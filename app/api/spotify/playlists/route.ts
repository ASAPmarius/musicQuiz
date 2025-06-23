import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(request: NextRequest) {
  console.log('🎵 Playlists API called')
  
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

    // Fetch from Spotify with pagination support
    let allPlaylists: any[] = []
    let nextUrl: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50'
    
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
          error: 'Failed to fetch playlists',
          details: errorText 
        }, { status: response.status })
      }

      const data = await response.json()
      allPlaylists = allPlaylists.concat(data.items || [])
      nextUrl = data.next // Spotify provides full URL for next page
      
      console.log(`Fetched ${allPlaylists.length}/${data.total} playlists`)
    }

    console.log(`✅ Returning ${allPlaylists.length} playlists`)
    return NextResponse.json(allPlaylists)
    
  } catch (error) {
    console.error('Error in /api/spotify/playlists:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch playlists',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}