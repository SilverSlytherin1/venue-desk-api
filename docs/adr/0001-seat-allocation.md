# ADR 0001: Seat allocation with a conditional counter update

Status: accepted

## Context

An event has a fixed capacity. Anyone can book 1 to 4 seats, without an account, and the moment a
popular event opens many requests arrive at once. Two rules cannot be broken:

1. The sum of confirmed seats never exceeds the capacity.
2. A client that retries a request (timeout, double click, flaky network) gets one booking, not two.

Seats are not numbered: a booking takes a quantity, not specific places.

## Decision

Each event row carries a `seats_taken` counter. A booking is one transaction, in this order:

```sql
-- 1. Take the idempotency key.
INSERT INTO bookings (...) VALUES (...) ON CONFLICT DO NOTHING;

-- 2. Take the seats.
UPDATE events
   SET seats_taken = seats_taken + $n
 WHERE id = $event AND starts_at > $now AND seats_taken + $n <= capacity;

-- 3. Commit if step 2 updated one row. Otherwise roll back, which removes the row of step 1.
```

Three rules together make this correct. Each of them is enforced by the database, not by
application code that reads first and writes later.

**Capacity.** The check and the write of step 2 are the same statement. Under the default
READ COMMITTED isolation, an `UPDATE` that finds its row locked by another transaction waits for
that transaction to finish, then evaluates its `WHERE` clause again against the row as committed.
Two requests can therefore never both pass the check for the same seats. A
`CHECK (seats_taken >= 0 AND seats_taken <= capacity)` constraint sits behind it. The application
does not rely on the constraint: it is there so that a future bug or a manual `UPDATE` fails
loudly instead of overselling.

**Idempotency.** `bookings.idempotency_key` is unique, and each booking stores a hash of the
request that created it. If step 1 inserts nothing, the key is already taken and the request is
a retry: it returns the stored booking when the hash matches, and is rejected when it does not.
A retry stops there and never reaches step 2, so replaying a booking is safe even after the
event has sold out or started. If two requests with the same key overlap, the second insert waits
for the first transaction. If that one commits, the second request is a retry. If it rolls back,
the second request carries on as a first attempt.

**Cancellation.** One `UPDATE` flips the booking from `CONFIRMED` to `CANCELLED` and applies
only to a booking that is still `CONFIRMED`. The request that actually flipped it decrements the
counter in the same transaction. Any other cancellation of the same booking changes nothing.

What the test suite demonstrates, through HTTP against a real PostgreSQL: 200 parallel requests
for 50 seats confirm exactly 50; the same request sent 30 times in parallel creates one booking;
a concurrent retry of the request that took the last seats still gets the booking; 20 parallel
cancellations release the seats once. To watch the first of these fail, replace the `UPDATE` in
`BookingsService.book` with a read of the event followed by a separate write and run
`npm run test:e2e`.

## Alternatives considered

**Read, check in code, then write.** The obvious version, and wrong: two requests read the same
count and both write.

**`SELECT ... FOR UPDATE`, check in code, then write.** Correct, and built on the same row lock:
in both designs concurrent bookings for one event take turns on the event row. The differences
are these. The conditional update is one statement and one round trip, where the explicit lock
needs a read, a decision in the application and a write. The lock is taken by the last statement
before the commit, so it is held from that update to the commit and no longer, instead of across
the read, the decision and every statement that follows. And the rule is part of the statement
that writes, so no other code path can forget to take the lock first.

**SERIALIZABLE isolation.** Correct, but conflicts surface as serialization failures that the
application must catch and retry. A rush on a single event is the worst case for it, because
almost every transaction touches the same row. It would add a retry loop and its tuning for
nothing this case needs.

**Counting bookings instead of keeping a counter.** `SUM(seats)` over the bookings of the event
removes the denormalised column but not the race: it still needs one of the two options above,
plus an aggregate on every request.

**A counter outside the database (Redis `DECRBY` or a Lua script).** Very fast, and the usual
answer at ticketing scale. It also creates two sources of truth. A crash between the counter and
the insert leaks or oversells seats, so it needs reconciliation, and it adds a component to run.
Not justified until one row in PostgreSQL is measurably the bottleneck.

**One row per seat, claimed with `FOR UPDATE SKIP LOCKED`.** The right model when seats are
individually numbered. Here they are interchangeable, so it would mean thousands of rows to
express one integer.

**Taking the seats before the key.** The same two statements in the opposite order make a
refusal cheaper, because nothing is inserted. But a retry of a successful booking then takes
seats a second time before it finds its key in use, and has to give them back. Taking the key
first keeps the retry path trivial, at the price described below.

## Consequences

- No retries, no advisory locks, no extra infrastructure, default isolation level.
- Bookings for the same event take turns on its row, so throughput per event is bounded by
  commit latency. Different events do not contend. The foreign key check of step 1 takes only a
  key share lock on the event, which does not conflict with the update of step 2.
- A refused request has inserted a booking row and rolled it back. That costs a dead row for
  vacuum to collect and one value of the booking sequence, so sequence numbers have gaps.
  Nothing depends on them being contiguous.
- `seats_taken` duplicates what the bookings table already says. It must only ever change
  through the statements above. The concurrency test asserts that the counter, the bookings
  table and the responses sent to clients all agree.
- The `seatsLeft` reported with `EVENT_SOLD_OUT` is read after the refused update, so it is
  advisory: a cancellation landing in between can make it stale.
- None of this limits how fast one client can book. That is a separate concern, handled by a
  per-IP rate limit and listed under out of scope in the README.
