import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '')
    
    let totalTracks = 0
    let offset = 0
    const limit = 50
    let hasMore = true

    // We need to fetch all albums to count their tracks
    while (hasMore) {
      const response = await fetch(
        `https://api.spotify.com/v1/me/albums?limit=${limit}&offset=${offset}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`)
      }

      const data = await response.json()
      
      // Add up track counts from each album
      data.items.forEach((item: any) => {
        totalTracks += item.album.total_tracks || 0
      })

      hasMore = data.next !== null
      offset += limit
      
      if (offset > 6000) break // Safety limit
    }

    return NextResponse.json({ totalTracks })
    
  } catch (error) {
    console.error('Error counting album tracks:', error)
    return NextResponse.json({ error: 'Failed to count album tracks' }, { status: 500 })
  }
}