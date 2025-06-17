// app/api/debug-database/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No session or email' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        accounts: {
          where: { provider: 'spotify' }
        }
      }
    })

    if (!user || !user.accounts[0]) {
      return NextResponse.json({ error: 'User or Spotify account not found' }, { status: 404 })
    }

    const spotifyAccount = user.accounts[0]

    // Compare session vs database
    const comparison = {
      session: {
        accessToken: (session as any)?.accessToken?.substring(0, 20) + '...' || 'Missing',
        refreshToken: (session as any)?.refreshToken?.substring(0, 20) + '...' || 'Missing',
        scope: (session as any)?.scope || 'Missing',
        expiresAt: (session as any)?.expiresAt || 'Missing',
        spotifyId: (session as any)?.spotifyId || 'Missing'
      },
      database: {
        accessToken: spotifyAccount.access_token?.substring(0, 20) + '...' || 'Missing',
        refreshToken: spotifyAccount.refresh_token?.substring(0, 20) + '...' || 'Missing',
        scope: spotifyAccount.scope || 'Missing',
        expiresAt: spotifyAccount.expires_at || 'Missing',
        spotifyId: spotifyAccount.providerAccountId || 'Missing'
      },
      match: {
        accessToken: (session as any)?.accessToken === spotifyAccount.access_token,
        scope: (session as any)?.scope === spotifyAccount.scope,
        expiresAt: (session as any)?.expiresAt === spotifyAccount.expires_at
      }
    }

    // Test the database token directly with Spotify
    let spotifyTest = null
    if (spotifyAccount.access_token) {
      try {
        const testResponse = await fetch('https://api.spotify.com/v1/me', {
          headers: {
            'Authorization': `Bearer ${spotifyAccount.access_token}`,
          },
        })
        spotifyTest = {
          status: testResponse.status,
          valid: testResponse.ok,
          error: testResponse.ok ? null : await testResponse.text()
        }
      } catch (error) {
        spotifyTest = {
          status: 'error',
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }

    return NextResponse.json({
      comparison,
      spotifyApiTest: spotifyTest,
      recommendation: !comparison.match.accessToken ? 
        'Session and database tokens do not match. Try signing out and in again.' :
        !spotifyTest?.valid ?
        'Token is invalid. Need to refresh or re-authenticate.' :
        'Everything looks good!'
    })

  } catch (error) {
    console.error('❌ Debug database error:', error)
    return NextResponse.json({
      error: 'Debug failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}