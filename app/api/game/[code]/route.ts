import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { LobbyPlayer, GameData, Song } from '@/lib/types/game'
import { prisma } from '@/lib/prisma'
import { 
  validateRequest, 
  validateParams, 
  handleValidationError, 
  createSafeResponse, 
  getUserIdForRateLimit 
} from '@/lib/validation/middleware'
import { PlayerUpdateSchema, GameCodeParamSchema } from '@/lib/validation/schemas'

interface RouteParams {
  params: Promise<{
    code: string
  }>
}

// GET - Fetch game details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Validate route parameters
    const resolvedParams = await params
    const { code: gameCode } = validateParams(resolvedParams, GameCodeParamSchema)
    
    console.log('🔍 Fetching game details for:', gameCode)

    // Find game with all players AND songs using JOINs (normalized approach)
    const game = await prisma.game.findUnique({
      where: { code: gameCode },
      include: {
        host: true,
        players: {
          orderBy: { joinedAt: 'asc' }
        },
        // 🆕 NEW: Include normalized song data via JOINs
        gameSongs: {
          include: {
            song: {
              include: {
                playerSongs: {
                  where: { gameId: undefined }, // Will be set below
                  select: {
                    playerId: true,
                    sourceType: true,
                    sourceName: true,
                    sourceId: true,
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!game) {
      console.log('❌ Game not found:', gameCode)
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // 🆕 NEW: Transform normalized song data back to original format
    const songCache: Song[] = game.gameSongs.map(gs => {
      // Get player song info for this specific game
      const playerSongsForThisGame = gs.song.playerSongs.length > 0 
        ? gs.song.playerSongs 
        : []

      // If playerSongs is empty, we need to fetch it separately
      // This is a limitation of Prisma's include - we'll fix it below
      
      return {
        id: gs.song.spotifyId,
        name: gs.song.name,
        artists: gs.song.artistName,
        album: gs.song.albumName,
        coverUrl: gs.song.coverUrl || undefined,
        owners: [] // Will be populated below
      }
    })

    // 🔧 FIX: Get player song relationships separately (more efficient)
    if (songCache.length > 0) {
      const songIds = game.gameSongs.map(gs => gs.song.id)
      const playerSongs = await prisma.playerSong.findMany({
        where: {
          gameId: game.id,
          songId: { in: songIds }
        },
        include: {
          song: {
            select: { spotifyId: true }
          }
        }
      })

      // Map player songs back to song cache
      songCache.forEach(song => {
        const relatedPlayerSongs = playerSongs.filter(ps => ps.song.spotifyId === song.id)
        song.owners = relatedPlayerSongs.map(ps => {
          const player = game.players.find(p => p.userId === ps.playerId)
          return {
            playerId: ps.playerId,
            playerName: player?.displayName || 'Unknown Player',
            source: {
              type: ps.sourceType as 'playlist' | 'liked' | 'album',
              name: ps.sourceName,
              id: ps.sourceId || undefined
            }
          }
        })
      })
    }

    // Format players as LobbyPlayer objects (unchanged)
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

    console.log(`✅ Found game ${gameCode} with ${currentPlayers.length} players and ${songCache.length} songs`)

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
        songCache: songCache, // 🆕 NEW: Transformed from normalized data
        createdAt: game.createdAt,
        updatedAt: game.updatedAt
      }
    })

  } catch (error) {
    console.error('Error fetching game:', error)
    return handleValidationError(error)
  }
}

export async function PUT(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Validate route parameters
    const { code: gameCode } = validateParams(params, GameCodeParamSchema)

    // ✅ Read body ONCE and then validate it
    const body = await request.json()
    console.log('🚨 DEBUG: Raw request body:', JSON.stringify(body, null, 2))
    console.log('🚨 DEBUG: playerUpdate field:', body.playerUpdate)
    
    // ✅ Validate the pre-parsed body instead of re-reading
    const validatedData = PlayerUpdateSchema.parse(body.playerUpdate)
    
    console.log('🔍 DEBUG: Fields being updated:', Object.keys(validatedData))
    console.log('🔍 DEBUG: playlistsSelected value:', validatedData.playlistsSelected)
    console.log('🔍 DEBUG: deviceName value:', validatedData.deviceName)
    console.log('🔍 DEBUG: spotifyDeviceId value:', validatedData.spotifyDeviceId)

    // Find game first
    const game = await prisma.game.findUnique({
      where: { code: gameCode },
      include: {
        players: true
      }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Check if user is in this game
    const playerExists = game.players.some(p => p.userId === session.user.id)
    if (!playerExists) {
      return NextResponse.json({ error: 'You are not in this game' }, { status: 403 })
    }

    // Update player in database
    const updatedPlayer = await prisma.gamePlayer.update({
      where: {
        gameId_userId: {
          gameId: game.id,
          userId: session.user.id
        }
      },
      data: {
        ...validatedData,
        updatedAt: new Date()
      }
    })

    console.log('✅ Player updated successfully:', updatedPlayer.displayName)

    // 🔧 FIXED: Emit socket event to ALL players in the game with specific action
    const io = (global as any).io
    if (io) {
      // Determine the specific action based on what was updated
      let action = 'player-updated' // default
      
      if (validatedData.playlistsSelected !== undefined) {
        action = 'playlists-changed'  // ← Move this FIRST
        console.log('🎯 Setting action to playlists-changed')
      } else if (validatedData.isReady !== undefined) {
        action = 'player-ready-changed'
      } else if (validatedData.spotifyDeviceId !== undefined || validatedData.deviceName !== undefined) {
        action = 'device-changed'
        console.log('🎯 Setting action to device-changed because device fields present')
      } else if (validatedData.songsLoaded !== undefined || validatedData.loadingProgress !== undefined) {
        action = 'loading-progress-changed'
      }

      console.log('🎯 Final action chosen:', action)
      console.log('🔄 About to emit WebSocket event')
      console.log('🔄 Action will be:', action)
      console.log('🔄 Player update data:', validatedData)
      console.log('🔄 Game code for emission:', gameCode)
      
      // Emit to ALL players in the room (including the one who made the update)
      io.to(gameCode).emit('game-updated', {
        action: action,
        playerId: session.user.id,
        playerUpdate: validatedData,
        timestamp: new Date().toISOString()
      })
    }

    // Return sanitized response
    return createSafeResponse({ 
      success: true, 
      message: 'Player updated successfully',
      player: {
        id: updatedPlayer.id,
        userId: updatedPlayer.userId,
        displayName: updatedPlayer.displayName,
        spotifyDeviceId: updatedPlayer.spotifyDeviceId,
        deviceName: updatedPlayer.deviceName,
        playlistsSelected: updatedPlayer.playlistsSelected,
        songsLoaded: updatedPlayer.songsLoaded,
        loadingProgress: updatedPlayer.loadingProgress,
        isReady: updatedPlayer.isReady,
        isHost: updatedPlayer.isHost,
        joinedAt: updatedPlayer.joinedAt.toISOString(),
        updatedAt: updatedPlayer.updatedAt.toISOString()
      }
    })

  } catch (error) {
    console.error('Error updating player:', error)
    return handleValidationError(error)
  }
}