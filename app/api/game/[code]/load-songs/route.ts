import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { fetchPlayerSongsFromSelection } from '@/lib/spotify-mixer'
import { prisma } from '@/lib/prisma'
import { parsePlayersFromJSON, playersToJSON } from '@/lib/types/game'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    const { selectedPlaylistIds } = await request.json()

    if (!selectedPlaylistIds || !Array.isArray(selectedPlaylistIds)) {
      return NextResponse.json({ error: 'Invalid playlist IDs' }, { status: 400 })
    }

    // Find the game
    const game = await prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: { host: true }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Get current players and find the requesting player
    const players = parsePlayersFromJSON(game.players)
    const playerIndex = players.findIndex(p => p.userId === session.user.id)
    
    if (playerIndex === -1) {
      return NextResponse.json({ error: 'Player not in game' }, { status: 403 })
    }

    const currentPlayer = players[playerIndex]

    // Get access token from session
    const accessToken = (session as any).accessToken
    if (!accessToken) {
      return NextResponse.json({ error: 'No Spotify access token' }, { status: 401 })
    }

    // Update player status to show loading started
    currentPlayer.loadingProgress = 0
    await prisma.game.update({
      where: { id: game.id },
      data: { players: playersToJSON(players) }
    })

    // Emit progress update via Socket.io
    const io = (global as any).io
    if (io) {
      io.to(code.toUpperCase()).emit('game-updated', {
        action: 'player-loading-progress',
        userId: session.user.id,
        progress: 0,
        timestamp: new Date().toISOString()
      })
    }

    // Fetch songs using your existing function
    console.log(`🎵 Loading songs for ${currentPlayer.displayName} from ${selectedPlaylistIds.length} playlists`)
    
    const songs = await fetchPlayerSongsFromSelection(
      currentPlayer.userId,
      currentPlayer.displayName,
      accessToken,
      selectedPlaylistIds
    )

    // Update progress to 50% (fetching complete, now processing)
    currentPlayer.loadingProgress = 50
    await prisma.game.update({
      where: { id: game.id },
      data: { players: playersToJSON(players) }
    })

    if (io) {
      io.to(code.toUpperCase()).emit('game-updated', {
        action: 'player-loading-progress',
        userId: session.user.id,
        progress: 50,
        timestamp: new Date().toISOString()
      })
    }

    // Store songs in the game's song cache
    // Note: In a real implementation, you might want to merge songs from all players
    let currentSongCache = []
    try {
      currentSongCache = game.songCache ? JSON.parse(game.songCache as string) : []
    } catch {
      currentSongCache = []
    }

    // Add this player's songs to the cache
    const updatedSongCache = [...currentSongCache, ...songs]

    // Update progress to 100% and mark as completed
    currentPlayer.loadingProgress = 100
    currentPlayer.songsLoaded = true

    await prisma.game.update({
      where: { id: game.id },
      data: { 
        players: playersToJSON(players),
        songCache: JSON.stringify(updatedSongCache)
      }
    })

    // Final progress update via Socket.io
    if (io) {
      io.to(code.toUpperCase()).emit('game-updated', {
        action: 'player-songs-ready',
        userId: session.user.id,
        songCount: songs.length,
        totalCachedSongs: updatedSongCache.length,
        timestamp: new Date().toISOString()
      })
    }

    console.log(`✅ Successfully loaded ${songs.length} songs for ${currentPlayer.displayName}`)

    return NextResponse.json({ 
      success: true, 
      songCount: songs.length,
      totalCachedSongs: updatedSongCache.length
    })

  } catch (error) {
    console.error('Error loading songs:', error)
    
    // Try to update player status to show error
    try {
      const session = await getServerSession(authOptions)
      if (session?.user?.id) {
        const { code } = await params
        const game = await prisma.game.findUnique({
          where: { code: code.toUpperCase() }
        })
        
        if (game) {
          const players = parsePlayersFromJSON(game.players)
          const playerIndex = players.findIndex(p => p.userId === session.user.id)
          
          if (playerIndex !== -1) {
            players[playerIndex].loadingProgress = 0
            players[playerIndex].songsLoaded = false
            
            await prisma.game.update({
              where: { id: game.id },
              data: { players: playersToJSON(players) }
            })
          }
        }
      }
    } catch (updateError) {
      console.error('Failed to reset player status after error:', updateError)
    }

    return NextResponse.json(
      { error: 'Failed to load songs' }, 
      { status: 500 }
    )
  }
}