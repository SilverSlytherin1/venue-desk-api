# Venue Desk API

Backend of Venue Desk, a small demo product for an events venue.
It does three things: public seat booking that never sells a seat twice under concurrent load, a guest journey
that confirms each booking, reminds the guest the day before and asks for a rating the day after, and a staff
area where work orders follow a role-based workflow.
Built with NestJS 12, Prisma 7, PostgreSQL 17 and strict TypeScript. The Angular client is [venue-desk-web](https://github.com/SilverSlytherin1/venue-desk-web).

Screenshots of the guest journey and the staff desk are in the [web README](https://github.com/SilverSlytherin1/venue-desk-web#readme).

## Run it

```bash
git clone https://github.com/SilverSlytherin1/venue-desk-api.git && cd venue-desk-api
docker compose up --build
```

This starts PostgreSQL, applies the migrations, loads the demo data and serves:

- the API at `http://localhost:3000/api/v1`
- interactive OpenAPI docs at `http://localhost:3000/docs` (JSON at `/docs-json`)

Demo logins, created by the seed script and meant for local use only:

| Email                  | Password       | Role  |
| ---------------------- | -------------- | ----- |
| `admin@venuedesk.test` | `demo-admin-1` | ADMIN |
| `sam@venuedesk.test`   | `demo-staff-1` | STAFF |
| `robin@venuedesk.test` | `demo-staff-2` | STAFF |

The seed also creates five upcoming events (one wide open, one with 2 seats left, one sold out,
one with only 10 seats, and one that starts a little over 24 hours after the seed runs), two past
events with their ratings, the messages of every booking, and eight work orders across all statuses.
The reminders of the event that starts tomorrow fall due about 15 minutes after the stack starts,
so they can be seen switching from `SCHEDULED` to `SENT` during a demo. One past booking has not
rated yet and has a fixed feedback token: open
`http://localhost:4200/feedback/5f0c2a9e-8d1b-4c3e-9a7f-2b6d4e8c1a35` with the web app running.

```bash
# Public: list events, then book two seats for one of them
curl -s localhost:3000/api/v1/events
curl -s -X POST localhost:3000/api/v1/events/<event-id>/bookings \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"Lena Varga","email":"lena@example.com","seats":2}'

# Staff: log in, then use the token
curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@venuedesk.test","password":"demo-admin-1"}'
curl -s localhost:3000/api/v1/work-orders -H 'Authorization: Bearer <accessToken>'
```

The compose stack is a demo, and says so: it runs the production image with `DEMO_MODE=true`.
That flag is the only thing that lets a production-mode process start with the JWT secret
published in this repository. Without it the API refuses to start until it is given a secret
of its own. PostgreSQL is published on the loopback interface only.

`docker compose down -v` stops the stack and deletes its data.

## Where to look first

| If you have five minutes for... | Open                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| the seat allocation             | [`bookings.service.ts`](src/modules/bookings/bookings.service.ts)                                                                    |
| the guest messages              | [`message-schedule.ts`](src/modules/messages/message-schedule.ts), [`messages.service.ts`](src/modules/messages/messages.service.ts) |
| the proof that it holds         | [`bookings.concurrency.e2e-spec.ts`](test/bookings.concurrency.e2e-spec.ts)                                                          |
| the workflow rules              | [`work-order-transitions.ts`](src/modules/work-orders/work-order-transitions.ts) and its spec                                        |
| error handling                  | [`domain-errors.ts`](src/common/errors/domain-errors.ts), [`problem.ts`](src/common/errors/problem.ts)                               |
| authentication and roles        | [`jwt-auth.guard.ts`](src/modules/auth/jwt-auth.guard.ts), [`src/common/auth`](src/common/auth)                                      |
| the schema and its constraints  | [`schema.prisma`](prisma/schema.prisma), [`migrations`](prisma/migrations)                                                           |

The code is layered the same way in every module:

- **Controllers** deal with HTTP only: route, validated DTO in, one service call, DTO out.
- **Services** hold the rules and talk to Prisma. They never see a request or a status code.
  When a rule is broken they throw a small domain error such as `EventSoldOutError`.
- **One exception filter** turns every error into an RFC 7807 `application/problem+json`
  document with a stable `code`. Unexpected errors are logged and reported as `INTERNAL_ERROR`
  without leaking their cause.
- **Mappers** convert database rows to response DTOs explicitly. A Prisma model is never
  returned as is, so adding a column cannot silently widen a response. Domain enums are
  declared in the domain and checked against the database enums by the compiler.

```
src/
  app.ts               builds the application (prefix, helmet, CORS, OpenAPI), shared with the e2e suite
  app.module.ts        everything global is registered here: validation, error filter, guards, rate limits
  config/              environment schema, validated at startup
  database/            PrismaService, mapping of constraint violations
  common/auth/         roles guard, @Public, @Roles, @CurrentUser
  common/errors/       domain errors, problem+json mapping and filter
  common/http/         validation pipe, pagination, rate limit, id parameter
  modules/auth/        login, token verification guard, password hashing
  modules/users/       assignee picker
  modules/events/      event catalogue
  modules/bookings/    seat allocation, idempotency, cancellation
  modules/messages/    guest message outbox, schedule, texts, dispatcher, sender port
  modules/feedback/    public rating by token, staff list and summary
  modules/dashboard/   figures for the staff overview
  modules/work-orders/ CRUD and the status workflow
  modules/health/      liveness and database check
```

## How seat allocation stays correct

A booking is one transaction. First the booking row, inserted only if its
`Idempotency-Key` has not been used. Then the seats:

```sql
UPDATE events
   SET seats_taken = seats_taken + $n
 WHERE id = $event AND starts_at > $now AND seats_taken + $n <= capacity;
```

If that statement updates no row, the transaction rolls back and the request is refused with
`EVENT_SOLD_OUT` or `EVENT_CLOSED`. If it does, the guest's messages are written next, in the same
transaction (see [Guest journey](#guest-journey)). The check and the write are a single statement, so no other
request can get between them. A retry stops at its key and gets the original booking back with
`200` instead of `201`, and the same key with a different payload is `IDEMPOTENCY_KEY_REUSED`.
Cancellation releases the seats with the same kind of guarded update, exactly once, and only
until the event starts: after that it is `EVENT_CLOSED`. A `CHECK`
constraint on the counter is the last line of defence.

[ADR 0001](docs/adr/0001-seat-allocation.md) has the reasoning: what exactly each rule relies
on, why this was chosen over an explicit row lock, SERIALIZABLE isolation and an external
counter, and what it costs.

## Guest journey

Every booking gets up to three messages:

| Message            | Scheduled for                    | Note                                                 |
| ------------------ | -------------------------------- | ---------------------------------------------------- |
| `CONFIRMATION`     | the moment of booking            | sent right after the booking commits                 |
| `REMINDER`         | 24 hours before the event starts | left out if that moment is less than an hour away    |
| `FEEDBACK_REQUEST` | 24 hours after the event starts  | links to `{PUBLIC_WEB_URL}/feedback/{feedbackToken}` |

- **Outbox.** The messages are rows in the `messages` table, written in the booking transaction,
  with their final subject and plain text body. A booking never exists without its messages, a
  refused one never has any, and a replayed request never schedules anything twice (the retry
  stops at its idempotency key, and `(booking_id, kind)` is unique as well). Cancelling a booking
  cancels its `SCHEDULED` messages in the cancelling transaction; what has gone out stays `SENT`.
- **Dispatcher.** `MessagesService.dispatchDue(now)` sends what is due. It claims each row with a
  conditional update, `SCHEDULED` to `SENT`, and only the call that won the claim hands the row to
  the sender. However many dispatchers run at once, a message goes out once, and a cancelled one
  never does. A reminder whose event has already started is marked `CANCELLED` instead of sent,
  while a late feedback request still goes out. `@nestjs/schedule` runs it every minute unless `SCHEDULER_ENABLED=false`. The
  confirmation does not wait for the next run: the booking request claims and sends it as soon as
  it has committed, and the response shows the messages as they are after that attempt, `SENT`
  even when a scheduler run got there first. If that fails, the booking still succeeds, the row stays `SCHEDULED` and the
  dispatcher retries it. A sender that throws puts its row back in the queue.
- **Demo sender.** Delivery goes through a `MessageSender` port. Its only implementation,
  `DemoMessageSender`, delivers nothing: the row, with its exact text and send time, is the
  record, and the staff area shows it. It logs message ids and kinds only, never addresses or
  bodies. Plugging in an email provider means one new class and one line in `messages.module.ts`.
- **Texts** are plain English, rendered by a pure function and unit tested. Dates and times are
  written on the venue's clock (`VENUE_TIME_ZONE`).
- **Feedback.** Guests have no account: the random `feedbackToken` of the booking is the key to
  its feedback page. Rating opens when the event starts, is refused for a cancelled booking
  (`FEEDBACK_NOT_OPEN`), and is accepted once per booking (`FEEDBACK_ALREADY_SUBMITTED`); a
  unique constraint decides between simultaneous submissions. A `CHECK` keeps ratings in 1 to 5.

## Endpoints

All under `/api/v1`. The OpenAPI document at `/docs` has every schema and error code.

| Endpoint                           | Who         | What                                                         |
| ---------------------------------- | ----------- | ------------------------------------------------------------ |
| `GET /health`                      | public      | liveness and database check                                  |
| `POST /auth/login`, `GET /auth/me` | public, any | log in, current user                                         |
| `GET /events?when=upcoming\|past`  | public      | upcoming soonest first (default), or past latest first       |
| `GET /events/:id`                  | public      | one event with its seats left                                |
| `POST /events`                     | ADMIN       | create an event                                              |
| `POST /events/:id/bookings`        | public      | book 1 to 4 seats, needs an `Idempotency-Key`                |
| `GET /events/:id/bookings`         | staff       | bookings of an event with their messages and rating          |
| `POST /bookings/:id/cancel`        | staff       | before the event starts: cancel, release seats and messages  |
| `GET /feedback/:token`             | public      | what the feedback page shows                                 |
| `POST /feedback/:token`            | public      | rate 1 to 5 with an optional comment, once                   |
| `GET /feedback`                    | staff       | ratings newest first, by `eventId` and `rating`              |
| `GET /feedback-summary`            | staff       | average, count and distribution, overall or for an `eventId` |
| `GET /messages`                    | staff       | messages with their text, by `status`, `kind` and `eventId`  |
| `GET /dashboard`                   | staff       | figures for the staff overview                               |
| `GET /users`                       | ADMIN       | assignee picker                                              |
| `/work-orders`                     | staff       | list, read, create, edit, transition (see below)             |

A booking in a response carries `messages` (kind, status, `scheduledFor`, `sentAt`) in the order
they go out, and `rating`, which is null until the guest has rated.

## Work order workflow

| From          | To            | Who                                 |
| ------------- | ------------- | ----------------------------------- |
| `OPEN`        | `IN_PROGRESS` | ADMIN, or STAFF who is the assignee |
| `IN_PROGRESS` | `DONE`        | ADMIN, or STAFF who is the assignee |
| `IN_PROGRESS` | `OPEN`        | ADMIN, or STAFF who is the assignee |
| `OPEN`        | `CANCELLED`   | ADMIN only                          |
| `IN_PROGRESS` | `CANCELLED`   | ADMIN only                          |

- A move that is not in the table is `INVALID_TRANSITION`. A move that is in the table but not
  allowed to the caller is `FORBIDDEN`.
- `DONE` and `CANCELLED` are terminal for the status only. An admin can still correct the
  title, description, priority and assignee of a closed work order.
- The table is data in a pure module with one function, `evaluateTransition(from, to, actor)`,
  unit tested over its whole input space. The `allowedTransitions` field of every response is
  computed from the same table for the calling user, so the UI can show exactly the buttons
  that will work. Its order is deliberate: the step forward, then the step back, then
  `CANCELLED`.
- The status update applies only if the status and the assignee are still the ones the
  decision was based on. Of two simultaneous transitions exactly one wins, and the other gets
  `INVALID_TRANSITION`.
- The `q` filter of the list is a case-insensitive substring match on title and description,
  which is a sequential scan. That is fine at this size. The next step would be a trigram
  index (`pg_trgm`) or full-text search.

## Security

- Authentication is on by default through a global guard. A route is public only if it says
  `@Public()`, and a protected route that forgets `@Roles(...)` is denied to everyone.
- The guard loads the user on every authenticated request. A deleted account or a changed role
  takes effect at once instead of when the token expires, at the cost of one primary key
  lookup per request.
- Passwords are hashed with argon2id. Login answers an unknown email and a wrong password with
  the same error and comparable timing.
- JWTs are signed with HS256, verified with a pinned algorithm and issuer, and expire after one hour.
- Login, public booking and the public feedback page (read and submit) are rate limited per
  client IP (5, 10 and 10 requests per minute by default; feedback shares the booking setting). The client IP is the socket address unless `TRUST_PROXY_HOPS` says how many
  reverse proxies to trust. Behind a load balancer it has to be set, or all clients share
  one allowance.
- A feedback token is a random UUID, separate from the booking id and reference. It opens
  only the feedback page of its own booking, which shows the event and the guest's first name.
  Staff can read it in the message bodies, see [out of scope](#deliberately-out-of-scope).
- Input is validated at the boundary. Unknown properties are rejected, not ignored. The
  messages in `errors` are written for people ("Name is required.") and come from one
  catalogue in [`validation.pipe.ts`](src/common/http/validation.pipe.ts), not from each DTO.
- Helmet headers, CORS restricted to the configured origins, and configuration validated at
  startup: the process refuses to start on a missing or malformed variable.

## Tests

```bash
npm test                 # unit tests: no database, no generated client, under a second
docker compose up -d db  # PostgreSQL for the e2e suite
npm run test:e2e         # every endpoint over HTTP against a real PostgreSQL
```

- **Unit tests** cover what has real branching: the transition table (all 64 combinations of
  status, target and actor), the message schedule (which messages, when, the one hour reminder
  cutoff), the message texts and their time zone, the rating summary, the roles guard, the error
  to problem mapping, the booking reference generator and the environment schema.
- **E2E tests** boot the real application, call it over HTTP and check both the response and
  the stored state. Write endpoints are tested for the happy path, for validation errors and,
  where they are protected, for a missing token and an insufficient role. The suite runs in a
  database of its own (`venue_desk_e2e`, created automatically) that is emptied before every test.
  The scheduler is off there: tests call `dispatchDue` with the clock they need, including eight
  dispatchers at once to show that each message is sent once.
- **The concurrency test** fires 200 parallel booking requests of 1 to 4 seats at an event with
  50 seats. It asserts that the confirmed seats add up to exactly 50, that every other request
  received `EVENT_SOLD_OUT` with fewer seats left than it asked for, and that `seatsTaken`
  equals the sum of the stored bookings. Exactly 50, not "at most": 50 of the requests ask for
  a single seat, and a single seat can only be refused when the event is full.
- **Races are forced, not hoped for.** The lost-update tests of the work order workflow hold a
  row lock open, wait until the database reports the request as blocked on it, and only then
  commit the competing change.

To see a test earn its place, replace the `UPDATE` in `BookingsService.book` with a read
followed by a separate write and run `npm run test:e2e`: the capacity assertion fails.

## Local development

```bash
nvm use                  # Node 22.20
npm ci
cp .env.example .env
docker compose up -d db  # PostgreSQL on localhost:5433
npm run db:migrate
npm run db:seed
npm run start:dev        # http://localhost:3000, restarts on change
```

The Prisma client is generated code and is not committed. `npm run db:generate` creates it,
and runs by itself before `lint`, `typecheck`, `build`, `start:dev` and `test:e2e`.

CI runs three jobs on every pull request and on every push to `main`, see
[`ci.yml`](.github/workflows/ci.yml):

1. `lint`, `format:check`, `typecheck`, unit tests, `build`, and `npm audit` of the
   dependencies that ship in the image.
2. The e2e suite on a PostgreSQL service container, then `db:check`, which fails if the
   migrated database differs from `schema.prisma`.
3. A build of both Docker images and a start of the compose demo, up to a healthy API.

NestJS 12 is published as ES modules, so the project is ESM too: relative imports carry a `.js`
extension, the build is plain `tsc` and the tests run on Vitest.

## Configuration

All configuration comes from environment variables, documented in [`.env.example`](.env.example)
and validated by [`src/config/env.ts`](src/config/env.ts). The values in `.env.example` and
`docker-compose.yml` are demo values. A real deployment must set its own `JWT_SECRET`, and the
API enforces that: in production it rejects the published one unless `DEMO_MODE=true`.

| Variable            | Default                 | Meaning                                                       |
| ------------------- | ----------------------- | ------------------------------------------------------------- |
| `SCHEDULER_ENABLED` | `true`                  | run the message dispatcher every minute                       |
| `VENUE_TIME_ZONE`   | `Europe/Rome`           | IANA zone in which messages write dates and times             |
| `PUBLIC_WEB_URL`    | `http://localhost:4200` | web app address for the feedback links, also used by the seed |

To drive the stack from automated UI tests, which log in and book far more often than a person,
raise the limits: `LOGIN_RATE_LIMIT=100 BOOKING_RATE_LIMIT=1000 docker compose up`.

## Deliberately out of scope

This is a code sample, not a product. Left out on purpose:

- **Refresh tokens and token revocation.** There is no logout on the server: a token works
  until it expires or its user is deleted. Production would use short access tokens with a
  rotating, server-stored refresh token.
- **User management.** No registration, password reset or MFA. Users come from the seed.
- **Payments, seat holds with expiry, waiting lists, numbered seats.** A booking confirms at once.
- **Real abuse protection.** The rate limits are per IP and kept in memory, so they are
  correct for a single instance only and do nothing against a distributed client. There is no
  per-account lockout on login. Keeping a script from buying out an event takes more than a
  rate limit: holds that expire, payment, or a CAPTCHA.
- **A real email provider.** Messages are scheduled, rendered and recorded, but the demo sender
  delivers nothing. Production would add a sender for an email service, with bounces and
  unsubscribe handling, behind the existing `MessageSender` port.
- **Masking guest links in the staff area.** `GET /messages` returns every message body as
  sent, so staff can read each guest's feedback link, and with it rate in the guest's name.
  The demo keeps it on purpose: the presenter opens the guest page from the Messages screen. A
  real deployment would mask the token in the staff view and show the link only to the guest.
- **Multi-tenancy.** One venue.
- **Expiry of idempotency keys.** They live as long as the booking.
- **Audit trail** of who moved a work order and when.
- **Observability.** Default Nest logging, no metrics or tracing.
- **Deployment.** The compose file is for local use. There is no production infrastructure here.

---

Emanuel Pinto, riverdevstudio.it
