-- AlterTable: add sprintId to learning sessions for tracking
ALTER TABLE "learning_sessions" ADD COLUMN "sprint_id" TEXT;

-- Create index for sprint session lookups
CREATE INDEX "learning_sessions_sprint_id_idx" ON "learning_sessions"("sprint_id");
