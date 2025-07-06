import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { Server } from 'socket.io'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { gameCode, displayName } = await request.json()

    if (!gameCode || !displayName?.trim()) {
      return NextResponse.json(
        { error: 'Game code and display name are required' }, 
        { status: 400 }
      )
    }

    const upperGameCode = gameCode.toUpperCase()

    // Find the game with existing players
    const game = await prisma.game.findUnique({
      where: { code: upperGameCode },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        players: true  // Get existing players from GamePlayer table
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

    // Check if display name is already taken
    const nameExists = game.players.some(p => 
      p.displayName.toLowerCase() === displayName.trim().toLowerCase()
    )
    if (nameExists) {
      return NextResponse.json({ 
        error: 'Display name is already taken. Please choose a different name.' 
      }, { status: 400 })
    }

    // 🎯 ADD PLAYER TO GAME - Uses GamePlayer table directly
    const result = await prisma.$transaction(async (tx) => {
      // Create new player record
      const newPlayer = await tx.gamePlayer.create({
        data: {
          gameId: game.id,
          userId: session.user.id,
          displayName: displayName.trim(),
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

      // Get all players including the new one
      const allPlayers = await tx.gamePlayer.findMany({
        where: { gameId: game.id },
        orderBy: { joinedAt: 'asc' }
      })

      return { newPlayer, allPlayers }
    })

    // Format players for response
    const formattedPlayers = result.allPlayers.map(player => ({
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

    const newPlayerFormatted = {
      id: result.newPlayer.id,
      userId: result.newPlayer.userId,
      displayName: result.newPlayer.displayName,
      spotifyDeviceId: result.newPlayer.spotifyDeviceId,
      deviceName: result.newPlayer.deviceName,
      playlistsSelected: result.newPlayer.playlistsSelected,
      songsLoaded: result.newPlayer.songsLoaded,
      loadingProgress: result.newPlayer.loadingProgress,
      joinedAt: result.newPlayer.joinedAt.toISOString(),
      isReady: result.newPlayer.isReady,
      isHost: result.newPlayer.isHost
    }

    try {
      // Emit socket event for real-time updates
      const io = (global as any).io as Server
      if (io) {
        io.to(upperGameCode).emit('game-updated', {
          action: 'player-joined',
          playerData: newPlayerFormatted,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      // Socket emission failed, but that's ok - the join still succeeded
      console.warn('Failed to emit socket event:', error)
    }

    return NextResponse.json({
      success: true,
      message: `Successfully joined game ${upperGameCode}`,
      game: {
        id: game.id,
        code: game.code,
        status: game.status,
        maxPlayers: game.maxPlayers,
        targetScore: game.targetScore,
        currentPlayers: formattedPlayers.length,
        players: formattedPlayers,
        host: game.host,
        createdAt: game.createdAt
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