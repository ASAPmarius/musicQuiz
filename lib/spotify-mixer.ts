import { Song, OwnerInfo, SongSource } from './types/game'

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
    
    // 4. Process liked songs
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
    
    // 5. Process each playlist
    if (Array.isArray(playlists)) {
      for (const playlist of playlists) {
        try {
          const tracksResponse = await fetch(`${baseUrl}/api/spotify/playlist/${playlist.id}/tracks`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          })
          
          if (!tracksResponse.ok) {
            console.error(`Failed to fetch tracks for playlist ${playlist.name}:`, tracksResponse.status)
            continue // Skip this playlist
          }
          
          const tracksData = await tracksResponse.json()
          
          // Handle both array and object response
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
                  playerId,
                  playerName,
                  source: { 
                    type: 'playlist', 
                    name: playlist.name,
                    id: playlist.id
                  }
                }]
              })
            }
          })
        } catch (playlistError) {
          console.error(`Error processing playlist ${playlist.name}:`, playlistError)
        }
      }
    }
    
    // 6. Process saved albums
    if (Array.isArray(savedAlbums)) {
      for (const savedAlbum of savedAlbums) {
        try {

          await new Promise(resolve => setTimeout(resolve, 100)) // 100ms delay

          const albumTracksResponse = await fetch(`${baseUrl}/api/spotify/album/${savedAlbum.id}/tracks`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          })
          
          if (!albumTracksResponse.ok) {
            console.error(`Failed to fetch tracks for album ${savedAlbum.name}:`, albumTracksResponse.status)
            continue // Skip this album
          }
          
          const albumTracksData = await albumTracksResponse.json()
          
          // Handle both array and object response
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
                  playerId,
                  playerName,
                  source: { 
                    type: 'album', 
                    name: savedAlbum.name,
                    id: savedAlbum.id
                  }
                }]
              })
            }
          })
        } catch (albumError) {
          console.error(`Error processing album ${savedAlbum.name}:`, albumError)
        }
      }
    }
    
    console.log(`Fetched ${songs.length} songs for ${playerName}`)
    
  } catch (error) {
    console.error(`Error fetching songs for ${playerName}:`, error)
  }
  
  return songs
}

// Rest of the file remains the same...
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
    
    // 1. Fetch liked songs (ALL of them, same as before)
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
        console.log(`Added ${likedSongs.length} liked songs`)
      }
    } else {
      console.error('Failed to fetch liked songs:', likedResponse.status)
    }

    // 2. Fetch saved albums (ALL of them, same as before)
    const albumsResponse = await fetch(`${baseUrl}/api/spotify/saved-albums`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (albumsResponse.ok) {
      const savedAlbums = await albumsResponse.json()
      
      if (Array.isArray(savedAlbums)) {
        for (const savedAlbum of savedAlbums) {
          try {
            await new Promise(resolve => setTimeout(resolve, 100)) // 100ms delay

            const albumTracksResponse = await fetch(`${baseUrl}/api/spotify/album/${savedAlbum.id}/tracks`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            })
            
            if (!albumTracksResponse.ok) {
              console.error(`Failed to fetch tracks for album ${savedAlbum.name}:`, albumTracksResponse.status)
              continue
            }
            
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
                    playerId,
                    playerName,
                    source: { 
                      type: 'album', 
                      name: savedAlbum.name,
                      id: savedAlbum.id
                    }
                  }]
                })
              }
            })
            
            console.log(`Added ${albumTracks.length} songs from album "${savedAlbum.name}"`)
            
          } catch (albumError) {
            console.error(`Error processing album ${savedAlbum.name}:`, albumError)
          }
        }
      }
    } else {
      console.error('Failed to fetch saved albums:', albumsResponse.status)
    }

    // 3. Process only SELECTED playlists (this is the new selective part)
    if (selectedPlaylistIds.length > 0) {
      // First, get all playlists to find names
      const playlistsResponse = await fetch(`${baseUrl}/api/spotify/playlists`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      
      if (playlistsResponse.ok) {
        const allPlaylists = await playlistsResponse.json()
        
        for (const playlistId of selectedPlaylistIds) {
          try {
            const playlist = allPlaylists.find((p: any) => p.id === playlistId)
            
            if (!playlist) {
              console.error(`Playlist ${playlistId} not found`)
              continue
            }

            // Fetch tracks from this playlist
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
                    playerId,
                    playerName,
                    source: { 
                      type: 'playlist', 
                      name: playlist.name,
                      id: playlist.id
                    }
                  }]
                })
              }
            })
            
            console.log(`Added ${tracks.length} songs from selected playlist "${playlist.name}"`)
            
          } catch (playlistError) {
            console.error(`Error processing playlist ${playlistId}:`, playlistError)
          }
        }
      } else {
        console.error('Failed to fetch playlists for name lookup:', playlistsResponse.status)
      }
    }
    
    console.log(`Total: ${songs.length} songs (from selected playlists + all albums + liked songs) for ${playerName}`)
    
  } catch (error) {
    console.error(`Error fetching songs for ${playerName}:`, error)
  }
  
  return songs
}

export function shuffleSongs(songs: Song[]): Song[] {
  const shuffled = [...songs]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}