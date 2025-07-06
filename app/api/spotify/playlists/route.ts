import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(request: NextRequest) {
  console.log('🎵 Playlists API called')
  
  return withSpotifyAuth(request, async (accessToken) => {
    // Fetch from Spotify with pagination support
    let allPlaylists: any[] = []
    let nextUrl: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50'
    
    while (nextUrl) {
      const data = await makeSpotifyRequest(nextUrl, accessToken)
      allPlaylists = allPlaylists.concat(data.items || [])
      nextUrl = data.next // Spotify provides full URL for next page
      
      console.log(`Fetched ${allPlaylists.length}/${data.total} playlists`)
    }

    console.log(`✅ Returning ${allPlaylists.length} playlists`)
    return allPlaylists
  })
}