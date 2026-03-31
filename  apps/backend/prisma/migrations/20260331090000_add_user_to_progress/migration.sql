-- AlterTable
ALTER TABLE "word_progress" ADD COLUMN "user_id" TEXT;

-- AlterTable
ALTER TABLE "learning_sessions" ADD COLUMN "user_id" TEXT;

-- Set default user for existing records (use admin user)
UPDATE "word_progress" SET "user_id" = 'admin-00000000-0000-0000-000000000001' WHERE "user_id" IS NULL;
UPDATE "learning_sessions" SET "user_id" = 'admin-00000000-0000-0000-000000000001' WHERE "user_id" IS NULL;

-- Make columns not nullable
ALTER TABLE "word_progress" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "learning_sessions" ALTER COLUMN "user_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "word_progress" ADD CONSTRAINT "word_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "word_progress_user_id_idx" ON "word_progress"("user_id");
CREATE INDEX "learning_sessions_user_id_idx" ON "learning_sessions"("user_id");

-- Create unique constraint
ALTER TABLE "word_progress" ADD CONSTRAINT "word_progress_user_id_word_id_key" UNIQUE ("user_id", "word_id");
