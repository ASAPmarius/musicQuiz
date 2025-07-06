import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    // Simple authentication check - you can enhance this
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CLEANUP_SECRET_TOKEN || 'your-secret-cleanup-token'
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Calculate cutoff time (4 hours ago)
    const fourHoursAgo = new Date()
    fourHoursAgo.setHours(fourHoursAgo.getHours() - 4)

    console.log(`🧹 Starting cleanup of games older than ${fourHoursAgo.toISOString()}`)

    // Find games to delete (for logging purposes)
    const gamesToDelete = await prisma.game.findMany({
      where: {
        createdAt: {
          lt: fourHoursAgo
        }
      },
      include: {
        players: true,
        _count: {
          select: {
            players: true,
            rounds: true,
            scores: true,
            gameSongs: true
          }
        }
      }
    })

    if (gamesToDelete.length === 0) {
      console.log('✅ No games to clean up')
      return NextResponse.json({
        success: true,
        message: 'No games to clean up',
        deleted: 0,
        cutoffTime: fourHoursAgo.toISOString()
      })
    }

    // Log what we're about to delete
    console.log(`📊 Found ${gamesToDelete.length} games to delete:`)
    gamesToDelete.forEach(game => {
      console.log(`  - Game ${game.code} (${game.status}): ${game._count.players} players, ${game._count.rounds} rounds, ${game._count.scores} scores, ${game._count.gameSongs} song collections`)
    })

    // Delete the games (CASCADE will handle related data)
    const deleteResult = await prisma.game.deleteMany({
      where: {
        createdAt: {
          lt: fourHoursAgo
        }
      }
    })

    console.log(`✅ Cleanup completed! Deleted ${deleteResult.count} games`)

    // Calculate total related records that were deleted (for reporting)
    const totalRelatedRecords = gamesToDelete.reduce((total, game) => {
      return total + game._count.players + game._count.rounds + game._count.scores + game._count.gameSongs
    }, 0)

    return NextResponse.json({
      success: true,
      message: `Successfully cleaned up old games`,
      deleted: deleteResult.count,
      totalRelatedRecordsDeleted: totalRelatedRecords,
      cutoffTime: fourHoursAgo.toISOString(),
      deletedGames: gamesToDelete.map(game => ({
        code: game.code,
        status: game.status,
        createdAt: game.createdAt,
        playerCount: game._count.players
      }))
    })

  } catch (error) {
    console.error('❌ Cleanup failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

// Also support GET for manual testing (with same auth)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CLEANUP_SECRET_TOKEN || 'your-secret-cleanup-token'
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Calculate cutoff time (4 hours ago)
    const fourHoursAgo = new Date()
    fourHoursAgo.setHours(fourHoursAgo.getHours() - 4)

    // Find games that would be deleted (dry run)
    const gamesToDelete = await prisma.game.findMany({
      where: {
        createdAt: {
          lt: fourHoursAgo
        }
      },
      include: {
        _count: {
          select: {
            players: true,
            rounds: true,
            scores: true,
            gameSongs: true
          }
        }
      }
    })

    return NextResponse.json({
      dryRun: true,
      cutoffTime: fourHoursAgo.toISOString(),
      gamesEligibleForDeletion: gamesToDelete.length,
      games: gamesToDelete.map(game => ({
        id: game.id,
        code: game.code,
        status: game.status,
        createdAt: game.createdAt,
        age: Math.round((Date.now() - game.createdAt.getTime()) / (1000 * 60 * 60)) + ' hours',
        relatedRecords: game._count
      }))
    })

  } catch (error) {
    console.error('❌ Cleanup dry run failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Dry run failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}