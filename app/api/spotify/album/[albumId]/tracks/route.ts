import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ albumId: string }> }
) {
  try {
    const { albumId } = await params
    console.log('💿 Fetching tracks for album:', albumId)
    
    const session = await getServerSession(authOptions)
    
    if (!session || !(session as any)?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const accessToken = (session as any).accessToken
    const { searchParams } = new URL(request.url)
    const offset = searchParams.get('offset') || '0'
    const limit = searchParams.get('limit') || '50'

    // 🎵 Get album tracks (note: different endpoint structure than playlists!)
    const response = await fetch(
      `https://api.spotify.com/v1/albums/${albumId}/tracks?offset=${offset}&limit=${limit}`,
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
        error: `Spotify API error: ${response.status}`,
        details: errorText
      }, { status: response.status })
    }

    const data = await response.json()
    console.log('💿 Raw album tracks from Spotify:', data.items?.length || 0)
    
    // ⚠️ IMPORTANT: Album tracks endpoint returns different structure than playlist tracks!
    // Album tracks are directly in 'items', not wrapped in 'track' objects
    const allTracks = data.items
      .filter((track: any) => track && track.id) // Filter out null tracks
      .map((track: any) => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map((artist: any) => artist.name).join(', '),
        uri: track.uri,
        preview_url: track.preview_url,
        duration_ms: track.duration_ms,
        track_number: track.track_number,
        // Note: Album tracks don't have album info (they're already from an album!)
        hasPreview: !!track.preview_url,
        canPlayWithSDK: true
      }))

    return NextResponse.json({
      tracks: allTracks,
      total: data.total,
      offset: data.offset,
      limit: data.limit,
      has_more: data.offset + data.limit < data.total
    })

  } catch (error) {
    console.error('❌ Album tracks error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}