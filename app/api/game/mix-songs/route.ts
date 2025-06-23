import { NextRequest, NextResponse } from 'next/server'
import { fetchPlayerSongsWithSource, mergeSongPools } from '@/lib/spotify-mixer'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const { players } = await request.json()
    
    // Fetch songs for each player
    const allPlayerSongs = await Promise.all(
      players.map(async (player: any) => {
        // In production, you'd get tokens from your game session storage
        // For now, use the current user's token for testing
        const token = (session as any).accessToken
        
        return fetchPlayerSongsWithSource(
          player.id,
          player.name,
          token
        )
      })
    )
    
    // Merge all songs
    const mixedSongs = mergeSongPools(allPlayerSongs)
    
    // Shuffle
    const shuffled = mixedSongs.sort(() => Math.random() - 0.5)
    
    return NextResponse.json({
      songs: shuffled,
      stats: {
        totalSongs: shuffled.length,
        songsWithMultipleOwners: shuffled.filter(s => s.owners.length > 1).length
      }
    })
  } catch (error) {
    console.error('Error mixing songs:', error)
    return NextResponse.json({ error: 'Failed to mix songs' }, { status: 500 })
  }
}