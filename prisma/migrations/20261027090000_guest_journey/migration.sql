-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('CONFIRMATION', 'REMINDER', 'FEEDBACK_REQUEST');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "feedback_token" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_status_scheduled_for_idx" ON "messages"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "messages_booking_id_kind_key" ON "messages"("booking_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_booking_id_key" ON "feedback"("booking_id");

-- CreateIndex
CREATE INDEX "feedback_created_at_idx" ON "feedback"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_feedback_token_key" ON "bookings"("feedback_token");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Written by hand: Prisma cannot express CHECK constraints.
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- A message is sent exactly when it has a send time.
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_at_matches_status" CHECK (("status" = 'SENT') = ("sent_at" IS NOT NULL));
