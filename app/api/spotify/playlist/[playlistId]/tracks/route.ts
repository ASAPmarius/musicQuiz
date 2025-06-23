import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> }
) {
  try {
    const { playlistId } = await params
    console.log(`🎵 Playlist tracks API called for playlist ${playlistId}`)

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

    // Fetch all tracks from playlist with pagination
    let allTracks: any[] = []
    let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists,album,preview_url)),next,total`
    
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
          return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
        }
        
        return NextResponse.json({ 
          error: 'Failed to fetch playlist tracks',
          details: errorText 
        }, { status: response.status })
      }

      const data = await response.json()
      // Extract tracks and filter out null values (deleted tracks)
      const tracks = (data.items || [])
        .map((item: any) => item.track)
        .filter((track: any) => track !== null)
      
      allTracks = allTracks.concat(tracks)
      nextUrl = data.next
      
      console.log(`Fetched ${allTracks.length}/${data.total} tracks from playlist`)
    }

    console.log(`✅ Returning ${allTracks.length} tracks from playlist`)
    return NextResponse.json(allTracks)
    
  } catch (error) {
    console.error('Error in /api/spotify/playlists/[id]/tracks:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch playlist tracks',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}