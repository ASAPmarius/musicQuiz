import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(request: NextRequest) {
  try {
    // ✅ NextAuth v4 way to get session
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' }, 
        { status: 401 }
      )
    }

    // Get user's profile information from Spotify
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Spotify API error:', response.status, response.statusText)
      return NextResponse.json(
        { error: 'Failed to fetch user data from Spotify' }, 
        { status: response.status }
      )
    }

    const user = await response.json()
    return NextResponse.json(user)
    
  } catch (error) {
    console.error('Error in /api/spotify/user:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user data' }, 
      { status: 500 }
    )
  }
}