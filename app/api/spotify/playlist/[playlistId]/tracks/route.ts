import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeSpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> }
) {
  const { playlistId } = await params
  console.log(`🎵 Playlist tracks API called for playlist ${playlistId}`)

  return withSpotifyAuth(request, async (accessToken) => {
    // Fetch all tracks from playlist with pagination
    let allTracks: any[] = []
    let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists,album,preview_url)),next,total`
    
    while (nextUrl) {
      const data = await makeSpotifyRequest(nextUrl, accessToken)
      // Extract tracks and filter out null values (deleted tracks)
      const tracks = (data.items || [])
        .map((item: any) => item.track)
        .filter((track: any) => track !== null)
      
      allTracks = allTracks.concat(tracks)
      nextUrl = data.next
      
      console.log(`Fetched ${allTracks.length}/${data.total} tracks from playlist`)
    }

    console.log(`✅ Returning ${allTracks.length} tracks from playlist`)
    return allTracks
  })
}