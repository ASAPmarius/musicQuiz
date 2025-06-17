// app/api/spotify/playlist/[playlistId]/tracks/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> }
) {
  try {
    const { playlistId } = await params
    console.log('🎵 Fetching tracks for playlist:', playlistId)
    
    const session = await getServerSession(authOptions)
    
    if (!session || !(session as any)?.accessToken) {
      console.log('❌ No session or token')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const accessToken = (session as any).accessToken
    console.log('🎵 Using token:', accessToken.substring(0, 20) + '...')

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const offset = searchParams.get('offset') || '0'
    const limit = searchParams.get('limit') || '50'

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    console.log('🎵 Spotify tracks response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('🎵 Spotify API error:', response.status, errorText)
      return NextResponse.json({
        error: `Spotify API error: ${response.status}`,
        details: errorText
      }, { status: response.status })
    }

    const data = await response.json()
    console.log('🎵 Raw tracks from Spotify:', data.items?.length || 0)
    
    // ✅ Show ALL tracks, not just ones with preview URLs
    // Since we now have Web Playback SDK, we can play any track
    const allTracks = data.items
      .filter((item: any) => item.track && item.track.id) // Only filter out null/deleted tracks
      .map((item: any) => ({
        id: item.track.id,
        name: item.track.name,
        artists: item.track.artists.map((artist: any) => artist.name).join(', '),
        uri: item.track.uri, // ✅ Spotify URI for Web Playback SDK
        preview_url: item.track.preview_url, // ✅ Keep even if null
        album: item.track.album.name,
        duration_ms: item.track.duration_ms,
        // ✅ Add helpful flags
        hasPreview: !!item.track.preview_url,
        canPlayWithSDK: true // All tracks can play with Web Playback SDK
      }))

    // Separate counts for debugging
    const tracksWithPreviews = allTracks.filter((track: any) => track.hasPreview)
    const tracksWithoutPreviews = allTracks.filter((track: any) => !track.hasPreview)

    console.log('🎵 Track analysis:', {
      total: allTracks.length,
      withPreviews: tracksWithPreviews.length,
      withoutPreviews: tracksWithoutPreviews.length
    })

    return NextResponse.json({
      tracks: allTracks, // ✅ Return ALL tracks
      total: data.total,
      offset: data.offset,
      limit: data.limit,
      has_more: data.offset + data.limit < data.total,
      // ✅ Add metadata for frontend
      metadata: {
        totalTracks: allTracks.length,
        tracksWithPreviews: tracksWithPreviews.length,
        tracksWithoutPreviews: tracksWithoutPreviews.length,
        note: tracksWithoutPreviews.length > 0 ? 
          `${tracksWithoutPreviews.length} tracks can only be played with Web Playback SDK (no 30s preview)` : 
          'All tracks have 30-second previews available'
      }
    })

  } catch (error) {
    console.error('❌ Error fetching tracks:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}