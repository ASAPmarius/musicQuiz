import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '')
    
    // Just get the first page to read the total count
    const response = await fetch(
      'https://api.spotify.com/v1/me/tracks?limit=1',
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
    return NextResponse.json({ total: data.total })
    
  } catch (error) {
    console.error('Error counting liked songs:', error)
    return NextResponse.json({ error: 'Failed to count liked songs' }, { status: 500 })
  }
}