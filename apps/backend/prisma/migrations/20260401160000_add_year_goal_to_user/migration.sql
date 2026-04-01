-- AlterTable: Add year word goal fields to users
ALTER TABLE "users" ADD COLUMN "year_word_target" INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE "users" ADD COLUMN "year_target_date" TIMESTAMP;
