-- CreateTable
CREATE TABLE "MotivationalQuote" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivationalQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MotivationalQuote_text_key" ON "MotivationalQuote"("text");

-- CreateIndex
CREATE INDEX "MotivationalQuote_isActive_idx" ON "MotivationalQuote"("isActive");
