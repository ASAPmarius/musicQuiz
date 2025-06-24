import { NextRequest, NextResponse } from 'next/server'
import { fetchPlayerSongsFromSelection, mergeSongPools } from '@/lib/spotify-mixer'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const { players, selectedPlaylistIds } = await request.json()
    
    // Fetch songs for each player from selected playlists only
    const allPlayerSongs = await Promise.all(
      players.map(async (player: any) => {
        const token = (session as any).accessToken
        
        return fetchPlayerSongsFromSelection(
          player.id,
          player.name,
          token,
          selectedPlaylistIds
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
        songsWithMultipleOwners: shuffled.filter(s => s.owners.length > 1).length,
        selectedPlaylists: selectedPlaylistIds.length
      }
    })
  } catch (error) {
    console.error('Error mixing selected songs:', error)
    return NextResponse.json({ error: 'Failed to mix songs' }, { status: 500 })
  }
}