import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'

// Quick scan function to get actual counts (NEW!)
async function getLibraryStats(accessToken: string, selectedPlaylistIds: string[], baseUrl: string) {
  let totalSongs = 0
  const breakdown = { liked: 0, albums: 0, playlists: 0 }

  // 1. Count liked songs
  try {
    const likedResponse = await fetch(`${baseUrl}/api/spotify/liked-songs`, {
      method: 'HEAD', // Just get headers to check total count
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (likedResponse.ok) {
      // If HEAD doesn't work, do a quick GET with limit=1
      const likedCountResponse = await fetch(`${baseUrl}/api/spotify/liked-songs?limit=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (likedCountResponse.ok) {
        const likedData = await likedCountResponse.json()
        // Spotify returns total count in the response
        breakdown.liked = likedData.total || 0
        totalSongs += breakdown.liked
      }
    }
  } catch (error) {
    console.warn('Could not count liked songs:', error)
    // Fallback estimate
    breakdown.liked = 200
    totalSongs += breakdown.liked
  }

  // 2. Count saved albums (get total tracks across all albums)
  try {
    const albumsResponse = await fetch(`${baseUrl}/api/spotify/saved-albums`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (albumsResponse.ok) {
      const albumsData = await albumsResponse.json()
      if (Array.isArray(albumsData)) {
        albumsData.forEach((album: any) => {
          breakdown.albums += album.total_tracks || 12 // Average album size
        })
        totalSongs += breakdown.albums
      }
    }
  } catch (error) {
    console.warn('Could not count album tracks:', error)
    // Fallback estimate based on typical library
    breakdown.albums = 300
    totalSongs += breakdown.albums
  }

  // 3. Count playlist tracks
  for (const playlistId of selectedPlaylistIds) {
    try {
      const playlistResponse = await fetch(`${baseUrl}/api/spotify/playlist/${playlistId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (playlistResponse.ok) {
        const playlist = await playlistResponse.json()
        const trackCount = playlist.tracks?.total || 0
        breakdown.playlists += trackCount
        totalSongs += trackCount
      }
    } catch (error) {
      console.warn(`Could not count playlist ${playlistId} tracks:`, error)
      // Add fallback estimate for this playlist
      breakdown.playlists += 30 // Average playlist size
      totalSongs += 30
    }
  }

  return { totalSongs, breakdown }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  // Declare variables at function scope so they're accessible in catch block
  let session: any = null
  let gameCode: string = ''
  let game: any = null

  try {
    session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const resolvedParams = await params
    gameCode = resolvedParams.code.toUpperCase()
    const body = await request.json()
    const { selectedPlaylistIds } = body

    if (!Array.isArray(selectedPlaylistIds)) {
      return NextResponse.json({ error: 'Invalid playlists' }, { status: 400 })
    }

    // 1. Find the game
    game = await prisma.game.findUnique({
      where: { code: gameCode },
      include: { players: true }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // 2. Find current player
    const currentPlayer = game.players.find((p: any) => p.userId === session.user.id)
    if (!currentPlayer) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    // 3. Helper to update progress
    const updateProgress = async (progress: number, message?: string) => {
      try {
        await prisma.gamePlayer.update({
          where: {
            gameId_userId: {
              gameId: game.id,
              userId: session.user.id
            }
          },
          data: {
            loadingProgress: progress,
            updatedAt: new Date()
          }
        })

        // Emit socket update
        const io = (global as any).io
        if (io) {
          io.to(gameCode).emit('game-updated', {
            action: 'player-loading-progress',
            userId: session.user.id,
            progress,
            message,
            timestamp: new Date().toISOString()
          })
        }
      } catch (error) {
        console.error('Failed to update progress:', error)
      }
    }

    // 4. Get access token
    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'spotify' }
    })

    if (!account?.access_token) {
      return NextResponse.json({ error: 'No Spotify access token' }, { status: 401 })
    }

    const accessToken = account.access_token
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    // 5. Initialize progress
    await updateProgress(5, 'Starting to fetch your music library...')

    // 6. PHASE 1: Quick scan to get actual counts (NEW APPROACH!)
    await updateProgress(10, 'Scanning your music library...')
    
    const libraryStats = await getLibraryStats(accessToken, selectedPlaylistIds, baseUrl)
    
    await updateProgress(15, `Found ${libraryStats.totalSongs} songs to process!`)
    console.log('📊 Library stats:', libraryStats)

    // 7. PHASE 2: Load songs with accurate progress
    const songs: any[] = []
    const seenSongIds = new Set<string>()
    
    // Track songs processed from each source (including duplicates)
    const sourceStats = {
      likedSongs: 0,
      savedAlbums: 0,
      playlists: 0
    }

    const updateSongProgress = async (processed: number, source: string) => {
      // Now we have REAL total, so progress is accurate
      const progress = Math.min(15 + Math.floor((processed / libraryStats.totalSongs) * 70), 85)
      await updateProgress(progress, `Loading from ${source}... (${processed}/${libraryStats.totalSongs})`)
    }

    // Load liked songs
    try {
      console.log('🔄 Fetching liked songs...')
      const likedResponse = await fetch(`${baseUrl}/api/spotify/liked-songs`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (likedResponse.ok) {
        const likedSongs = await likedResponse.json()
        if (Array.isArray(likedSongs)) {
          likedSongs.forEach((track: any) => {
            if (track && track.id) {
              sourceStats.likedSongs++ // Count every song processed
              
              if (!seenSongIds.has(track.id)) {
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
            }
          })
          await updateSongProgress(songs.length, 'Liked Songs')
        }
      }
    } catch (likedError) {
      console.error('Error processing liked songs:', likedError)
    }

    // Load saved albums
    try {
      console.log('🔄 Fetching saved albums...')
      const albumsResponse = await fetch(`${baseUrl}/api/spotify/saved-albums`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (albumsResponse.ok) {
        const savedAlbums = await albumsResponse.json()
        if (Array.isArray(savedAlbums)) {
          for (let i = 0; i < savedAlbums.length; i++) {
            const savedAlbum = savedAlbums[i]
            try {
              const albumTracksResponse = await fetch(`${baseUrl}/api/spotify/album/${savedAlbum.id}/tracks`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              })
              
              if (albumTracksResponse.ok) {
                const albumTracksData = await albumTracksResponse.json()
                const albumTracks = Array.isArray(albumTracksData) ? albumTracksData : (albumTracksData.items || [])
                
                albumTracks.forEach((track: any) => {
                  if (track && track.id) {
                    sourceStats.savedAlbums++ // Count every song processed
                    
                    if (!seenSongIds.has(track.id)) {
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
                            type: 'album', 
                            name: savedAlbum.name,
                            id: savedAlbum.id
                          }
                        }]
                      })
                    }
                  }
                })
                
                await updateSongProgress(songs.length, `${savedAlbum.name} (${i + 1}/${savedAlbums.length})`)
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

    // Load selected playlists
    if (selectedPlaylistIds.length > 0) {
      for (let i = 0; i < selectedPlaylistIds.length; i++) {
        const playlistId = selectedPlaylistIds[i]
        
        try {
          console.log(`🔄 Fetching playlist ${i + 1}/${selectedPlaylistIds.length}: ${playlistId}`)
          
          // Get playlist info
          const playlistResponse = await fetch(`${baseUrl}/api/spotify/playlist/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          })
          
          if (playlistResponse.ok) {
            const playlist = await playlistResponse.json()
            
            // Get playlist tracks
            const tracksResponse = await fetch(`${baseUrl}/api/spotify/playlist/${playlistId}/tracks`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            })
            
            if (tracksResponse.ok) {
              const tracksData = await tracksResponse.json()
              const tracks = Array.isArray(tracksData) ? tracksData : (tracksData.items || [])
              
              tracks.forEach((item: any) => {
                const track = item.track || item
                if (track && track.id) {
                  sourceStats.playlists++ // Count every song processed
                  
                  if (!seenSongIds.has(track.id)) {
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
                }
              })
              
              await updateSongProgress(songs.length, `${playlist.name} (${i + 1}/${selectedPlaylistIds.length})`)
            }
          }
        } catch (playlistError) {
          console.error(`Error processing playlist ${playlistId}:`, playlistError)
        }
      }
    }

    await updateProgress(90, 'Finalizing and saving songs...')

    // 8. Save to database in transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update player status
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
      
      // 2. Store songs separately for this player
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
      
      // 3. Get total song count from all players
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
        likedSongs: sourceStats.likedSongs,
        savedAlbums: sourceStats.savedAlbums,
        playlists: sourceStats.playlists
      }
    })

  } catch (mainError) {
    console.error('Error loading songs:', mainError)
    
    // Reset player status on error - only if we have valid session and game
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

        // Emit socket update only if we have gameCode
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
      { error: 'Failed to load songs' }, 
      { status: 500 }
    )
  }
}