# Venue Desk API

Backend of Venue Desk, a small demo product for an events venue.
It does two things: public seat booking that never sells a seat twice under concurrent load, and a staff area where work orders follow a role-based workflow.
Built with NestJS 12, Prisma 7, PostgreSQL 17 and strict TypeScript. The Angular client is [venue-desk-web](https://github.com/SilverSlytherin1/venue-desk-web).

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

The seed also creates four upcoming events (one wide open, one with 2 seats left, one sold out,
one with only 10 seats) and eight work orders across all statuses.

```bash
# Public: list events, then book two seats for one of them
curl -s localhost:3000/api/v1/events
curl -s -X POST localhost:3000/api/v1/events/<event-id>/bookings \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","seats":2}'

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

| If you have five minutes for... | Open                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| the seat allocation             | [`bookings.service.ts`](src/modules/bookings/bookings.service.ts)                                      |
| the proof that it holds         | [`bookings.concurrency.e2e-spec.ts`](test/bookings.concurrency.e2e-spec.ts)                            |
| the workflow rules              | [`work-order-transitions.ts`](src/modules/work-orders/work-order-transitions.ts) and its spec          |
| error handling                  | [`domain-errors.ts`](src/common/errors/domain-errors.ts), [`problem.ts`](src/common/errors/problem.ts) |
| authentication and roles        | [`jwt-auth.guard.ts`](src/modules/auth/jwt-auth.guard.ts), [`src/common/auth`](src/common/auth)        |
| the schema and its constraints  | [`schema.prisma`](prisma/schema.prisma), [`migrations`](prisma/migrations)                             |

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
  modules/work-orders/ CRUD and the status workflow
  modules/health/      liveness and database check
```

## How seat allocation stays correct

A booking is one transaction with two writes. First the booking row, inserted only if its
`Idempotency-Key` has not been used. Then the seats:

```sql
UPDATE events
   SET seats_taken = seats_taken + $n
 WHERE id = $event AND starts_at > $now AND seats_taken + $n <= capacity;
```

If that statement updates no row, the transaction rolls back and the request is refused with
`EVENT_SOLD_OUT` or `EVENT_CLOSED`. The check and the write are a single statement, so no other
request can get between them. A retry stops at its key and gets the original booking back with
`200` instead of `201`, and the same key with a different payload is `IDEMPOTENCY_KEY_REUSED`.
Cancellation releases the seats with the same kind of guarded update, exactly once. A `CHECK`
constraint on the counter is the last line of defence.

[ADR 0001](docs/adr/0001-seat-allocation.md) has the reasoning: what exactly each rule relies
on, why this was chosen over an explicit row lock, SERIALIZABLE isolation and an external
counter, and what it costs.

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
- Login and public booking are rate limited per client IP (5 and 10 requests per minute by
  default). The client IP is the socket address unless `TRUST_PROXY_HOPS` says how many
  reverse proxies to trust. Behind a load balancer it has to be set, or all clients share
  one allowance.
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
  status, target and actor), the roles guard, the error to problem mapping, the booking
  reference generator and the environment schema.
- **E2E tests** boot the real application, call it over HTTP and check both the response and
  the stored state. Write endpoints are tested for the happy path, for validation errors and,
  where they are protected, for a missing token and an insufficient role. The suite runs in a
  database of its own (`venue_desk_e2e`, created automatically) that is emptied before every test.
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
- **Email.** No booking confirmation is sent.
- **Multi-tenancy.** One venue.
- **Expiry of idempotency keys.** They live as long as the booking.
- **Audit trail** of who moved a work order and when.
- **Observability.** Default Nest logging, no metrics or tracing.
- **Deployment.** The compose file is for local use. There is no production infrastructure here.

---

Emanuel Pinto, riverdevstudio.it
