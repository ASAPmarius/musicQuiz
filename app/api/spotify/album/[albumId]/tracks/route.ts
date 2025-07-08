import { NextRequest } from 'next/server'
import { withSpotifyAuth, makeLowPrioritySpotifyRequest } from '@/lib/spotify-api-wrapper'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return withSpotifyAuth(request, async (accessToken, userId) => {
    // Album track details are low priority
    const data = await makeLowPrioritySpotifyRequest(
      `https://api.spotify.com/v1/albums/${params.id}/tracks?limit=50`,
      accessToken,
      userId
    )

    return data.items || []
  })
}