import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { NextRequest, NextResponse } from 'next/server'
import { spotifyRateLimiter, SpotifyRateLimiter } from './rate-limiter'

export interface SpotifyApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  needsReauth?: boolean
  status?: number
}

export async function withSpotifyAuth<T>(
  request: NextRequest,
  handler: (accessToken: string, userId: string) => Promise<T>
): Promise<NextResponse> {
  try {
    // Check for Bearer token first (for server-to-server calls)
    const authHeader = request.headers.get('authorization')
    let accessToken: string | undefined
    let userId: string | undefined
    let session: any

    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7)
      // For Bearer tokens, we need to get userId from session anyway
      session = await getServerSession(authOptions)
      userId = session?.user?.id
      console.log('✅ Using Bearer token with userId:', userId)
    } else {
      // Fall back to session check (for client calls)
      session = await getServerSession(authOptions)
      accessToken = session?.accessToken
      userId = session?.user?.id

      // 🔄 CHECK FOR REFRESH ERROR
      if (session?.error === "RefreshAccessTokenError") {
        console.log('❌ Token refresh failed, user needs to re-login')
        return NextResponse.json({ 
          error: 'Token refresh failed', 
          needsReauth: true 
        }, { status: 401 })
      }

      if (accessToken) {
        console.log('✅ Using session token for userId:', userId)
      }
    }

    if (!accessToken || !userId) {
      console.log('❌ No session, token, or userId')
      return NextResponse.json({ 
        error: 'Not authenticated',
        needsReauth: true 
      }, { status: 401 })
    }

    // Call the actual handler with the access token and userId
    const result = await handler(accessToken, userId)
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

/**
 * Enhanced Spotify API request with rate limiting and retry logic
 * 
 * @param url - Spotify API endpoint URL
 * @param accessToken - User's Spotify access token
 * @param userId - User ID for rate limiting (each user gets separate limits)
 * @param options - Fetch options
 * @param priority - Request priority (high/normal/low)
 * @param retryCount - Current retry attempt (internal use)
 */
export async function makeSpotifyRequest(
  url: string, 
  accessToken: string, 
  userId: string,
  options: RequestInit = {},
  priority: number = SpotifyRateLimiter.PRIORITY.NORMAL,
  retryCount: number = 0
) {
  const maxRetries = 3
  const baseDelayMs = 1000 // 1 second base delay

  try {
    // 🎫 Request a token from the rate limiter
    console.log(`🎫 Requesting token for user ${userId} (priority: ${priority})`)
    await spotifyRateLimiter.requestToken(userId, priority)

    // 🚀 Make the actual API request
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    // ✅ Success - return the data
    if (response.ok) {
      console.log(`✅ Spotify API success: ${url}`)
      return response.json()
    }

    // 🔄 Handle 429 (Too Many Requests) - Spotify's rate limit hit
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After')
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader) : 5
      
      console.log(`⏱️ Rate limited on ${url}, waiting ${retryAfterSeconds}s`)
      
      // Use the rate limiter's 429 handler
      await spotifyRateLimiter.handle429Error(userId, retryAfterSeconds)
      
      // Retry the request
      if (retryCount < maxRetries) {
        console.log(`🔄 Retrying request after rate limit (attempt ${retryCount + 1}/${maxRetries})`)
        return makeSpotifyRequest(url, accessToken, userId, options, priority, retryCount + 1)
      }
    }

    // 🔄 Handle 401 (Unauthorized) - Token expired
    if (response.status === 401) {
      console.log(`❌ Token expired for ${url}`)
      throw response // Let the wrapper handle this
    }

    // 🔄 Handle 5xx errors (Server errors) - Retry with exponential backoff
    if (response.status >= 500 && retryCount < maxRetries) {
      const delay = baseDelayMs * Math.pow(2, retryCount) // Exponential backoff
      console.log(`🔄 Server error ${response.status} on ${url}, retrying in ${delay}ms`)
      
      await new Promise(resolve => setTimeout(resolve, delay))
      return makeSpotifyRequest(url, accessToken, userId, options, priority, retryCount + 1)
    }

    // ❌ Other errors - get detailed error message
    const errorText = await response.text()
    console.error(`❌ Spotify API error: ${response.status} ${response.statusText}`)
    console.error(`URL: ${url}`)
    console.error(`Response: ${errorText}`)
    
    throw new Error(`Spotify API error: ${response.status} - ${errorText}`)

  } catch (error) {
    // Handle network errors and other exceptions
    if (error instanceof Response) {
      // This is a Response object (401 error), re-throw it
      throw error
    }

    // Handle network errors with retry
    if (retryCount < maxRetries && error instanceof Error) {
      const delay = baseDelayMs * Math.pow(2, retryCount)
      console.log(`🔄 Network error, retrying in ${delay}ms: ${error.message}`)
      
      await new Promise(resolve => setTimeout(resolve, delay))
      return makeSpotifyRequest(url, accessToken, userId, options, priority, retryCount + 1)
    }

    // Final failure
    console.error(`❌ Final error after ${retryCount} retries:`, error)
    throw error
  }
}

/**
 * Convenience function for high-priority requests (user profile, devices)
 */
export async function makeHighPrioritySpotifyRequest(
  url: string, 
  accessToken: string, 
  userId: string,
  options: RequestInit = {}
) {
  return makeSpotifyRequest(url, accessToken, userId, options, SpotifyRateLimiter.PRIORITY.HIGH)
}

/**
 * Convenience function for low-priority requests (album details, etc.)
 */
export async function makeLowPrioritySpotifyRequest(
  url: string, 
  accessToken: string, 
  userId: string,
  options: RequestInit = {}
) {
  return makeSpotifyRequest(url, accessToken, userId, options, SpotifyRateLimiter.PRIORITY.LOW)
}