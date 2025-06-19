import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(request: NextRequest) {
  console.log('💿 Saved albums API called')
  
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || !(session as any)?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const accessToken = (session as any).accessTokenput
    const { searchParams } = new URL(request.url)
    const offset = searchParams.get('offset') || '0'
    const limit = searchParams.get('limit') || '20' // Albums usually smaller limit

    // 🎵 This is the Spotify endpoint for saved albums  
    const response = await fetch(
      `https://api.spotify.com/v1/me/albums?offset=${offset}&limit=${limit}`,
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
    
    // Format saved albums
    const formattedAlbums = data.items.map((item: any) => ({
      id: item.album.id,
      name: item.album.name,
      artists: item.album.artists.map((artist: any) => artist.name).join(', '),
      total_tracks: item.album.total_tracks,
      images: item.album.images,
      release_date: item.album.release_date,
      added_at: item.added_at
    }))

    return NextResponse.json({
      albums: formattedAlbums,
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