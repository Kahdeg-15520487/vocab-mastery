-- AlterTable: Add XP and level to users
ALTER TABLE "users" ADD COLUMN "total_xp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;
