-- AlterTable
ALTER TABLE "games" ALTER COLUMN "targetScore" SET DEFAULT 30;

-- CreateTable
CREATE TABLE "game_songs" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "songs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_songs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_songs_gameId_playerId_key" ON "game_songs"("gameId", "playerId");

-- AddForeignKey
ALTER TABLE "game_songs" ADD CONSTRAINT "game_songs_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
