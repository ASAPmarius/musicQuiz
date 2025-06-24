import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { LobbyPlayer, parsePlayersFromJSON, playersToJSON } from '@/lib/types/game'

interface RouteParams {
  params: {
    code: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const gameCode = params.code.toUpperCase()

    // Find the game
    const game = await prisma.game.findUnique({
      where: { code: gameCode },
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

    // Parse current players with safe conversion
    const currentPlayers = parsePlayersFromJSON(game.players)

    // Check if user is in the game
    const userInGame = currentPlayers.some((p) => p.userId === session.user.id)
    if (!userInGame) {
      return NextResponse.json({ 
        error: 'You are not a member of this game' 
      }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      game: {
        id: game.id,
        code: game.code,
        status: game.status,
        maxPlayers: game.maxPlayers,
        roundCount: game.roundCount,
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

// Update player status in game
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const gameCode = params.code.toUpperCase()
    const body = await request.json()
    const { playerUpdate } = body

    // Find the game
    const game = await prisma.game.findUnique({
      where: { code: gameCode }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Parse current players with safe conversion
    const currentPlayers = parsePlayersFromJSON(game.players)

    // Find the player to update
    const playerIndex = currentPlayers.findIndex((p) => p.userId === session.user.id)
    if (playerIndex === -1) {
      return NextResponse.json({ 
        error: 'You are not a member of this game' 
      }, { status: 403 })
    }

    // Update the player's information
    const updatedPlayers = [...currentPlayers]
    updatedPlayers[playerIndex] = {
      ...updatedPlayers[playerIndex],
      ...playerUpdate,
      // Prevent changing certain protected fields
      userId: updatedPlayers[playerIndex].userId,
      joinedAt: updatedPlayers[playerIndex].joinedAt,
      isHost: updatedPlayers[playerIndex].isHost
    }

    // Update the game
    const updatedGame = await prisma.game.update({
      where: { id: game.id },
      data: {
        players: playersToJSON(updatedPlayers), // Convert to JSON
        updatedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Player status updated',
      players: updatedPlayers
    })

  } catch (error) {
    console.error('Error updating player status:', error)
    return NextResponse.json(
      { error: 'Failed to update player status' }, 
      { status: 500 }
    )
  }
}