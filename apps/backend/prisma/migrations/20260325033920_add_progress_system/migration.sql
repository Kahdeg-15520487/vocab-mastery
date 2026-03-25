-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('NEW', 'LEARNING', 'REVIEWING', 'MASTERED');

-- CreateTable
CREATE TABLE "user_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "theme_id" TEXT,
    "cefr_level" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'NEW',
    "interval" INTEGER NOT NULL DEFAULT 0,
    "ease_factor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "next_review" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_review" TIMESTAMP(3),
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "words_learned" INTEGER NOT NULL DEFAULT 0,
    "words_mastered" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "words_to_learn" INTEGER NOT NULL DEFAULT 10,
    "words_to_review" INTEGER NOT NULL DEFAULT 20,
    "words_learned" INTEGER NOT NULL DEFAULT 0,
    "words_reviewed" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_streaks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_activity_date" TIMESTAMP(3),
    "grace_periods_used" INTEGER NOT NULL DEFAULT 0,
    "grace_period_month" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "condition_type" TEXT NOT NULL,
    "condition_value" INTEGER NOT NULL,
    "xp_reward" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_progress_user_id_idx" ON "user_progress"("user_id");

-- CreateIndex
CREATE INDEX "user_progress_next_review_idx" ON "user_progress"("next_review");

-- CreateIndex
CREATE INDEX "user_progress_status_idx" ON "user_progress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_progress_user_id_cefr_level_theme_id_key" ON "user_progress"("user_id", "cefr_level", "theme_id");

-- CreateIndex
CREATE INDEX "daily_goals_user_id_idx" ON "daily_goals"("user_id");

-- CreateIndex
CREATE INDEX "daily_goals_date_idx" ON "daily_goals"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_goals_user_id_date_key" ON "daily_goals"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "user_streaks_user_id_key" ON "user_streaks"("user_id");

-- CreateIndex
CREATE INDEX "user_streaks_last_activity_date_idx" ON "user_streaks"("last_activity_date");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_key_key" ON "achievements"("key");

-- CreateIndex
CREATE INDEX "achievements_category_idx" ON "achievements"("category");

-- CreateIndex
CREATE INDEX "user_achievements_user_id_idx" ON "user_achievements"("user_id");

-- CreateIndex
CREATE INDEX "user_achievements_unlocked_at_idx" ON "user_achievements"("unlocked_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_user_id_achievement_id_key" ON "user_achievements"("user_id", "achievement_id");

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_goals" ADD CONSTRAINT "daily_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
