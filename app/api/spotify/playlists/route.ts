import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'

export async function GET(request: NextRequest) {
  try {
    // Get the user's session
    const session = await auth()
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get query parameters for pagination
    const { searchParams } = new URL(request.url)
    const offset = searchParams.get('offset') || '0'
    const limit = searchParams.get('limit') || '50'

    // Fetch user's playlists from Spotify API
    const response = await fetch(
      `https://api.spotify.com/v1/me/playlists?offset=${offset}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error('Spotify API error:', response.status, response.statusText)
      
      // Handle token expiry
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Spotify token expired. Please re-authenticate.' }, 
          { status: 401 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch playlists from Spotify' }, 
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Format the response to include only necessary data
    const formattedPlaylists = data.items.map((playlist: any) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      tracks: {
        total: playlist.tracks.total
      },
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
    console.error('Error fetching playlists:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}