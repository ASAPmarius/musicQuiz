import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { LobbyPlayer } from '@/lib/types/game'

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

    const resolvedParams = await params
    const gameCode = resolvedParams.code.toUpperCase()

    // Find the game with players from the new GamePlayer table
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
        // 🆕 Include players from the new GamePlayer table
        players: {
          include: {
            user: {
              select: {
                name: true,
                image: true
              }
            }
          },
          orderBy: {
            joinedAt: 'asc' // Show players in join order
          }
        }
      }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Check if user is in the game
    const userInGame = game.players.some((p) => p.userId === session.user.id)
    if (!userInGame) {
      return NextResponse.json({ 
        error: 'You are not a member of this game' 
      }, { status: 403 })
    }

    // 🆕 Convert GamePlayer database records to LobbyPlayer interface
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

    return NextResponse.json({
      success: true,
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

// 🆕 Updated PUT method for atomic player updates
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

    // Fetch updated players list for socket broadcast (optional)
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

    return NextResponse.json({
      success: true,
      message: 'Player status updated atomically!',
      player: {
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
      },
      players: formattedPlayers
    })

  } catch (error) {
    console.error('Error updating player:', error)
    return NextResponse.json(
      { error: 'Failed to update player status' }, 
      { status: 500 }
    )
  }
}