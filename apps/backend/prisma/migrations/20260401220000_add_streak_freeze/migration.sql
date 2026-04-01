-- Add streak freeze tracking
ALTER TABLE "user_streaks" ADD COLUMN "last_freeze_used" TIMESTAMP;
ALTER TABLE "user_streaks" ADD COLUMN "frozen_until" DATE;
