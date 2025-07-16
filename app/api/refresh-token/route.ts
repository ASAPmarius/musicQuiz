import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's account from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        accounts: {
          where: { provider: 'spotify' }
        }
      }
    })

    if (!user || !user.accounts[0]) {
      return NextResponse.json({ error: 'No Spotify account found' }, { status: 400 })
    }

    const account = user.accounts[0]

    // 🔧 FIX: Check for null refresh token
    if (!account.refresh_token) {
      return NextResponse.json({ 
        error: 'No refresh token available', 
        needsReauth: true 
      }, { status: 400 })
    }

    // Refresh the token
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token, // Now TypeScript knows this is not null
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Token refresh failed - HTTP status:', response.status)
      return NextResponse.json({ 
        error: 'Token refresh failed', 
        details: errorText,
        needsReauth: true 
      }, { status: 400 })
    }

    const tokens = await response.json()

    // Update the account in the database
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token,
        expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
        refresh_token: tokens.refresh_token || account.refresh_token,
      }
    })

    console.log('✅ Token refreshed successfully via manual API')

    return NextResponse.json({
      success: true,
      message: 'Token refreshed successfully',
      expiresIn: tokens.expires_in
    })

  } catch (error) {
    console.error('Manual token refresh error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({
      error: 'Token refresh failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}