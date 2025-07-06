import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(request: NextRequest) {
  console.log('🎵 Liked songs API called')
  
  return withSpotifyAuth(request, async (accessToken) => {
    let allTracks: any[] = []
    let nextUrl: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50'
    
    while (nextUrl) {
      const data = await makeSpotifyRequest(nextUrl, accessToken)
      // Extract just the track objects
      const tracks = (data.items || []).map((item: any) => item.track).filter(Boolean)
      allTracks = allTracks.concat(tracks)
      nextUrl = data.next
      
      console.log(`Fetched ${allTracks.length}/${data.total} liked songs`)
    }

    console.log(`✅ Returning ${allTracks.length} liked songs`)
    return allTracks
  })
}