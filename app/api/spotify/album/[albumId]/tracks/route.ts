import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> }
) {
  try {
    const { albumId } = await params
    console.log(`🎵 Album tracks API called for album ${albumId}`)
  
    // Check for Bearer token first (for server-to-server calls)
    const authHeader = request.headers.get('authorization')
    let accessToken: string | undefined
    
    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7)
      console.log('✅ Using Bearer token')
    } else {
      // Fall back to session check (for client calls)
      const session = await getServerSession(authOptions)
      accessToken = (session as any)?.accessToken
      if (accessToken) {
        console.log('✅ Using session token')
      }
    }
    
    if (!accessToken) {
      console.log('❌ No session or token')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Fetch all tracks from album (usually no pagination needed, but let's be safe)
    let allTracks: any[] = []
    let nextUrl: string | null = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`
    
    while (nextUrl) {
      const response: Response = await fetch(nextUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Spotify API error:', response.status, errorText)
        
        if (response.status === 401) {
          return NextResponse.json({ error: 'Spotify token expired' }, { status: 401 })
        }
        
        if (response.status === 404) {
          return NextResponse.json({ error: 'Album not found' }, { status: 404 })
        }
        
        return NextResponse.json({ 
          error: 'Failed to fetch album tracks',
          details: errorText 
        }, { status: response.status })
      }

      const data = await response.json()
      allTracks = allTracks.concat(data.items || [])
      nextUrl = data.next // Usually null for albums, but just in case
      
      if (data.total) {
        console.log(`Fetched ${allTracks.length}/${data.total} tracks from album`)
      }
    }

    console.log(`✅ Returning ${allTracks.length} tracks from album`)
    return NextResponse.json(allTracks)
    
  } catch (error) {
    console.error('Error in /api/spotify/albums/[id]/tracks:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch album tracks',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}