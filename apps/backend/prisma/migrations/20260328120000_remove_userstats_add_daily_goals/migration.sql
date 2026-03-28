-- DropTable
DROP TABLE IF EXISTS "user_stats";

-- AlterTable: Add configurable daily goals to users
ALTER TABLE "users" ADD COLUMN "daily_learn_goal" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "users" ADD COLUMN "daily_review_goal" INTEGER NOT NULL DEFAULT 20;
