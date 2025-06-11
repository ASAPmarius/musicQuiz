import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { spotifyService } from '@/lib/spotify';

export async function GET(request: NextRequest) {
  try {
    // First, check if user is logged in (like checking if customer has a table reservation)
    const session = await auth();
    
    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated or missing access token' }, 
        { status: 401 }
      );
    }

    // Get query parameters (like reading the customer's special requests)
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Ask Spotify for the user's playlists
    const playlists = await spotifyService.getUserPlaylists(
      session.accessToken,
      limit,
      offset
    );

    return NextResponse.json(playlists);
  } catch (error) {
    console.error('Error in /api/spotify/playlists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlists' }, 
      { status: 500 }
    );
  }
}
