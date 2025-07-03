import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { Song } from '@/lib/types/game'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await params
    const gameCode = resolvedParams.code.toUpperCase()

    // Get all songs for this game
    const gameSongs = await prisma.gameSongs.findMany({
      where: {
        game: { code: gameCode }
      }
    })

    // Merge all songs into one array
    const songMap = new Map<string, Song>()

    gameSongs.forEach(playerSongsRecord => {
      // Type assertion - we know songs is an array
      const songs = playerSongsRecord.songs as unknown as Song[]
      
      if (!Array.isArray(songs)) {
        console.warn(`Invalid songs data for player ${playerSongsRecord.playerId}`)
        return
      }
      
      songs.forEach(song => {
        if (songMap.has(song.id)) {
          // Song exists - merge owners
          const existing = songMap.get(song.id)!
          existing.owners.push(...song.owners)
        } else {
          // New song
          songMap.set(song.id, { ...song })
        }
      })
    })

    const allSongs = Array.from(songMap.values())

    return NextResponse.json({
      success: true,
      songs: allSongs,
      totalCount: allSongs.length
    })

  } catch (error) {
    console.error('Error fetching game songs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch songs' }, 
      { status: 500 }
    )
  }
}