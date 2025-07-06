import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> }
) {
  const { albumId } = await params
  console.log(`🎵 Album tracks API called for album ${albumId}`)

  return withSpotifyAuth(request, async (accessToken) => {
    // Fetch all tracks from album (usually no pagination needed, but let's be safe)
    let allTracks: any[] = []
    let nextUrl: string | null = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`
    
    while (nextUrl) {
      const data = await makeSpotifyRequest(nextUrl, accessToken)
      allTracks = allTracks.concat(data.items || [])
      nextUrl = data.next // Usually null for albums, but just in case
      
      if (data.total) {
        console.log(`Fetched ${allTracks.length}/${data.total} tracks from album`)
      }
    }

    console.log(`✅ Returning ${allTracks.length} tracks from album`)
    return allTracks
  })
}