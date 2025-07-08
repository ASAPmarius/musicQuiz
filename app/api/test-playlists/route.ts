import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeHighPrioritySpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(request: NextRequest) {
  console.log('🎵 User profile API called')
  
  return withSpotifyAuth(request, async (accessToken, userId) => {  // <- Add userId parameter
    if (!userId) {
      throw new Error('User ID is required for rate limiting')
    }
    
    // Get user's profile information from Spotify (HIGH PRIORITY)
    const user = await makeHighPrioritySpotifyRequest(
      'https://api.spotify.com/v1/me', 
      accessToken, 
      userId  // <- Add userId
    )
    
    console.log('✅ User profile fetched successfully')
    return user
  })
}