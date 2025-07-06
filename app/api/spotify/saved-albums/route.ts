import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(request: NextRequest) {
  console.log('🎵 Albums API called')
  
  return withSpotifyAuth(request, async (accessToken) => {
    // Fetch all saved albums with pagination
    let allAlbums: any[] = []
    let nextUrl: string | null = 'https://api.spotify.com/v1/me/albums?limit=50'
    
    while (nextUrl) {
      const data = await makeSpotifyRequest(nextUrl, accessToken)
      // Extract just the album objects
      const albums = (data.items || []).map((item: any) => item.album).filter(Boolean)
      allAlbums = allAlbums.concat(albums)
      nextUrl = data.next
      
      console.log(`Fetched ${allAlbums.length}/${data.total} albums`)
    }

    console.log(`✅ Returning ${allAlbums.length} albums`)
    return allAlbums
  })
}