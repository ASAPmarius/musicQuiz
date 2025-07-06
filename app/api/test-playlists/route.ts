import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(request: NextRequest) {
  console.log('🎵 Test playlists API called')
  
  return withSpotifyAuth(request, async (accessToken) => {
    const data = await makeSpotifyRequest('https://api.spotify.com/v1/me/playlists?limit=10', accessToken)

    console.log('✅ Success! Got', data.items?.length, 'playlists')

    return {
      success: true,
      playlistCount: data.items?.length || 0,
      playlists: data.items?.slice(0, 3).map((p: any) => ({ 
        id: p.id, 
        name: p.name 
      })) || [],
      tokenUsed: accessToken.substring(0, 20) + '...'
    }
  })
}