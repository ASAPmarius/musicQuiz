import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { SpotifyCacheWrapper } from '@/lib/spotify-cache-wrapper'

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

    console.log(`🎵 Loading songs for game ${gameCode}, user ${session.user.id} (with caching)`)

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

    // Normalized saveSongsBatch function
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
    
    console.log(`📋 Fetching playlists for user ${session.user.id} (cached)`)
    const allPlaylists = await SpotifyCacheWrapper.getUserPlaylists(session.user.id, accessToken)
    
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

        console.log(`🎵 Processing playlist "${playlist.name}" (cached)`)
        
        // USE CACHED VERSION
        const cachedTracks = await SpotifyCacheWrapper.getPlaylistTracks(playlistId, accessToken)
        
        const batchSongs: any[] = []

        cachedTracks.forEach((track: any) => {
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
      
      console.log(`❤️ Fetching liked songs for user ${session.user.id} (cached)`)
      // USE CACHED VERSION  
      const cachedLikedSongs = await SpotifyCacheWrapper.getUserLikedSongs(session.user.id, accessToken)

      cachedLikedSongs.forEach((track: any) => {
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
        breakdown.likedSongs += batchSongs.length
      }
      
      await updateSmartProgress(songs.length, 'Liked Songs', 'liked')
      
    } catch (likedError) {
      console.error('Error processing liked songs:', likedError)
    }

    // Process saved albums
    await updateProgress(70, 'Loading your saved albums...')

    try {
      console.log(`💽 Fetching saved albums for user ${session.user.id} (cached)`)
      // USE CACHED VERSION
      const allSavedAlbums = await SpotifyCacheWrapper.getUserSavedAlbums(session.user.id, accessToken)

      for (let i = 0; i < allSavedAlbums.length; i++) {
        const album = allSavedAlbums[i]
        
        try {
          await updateProgress(
            Math.round(70 + (i / allSavedAlbums.length) * 25), 
            `Loading "${album.name}" (${i + 1}/${allSavedAlbums.length})`
          )

          console.log(`💽 Processing album "${album.name}" (cached)`)
          
          // USE CACHED VERSION
          const cachedAlbumTracks = await SpotifyCacheWrapper.getAlbumTracks(album.id, accessToken)
          
          const batchSongs: any[] = []

          cachedAlbumTracks.forEach((track: any) => {
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