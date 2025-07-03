import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { fetchPlayerSongsFromSelection } from '@/lib/spotify-mixer'
import { prisma } from '@/lib/prisma'
import { parsePlayersFromJSON, playersToJSON } from '@/lib/types/game'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  // Declare all variables at function scope to avoid scoping issues
  let session: any = null
  let game: any = null
  let gameCode: string = ''
  let currentPlayer: any = null
  let players: any[] = []
  
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

    // 3. Find the game
    game = await prisma.game.findUnique({
      where: { code: gameCode },
      include: { host: true }
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // 4. Find the requesting player
    players = parsePlayersFromJSON(game.players)
    const playerIndex = players.findIndex(p => p.userId === session.user.id)
    
    if (playerIndex === -1) {
      return NextResponse.json({ error: 'Player not in game' }, { status: 403 })
    }

    currentPlayer = players[playerIndex]

    // 5. Get access token
    const accessToken = (session as any).accessToken
    if (!accessToken) {
      return NextResponse.json({ error: 'No Spotify access token' }, { status: 401 })
    }

    const io = (global as any).io
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    // Helper function to update progress
    const updateProgress = async (progress: number, message?: string) => {
      currentPlayer.loadingProgress = progress
      await prisma.game.update({
        where: { id: game.id },
        data: { players: playersToJSON(players) }
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

    // 6. Start loading process
    await updateProgress(5, 'Analyzing your music library...')
    
    // Get playlist details for estimation
    let allPlaylists: any[] = []
    let totalExpectedSongs = 0
    
    try {
      const playlistsResponse = await fetch(`${baseUrl}/api/spotify/playlists`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (playlistsResponse.ok) {
        allPlaylists = await playlistsResponse.json()
        const selectedPlaylists = allPlaylists.filter((p: any) => selectedPlaylistIds.includes(p.id))
        totalExpectedSongs = selectedPlaylists.reduce((sum: number, p: any) => sum + (p.tracks?.total || 0), 0)
      }
    } catch (playlistFetchError) {
      console.error('Error fetching playlists:', playlistFetchError)
    }

    // Add estimates for liked songs and albums
    totalExpectedSongs += 500 // Conservative estimate

    await updateProgress(15, `Found ~${totalExpectedSongs} songs to process`)

    // 7. Load songs from different sources
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
                
                if (i % 10 === 0) {
                  await updateSongProgress(songs.length, `Saved Albums (${i + 1}/${savedAlbums.length})`)
                }
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
          const playlist = allPlaylists.find((p: any) => p.id === playlistId)
          if (!playlist) continue

          const tracksResponse = await fetch(`${baseUrl}/api/spotify/playlist/${playlistId}/tracks`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          })
          
          if (tracksResponse.ok) {
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
            
            await updateSongProgress(songs.length, `${playlist.name} (${i + 1}/${selectedPlaylistIds.length})`)
          }
        } catch (playlistError) {
          console.error(`Error processing playlist ${playlistId}:`, playlistError)
        }
      }
    }

    // 8. Finalize
    await updateProgress(90, 'Finalizing your music library...')

    // Update player status
    currentPlayer.loadingProgress = 100
    currentPlayer.songsLoaded = true

    // Use transaction to update both player status and songs
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update player status in game
      const latestGame = await tx.game.findUnique({
        where: { id: game.id }
      })
      
      if (!latestGame) {
        throw new Error('Game not found')
      }
      
      const latestPlayers = parsePlayersFromJSON(latestGame.players)
      const playerIndex = latestPlayers.findIndex(p => p.userId === session.user.id)
      
      if (playerIndex !== -1) {
        latestPlayers[playerIndex].loadingProgress = 100
        latestPlayers[playerIndex].songsLoaded = true
      }
      
      const updatedGame = await tx.game.update({
        where: { id: game.id },
        data: {
          players: playersToJSON(latestPlayers)
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
          songs: songs, // Prisma will handle JSON conversion
          updatedAt: new Date()
        },
        create: {
          gameId: game.id,
          playerId: session.user.id,
          songs: songs // Prisma will handle JSON conversion
        }
      })
      
      // 3. Get total song count from all players
      const allPlayerSongs = await tx.gameSongs.findMany({
        where: { gameId: game.id },
        select: { songs: true }
      })

      let totalSongCount = 0
      allPlayerSongs.forEach(playerSongs => {
        // Cast the JsonValue to the expected array type
        const songsArray = playerSongs.songs as any[]
        if (Array.isArray(songsArray)) {
          totalSongCount += songsArray.length
        }
      })
      
      return { updatedGame, gameSongs, totalSongCount }
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
    
    // Reset player status on error
    try {
      if (session?.user?.id && game && currentPlayer && players.length > 0) {
        const playerIndex = players.findIndex(p => p.userId === session.user.id)
        
        if (playerIndex !== -1) {
          players[playerIndex].loadingProgress = 0
          players[playerIndex].songsLoaded = false
          
          await prisma.game.update({
            where: { id: game.id },
            data: { players: playersToJSON(players) }
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