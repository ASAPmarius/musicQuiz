import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    // Simple authentication check
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CLEANUP_SECRET_TOKEN || 'your-secret-cleanup-token'
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🎵 Starting aggressive song cleanup...')

    // Step 1: Clean up orphaned songs (not in any game)
    const orphanedSongs = await prisma.song.findMany({
      where: {
        gameSongs: { none: {} },
        playerSongs: { none: {} }
      }
    })

    let orphanedDeleted = 0
    if (orphanedSongs.length > 0) {
      const deleteResult = await prisma.song.deleteMany({
        where: { id: { in: orphanedSongs.map(s => s.id) } }
      })
      orphanedDeleted = deleteResult.count
      console.log(`🗑️ Deleted ${orphanedDeleted} orphaned songs`)
    }

    // Step 2: Clean up old songs (24+ hours old, not in active games)
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    const oldSongs = await prisma.song.findMany({
      where: {
        createdAt: { lt: twentyFourHoursAgo },
        gameSongs: {
          none: {
            game: {
              status: { in: ['WAITING', 'PLAYING'] }
            }
          }
        }
      }
    })

    let oldDeleted = 0
    if (oldSongs.length > 0) {
      const deleteResult = await prisma.song.deleteMany({
        where: { id: { in: oldSongs.map(s => s.id) } }
      })
      oldDeleted = deleteResult.count
      console.log(`🗑️ Deleted ${oldDeleted} old songs`)
    }

    // Step 3: Clean up duplicate songs (same Spotify ID)
    const duplicateSongs = await prisma.song.groupBy({
      by: ['spotifyId'],
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } }
    })

    let duplicatesDeleted = 0
    for (const duplicate of duplicateSongs) {
      const songsToKeep = await prisma.song.findFirst({
        where: { spotifyId: duplicate.spotifyId },
        orderBy: { createdAt: 'asc' }
      })

      if (songsToKeep) {
        const deleteResult = await prisma.song.deleteMany({
          where: {
            spotifyId: duplicate.spotifyId,
            id: { not: songsToKeep.id }
          }
        })
        duplicatesDeleted += deleteResult.count
      }
    }

    console.log(`🎵 Song cleanup completed!`)
    console.log(`  - Orphaned songs deleted: ${orphanedDeleted}`)
    console.log(`  - Old songs deleted: ${oldDeleted}`)
    console.log(`  - Duplicate songs deleted: ${duplicatesDeleted}`)

    return NextResponse.json({
      success: true,
      message: 'Song cleanup completed successfully',
      orphanedDeleted,
      oldDeleted,
      duplicatesDeleted,
      totalDeleted: orphanedDeleted + oldDeleted + duplicatesDeleted,
      cutoffTime: twentyFourHoursAgo.toISOString()
    })

  } catch (error) {
    console.error('❌ Song cleanup failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Song cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

// GET for dry run
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CLEANUP_SECRET_TOKEN || 'your-secret-cleanup-token'
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    // Count what would be deleted
    const orphanedCount = await prisma.song.count({
      where: {
        gameSongs: { none: {} },
        playerSongs: { none: {} }
      }
    })

    const oldCount = await prisma.song.count({
      where: {
        createdAt: { lt: twentyFourHoursAgo },
        gameSongs: {
          none: {
            game: { status: { in: ['WAITING', 'PLAYING'] } }
          }
        }
      }
    })

    const totalSongs = await prisma.song.count()

    return NextResponse.json({
      dryRun: true,
      totalSongs,
      orphanedSongs: orphanedCount,
      oldSongs: oldCount,
      potentialDeletion: orphanedCount + oldCount,
      cutoffTime: twentyFourHoursAgo.toISOString()
    })

  } catch (error) {
    console.error('❌ Song cleanup dry run failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Dry run failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}