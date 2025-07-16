import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { 
  validateRequest, 
  handleValidationError, 
  createSafeResponse, 
  getUserIdForRateLimit 
} from '@/lib/validation/middleware'
import { GameCreationSchema } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Validate and sanitize request data
    const validatedData = await validateRequest(request, GameCreationSchema, {
      userId: getUserIdForRateLimit(session.user.id),
      rateLimit: 'gameCreate'
    })

    const { displayName, maxPlayers, targetScore } = validatedData

    // Generate a unique room code
    const generateRoomCode = (): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let result = ''
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      return result
    }

    let roomCode: string
    let attempts = 0
    const maxAttempts = 10

    // Ensure room code is unique
    do {
      roomCode = generateRoomCode()
      const existing = await prisma.game.findUnique({
        where: { code: roomCode }
      })
      if (!existing) break
      attempts++
    } while (attempts < maxAttempts)

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: 'Failed to generate unique room code. Please try again.' }, 
        { status: 500 }
      )
    }

    // Create game and host player in transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the game first
      const game = await tx.game.create({
        data: {
          code: roomCode,
          hostId: session.user.id,
          status: 'WAITING',
          maxPlayers,
          targetScore,
          settings: {
            maxPlayers,
            targetScore,
            createdAt: new Date().toISOString()
          },
          currentRound: 0
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

      // 2. Create the host player record in GamePlayer table
      const hostPlayer = await tx.gamePlayer.create({
        data: {
          gameId: game.id,
          userId: session.user.id,
          displayName: displayName, // Use validated display name
          spotifyDeviceId: null,
          deviceName: 'No device selected',
          playlistsSelected: [],
          songsLoaded: false,
          loadingProgress: 0,
          isReady: false,
          isHost: true,
          joinedAt: new Date(),
          updatedAt: new Date()
        }
      })

      return { game, hostPlayer }
    })

    // Convert the host player to LobbyPlayer format for response
    const hostPlayerFormatted = {
      id: result.hostPlayer.id,
      userId: result.hostPlayer.userId,
      displayName: result.hostPlayer.displayName,
      spotifyDeviceId: result.hostPlayer.spotifyDeviceId,
      deviceName: result.hostPlayer.deviceName,
      playlistsSelected: result.hostPlayer.playlistsSelected,
      songsLoaded: result.hostPlayer.songsLoaded,
      loadingProgress: result.hostPlayer.loadingProgress,
      joinedAt: result.hostPlayer.joinedAt.toISOString(),
      isReady: result.hostPlayer.isReady,
      isHost: result.hostPlayer.isHost
    }

    // Return sanitized response
    return createSafeResponse({
      success: true,
      message: `Game created successfully! Room code: ${roomCode}`,
      game: {
        id: result.game.id,
        code: result.game.code,
        status: result.game.status,
        maxPlayers: result.game.maxPlayers,
        targetScore: result.game.targetScore,
        currentPlayers: 1,
        players: [hostPlayerFormatted], 
        host: result.game.host,
        songCache: [],
        settings: result.game.settings,
        createdAt: result.game.createdAt,
        updatedAt: result.game.updatedAt
      }
    })

  } catch (error) {
    console.error('Error creating game:', error)
    return handleValidationError(error)
  }
}