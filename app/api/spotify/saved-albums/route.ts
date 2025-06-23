import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(request: NextRequest) {
  console.log('🎵 Albums API called')
  
  try {
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

    // Fetch all saved albums with pagination
    let allAlbums: any[] = []
    let nextUrl: string | null = 'https://api.spotify.com/v1/me/albums?limit=50'
    
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
        
        return NextResponse.json({ 
          error: 'Failed to fetch albums',
          details: errorText 
        }, { status: response.status })
      }

      const data = await response.json()
      // Extract just the album objects
      const albums = (data.items || []).map((item: any) => item.album).filter(Boolean)
      allAlbums = allAlbums.concat(albums)
      nextUrl = data.next
      
      console.log(`Fetched ${allAlbums.length}/${data.total} albums`)
    }

    console.log(`✅ Returning ${allAlbums.length} albums`)
    return NextResponse.json(allAlbums)
    
  } catch (error) {
    console.error('Error in /api/spotify/albums:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch albums',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}