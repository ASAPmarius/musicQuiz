import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(request: NextRequest) {
  console.log('❤️ Liked songs API called')
  
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || !(session as any)?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const accessToken = (session as any).accessToken
    const { searchParams } = new URL(request.url)
    const offset = searchParams.get('offset') || '0'
    const limit = searchParams.get('limit') || '50'

    // 🎵 This is the Spotify endpoint for liked songs
    const response = await fetch(
      `https://api.spotify.com/v1/me/tracks?offset=${offset}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({
        error: 'Spotify API error',
        details: errorText
      }, { status: response.status })
    }

    const data = await response.json()
    
    // Format liked songs (similar to how you format playlists)
    const formattedTracks = data.items.map((item: any) => ({
      id: item.track.id,
      name: item.track.name,
      artists: item.track.artists.map((artist: any) => artist.name).join(', '),
      album: item.track.album.name,
      preview_url: item.track.preview_url,
      images: item.track.album.images,
      added_at: item.added_at
    }))

    return NextResponse.json({
      tracks: formattedTracks,
      total: data.total,
      offset: data.offset,
      limit: data.limit,
      has_more: data.offset + data.limit < data.total
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}