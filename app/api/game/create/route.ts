import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { maxPlayers = 8, targetScore = 30 } = await request.json()

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
        { error: 'Failed to generate unique room code' }, 
        { status: 500 }
      )
    }

    // 🎯 CREATE GAME AND HOST PLAYER IN TRANSACTION
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
          currentRound: 0,
          songCache: []
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
          displayName: session.user.name || 'Host',
          spotifyDeviceId: null,
          deviceName: 'No device selected',
          playlistsSelected: [],
          songsLoaded: false,
          loadingProgress: 0,
          isReady: false,
          isHost: true,  // Mark as host
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

    return NextResponse.json({
      success: true,
      game: {
        id: result.game.id,
        code: result.game.code,
        status: result.game.status,
        maxPlayers: result.game.maxPlayers,
        targetScore: result.game.targetScore,
        currentPlayers: 1,
        players: [hostPlayerFormatted], // Array with just the host
        host: result.game.host,
        createdAt: result.game.createdAt
      }
    })

  } catch (error) {
    console.error('Error creating game:', error)
    return NextResponse.json(
      { error: 'Failed to create game' }, 
      { status: 500 }
    )
  }
}