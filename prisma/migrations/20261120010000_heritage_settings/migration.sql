CREATE TABLE "HeritageSettings" (
    "id" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 180,
    "disabledIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HeritageSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "HeritageSettings" ("id", "intervalMinutes", "disabledIds", "updatedAt")
VALUES ('global', 180, ARRAY[]::TEXT[], CURRENT_TIMESTAMP);
