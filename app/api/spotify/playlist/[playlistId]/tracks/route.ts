import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> }
) {
  try {
    // ✅ FIXED: Await the params first!
    const { playlistId } = await params
    
    // Get the user's session
    const session = await auth()
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get query parameters for pagination
    const { searchParams } = new URL(request.url)
    const offset = searchParams.get('offset') || '0'
    const limit = searchParams.get('limit') || '50'

    // Fetch tracks from Spotify API
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error('Spotify API error:', response.status, response.statusText)
      return NextResponse.json(
        { error: 'Failed to fetch tracks from Spotify' }, 
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Filter out tracks without preview URLs and format the response
    const tracksWithPreviews = data.items
      .filter((item: any) => item.track?.preview_url)
      .map((item: any) => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map((artist: any) => artist.name).join(', '),
        preview_url: item.track.preview_url,
        album: item.track.album.name,
        duration_ms: item.track.duration_ms
      }))

    return NextResponse.json({
      tracks: tracksWithPreviews,
      total: data.total,
      offset: data.offset,
      limit: data.limit,
      has_more: data.offset + data.limit < data.total
    })

  } catch (error) {
    console.error('Error fetching playlist tracks:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}