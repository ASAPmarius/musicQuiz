// app/api/spotify/playlists/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(request: NextRequest) {
  console.log('🎵 Playlists API called')
  
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || !(session as any)?.accessToken) {
      console.log('❌ No session or token')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const accessToken = (session as any).accessToken
    console.log('🎵 Using token:', accessToken.substring(0, 20) + '...')

    // Get query parameters for pagination
    const { searchParams } = new URL(request.url)
    const offset = searchParams.get('offset') || '0'
    const limit = searchParams.get('limit') || '50'

    const response = await fetch(
      `https://api.spotify.com/v1/me/playlists?offset=${offset}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    console.log('🎵 Spotify response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('🎵 Spotify error:', response.status, errorText)
      return NextResponse.json({
        error: 'Spotify API error',
        status: response.status,
        details: errorText
      }, { status: response.status })
    }

    const data = await response.json()
    console.log('✅ Got', data.items?.length, 'playlists')

    // Format the response
    const formattedPlaylists = data.items.map((playlist: any) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      tracks: { total: playlist.tracks.total },
      images: playlist.images,
      owner: playlist.owner.display_name,
      public: playlist.public
    }))

    return NextResponse.json({
      playlists: formattedPlaylists,
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