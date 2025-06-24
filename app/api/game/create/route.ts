import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { LobbyPlayer, playersToJSON } from '@/lib/types/game'

// Generate a unique 6-character room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      maxPlayers = 8, 
      roundCount = 10,
      displayName = session.user.name || 'Host'
    } = body

    // Validate input
    if (maxPlayers < 2 || maxPlayers > 20) {
      return NextResponse.json({ error: 'Max players must be between 2 and 20' }, { status: 400 })
    }

    if (roundCount < 5 || roundCount > 50) {
      return NextResponse.json({ error: 'Round count must be between 5 and 50' }, { status: 400 })
    }

    // Generate unique room code
    let roomCode: string
    let attempts = 0
    do {
      roomCode = generateRoomCode()
      attempts++
      
      // Safety check - prevent infinite loop
      if (attempts > 10) {
        throw new Error('Failed to generate unique room code')
      }
      
      // Check if code already exists
      const existingGame = await prisma.game.findUnique({
        where: { code: roomCode }
      })
      
      if (!existingGame) break
    } while (true)

    // Create the host player object with proper typing
    const hostPlayer: LobbyPlayer = {
      userId: session.user.id,
      displayName,
      spotifyDeviceId: null,
      deviceName: 'No device selected',
      playlistsSelected: [],
      songsLoaded: false,
      loadingProgress: 0,
      joinedAt: new Date().toISOString(),
      isReady: false,
      isHost: true
    }

    // Create game with host as first player
    const game = await prisma.game.create({
      data: {
        code: roomCode,
        hostId: session.user.id,
        status: 'WAITING',
        maxPlayers,
        roundCount,
        players: playersToJSON([hostPlayer]), // Convert to JSON
        settings: {
          maxPlayers,
          roundCount,
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

    return NextResponse.json({
      success: true,
      game: {
        id: game.id,
        code: game.code,
        status: game.status,
        maxPlayers: game.maxPlayers,
        roundCount: game.roundCount,
        currentPlayers: 1,
        players: game.players,
        host: game.host,
        createdAt: game.createdAt
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