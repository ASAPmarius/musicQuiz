import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CLEANUP_SECRET_TOKEN || 'your-secret-cleanup-token'
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🤖 Starting automated cleanup...')

    // Run game cleanup
    const gameCleanup = await fetch(`${process.env.NEXTAUTH_URL}/api/cleanup/games`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${expectedToken}`,
        'content-type': 'application/json'
      }
    })

    const gameResults = await gameCleanup.json()

    // Run song cleanup
    const songCleanup = await fetch(`${process.env.NEXTAUTH_URL}/api/cleanup/songs`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${expectedToken}`,
        'content-type': 'application/json'
      }
    })

    const songResults = await songCleanup.json()

    console.log('✅ Automated cleanup completed!')

    return NextResponse.json({
      success: true,
      message: 'Automated cleanup completed',
      gameCleanup: gameResults,
      songCleanup: songResults,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Automated cleanup failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Automated cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}