import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Starting session debug...')
    
    // ✅ NextAuth v4 way to get session on server side
    const session = await getServerSession(authOptions)
    
    console.log('📋 Server session data:', {
      exists: !!session,
      user: session?.user,
      accessToken: session?.accessToken ? 'Present' : 'Missing',
      refreshToken: session?.refreshToken ? 'Present' : 'Missing',
      spotifyId: session?.spotifyId,
    })

    return NextResponse.json({
      message: 'Session debug complete',
      serverSession: {
        exists: !!session,
        hasUser: !!session?.user,
        userName: session?.user?.name,
        userEmail: session?.user?.email,
        hasAccessToken: !!session?.accessToken,
        hasRefreshToken: !!session?.refreshToken,
        spotifyId: session?.spotifyId,
        // Don't include the actual tokens for security
        accessTokenLength: session?.accessToken?.length || 0,
        refreshTokenLength: session?.refreshToken?.length || 0
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Session debug error:', error)
    return NextResponse.json(
      { 
        error: 'Session debug failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}