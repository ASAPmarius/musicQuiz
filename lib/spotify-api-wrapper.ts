// lib/spotify-api-wrapper.ts
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { NextRequest, NextResponse } from 'next/server'

export interface SpotifyApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  needsReauth?: boolean
  status?: number
}

export async function withSpotifyAuth<T>(
  request: NextRequest,
  handler: (accessToken: string) => Promise<T>
): Promise<NextResponse> {
  try {
    // Check for Bearer token first (for server-to-server calls)
    const authHeader = request.headers.get('authorization')
    let accessToken: string | undefined
    let session: any

    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7)
      console.log('✅ Using Bearer token')
    } else {
      // Fall back to session check (for client calls)
      session = await getServerSession(authOptions)
      accessToken = session?.accessToken

      // 🔄 CHECK FOR REFRESH ERROR
      if (session?.error === "RefreshAccessTokenError") {
        console.log('❌ Token refresh failed, user needs to re-login')
        return NextResponse.json({ 
          error: 'Token refresh failed', 
          needsReauth: true 
        }, { status: 401 })
      }

      if (accessToken) {
        console.log('✅ Using session token')
      }
    }

    if (!accessToken) {
      console.log('❌ No session or token')
      return NextResponse.json({ 
        error: 'Not authenticated',
        needsReauth: true 
      }, { status: 401 })
    }

    // Call the actual handler with the access token
    const result = await handler(accessToken)
    return NextResponse.json(result)

  } catch (error) {
    console.error('Spotify API wrapper error:', error)
    
    // Check if it's a Spotify 401 error (token expired)
    if (error instanceof Response && error.status === 401) {
      return NextResponse.json({
        error: 'Spotify token expired',
        needsReauth: true,
        suggestion: 'Please refresh the page or sign in again'
      }, { status: 401 })
    }

    return NextResponse.json({
      error: 'Failed to fetch from Spotify',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Helper function for making Spotify API calls with automatic error handling
export async function makeSpotifyRequest(url: string, accessToken: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Spotify API error:', response.status, errorText)
    
    if (response.status === 401) {
      // Token expired - let the wrapper handle this
      throw response
    }
    
    throw new Error(`Spotify API error: ${response.status} - ${errorText}`)
  }

  return response.json()
}