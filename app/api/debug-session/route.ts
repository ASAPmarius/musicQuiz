import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Starting session debug...')
    
    // Get the session using NextAuth's auth() function
    const session = await auth();
    
    console.log('📋 Server session data:', {
      exists: !!session,
      user: session?.user,
      accessToken: session?.accessToken ? 'Present' : 'Missing',
      refreshToken: session?.refreshToken ? 'Present' : 'Missing',
      spotifyId: (session as any)?.spotifyId,
      expires: (session as any)?.expires
    });

    return NextResponse.json({
      message: 'Session debug complete',
      serverSession: {
        exists: !!session,
        hasUser: !!session?.user,
        userName: session?.user?.name,
        userEmail: session?.user?.email,
        hasAccessToken: !!(session as any)?.accessToken,
        hasRefreshToken: !!(session as any)?.refreshToken,
        spotifyId: (session as any)?.spotifyId,
        expires: (session as any)?.expires,
        // Don't include the actual tokens for security
        accessTokenLength: (session as any)?.accessToken?.length || 0,
        refreshTokenLength: (session as any)?.refreshToken?.length || 0
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Session debug error:', error);
    return NextResponse.json(
      { 
        error: 'Session debug failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}