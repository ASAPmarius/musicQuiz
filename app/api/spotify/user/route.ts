import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { spotifyService } from '@/lib/spotify';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' }, 
        { status: 401 }
      );
    }

    // Get user's profile information from Spotify
    const user = await spotifyService.getCurrentUser(session.accessToken);

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error in /api/spotify/user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user data' }, 
      { status: 500 }
    );
  }
}