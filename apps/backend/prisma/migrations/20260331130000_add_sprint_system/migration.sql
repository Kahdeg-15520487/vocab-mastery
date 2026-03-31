-- SprintStatus enum
CREATE TYPE "SprintStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'ABANDONED');

-- SprintPhase enum
CREATE TYPE "SprintPhase" AS ENUM ('ACQUISITION', 'APPLICATION');

-- Sprint table
CREATE TABLE "sprints" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "SprintStatus" NOT NULL DEFAULT 'PLANNED',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "word_target" INTEGER NOT NULL DEFAULT 265,
    "review_target" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "is_review_sprint" BOOLEAN NOT NULL DEFAULT false,
    "phase" "SprintPhase" NOT NULL DEFAULT 'ACQUISITION',
    "retention_rate" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- SprintWord table
CREATE TABLE "sprint_words" (
    "id" TEXT NOT NULL,
    "sprint_id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "sentences" JSONB,
    "quizzed" BOOLEAN NOT NULL DEFAULT false,
    "quiz_correct" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sprint_words_pkey" PRIMARY KEY ("id")
);

-- SprintWriting table
CREATE TABLE "sprint_writings" (
    "id" TEXT NOT NULL,
    "sprint_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "sprint_words_used" INTEGER NOT NULL DEFAULT 0,
    "feedback" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sprint_writings_pkey" PRIMARY KEY ("id")
);

-- Milestone table
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "word_target" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "focus_area" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sprint_words" ADD CONSTRAINT "sprint_words_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sprint_words" ADD CONSTRAINT "sprint_words_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sprint_writings" ADD CONSTRAINT "sprint_writings_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraints
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_user_id_number_key" UNIQUE ("user_id", "number");
ALTER TABLE "sprint_words" ADD CONSTRAINT "sprint_words_sprint_id_word_id_key" UNIQUE ("sprint_id", "word_id");

-- Indexes
CREATE INDEX "sprints_user_id_idx" ON "sprints"("user_id");
CREATE INDEX "sprints_status_idx" ON "sprints"("status");
CREATE INDEX "sprint_words_sprint_id_idx" ON "sprint_words"("sprint_id");
CREATE INDEX "sprint_words_word_id_idx" ON "sprint_words"("word_id");
CREATE INDEX "sprint_writings_sprint_id_idx" ON "sprint_writings"("sprint_id");
CREATE INDEX "milestones_user_id_idx" ON "milestones"("user_id");
CREATE INDEX "milestones_deadline_idx" ON "milestones"("deadline");
