// app/api/test-tracks/[playlistId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playlistId: string }> }
) {
  try {
    const { playlistId } = await params
    console.log('🎵 DEBUG: Testing tracks for playlist:', playlistId)
    
    const session = await getServerSession(authOptions)
    
    if (!session || !(session as any)?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const accessToken = (session as any).accessToken
    console.log('🎵 DEBUG: Using token:', accessToken.substring(0, 20) + '...')

    // Fetch tracks from Spotify (no filtering yet)
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    console.log('🎵 DEBUG: Spotify response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('🎵 DEBUG: Spotify error:', response.status, errorText)
      return NextResponse.json({
        error: `Spotify API error: ${response.status}`,
        details: errorText
      }, { status: response.status })
    }

    const data = await response.json()
    console.log('🎵 DEBUG: Raw response from Spotify:', {
      totalItems: data.items?.length || 0,
      total: data.total,
      firstTrack: data.items?.[0]?.track?.name || 'No tracks'
    })

    // Check how many have preview URLs
    const allTracks = data.items.map((item: any) => ({
      id: item.track?.id || 'no-id',
      name: item.track?.name || 'No name',
      hasPreviewUrl: !!item.track?.preview_url,
      previewUrl: item.track?.preview_url || null,
      uri: item.track?.uri || null,
      type: item.track?.type || 'unknown'
    }))

    const tracksWithPreviews = allTracks.filter((track: any) => track.hasPreviewUrl)

    console.log('🎵 DEBUG: Track analysis:', {
      totalTracks: allTracks.length,
      tracksWithPreviews: tracksWithPreviews.length,
      tracksWithoutPreviews: allTracks.length - tracksWithPreviews.length
    })

    return NextResponse.json({
      debug: true,
      playlistId,
      rawTotal: data.total,
      fetchedTracks: allTracks.length,
      tracksWithPreviews: tracksWithPreviews.length,
      tracksWithoutPreviews: allTracks.length - tracksWithPreviews.length,
      sampleTracks: allTracks.slice(0, 3), // First 3 tracks for inspection
      tracksWithPreviewsFormatted: tracksWithPreviews.slice(0, 3),
      recommendation: tracksWithPreviews.length === 0 ? 
        'No tracks have preview URLs. This is normal for some playlists. Consider showing all tracks or using Web Playback SDK.' :
        `${tracksWithPreviews.length} out of ${allTracks.length} tracks have preview URLs.`
    })

  } catch (error) {
    console.error('❌ DEBUG: Error testing tracks:', error)
    return NextResponse.json({
      error: 'Debug tracks failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}