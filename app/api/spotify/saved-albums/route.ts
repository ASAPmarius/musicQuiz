import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(request: NextRequest) {
  return withSpotifyAuth(request, async (accessToken, userId) => {
    let allAlbums: any[] = []
    let nextUrl: string | null = 'https://api.spotify.com/v1/me/albums?limit=50'
    
    while (nextUrl) {
      const data = await makeSpotifyRequest(nextUrl, accessToken, userId)
      allAlbums = allAlbums.concat(data.items || [])
      nextUrl = data.next
    }

    return allAlbums.map(item => item.album)
  })
}