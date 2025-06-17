// app/api/test-playlists/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'

export async function GET(request: NextRequest) {
  console.log('🎵 Test playlists API called')
  
  try {
    const session = await getServerSession(authOptions)
    console.log('📋 Session check:', {
      exists: !!session,
      hasToken: !!(session as any)?.accessToken,
      scopes: (session as any)?.scope
    })
    
    if (!session || !(session as any)?.accessToken) {
      console.log('❌ No session or token')
      return NextResponse.json({ 
        error: 'Not authenticated',
        hasSession: !!session,
        hasToken: !!(session as any)?.accessToken
      }, { status: 401 })
    }

    const accessToken = (session as any).accessToken
    console.log('🎵 Making Spotify API call with token:', accessToken.substring(0, 20) + '...')

    const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=10', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    console.log('🎵 Spotify response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('🎵 Spotify error:', response.status, errorText)
      
      return NextResponse.json({
        error: 'Spotify API error',
        status: response.status,
        details: errorText,
        tokenUsed: accessToken.substring(0, 20) + '...'
      }, { status: response.status })
    }

    const data = await response.json()
    console.log('✅ Success! Got', data.items?.length, 'playlists')

    return NextResponse.json({
      success: true,
      playlistCount: data.items?.length || 0,
      playlists: data.items?.slice(0, 3).map((p: any) => ({ 
        id: p.id, 
        name: p.name 
      })) || [],
      tokenUsed: accessToken.substring(0, 20) + '...',
      scopes: (session as any)?.scope
    })

  } catch (error) {
    console.error('❌ API Error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}