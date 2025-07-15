import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { SpotifyCacheWrapper } from '@/lib/spotify-cache-wrapper'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { action, playlistId } = await request.json()
    
    switch (action) {
      case 'user':
        await SpotifyCacheWrapper.invalidateUserCache(session.user.id)
        return NextResponse.json({ message: 'User cache invalidated' })
      
      case 'playlist':
        if (playlistId) {
          await SpotifyCacheWrapper.invalidatePlaylistCache(playlistId)
          return NextResponse.json({ message: 'Playlist cache invalidated' })
        }
        return NextResponse.json({ error: 'Playlist ID required' }, { status: 400 })
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Cache invalidation error:', error)
    return NextResponse.json({ error: 'Failed to invalidate cache' }, { status: 500 })
  }
}