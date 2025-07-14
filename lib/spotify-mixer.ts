import { Song, OwnerInfo, SongSource } from './types/game'

// Parallel processing helpers
async function processBatchInParallel<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  
  // Process items in batches to avoid overwhelming the API
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(items.length/batchSize)} (${batch.length} items)`)
    
    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(item => processor(item))
    )
    
    // Extract successful results and log failures
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        console.error(`❌ Failed to process item ${i + index}:`, result.reason)
      }
    })
  }
  
  return results
}

interface PlaylistProcessor {
  id: string
  name: string
  playerId: string
  playerName: string
  accessToken: string
  baseUrl: string
}

async function processPlaylistTracks(processor: PlaylistProcessor): Promise<Song[]> {
  const songs: Song[] = []
  
  try {
    const tracksResponse = await fetch(`${processor.baseUrl}/api/spotify/playlist/${processor.id}/tracks`, {
      headers: { 'Authorization': `Bearer ${processor.accessToken}` }
    })
    
    if (!tracksResponse.ok) {
      throw new Error(`Failed to fetch tracks for playlist ${processor.name}: ${tracksResponse.status}`)
    }
    
    const tracksData = await tracksResponse.json()
    const tracks = Array.isArray(tracksData) ? tracksData : (tracksData.items || [])
    
    tracks.forEach((track: any) => {
      if (track && track.id) {
        songs.push({
          id: track.id,
          name: track.name,
          artists: track.artists,
          album: track.album,
          owners: [{
            playerId: processor.playerId,
            playerName: processor.playerName,
            source: { 
              type: 'playlist', 
              name: processor.name,
              id: processor.id
            }
          }]
        })
      }
    })
    
    console.log(`✅ Added ${tracks.length} songs from playlist "${processor.name}"`)
    return songs
    
  } catch (error) {
    console.error(`❌ Error processing playlist ${processor.name}:`, error)
    return []
  }
}

interface AlbumProcessor {
  id: string
  name: string
  playerId: string
  playerName: string
  accessToken: string
  baseUrl: string
}

async function processAlbumTracks(processor: AlbumProcessor): Promise<Song[]> {
  const songs: Song[] = []
  
  try {
    // Small delay to be gentle on the API for albums (lower priority)
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const albumTracksResponse = await fetch(`${processor.baseUrl}/api/spotify/album/${processor.id}/tracks`, {
      headers: { 'Authorization': `Bearer ${processor.accessToken}` }
    })
    
    if (!albumTracksResponse.ok) {
      throw new Error(`Failed to fetch tracks for album ${processor.name}: ${albumTracksResponse.status}`)
    }
    
    const albumTracksData = await albumTracksResponse.json()
    const albumTracks = Array.isArray(albumTracksData) ? albumTracksData : (albumTracksData.items || [])
    
    albumTracks.forEach((track: any) => {
      if (track && track.id) {
        songs.push({
          id: track.id,
          name: track.name,
          artists: track.artists,
          album: processor.name,
          owners: [{
            playerId: processor.playerId,
            playerName: processor.playerName,
            source: { 
              type: 'album', 
              name: processor.name,
              id: processor.id
            }
          }]
        })
      }
    })
    
    console.log(`✅ Added ${albumTracks.length} songs from album "${processor.name}"`)
    return songs
    
  } catch (error) {
    console.error(`❌ Error processing album ${processor.name}:`, error)
    return []
  }
}

export async function fetchAllPlayerSongs(
  playerId: string,
  playerName: string,
  accessToken: string
): Promise<Song[]> {
  const songs: Song[] = []
  const seenSongIds = new Set<string>()
  
  // Get the base URL from environment variable
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  
  try {
    // 1. Fetch playlists
    const playlistsResponse = await fetch(`${baseUrl}/api/spotify/playlists`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (!playlistsResponse.ok) {
      console.error('Failed to fetch playlists:', playlistsResponse.status)
      return songs
    }
    const playlists = await playlistsResponse.json()
    
    // 2. Fetch liked songs
    const likedResponse = await fetch(`${baseUrl}/api/spotify/liked-songs`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (!likedResponse.ok) {
      console.error('Failed to fetch liked songs:', likedResponse.status)
      return songs
    }
    const likedSongs = await likedResponse.json()
    
    // 3. Fetch saved albums
    const albumsResponse = await fetch(`${baseUrl}/api/spotify/saved-albums`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (!albumsResponse.ok) {
      console.error('Failed to fetch saved albums:', albumsResponse.status)
      return songs
    }
    const savedAlbums = await albumsResponse.json()
    
    // 4. Process liked songs first (immediate, no API calls needed)
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
              playerId,
              playerName,
              source: { type: 'liked', name: 'Liked Songs' }
            }]
          })
        }
      })
    }
    
    // 5. Process playlists in parallel batches
    if (Array.isArray(playlists)) {
      const playlistProcessors: PlaylistProcessor[] = playlists.map(playlist => ({
        id: playlist.id,
        name: playlist.name,
        playerId,
        playerName,
        accessToken,
        baseUrl
      }))

      console.log(`🚀 Processing ${playlistProcessors.length} playlists in parallel batches...`)

      // Process playlists in batches of 5 to balance speed vs rate limits
      const playlistSongArrays = await processBatchInParallel(
        playlistProcessors,
        5, // Process 5 playlists simultaneously
        processPlaylistTracks
      )

      // Flatten and deduplicate playlist songs
      playlistSongArrays.forEach(playlistSongs => {
        playlistSongs.forEach(song => {
          if (!seenSongIds.has(song.id)) {
            seenSongIds.add(song.id)
            songs.push(song)
          }
        })
      })
    }
    
    // 6. Process saved albums in parallel batches
    if (Array.isArray(savedAlbums)) {
      const albumProcessors: AlbumProcessor[] = savedAlbums.map(savedAlbum => ({
        id: savedAlbum.id,
        name: savedAlbum.name,
        playerId,
        playerName,
        accessToken,
        baseUrl
      }))

      console.log(`🚀 Processing ${albumProcessors.length} albums in parallel batches...`)

      // Process albums in smaller batches (3) since they're lower priority
      const albumSongArrays = await processBatchInParallel(
        albumProcessors,
        3, // Process 3 albums simultaneously  
        processAlbumTracks
      )

      // Flatten and deduplicate album songs
      albumSongArrays.forEach(albumSongs => {
        albumSongs.forEach(song => {
          if (!seenSongIds.has(song.id)) {
            seenSongIds.add(song.id)
            songs.push(song)
          }
        })
      })
    }
    
    console.log(`Fetched ${songs.length} songs for ${playerName}`)
    
  } catch (error) {
    console.error(`Error fetching songs for ${playerName}:`, error)
  }
  
  return songs
}

export async function fetchPlayerSongsFromSelection(
  playerId: string,
  playerName: string,
  accessToken: string,
  selectedPlaylistIds: string[]
): Promise<Song[]> {
  const songs: Song[] = []
  const seenSongIds = new Set<string>()
  
  // Get the base URL from environment variable
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  
  try {
    console.log(`Fetching songs from ${selectedPlaylistIds.length} selected playlists + all albums + liked songs for ${playerName}`)
    
    // 1. Fetch liked songs first (immediate, no API calls needed)
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
                playerId,
                playerName,
                source: { type: 'liked', name: 'Liked Songs' }
              }]
            })
          }
        })
      }
    } else {
      console.error('Failed to fetch liked songs:', likedResponse.status)
    }
    
    // 2. Process only SELECTED playlists in parallel
    if (selectedPlaylistIds.length > 0) {
      // First, get all playlists to find names
      const playlistsResponse = await fetch(`${baseUrl}/api/spotify/playlists`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (playlistsResponse.ok) {
        const allPlaylists = await playlistsResponse.json()
        
        // Process selected playlists in parallel batches
        const playlistProcessors: PlaylistProcessor[] = selectedPlaylistIds
          .map(playlistId => {
            const playlist = allPlaylists.find((p: any) => p.id === playlistId)
            return playlist ? {
              id: playlistId,
              name: playlist.name,
              playerId,
              playerName,
              accessToken,
              baseUrl
            } : null
          })
          .filter((p): p is PlaylistProcessor => p !== null)

        console.log(`🚀 Processing ${playlistProcessors.length} selected playlists in parallel batches...`)

        // Process playlists in batches of 5 to balance speed vs rate limits
        const playlistSongArrays = await processBatchInParallel(
          playlistProcessors,
          5, // Process 5 playlists simultaneously
          processPlaylistTracks
        )

        // Flatten and deduplicate playlist songs
        playlistSongArrays.forEach(playlistSongs => {
          playlistSongs.forEach(song => {
            if (!seenSongIds.has(song.id)) {
              seenSongIds.add(song.id)
              songs.push(song)
            }
          })
        })
      } else {
        console.error('Failed to fetch playlists for name lookup:', playlistsResponse.status)
        throw new Error('Failed to fetch playlists')
      }
    }

    // 3. Fetch saved albums (ALL of them, same as before) in parallel
    const albumsResponse = await fetch(`${baseUrl}/api/spotify/saved-albums`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (albumsResponse.ok) {
      const savedAlbums = await albumsResponse.json()
      
      if (Array.isArray(savedAlbums)) {
        // Process saved albums in parallel batches  
        const albumProcessors: AlbumProcessor[] = savedAlbums.map(savedAlbum => ({
          id: savedAlbum.id,
          name: savedAlbum.name,
          playerId,
          playerName,
          accessToken,
          baseUrl
        }))

        console.log(`🚀 Processing ${albumProcessors.length} albums in parallel batches...`)

        // Process albums in smaller batches (3) since they're lower priority
        const albumSongArrays = await processBatchInParallel(
          albumProcessors,
          3, // Process 3 albums simultaneously  
          processAlbumTracks
        )

        // Flatten and deduplicate album songs
        albumSongArrays.forEach(albumSongs => {
          albumSongs.forEach(song => {
            if (!seenSongIds.has(song.id)) {
              seenSongIds.add(song.id)
              songs.push(song)
            }
          })
        })
      }
    } else {
      console.error('Failed to fetch saved albums:', albumsResponse.status)
    }
    
    console.log(`Total: ${songs.length} songs (from selected playlists + all albums + liked songs) for ${playerName}`)
    
  } catch (error) {
    console.error(`Error fetching songs for ${playerName}:`, error)
  }
  
  return songs
}

export function mergeSongPools(playerSongArrays: Song[][]): Song[] {
  const songMap = new Map<string, Song>()
  
  playerSongArrays.forEach(playerSongs => {
    playerSongs.forEach(song => {
      if (songMap.has(song.id)) {
        // Song exists - merge owner info
        const existing = songMap.get(song.id)!
        existing.owners.push(...song.owners)
      } else {
        // New song
        songMap.set(song.id, { ...song })
      }
    })
  })
  
  return Array.from(songMap.values())
}

export function shuffleSongs(songs: Song[]): Song[] {
  const shuffled = [...songs]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}