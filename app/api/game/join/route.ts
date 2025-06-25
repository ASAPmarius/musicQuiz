import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { LobbyPlayer, parsePlayersFromJSON, playersToJSON } from '@/lib/types/game'
import { Server } from 'socket.io'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      gameCode,
      displayName = session.user.name || 'Player'
    } = body

    // Validate input
    if (!gameCode || gameCode.length !== 6) {
      return NextResponse.json({ error: 'Invalid game code' }, { status: 400 })
    }

    if (!displayName.trim()) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 })
    }

    // Find the game
    const game = await prisma.game.findUnique({
      where: { code: gameCode.toUpperCase() },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Check game status
    if (game.status !== 'WAITING') {
      return NextResponse.json({ 
        error: game.status === 'PLAYING' ? 'Game already in progress' : 'Game has ended' 
      }, { status: 400 })
    }

    // Parse current players with safe conversion
    const currentPlayers = parsePlayersFromJSON(game.players)

    // Check if user is already in the game
    const existingPlayer = currentPlayers.find((p) => p.userId === session.user.id)
    if (existingPlayer) {
      return NextResponse.json({ 
        error: 'You are already in this game',
        game: {
          id: game.id,
          code: game.code,
          status: game.status,
          maxPlayers: game.maxPlayers,
          roundCount: game.roundCount,
          currentPlayers: currentPlayers.length,
          players: currentPlayers,
          host: game.host,
          createdAt: game.createdAt
        }
      }, { status: 200 })
    }

    // Check if game is full
    if (currentPlayers.length >= game.maxPlayers) {
      return NextResponse.json({ error: 'Game is full' }, { status: 400 })
    }

    // Check for duplicate display names
    const nameExists = currentPlayers.some((p) => 
      p.displayName.toLowerCase() === displayName.trim().toLowerCase()
    )
    if (nameExists) {
      return NextResponse.json({ 
        error: 'Display name already taken. Please choose a different name.' 
      }, { status: 400 })
    }

    // Create new player object with proper typing
    const newPlayer: LobbyPlayer = {
      userId: session.user.id,
      displayName: displayName.trim(),
      spotifyDeviceId: null,
      deviceName: 'No device selected',
      playlistsSelected: [],
      songsLoaded: false,
      loadingProgress: 0,
      joinedAt: new Date().toISOString(),
      isReady: false,
      isHost: false
    }

    // Add player to game
    const updatedPlayers = [...currentPlayers, newPlayer]

    const updatedGame = await prisma.game.update({
      where: { id: game.id },
      data: {
        players: playersToJSON(updatedPlayers) // Convert to JSON
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      }
    })

    try {
      // Emit socket event for real-time updates
      const io = (global as any).io as Server
      if (io) {
        io.to(gameCode.toUpperCase()).emit('game-updated', {
          action: 'player-joined',
          playerData: newPlayer,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      // Socket emission failed, but that's ok - the join still succeeded
      console.warn('Failed to emit socket event:', error)
    }

    return NextResponse.json({
      success: true,
      message: `Successfully joined game ${gameCode}`,
      game: {
        id: updatedGame.id,
        code: updatedGame.code,
        status: updatedGame.status,
        maxPlayers: updatedGame.maxPlayers,
        roundCount: updatedGame.roundCount,
        currentPlayers: updatedPlayers.length,
        players: updatedPlayers,
        host: updatedGame.host,
        createdAt: updatedGame.createdAt
      }
    })

  } catch (error) {
    console.error('Error joining game:', error)
    return NextResponse.json(
      { error: 'Failed to join game' }, 
      { status: 500 }
    )
  }
}