interface SpotifyApi {
  access_token: string;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: Array<{ url: string }>;
  tracks: {
    total: number;
  };
  owner: {
    display_name: string;
  };
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  preview_url: string | null; // 30-second preview URL
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
}

interface SpotifyPlaylistResponse {
  items: SpotifyPlaylist[];
  total: number;
  next: string | null;
}

interface SpotifyTracksResponse {
  items: Array<{
    track: SpotifyTrack;
  }>;
  total: number;
  next: string | null;
}

// Think of this class as a "Spotify API Assistant"
// It knows how to talk to Spotify and translate responses for our app
class SpotifyService {
  private baseUrl = 'https://api.spotify.com/v1';

  // Helper method to make authenticated requests to Spotify
  private async makeRequest(endpoint: string, accessToken: string) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Get user's playlists (like getting a list of photo albums)
  async getUserPlaylists(accessToken: string, limit = 20, offset = 0): Promise<SpotifyPlaylistResponse> {
    try {
      const data = await this.makeRequest(
        `/me/playlists?limit=${limit}&offset=${offset}`,
        accessToken
      );
      return data;
    } catch (error) {
      console.error('Error fetching user playlists:', error);
      throw error;
    }
  }

  // Get tracks from a specific playlist (like getting photos from a specific album)
  async getPlaylistTracks(playlistId: string, accessToken: string, limit = 50, offset = 0): Promise<SpotifyTracksResponse> {
    try {
      const data = await this.makeRequest(
        `/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}&fields=items(track(id,name,artists(name),preview_url,album(name,images))),total,next`,
        accessToken
      );
      return data;
    } catch (error) {
      console.error('Error fetching playlist tracks:', error);
      throw error;
    }
  }

  // Get user's saved albums (their personal music library)
  async getUserSavedAlbums(accessToken: string, limit = 20, offset = 0) {
    try {
      const data = await this.makeRequest(
        `/me/albums?limit=${limit}&offset=${offset}`,
        accessToken
      );
      return data;
    } catch (error) {
      console.error('Error fetching saved albums:', error);
      throw error;
    }
  }

  async getAlbumTracks(albumId: string, accessToken: string, limit = 50, offset = 0) {
  try {
    const data = await this.makeRequest(
      `/albums/${albumId}/tracks?limit=${limit}&offset=${offset}`,
      accessToken
    );
    return data;
  } catch (error) {
    console.error('Error fetching album tracks:', error);
    throw error;
  }
}

  async getUserLikedSongs(accessToken: string, limit = 50, offset = 0) {
  try {
    const data = await this.makeRequest(
      `/me/tracks?limit=${limit}&offset=${offset}`,
      accessToken
    );
    return data;
  } catch (error) {
    console.error('Error fetching liked songs:', error);
    throw error;
  }
}

  // Get current user's profile info
  async getCurrentUser(accessToken: string) {
    try {
      const data = await this.makeRequest('/me', accessToken);
      return data;
    } catch (error) {
      console.error('Error fetching current user:', error);
      throw error;
    }
  }

  // Helper method to get tracks with preview URLs only
  // (We need this for the quiz - can't play songs without preview URLs)
  async getPlaylistTracksWithPreviews(playlistId: string, accessToken: string): Promise<SpotifyTrack[]> {
    let allTracks: SpotifyTrack[] = [];
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getPlaylistTracks(playlistId, accessToken, limit, offset);
      
      // Filter tracks that have preview URLs (30-second clips)
      const tracksWithPreviews = response.items
        .map(item => item.track)
        .filter(track => track.preview_url !== null);
      
      allTracks = allTracks.concat(tracksWithPreviews);
      
      // Check if there are more tracks to fetch
      hasMore = response.next !== null;
      offset += limit;
      
      // Safety break to avoid infinite loops
      if (offset > 2000) break;
    }

    return allTracks;
  }

  // Refresh an expired access token
  async refreshAccessToken(refreshToken: string): Promise<any> {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh access token');
    }

    return response.json();
  }
}

// Export a single instance (like having one dedicated assistant)
export const spotifyService = new SpotifyService();

// Export types so other files can use them
export type {
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyPlaylistResponse,
  SpotifyTracksResponse,
};