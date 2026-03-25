-- CreateTable
CREATE TABLE "study_lists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "icon" TEXT NOT NULL DEFAULT '📚',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_list_words" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_list_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_lists" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "shared_by" TEXT NOT NULL,
    "shared_with" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_lists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_lists_user_id_idx" ON "study_lists"("user_id");

-- CreateIndex
CREATE INDEX "study_lists_is_pinned_idx" ON "study_lists"("is_pinned");

-- CreateIndex
CREATE INDEX "study_list_words_list_id_idx" ON "study_list_words"("list_id");

-- CreateIndex
CREATE INDEX "study_list_words_word_id_idx" ON "study_list_words"("word_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_list_words_list_id_word_id_key" ON "study_list_words"("list_id", "word_id");

-- CreateIndex
CREATE INDEX "shared_lists_list_id_idx" ON "shared_lists"("list_id");

-- CreateIndex
CREATE INDEX "shared_lists_shared_with_idx" ON "shared_lists"("shared_with");

-- CreateIndex
CREATE INDEX "shared_lists_shared_by_idx" ON "shared_lists"("shared_by");

-- CreateIndex
CREATE UNIQUE INDEX "shared_lists_list_id_shared_with_key" ON "shared_lists"("list_id", "shared_with");

-- AddForeignKey
ALTER TABLE "study_lists" ADD CONSTRAINT "study_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_list_words" ADD CONSTRAINT "study_list_words_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "study_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_list_words" ADD CONSTRAINT "study_list_words_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_lists" ADD CONSTRAINT "shared_lists_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "study_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
