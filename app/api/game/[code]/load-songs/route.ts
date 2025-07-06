import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  // Declare all variables at function scope to avoid scoping issues
  let session: any = null
  let game: any = null
  let gameCode: string = ''
  let currentPlayer: any = null
  
  try {
    // 1. Authentication
    session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Extract parameters
    const resolvedParams = await params
    gameCode = resolvedParams.code.toUpperCase()
    const { selectedPlaylistIds } = await request.json()

    if (!selectedPlaylistIds || !Array.isArray(selectedPlaylistIds)) {
      return NextResponse.json({ error: 'Invalid playlist IDs' }, { status: 400 })
    }

    // 3. Find the game and current player from GamePlayer table
    game = await prisma.game.findUnique({
      where: { code: gameCode },
      include: { 
        host: true,
        players: {
          where: { userId: session.user.id }
        }
      }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // 4. Find the requesting player (now from GamePlayer table)
    if (game.players.length === 0) {
      return NextResponse.json({ error: 'Player not in game' }, { status: 403 })
    }

    currentPlayer = game.players[0] // We filtered by userId, so this is our player

    // 5. Get access token
    const accessToken = (session as any).accessToken
    if (!accessToken) {
      return NextResponse.json({ error: 'No Spotify access token' }, { status: 401 })
    }

    const io = (global as any).io
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    // Helper function to update progress - 🎯 NOW ATOMIC!
    const updateProgress = async (progress: number, message?: string) => {
      // 🎯 ATOMIC UPDATE - No race condition possible!
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

      if (io) {
        io.to(gameCode).emit('game-updated', {
          action: 'player-loading-progress',
          userId: session.user.id,
          progress,
          message,
          timestamp: new Date().toISOString()
        })
      }
    }

    // 6. Initialize progress
    await updateProgress(10, 'Starting to fetch your music library...')

    // 7. Estimate total songs for progress calculation
    const estimateTotalSongs = () => {
      return 500 + (selectedPlaylistIds.length * 50) // Rough estimate
    }
    const totalExpectedSongs = estimateTotalSongs()

    // 8. Load songs from different sources
    const songs: any[] = []
    const seenSongIds = new Set<string>()

    const updateSongProgress = async (processed: number, source: string) => {
      const progress = Math.min(15 + Math.floor((processed / totalExpectedSongs) * 70), 85)
      await updateProgress(progress, `Loading from ${source}... (${processed}/${totalExpectedSongs})`)
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
                const albumTracks = Array.isArray(albumTracksData) ? 
                  albumTracksData : (albumTracksData.items || [])
                
                albumTracks.forEach((track: any) => {
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
                          type: 'album', 
                          name: savedAlbum.name,
                          id: savedAlbum.id
                        }
                      }]
                    })
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
              const tracks = Array.isArray(tracksData) ? 
                tracksData : (tracksData.items || [])
              
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
              
              await updateSongProgress(songs.length, `${playlist.name} (${i + 1}/${selectedPlaylistIds.length})`)
            }
          }
        } catch (playlistError) {
          console.error(`Error processing playlist ${playlistId}:`, playlistError)
        }
      }
    }

    // 9. Finalize
    await updateProgress(90, 'Finalizing your music library...')

    // 🎯 ATOMIC TRANSACTION - Updates both player status and songs
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark player as having songs loaded - ATOMIC UPDATE!
      const updatedPlayer = await tx.gamePlayer.update({
        where: {
          gameId_userId: {
            gameId: game.id,
            userId: session.user.id
          }
        },
        data: {
          loadingProgress: 100,
          songsLoaded: true,  // 🎯 This won't conflict with other player updates!
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
    
    // Reset player status on error - 🎯 ALSO ATOMIC!
    try {
      if (session?.user?.id && game) {
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

        const io = (global as any).io
        if (io && gameCode) {
          io.to(gameCode).emit('game-updated', {
            action: 'player-loading-error',
            userId: session.user.id,
            timestamp: new Date().toISOString()
          })
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