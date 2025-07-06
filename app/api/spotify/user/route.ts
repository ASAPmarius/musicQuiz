import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(request: NextRequest) {
  console.log('🎵 User profile API called')
  
  return withSpotifyAuth(request, async (accessToken) => {
    // Get user's profile information from Spotify
    const user = await makeSpotifyRequest('https://api.spotify.com/v1/me', accessToken)
    
    console.log('✅ User profile fetched successfully')
    return user
  })
}