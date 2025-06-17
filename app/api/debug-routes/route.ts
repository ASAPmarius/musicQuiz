// app/api/debug-routes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    return NextResponse.json({
      message: 'Debug routes endpoint working',
      session: {
        exists: !!session,
        hasAccessToken: !!(session as any)?.accessToken,
        tokenPreview: (session as any)?.accessToken?.substring(0, 20) + '...' || 'No token',
        scopes: (session as any)?.scope?.split(' ') || [],
        spotifyId: (session as any)?.spotifyId
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Debug routes failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Also export POST to test both methods
export async function POST(request: NextRequest) {
  return NextResponse.json({ message: 'POST method works' })
}