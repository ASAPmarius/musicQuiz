// ========================================
// COMPLETE FIXED VERSION - NO ARTIFICIAL LIMITS
// ========================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface RouteParams {
  params: Promise<{
    code: string
  }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  let gameCode: string = ''
  let session: any = null
  let game: any = null
  
  try {
    // Check authentication
    session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Check for refresh error
    if (session?.error === "RefreshAccessTokenError") {
      console.log('❌ Token refresh failed, user needs to re-login')
      return NextResponse.json({ 
        error: 'Token refresh failed', 
        needsReauth: true 
      }, { status: 401 })
    }

    const accessToken = session.accessToken
    if (!accessToken) {
      return NextResponse.json({ 
        error: 'No access token', 
        needsReauth: true 
      }, { status: 401 })
    }

    const resolvedParams = await params
    gameCode = resolvedParams.code.toUpperCase()
    
    const { selectedPlaylistIds } = await request.json()

    console.log(`🎵 Loading songs for game ${gameCode} with ${selectedPlaylistIds.length} selected playlists`)

    // Find the game and current player
    game = await prisma.game.findUnique({
      where: { code: gameCode },
      include: {
        players: {
          where: { userId: session.user.id }
        }
      }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const currentPlayer = game.players[0]
    if (!currentPlayer) {
      return NextResponse.json({ error: 'Player not found in game' }, { status: 404 })
    }

    // Base URL for API calls
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    
    // 🔧 FIXED: Progress tracking that works with large libraries
    let totalProcessed = 0

    const updateProgress = async (progress: number, message: string) => {
      // 🔧 FIX: Round progress to integer
      const roundedProgress = Math.round(Math.min(100, Math.max(0, progress)))
      console.log(`📊 Progress: ${roundedProgress}% - ${message}`)
      
      try {
        await prisma.gamePlayer.update({
          where: {
            gameId_userId: {
              gameId: game.id,
              userId: session.user.id
            }
          },
          data: { loadingProgress: roundedProgress }
        })

        // Emit socket event
        const io = (global as any).io
        if (io) {
          io.to(gameCode).emit('game-updated', {
            action: 'player-loading-progress',
            userId: session.user.id,
            progress: roundedProgress, // Send rounded progress
            message,
            timestamp: new Date().toISOString()
          })
        }
      } catch (error) {
        console.error('Error updating progress:', error)
      }
    }

    const updateSmartProgress = async (songsProcessed: number, currentSource: string, phase: 'playlists' | 'liked' | 'albums') => {
      totalProcessed = songsProcessed
      
      let baseProgress = 0
      let maxProgress = 0
      
      // Different phases get different progress ranges
      switch (phase) {
        case 'playlists':
          baseProgress = 20
          maxProgress = 50
          break
        case 'liked':
          baseProgress = 50
          maxProgress = 70
          break
        case 'albums':
          baseProgress = 70
          maxProgress = 95
          break
      }
      
      // 🔧 FIX: Calculate progress and round to integer
      const phaseProgress = Math.min(maxProgress, baseProgress + ((songsProcessed % 500) / 500) * (maxProgress - baseProgress))
      const roundedProgress = Math.round(phaseProgress)
      
      await updateProgress(
        roundedProgress, 
        `${currentSource} (${songsProcessed} songs collected)`
      )
    }

    // Initialize
    const songs: any[] = []
    const seenSongIds = new Set<string>()
    
    await updateProgress(5, 'Starting song collection...')

    await updateProgress(10, 'Loading your playlists...')
    
    const playlistsResponse = await fetch(`${baseUrl}/api/spotify/playlists`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!playlistsResponse.ok) {
      throw new Error(`Failed to fetch playlists: ${playlistsResponse.status}`)
    }

    const allPlaylists = await playlistsResponse.json()
    await updateProgress(15, 'Playlists loaded successfully')

    // Process selected playlists
    await updateProgress(20, 'Processing selected playlists...')
    
    for (let i = 0; i < selectedPlaylistIds.length; i++) {
      const playlistId = selectedPlaylistIds[i]
      const playlist = allPlaylists.find((p: any) => p.id === playlistId)
      
      if (!playlist) {
        console.warn(`Playlist ${playlistId} not found`)
        continue
      }

      try {
        await updateProgress(
          Math.round(20 + (i / selectedPlaylistIds.length) * 30), 
          `Loading "${playlist.name}" (${i + 1}/${selectedPlaylistIds.length})`
        )

        const tracksResponse = await fetch(`${baseUrl}/api/spotify/playlist/${playlistId}/tracks`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (!tracksResponse.ok) {
          console.error(`Failed to fetch tracks for playlist ${playlist.name}:`, tracksResponse.status)
          continue
        }

        const tracksData = await tracksResponse.json()
        const tracks = Array.isArray(tracksData) ? tracksData : (tracksData.items || [])

        tracks.forEach((track: any) => {
          if (track && track.id && !seenSongIds.has(track.id)) {
            seenSongIds.add(track.id)
            songs.push({
              id: track.id,
              name: track.name,
              artists: track.artists,
              album: track.album,
              owners: [{
                playerId: session.user.id,
                playerName: currentPlayer.displayName,
                source: { 
                  type: 'playlist', 
                  name: playlist.name,
                  id: playlist.id
                }
              }]
            })
          }
        })

        await updateSmartProgress(songs.length, `"${playlist.name}"`, 'playlists')
        
      } catch (playlistError) {
        console.error(`Error processing playlist ${playlistId}:`, playlistError)
      }
    }

    // 2. 🔧 FIXED: Fetch ALL liked songs (NO LIMITS)
    await updateProgress(50, 'Loading your liked songs...')
    
    try {
      const likedResponse = await fetch(`${baseUrl}/api/spotify/liked-songs`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (likedResponse.ok) {
        const likedSongs = await likedResponse.json()
        
        if (Array.isArray(likedSongs)) {
          likedSongs.forEach((track: any) => {
            if (track && track.id && !seenSongIds.has(track.id)) {
              seenSongIds.add(track.id)
              songs.push({
                id: track.id,
                name: track.name,
                artists: track.artists,
                album: track.album,
                owners: [{
                  playerId: session.user.id,
                  playerName: currentPlayer.displayName,
                  source: { type: 'liked', name: 'Liked Songs' }
                }]
              })
            }
          })
          
          await updateSmartProgress(songs.length, 'Liked Songs', 'liked')
        }
      }
    } catch (likedError) {
      console.error('Error processing liked songs:', likedError)
    }

    // 3. 🔧 FIXED: Fetch ALL saved albums (NO LIMITS)
    await updateProgress(70, 'Loading your saved albums...')
    
    try {
      const albumsResponse = await fetch(`${baseUrl}/api/spotify/saved-albums`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (albumsResponse.ok) {
        const savedAlbums = await albumsResponse.json()
        
        if (Array.isArray(savedAlbums)) {
          // 🔧 FIXED: Process ALL albums (not just 20!)
          for (let i = 0; i < savedAlbums.length; i++) {
            const savedAlbum = savedAlbums[i]
            
            try {
              await updateProgress(
                Math.round(70 + (i / savedAlbums.length) * 20),
                `Loading album "${savedAlbum.name}" (${i + 1}/${savedAlbums.length})`
              )

              // Rate limiting to avoid hitting Spotify limits
              await new Promise(resolve => setTimeout(resolve, 100))

              const albumTracksResponse = await fetch(`${baseUrl}/api/spotify/album/${savedAlbum.id}/tracks`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              })
              
              if (albumTracksResponse.ok) {
                const albumTracksData = await albumTracksResponse.json()
                const albumTracks = Array.isArray(albumTracksData) ? albumTracksData : (albumTracksData.items || [])
              
                albumTracks.forEach((track: any) => {
                  if (track && track.id && !seenSongIds.has(track.id)) {
                    seenSongIds.add(track.id)
                    songs.push({
                      id: track.id,
                      name: track.name,
                      artists: track.artists,
                      album: savedAlbum.name,
                      owners: [{
                        playerId: session.user.id,
                        playerName: currentPlayer.displayName,
                        source: { 
                          type: 'album', 
                          name: savedAlbum.name,
                          id: savedAlbum.id
                        }
                      }]
                    })
                  }
                })
                
                await updateSmartProgress(songs.length, `"${savedAlbum.name}"`, 'albums')
              }
            } catch (albumError) {
              console.error(`Error processing album ${savedAlbum.name}:`, albumError)
            }
          }
        }
      }
    } catch (albumsError) {
      console.error('Error processing saved albums:', albumsError)
    }

    await updateProgress(95, 'Finalizing and saving songs...')

    // 4. Save to database in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update player status
      const updatedPlayer = await tx.gamePlayer.update({
        where: {
          gameId_userId: {
            gameId: game.id,
            userId: session.user.id
          }
        },
        data: {
          songsLoaded: true,
          loadingProgress: 100,
          playlistsSelected: selectedPlaylistIds,
          updatedAt: new Date()
        }
      })
      
      // Store songs separately for this player
      const gameSongs = await tx.gameSongs.upsert({
        where: {
          gameId_playerId: {
            gameId: game.id,
            playerId: session.user.id
          }
        },
        update: {
          songs: songs,
          updatedAt: new Date()
        },
        create: {
          gameId: game.id,
          playerId: session.user.id,
          songs: songs
        }
      })
      
      // Get total song count from all players
      const allPlayerSongs = await tx.gameSongs.findMany({
        where: { gameId: game.id },
        select: { songs: true }
      })

      let totalSongCount = 0
      allPlayerSongs.forEach(playerSongs => {
        const songsArray = playerSongs.songs as any[]
        if (Array.isArray(songsArray)) {
          totalSongCount += songsArray.length
        }
      })
      
      return { updatedPlayer, gameSongs, totalSongCount }
    })

    // Final progress update
    await updateProgress(100, `Successfully loaded ${songs.length} songs!`)

    // Emit socket update
    const io = (global as any).io
    if (io) {
      io.to(gameCode).emit('game-updated', {
        action: 'player-songs-ready',
        userId: session.user.id,
        songCount: songs.length,
        totalCachedSongs: result.totalSongCount,
        timestamp: new Date().toISOString()
      })
    }

    console.log(`✅ Successfully loaded ${songs.length} songs for ${currentPlayer.displayName}`)

    return NextResponse.json({ 
      success: true, 
      songCount: songs.length,
      totalCachedSongs: result.totalSongCount,
      breakdown: {
        likedSongs: songs.filter(s => s.owners[0].source.type === 'liked').length,
        savedAlbums: songs.filter(s => s.owners[0].source.type === 'album').length,
        playlists: songs.filter(s => s.owners[0].source.type === 'playlist').length
      }
    })

  } catch (mainError) {
    console.error('Error loading songs:', mainError)
    
    // Reset player status on error
    try {
      if (session?.user?.id && game?.id) {
        await prisma.gamePlayer.update({
          where: {
            gameId_userId: {
              gameId: game.id,
              userId: session.user.id
            }
          },
          data: {
            loadingProgress: 0,
            songsLoaded: false,
            updatedAt: new Date()
          }
        })

        if (gameCode) {
          const io = (global as any).io
          if (io) {
            io.to(gameCode).emit('game-updated', {
              action: 'player-loading-error',
              userId: session.user.id,
              timestamp: new Date().toISOString()
            })
          }
        }
      }
    } catch (resetError) {
      console.error('Failed to reset player status after error:', resetError)
    }

    return NextResponse.json(
      { error: 'Failed to load songs', details: mainError instanceof Error ? mainError.message : 'Unknown error' }, 
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}