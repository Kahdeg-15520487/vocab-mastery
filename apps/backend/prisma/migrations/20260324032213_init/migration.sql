-- CreateTable
CREATE TABLE "words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "phonetic_us" TEXT NOT NULL,
    "phonetic_uk" TEXT NOT NULL,
    "part_of_speech" JSONB NOT NULL,
    "definition" TEXT NOT NULL,
    "examples" JSONB NOT NULL,
    "synonyms" JSONB NOT NULL,
    "antonyms" JSONB NOT NULL,
    "oxford_list" TEXT NOT NULL,
    "cefr_level" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_themes" (
    "wordId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_themes_pkey" PRIMARY KEY ("wordId","themeId")
);

-- CreateTable
CREATE TABLE "word_progress" (
    "id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "interval" INTEGER NOT NULL DEFAULT 0,
    "ease_factor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "next_review" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_review" TIMESTAMP(3),
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "correct_reviews" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_sessions" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "theme_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "total_correct" INTEGER NOT NULL DEFAULT 0,
    "total_incorrect" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_words" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "shown" BOOLEAN NOT NULL DEFAULT false,
    "response" TEXT,
    "response_time" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "id" TEXT NOT NULL,
    "total_words" INTEGER NOT NULL DEFAULT 0,
    "mastered_words" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "words_word_key" ON "words"("word");

-- CreateIndex
CREATE INDEX "words_word_idx" ON "words"("word");

-- CreateIndex
CREATE INDEX "words_cefr_level_idx" ON "words"("cefr_level");

-- CreateIndex
CREATE INDEX "words_oxford_list_idx" ON "words"("oxford_list");

-- CreateIndex
CREATE UNIQUE INDEX "themes_name_key" ON "themes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "themes_slug_key" ON "themes"("slug");

-- CreateIndex
CREATE INDEX "word_themes_themeId_idx" ON "word_themes"("themeId");

-- CreateIndex
CREATE INDEX "word_progress_word_id_idx" ON "word_progress"("word_id");

-- CreateIndex
CREATE INDEX "word_progress_next_review_idx" ON "word_progress"("next_review");

-- CreateIndex
CREATE INDEX "word_progress_status_idx" ON "word_progress"("status");

-- CreateIndex
CREATE INDEX "learning_sessions_started_at_idx" ON "learning_sessions"("started_at");

-- CreateIndex
CREATE INDEX "session_words_session_id_idx" ON "session_words"("session_id");

-- AddForeignKey
ALTER TABLE "word_themes" ADD CONSTRAINT "word_themes_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_themes" ADD CONSTRAINT "word_themes_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_progress" ADD CONSTRAINT "word_progress_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_words" ADD CONSTRAINT "session_words_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "learning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
