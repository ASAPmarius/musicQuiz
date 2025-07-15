import { spotifyCache } from './cache-manager'
import { makeSpotifyRequest } from './spotify-api-wrapper'

export class SpotifyCacheWrapper {
  // Cache key generators
  private static getUserPlaylistsKey(userId: string): string {
    return `spotify:user:${userId}:playlists`
  }

  private static getPlaylistTracksKey(playlistId: string): string {
    return `spotify:playlist:${playlistId}:tracks`
  }

  private static getUserLikedSongsKey(userId: string): string {
    return `spotify:user:${userId}:liked-songs`
  }

  private static getUserSavedAlbumsKey(userId: string): string {
    return `spotify:user:${userId}:saved-albums`
  }

  private static getAlbumTracksKey(albumId: string): string {
    return `spotify:album:${albumId}:tracks`
  }

  // Helper method to make paginated Spotify API calls
  private static async fetchAllPages(
    initialUrl: string,
    accessToken: string,
    userId: string,
    itemsProperty: string = 'items'
  ): Promise<any[]> {
    let allItems: any[] = []
    let nextUrl: string | null = initialUrl
    
    while (nextUrl) {
      const data = await makeSpotifyRequest(nextUrl, accessToken, userId)
      
      if (data[itemsProperty]) {
        allItems = allItems.concat(data[itemsProperty])
      }
      
      nextUrl = data.next
    }
    
    return allItems
  }

  // Cached methods with direct Spotify API calls
  static async getUserPlaylists(userId: string, accessToken: string): Promise<any[]> {
    const cacheKey = this.getUserPlaylistsKey(userId)
    
    // Try cache first
    const cached = await spotifyCache.get<any[]>(cacheKey)
    if (cached) return cached

    console.log(`🔄 Fetching playlists from Spotify API for user ${userId}`)
    
    // Fetch from Spotify API directly with pagination
    const playlists = await this.fetchAllPages(
      'https://api.spotify.com/v1/me/playlists?limit=50',
      accessToken,
      userId,
      'items'
    )
    
    console.log(`✅ Fetched ${playlists.length} playlists from Spotify API`)
    
    // Cache the result (playlists don't change often, so 30 minutes TTL)
    await spotifyCache.set(cacheKey, playlists, 1800)
    
    return playlists
  }

  static async getUserLikedSongs(userId: string, accessToken: string): Promise<any[]> {
    const cacheKey = this.getUserLikedSongsKey(userId)
    
    const cached = await spotifyCache.get<any[]>(cacheKey)
    if (cached) return cached

    console.log(`🔄 Fetching liked songs from Spotify API for user ${userId}`)

    // Fetch from Spotify API directly with pagination
    const likedItems = await this.fetchAllPages(
      'https://api.spotify.com/v1/me/tracks?limit=50',
      accessToken,
      userId,
      'items'
    )
    
    // Extract just the track objects
    const likedSongs = likedItems.map(item => item.track).filter(Boolean)
    
    console.log(`✅ Fetched ${likedSongs.length} liked songs from Spotify API`)
    
    // Liked songs change more frequently, so shorter TTL (10 minutes)
    await spotifyCache.set(cacheKey, likedSongs, 600)
    
    return likedSongs
  }

  static async getUserSavedAlbums(userId: string, accessToken: string): Promise<any[]> {
    const cacheKey = this.getUserSavedAlbumsKey(userId)
    
    const cached = await spotifyCache.get<any[]>(cacheKey)
    if (cached) return cached

    console.log(`🔄 Fetching saved albums from Spotify API for user ${userId}`)

    // Fetch from Spotify API directly with pagination
    const savedItems = await this.fetchAllPages(
      'https://api.spotify.com/v1/me/albums?limit=50',
      accessToken,
      userId,
      'items'
    )
    
    // Extract just the album objects
    const savedAlbums = savedItems.map(item => item.album).filter(Boolean)
    
    console.log(`✅ Fetched ${savedAlbums.length} saved albums from Spotify API`)
    
    // Saved albums change rarely, so longer TTL (1 hour)
    await spotifyCache.set(cacheKey, savedAlbums, 3600)
    
    return savedAlbums
  }

  static async getPlaylistTracks(playlistId: string, accessToken: string): Promise<any[]> {
    const cacheKey = this.getPlaylistTracksKey(playlistId)
    
    const cached = await spotifyCache.get<any[]>(cacheKey)
    if (cached) return cached

    console.log(`🔄 Fetching tracks from Spotify API for playlist ${playlistId}`)

    // Fetch from Spotify API directly with pagination
    const trackItems = await this.fetchAllPages(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`,
      accessToken,
      playlistId, // Use playlistId as "userId" for rate limiting
      'items'
    )
    
    // Extract just the track objects
    const tracks = trackItems.map(item => item.track).filter(Boolean)
    
    console.log(`✅ Fetched ${tracks.length} tracks from Spotify API for playlist ${playlistId}`)
    
    // Playlist tracks change occasionally, so 45 minutes TTL
    await spotifyCache.set(cacheKey, tracks, 2700)
    
    return tracks
  }

  static async getAlbumTracks(albumId: string, accessToken: string): Promise<any[]> {
    const cacheKey = this.getAlbumTracksKey(albumId)
    
    const cached = await spotifyCache.get<any[]>(cacheKey)
    if (cached) return cached

    console.log(`🔄 Fetching tracks from Spotify API for album ${albumId}`)

    // Album tracks usually fit in one page, but handle pagination just in case
    const tracks = await this.fetchAllPages(
      `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`,
      accessToken,
      albumId, // Use albumId as "userId" for rate limiting
      'items'
    )
    
    console.log(`✅ Fetched ${tracks.length} tracks from Spotify API for album ${albumId}`)
    
    // Album tracks never change, so very long TTL (24 hours)
    await spotifyCache.set(cacheKey, tracks, 86400)
    
    return tracks
  }

  // Cache invalidation helpers
  static async invalidateUserCache(userId: string): Promise<void> {
    await spotifyCache.invalidatePattern(`spotify:user:${userId}`)
  }

  static async invalidatePlaylistCache(playlistId: string): Promise<void> {
    await spotifyCache.invalidate(this.getPlaylistTracksKey(playlistId))
  }
}