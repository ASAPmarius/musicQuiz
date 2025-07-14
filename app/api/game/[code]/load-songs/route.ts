import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const resolvedParams = await params
    const gameCode = resolvedParams.code.toUpperCase()
    const { selectedPlaylistIds } = await request.json()

    console.log(`🎵 Loading songs for game ${gameCode}, user ${session.user.id}`)

    // Find game and current player
    const game = await prisma.game.findUnique({
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

    // Get access token
    const accessToken = (session as any).accessToken
    if (!accessToken) {
      return NextResponse.json({ 
        error: 'No access token available',
        needsReauth: true 
      }, { status: 401 })
    }

    let totalProcessed = 0

    const updateProgress = async (progress: number, message: string) => {
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
            progress: roundedProgress,
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
      
      const phaseProgress = Math.min(maxProgress, baseProgress + ((songsProcessed % 500) / 500) * (maxProgress - baseProgress))
      const roundedProgress = Math.round(phaseProgress)
      
      await updateProgress(
        roundedProgress, 
        `${currentSource} (${songsProcessed} songs collected)`
      )
    }

    // 🆕 NEW: Normalized saveSongsBatch function
    const saveSongsBatch = async (songsToSave: any[]) => {
      try {
        if (songsToSave.length === 0) return
        
        console.log(`💾 Saving batch of ${songsToSave.length} songs to normalized tables`)
        
        // Step 1: Bulk upsert all songs
        const songUpsertPromises = songsToSave.map(songData => 
          prisma.song.upsert({
            where: { spotifyId: songData.id },
            update: {}, // Don't update if exists
            create: {
              spotifyId: songData.id,
              name: songData.name,
              artistName: songData.artists,
              albumName: songData.album,
              coverUrl: songData.coverUrl || null,
            },
          })
        )
        
        const upsertedSongs = await Promise.all(songUpsertPromises)
        console.log(`✅ Upserted ${upsertedSongs.length} songs`)
        
        // Step 2: Create GameSong relationships
        const uniqueSongIds = new Set(upsertedSongs.map(song => song.id))
        
        if (uniqueSongIds.size > 0) {
          const gameSongData = Array.from(uniqueSongIds).map(songId => ({
            gameId: game.id,
            songId,
          }))
          
          await prisma.gameSong.createMany({
            data: gameSongData,
            skipDuplicates: true,
          })
          console.log(`✅ Created ${gameSongData.length} GameSong relationships`)
        }
        
        // Step 3: Create PlayerSong relationships
        const playerSongData: any[] = []
        
        songsToSave.forEach(songData => {
          const song = upsertedSongs.find(s => s.spotifyId === songData.id)
          if (song && songData.owners) {
            songData.owners.forEach((owner: any) => {
              if (owner.playerId === session.user.id) {
                playerSongData.push({
                  gameId: game.id,
                  playerId: owner.playerId,
                  songId: song.id,
                  sourceType: owner.source.type,
                  sourceName: owner.source.name,
                  sourceId: owner.source.id || null,
                })
              }
            })
          }
        })
        
        if (playerSongData.length > 0) {
          await prisma.playerSong.createMany({
            data: playerSongData,
            skipDuplicates: true,
          })
          console.log(`✅ Created ${playerSongData.length} PlayerSong relationships`)
        }
        
        console.log(`🎉 Successfully saved batch to normalized tables`)
        
      } catch (error) {
        console.error('❌ Error in saveSongsBatch:', error)
        throw error
      }
    }

    // Initialize
    const songs: any[] = []
    const seenSongIds = new Set<string>()
    let breakdown = { playlists: 0, likedSongs: 0, savedAlbums: 0 }
    
    await updateProgress(5, 'Starting song collection...')

    // Load playlists
    await updateProgress(10, 'Loading your playlists...')
    const playlistsResponse = await makeSpotifyRequest(
      'https://api.spotify.com/v1/me/playlists?limit=50',
      accessToken,
      session.user.id
    )

    let nextUrl = playlistsResponse.next
    const allPlaylistItems = [...(playlistsResponse.items || [])]

    while (nextUrl) {
      const nextBatch = await makeSpotifyRequest(nextUrl, accessToken, session.user.id)
      allPlaylistItems.push(...(nextBatch.items || []))
      nextUrl = nextBatch.next
    }

    const allPlaylists = allPlaylistItems
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

        const tracksData = await makeSpotifyRequest(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`,
          accessToken,
          session.user.id
        )

        let nextTracksUrl = tracksData.next
        const allTracks = [...(tracksData.items || [])]

        while (nextTracksUrl) {
          const nextTracksBatch = await makeSpotifyRequest(nextTracksUrl, accessToken, session.user.id)
          allTracks.push(...(nextTracksBatch.items || []))
          nextTracksUrl = nextTracksBatch.next
        }

        const tracks = allTracks.map((item: any) => item.track).filter(Boolean)
        const batchSongs: any[] = []

        tracks.forEach((track: any) => {
          if (track && track.id && !seenSongIds.has(track.id)) {
            seenSongIds.add(track.id)
            const songData = {
              id: track.id,
              name: track.name,
              artists: track.artists?.[0]?.name || 'Unknown Artist',
              album: track.album?.name || 'Unknown Album',
              coverUrl: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
              owners: [{
                playerId: session.user.id,
                playerName: currentPlayer.displayName,
                source: { 
                  type: 'playlist', 
                  name: playlist.name,
                  id: playlist.id
                }
              }]
            }
            songs.push(songData)
            batchSongs.push(songData)
          }
        })

        if (batchSongs.length > 0) {
          await saveSongsBatch(batchSongs)
          breakdown.playlists += batchSongs.length
          console.log(`💾 Saved ${batchSongs.length} songs from "${playlist.name}"`)
        }

        await updateSmartProgress(songs.length, `"${playlist.name}"`, 'playlists')
        
      } catch (playlistError) {
        console.error(`Error processing playlist ${playlistId}:`, playlistError)
      }
    }

    // Process liked songs
    await updateProgress(50, 'Loading your liked songs...')

    try {
      const batchSongs: any[] = []
      let allLikedSongs: any[] = []
      let nextUrl: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50'
      
      while (nextUrl) {
        const likedResponse = await makeSpotifyRequest(nextUrl, accessToken, session.user.id)
        
        if (likedResponse.items) {
          const tracks = likedResponse.items.map((item: any) => item.track).filter(Boolean)
          allLikedSongs = allLikedSongs.concat(tracks)
        }
        
        nextUrl = likedResponse.next
      }

      allLikedSongs.forEach((track: any) => {
        if (track && track.id && !seenSongIds.has(track.id)) {
          seenSongIds.add(track.id)
          const songData = {
            id: track.id,
            name: track.name,
            artists: track.artists?.[0]?.name || 'Unknown Artist',
            album: track.album?.name || 'Unknown Album',
            coverUrl: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
            owners: [{
              playerId: session.user.id,
              playerName: currentPlayer.displayName,
              source: { type: 'liked', name: 'Liked Songs' }
            }]
          }
          songs.push(songData)
          batchSongs.push(songData)
        }
      })
      
      if (batchSongs.length > 0) {
        await saveSongsBatch(batchSongs)
        breakdown.likedSongs = batchSongs.length
        console.log(`💾 Saved ${batchSongs.length} liked songs`)
      }
      
      await updateSmartProgress(songs.length, 'Liked Songs', 'liked')
      
    } catch (likedError) {
      console.error('Error processing liked songs:', likedError)
    }

    // Process saved albums
    await updateProgress(70, 'Loading your saved albums...')

    try {
      let allSavedAlbums: any[] = []
      let nextUrl: string | null = 'https://api.spotify.com/v1/me/albums?limit=50'
      
      while (nextUrl) {
        const albumsResponse = await makeSpotifyRequest(nextUrl, accessToken, session.user.id)
        
        if (albumsResponse.items) {
          const albums = albumsResponse.items.map((item: any) => item.album).filter(Boolean)
          allSavedAlbums = allSavedAlbums.concat(albums)
        }
        
        nextUrl = albumsResponse.next
      }

      for (let i = 0; i < allSavedAlbums.length; i++) {
        const album = allSavedAlbums[i]
        
        try {
          const albumTracksResponse = await makeSpotifyRequest(
            `https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`,
            accessToken,
            session.user.id
          )

          const tracks = albumTracksResponse.items || []
          const batchSongs: any[] = []

          tracks.forEach((track: any) => {
            if (track && track.id && !seenSongIds.has(track.id)) {
              seenSongIds.add(track.id)
              const songData = {
                id: track.id,
                name: track.name,
                artists: track.artists?.[0]?.name || album.artists?.[0]?.name || 'Unknown Artist',
                album: album.name || 'Unknown Album',
                coverUrl: album.images?.[1]?.url || album.images?.[0]?.url || null,
                owners: [{
                  playerId: session.user.id,
                  playerName: currentPlayer.displayName,
                  source: { 
                    type: 'album', 
                    name: album.name,
                    id: album.id
                  }
                }]
              }
              songs.push(songData)
              batchSongs.push(songData)
            }
          })

          if (batchSongs.length > 0) {
            await saveSongsBatch(batchSongs)
            breakdown.savedAlbums += batchSongs.length
          }

          if (i % 10 === 0) {
            await updateSmartProgress(songs.length, `Albums (${i + 1}/${allSavedAlbums.length})`, 'albums')
          }

        } catch (albumError) {
          console.error(`Error processing album ${album.id}:`, albumError)
        }
      }
      
    } catch (albumsError) {
      console.error('Error processing saved albums:', albumsError)
    }

    // Final updates
    await updateProgress(95, 'Finalizing...')

    // Update player status
    await prisma.gamePlayer.update({
      where: {
        gameId_userId: {
          gameId: game.id,
          userId: session.user.id
        }
      },
      data: {
        songsLoaded: true,
        loadingProgress: 100
      }
    })

    await updateProgress(100, 'Songs loaded successfully!')

    // Emit completion event
    const io = (global as any).io
    if (io) {
      io.to(gameCode).emit('game-updated', {
        action: 'player-songs-ready',
        userId: session.user.id,
        playerName: currentPlayer.displayName,
        songCount: songs.length,
        timestamp: new Date().toISOString()
      })
    }

    console.log(`✅ Successfully loaded ${songs.length} songs for ${currentPlayer.displayName}`)

    return NextResponse.json({
      success: true,
      songCount: songs.length,
      breakdown,
      message: `Successfully loaded ${songs.length} songs`
    })

  } catch (error) {
    console.error('❌ Error loading songs:', error)
    return NextResponse.json({
      error: 'Failed to load songs',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}