import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(request: NextRequest) {
  return withSpotifyAuth(request, async (accessToken, userId) => {
    let allTracks: any[] = []
    let nextUrl: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50'
    
    while (nextUrl) {
      const data = await makeSpotifyRequest(nextUrl, accessToken, userId)
      allTracks = allTracks.concat(data.items || [])
      nextUrl = data.next
    }

    return allTracks.map(item => item.track)
  })
}