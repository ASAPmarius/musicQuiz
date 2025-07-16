import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { Server } from 'socket.io'
import { 
  validateRequest, 
  handleValidationError, 
  createSafeResponse, 
  getUserIdForRateLimit 
} from '@/lib/validation/middleware'
import { GameJoinSchema } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  try {
    // Check authentication first
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Validate and sanitize request data
    const validatedData = await validateRequest(request, GameJoinSchema, {
      userId: getUserIdForRateLimit(session.user.id),
      rateLimit: 'gameJoin'
    })

    const { gameCode, displayName } = validatedData

    // Find the game with existing players
    const game = await prisma.game.findUnique({
      where: { code: gameCode },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        players: true
      }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.status !== 'WAITING') {
      return NextResponse.json({ 
        error: 'Game has already started' 
      }, { status: 400 })
    }

    // Check if game is full
    if (game.players.length >= game.maxPlayers) {
      return NextResponse.json({ 
        error: 'Game is full' 
      }, { status: 400 })
    }

    // Check if user is already in the game
    const existingPlayer = game.players.find(p => p.userId === session.user.id)
    if (existingPlayer) {
      return NextResponse.json({ 
        error: 'You are already in this game' 
      }, { status: 400 })
    }

    // Check if display name is already taken (case-insensitive)
    const nameExists = game.players.some(p => 
      p.displayName.toLowerCase() === displayName.toLowerCase()
    )
    if (nameExists) {
      return NextResponse.json({ 
        error: 'Display name is already taken. Please choose a different name.',
        suggestions: [`${displayName}2`, `${displayName}_`, `${displayName}1`]
      }, { status: 400 })
    }

    // Create new player
    const newPlayer = await prisma.gamePlayer.create({
      data: {
        gameId: game.id,
        userId: session.user.id,
        displayName: displayName,
        spotifyDeviceId: null,
        deviceName: 'No device selected',
        playlistsSelected: [],
        songsLoaded: false,
        loadingProgress: 0,
        isReady: false,
        isHost: false,
        joinedAt: new Date(),
        updatedAt: new Date()
      }
    })

    // Format player data for response
    const newPlayerFormatted = {
      id: newPlayer.id,
      userId: newPlayer.userId,
      displayName: newPlayer.displayName,
      spotifyDeviceId: newPlayer.spotifyDeviceId,
      deviceName: newPlayer.deviceName,
      playlistsSelected: newPlayer.playlistsSelected,
      songsLoaded: newPlayer.songsLoaded,
      loadingProgress: newPlayer.loadingProgress,
      joinedAt: newPlayer.joinedAt.toISOString(),
      isReady: newPlayer.isReady,
      isHost: newPlayer.isHost
    }

    // Format all players for response
    const allPlayers = [...game.players, newPlayer]
    const formattedPlayers = allPlayers.map(p => ({
      id: p.id,
      userId: p.userId,
      displayName: p.displayName,
      spotifyDeviceId: p.spotifyDeviceId,
      deviceName: p.deviceName,
      playlistsSelected: p.playlistsSelected,
      songsLoaded: p.songsLoaded,
      loadingProgress: p.loadingProgress,
      joinedAt: p.joinedAt.toISOString(),
      isReady: p.isReady,
      isHost: p.isHost
    }))

    // Emit socket event to notify other players
    try {
      const io = (global as any).io as Server
      if (io) {
        io.to(gameCode).emit('game-updated', {
          action: 'player-joined',
          playerData: newPlayerFormatted,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      // Socket emission failed, but that's ok - the join still succeeded
      console.warn('Failed to emit socket event:', error)
    }

    // Return sanitized response
    return createSafeResponse({
      success: true,
      message: `Successfully joined game ${gameCode}`,
      game: {
        id: game.id,
        code: game.code,
        status: game.status,
        maxPlayers: game.maxPlayers,
        targetScore: game.targetScore,
        currentPlayers: formattedPlayers.length,
        players: formattedPlayers,
        host: game.host,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt
      }
    })

  } catch (error) {
    console.error('Error joining game:', error)
    return handleValidationError(error)
  }
}