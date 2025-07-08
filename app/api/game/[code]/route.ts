import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { LobbyPlayer, GameData } from '@/lib/types/game'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{
    code: string
  }>
}

// GET - Fetch game details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = await params
    const gameCode = resolvedParams.code.toUpperCase()
    
    console.log('🔍 Fetching game details for:', gameCode)

    // Find game with all players
    const game = await prisma.game.findUnique({
      where: { code: gameCode },
      include: {
        host: true,
        players: {
          orderBy: { joinedAt: 'asc' }
        }
      }
    })

    if (!game) {
      console.log('❌ Game not found:', gameCode)
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Format players as LobbyPlayer objects
    const currentPlayers: LobbyPlayer[] = game.players.map(player => ({
      id: player.id,
      userId: player.userId,
      displayName: player.displayName,
      spotifyDeviceId: player.spotifyDeviceId,
      deviceName: player.deviceName,
      playlistsSelected: player.playlistsSelected,
      songsLoaded: player.songsLoaded,
      loadingProgress: player.loadingProgress,
      joinedAt: player.joinedAt.toISOString(),
      isReady: player.isReady,
      isHost: player.isHost
    }))

    console.log(`✅ Found game ${gameCode} with ${currentPlayers.length} players`)

    return NextResponse.json({
      game: {
        id: game.id,
        code: game.code,
        status: game.status,
        maxPlayers: game.maxPlayers,
        targetScore: game.targetScore,
        currentRound: game.currentRound,
        currentPlayers: currentPlayers.length,
        players: currentPlayers,
        host: game.host,
        settings: game.settings,
        songCache: game.songCache,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt
      }
    })

  } catch (error) {
    console.error('Error fetching game:', error)
    return NextResponse.json(
      { error: 'Failed to fetch game details' }, 
      { status: 500 }
    )
  }
}

// PUT - Update player status (atomic updates with socket events)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const resolvedParams = await params
    const gameCode = resolvedParams.code.toUpperCase()
    const body = await request.json()
    const { playerUpdate } = body

    console.log(`🔄 Player update request for ${gameCode}:`, playerUpdate)

    // Find the game first to get the gameId
    const game = await prisma.game.findUnique({
      where: { code: gameCode },
      select: { id: true }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // 🎯 ATOMIC UPDATE - No more race conditions!
    const updatedPlayer = await prisma.gamePlayer.update({
      where: {
        gameId_userId: {
          gameId: game.id,
          userId: session.user.id
        }
      },
      data: {
        // Only update the fields that were provided
        ...(playerUpdate.isReady !== undefined && { isReady: playerUpdate.isReady }),
        ...(playerUpdate.songsLoaded !== undefined && { songsLoaded: playerUpdate.songsLoaded }),
        ...(playerUpdate.loadingProgress !== undefined && { loadingProgress: playerUpdate.loadingProgress }),
        ...(playerUpdate.spotifyDeviceId !== undefined && { spotifyDeviceId: playerUpdate.spotifyDeviceId }),
        ...(playerUpdate.deviceName !== undefined && { deviceName: playerUpdate.deviceName }),
        ...(playerUpdate.playlistsSelected !== undefined && { playlistsSelected: playerUpdate.playlistsSelected }),
        // Always update the timestamp
        updatedAt: new Date()
      }
    })

    console.log(`✅ Updated player ${updatedPlayer.displayName}:`, {
      songsLoaded: updatedPlayer.songsLoaded,
      loadingProgress: updatedPlayer.loadingProgress,
      isReady: updatedPlayer.isReady
    })

    // 🆕 EMIT SOCKET EVENTS for different types of updates
    try {
      const io = (global as any).io
      if (io) {
        // 🔄 Progress update event
        if (playerUpdate.loadingProgress !== undefined) {
          io.to(gameCode).emit('game-updated', {
            action: 'player-loading-progress',
            userId: session.user.id,
            progress: playerUpdate.loadingProgress,
            message: `Loading ${playerUpdate.loadingProgress}%`,
            timestamp: new Date().toISOString()
          })
          console.log(`📊 Emitted progress update: ${playerUpdate.loadingProgress}%`)
        }

        // 🎵 Songs loaded event
        if (playerUpdate.songsLoaded !== undefined) {
          io.to(gameCode).emit('game-updated', {
            action: playerUpdate.songsLoaded ? 'player-songs-ready' : 'player-songs-reset',
            userId: session.user.id,
            songsLoaded: playerUpdate.songsLoaded,
            playerName: updatedPlayer.displayName,
            timestamp: new Date().toISOString()
          })
          console.log(`🎵 Emitted songs loaded event: ${playerUpdate.songsLoaded}`)
        }

        // ✅ Ready status event
        if (playerUpdate.isReady !== undefined) {
          io.to(gameCode).emit('game-updated', {
            action: 'player-ready-changed',
            userId: session.user.id,
            isReady: playerUpdate.isReady,
            playerName: updatedPlayer.displayName,
            timestamp: new Date().toISOString()
          })
          console.log(`✅ Emitted ready status: ${playerUpdate.isReady}`)
        }

        // 🔧 Device selection event
        if (playerUpdate.spotifyDeviceId !== undefined || playerUpdate.deviceName !== undefined) {
          io.to(gameCode).emit('game-updated', {
            action: 'player-device-changed',
            userId: session.user.id,
            deviceName: updatedPlayer.deviceName,
            playerName: updatedPlayer.displayName,
            timestamp: new Date().toISOString()
          })
          console.log(`🔧 Emitted device change: ${updatedPlayer.deviceName}`)
        }

        // 📋 Playlist selection event
        if (playerUpdate.playlistsSelected !== undefined) {
          io.to(gameCode).emit('game-updated', {
            action: 'player-playlists-selected',
            userId: session.user.id,
            playlistCount: updatedPlayer.playlistsSelected.length,
            playerName: updatedPlayer.displayName,
            timestamp: new Date().toISOString()
          })
          console.log(`📋 Emitted playlist selection: ${updatedPlayer.playlistsSelected.length} playlists`)
        }
      } else {
        console.warn('⚠️ Socket.io not available for real-time updates')
      }
    } catch (socketError) {
      console.error('❌ Error emitting socket events:', socketError)
      // Don't fail the request just because socket failed
    }

    // Fetch updated players list for response
    const allPlayers = await prisma.gamePlayer.findMany({
      where: { gameId: game.id },
      orderBy: { joinedAt: 'asc' }
    })

    const formattedPlayers: LobbyPlayer[] = allPlayers.map(player => ({
      id: player.id,
      userId: player.userId,
      displayName: player.displayName,
      spotifyDeviceId: player.spotifyDeviceId,
      deviceName: player.deviceName,
      playlistsSelected: player.playlistsSelected,
      songsLoaded: player.songsLoaded,
      loadingProgress: player.loadingProgress,
      joinedAt: player.joinedAt.toISOString(),
      isReady: player.isReady,
      isHost: player.isHost
    }))

    const updatedPlayerFormatted: LobbyPlayer = {
      id: updatedPlayer.id,
      userId: updatedPlayer.userId,
      displayName: updatedPlayer.displayName,
      spotifyDeviceId: updatedPlayer.spotifyDeviceId,
      deviceName: updatedPlayer.deviceName,
      playlistsSelected: updatedPlayer.playlistsSelected,
      songsLoaded: updatedPlayer.songsLoaded,
      loadingProgress: updatedPlayer.loadingProgress,
      joinedAt: updatedPlayer.joinedAt.toISOString(),
      isReady: updatedPlayer.isReady,
      isHost: updatedPlayer.isHost
    }

    return NextResponse.json({
      success: true,
      message: 'Player status updated atomically!',
      player: updatedPlayerFormatted,
      players: formattedPlayers
    })

  } catch (error) {
    console.error('❌ Error updating player:', error)
    
    // More specific error handling
    if (error instanceof Error) {
      if (error.message.includes('Record to update not found')) {
        return NextResponse.json(
          { error: 'Player not found in this game' }, 
          { status: 404 }
        )
      }
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          { error: 'Duplicate player entry' }, 
          { status: 409 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to update player status', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    )
  }
}

// DELETE - Leave game (optional, for cleanup)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const resolvedParams = await params
    const gameCode = resolvedParams.code.toUpperCase()

    // Find the game
    const game = await prisma.game.findUnique({
      where: { code: gameCode },
      select: { id: true }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Remove player from game
    const deletedPlayer = await prisma.gamePlayer.delete({
      where: {
        gameId_userId: {
          gameId: game.id,
          userId: session.user.id
        }
      }
    })

    // Emit socket event
    try {
      const io = (global as any).io
      if (io) {
        io.to(gameCode).emit('game-updated', {
          action: 'player-left',
          userId: session.user.id,
          playerName: deletedPlayer.displayName,
          timestamp: new Date().toISOString()
        })
      }
    } catch (socketError) {
      console.error('Error emitting player left event:', socketError)
    }

    return NextResponse.json({
      success: true,
      message: 'Left game successfully'
    })

  } catch (error) {
    console.error('Error leaving game:', error)
    return NextResponse.json(
      { error: 'Failed to leave game' }, 
      { status: 500 }
    )
  }
}