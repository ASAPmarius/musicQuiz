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

    // Check for refresh error
    if ((session as any)?.error === "RefreshAccessTokenError") {
      console.log('❌ Token refresh failed, user needs to re-login')
      return NextResponse.json({ 
        error: 'Token refresh failed', 
        needsReauth: true 
      }, { status: 401 })
    }

    const accessToken = (session as any).accessToken
    if (!accessToken) {
      return NextResponse.json({ 
        error: 'No access token', 
        needsReauth: true 
      }, { status: 401 })
    }
    
    const { players, selectedPlaylistIds } = await request.json()
    
    console.log(`🎵 Mixing songs for ${players.length} players with ${selectedPlaylistIds.length} selected playlists`)
    
    // 🔧 REMOVED: Complex database progress updates - let frontend handle this
    // The mixer should just mix songs, not manage UI state
    
    // Fetch songs for each player from selected playlists only
    const allPlayerSongs = await Promise.all(
      players.map(async (player: any) => {
        console.log(`📋 Fetching songs for player: ${player.name}`)
        
        return fetchPlayerSongsFromSelection(
          player.id,
          player.name,
          accessToken,
          selectedPlaylistIds
        )
      })
    )
    
    // Merge all songs
    const mixedSongs = mergeSongPools(allPlayerSongs)
    
    // Shuffle
    const shuffled = mixedSongs.sort(() => Math.random() - 0.5)
    
    console.log(`✅ Mixed ${shuffled.length} total songs`)
    
    return NextResponse.json({
      songs: shuffled,
      stats: {
        totalSongs: shuffled.length,
        songsWithMultipleOwners: shuffled.filter(s => s.owners.length > 1).length,
        selectedPlaylists: selectedPlaylistIds.length,
        playersProcessed: players.length
      }
    })
  } catch (error) {
    console.error('Error mixing selected songs:', error)
    return NextResponse.json({ 
      error: 'Failed to mix songs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}