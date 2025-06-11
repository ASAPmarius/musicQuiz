import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { spotifyService } from '@/lib/spotify';

interface RouteParams {
  params: {
    playlistId: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await auth();
    
    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' }, 
        { status: 401 }
      );
    }

    const { playlistId } = params;
    
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const previewsOnly = searchParams.get('previews_only') === 'true';

    let tracks;
    
    if (previewsOnly) {
      // Get only tracks with 30-second previews (for the quiz)
      tracks = await spotifyService.getPlaylistTracksWithPreviews(
        playlistId,
        session.accessToken
      );
      
      // Return in a format similar to Spotify's API
      return NextResponse.json({
        items: tracks.map(track => ({ track })),
        total: tracks.length,
        next: null
      });
    } else {
      // Get all tracks (for display purposes)
      tracks = await spotifyService.getPlaylistTracks(
        playlistId,
        session.accessToken,
        limit,
        offset
      );
      
      return NextResponse.json(tracks);
    }
  } catch (error) {
    console.error('Error in /api/spotify/playlist/[playlistId]/tracks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist tracks' }, 
      { status: 500 }
    );
  }
}