import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

interface PlayerStatus {
  displayName?: string
  spotifyDeviceId?: string | null
  deviceName?: string
  playlistsSelected?: string[]
  songsLoaded?: boolean
  loadingProgress?: number
  isReady?: boolean
}

interface GameAction {
  action: string
  payload: any
}

interface Vote {
  roundId: string
  selectedPlayers: string[] // Array of player IDs they think own the song
}

interface UserInfo {
  userId: string
  displayName: string
}

export function useSocket(gameCode?: string, userInfo?: UserInfo) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [gameState, setGameState] = useState<any>(null)
  const [playerStatuses, setPlayerStatuses] = useState<Map<string, PlayerStatus>>(new Map())
  
  // Store the latest gameCode in a ref to avoid reconnecting unnecessarily
  const gameCodeRef = useRef<string | undefined>(gameCode)

  // 🔧 FIX: Create socket connection ONCE and keep it stable
  useEffect(() => {
    // Don't create socket until we have a valid gameCode
    if (!gameCode || gameCode.length !== 6) {
      console.log('⏸️ Waiting for valid gameCode before creating socket...')
      return
    }

    // Only create socket if we don't already have one
    if (socket) {
      console.log('✅ Socket already exists, skipping creation')
      return
    }

    console.log('🔌 Creating socket connection for gameCode:', gameCode)

    // Use current origin (works with ngrok, localhost, and production)
    const socketUrl = process.env.NODE_ENV === 'production' 
      ? undefined  // Will use current origin
      : 'http://localhost:3000'
    
    const newSocket = io(socketUrl, {
      transports: ['websocket'],
      autoConnect: true
    })

    newSocket.on('connect', () => {
      console.log('✅ Socket connected:', newSocket.id)
      setIsConnected(true)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason)
      setIsConnected(false)
    })

    // Game-related events
    newSocket.on('game-updated', (data) => {
      console.log('🎮 Game updated:', data)
      setGameState(data)
    })

    newSocket.on('game-state-changed', (data) => {
      console.log('🔄 Game state changed:', data)
      setGameState(data)
    })

    newSocket.on('player-status-updated', (data) => {
      console.log('📊 Player status updated:', data)
      setPlayerStatuses(prev => {
        const updated = new Map(prev)
        updated.set(data.socketId, data)
        return updated
      })
    })

    // Player connection events
    newSocket.on('player-connected', (data) => {
      console.log('🟢 Player connected:', data)
      // This will be handled by the game page component
    })

    newSocket.on('player-disconnected', (data) => {
      console.log('🔴 Player disconnected:', data)
      // This will be handled by the game page component
    })

    // Legacy player joined/left events (for backward compatibility)
    newSocket.on('player-joined', (data) => {
      console.log('👥 Player joined (legacy):', data)
      // This will be handled by the game page component
    })

    newSocket.on('player-left', (data) => {
      console.log('👋 Player left (legacy):', data)
      // This will be handled by the game page component
    })

    setSocket(newSocket)

    return () => {
      console.log('🧹 Cleaning up socket connection')
      newSocket.close()
      setSocket(null) // Clear socket state
    }
  }, [gameCode])

  // Update game room when gameCode changes
  useEffect(() => {
    if (socket && gameCode !== gameCodeRef.current) {
      // Leave old room
      if (gameCodeRef.current) {
        console.log('👋 Leaving old game room:', gameCodeRef.current)
        socket.emit('leave-game', gameCodeRef.current)
      }
      
      // Join new room - ONLY if gameCode is valid (6 characters)
      if (gameCode && gameCode.length === 6) {  // ← PRECISE FIX
        if (userInfo) {
          console.log('🔄 Joining new game room with user identification:', gameCode, userInfo)
          socket.emit('join-game-with-user', {
            gameCode,
            userId: userInfo.userId,
            displayName: userInfo.displayName
          })
        } else {
          console.log('🔄 Joining new game room (legacy):', gameCode)
          socket.emit('join-game', gameCode)
        }
      } else if (gameCode && gameCode.length !== 6) {
        console.log('⚠️ Invalid gameCode for socket room join:', gameCode)
      }
      
      gameCodeRef.current = gameCode
    }
  }, [socket, gameCode, userInfo])

  // 🔧 FIX: Handle joining game room when user info becomes available (SEPARATE effect)
  const hasJoinedRef = useRef<string | null>(null) // Track if we've already joined with this userInfo
  
  useEffect(() => {
    if (socket && gameCode && userInfo && isConnected) {
      const joinKey = `${gameCode}-${userInfo.userId}-${userInfo.displayName}`
      
      // Only join if we haven't already joined with this exact user info
      if (hasJoinedRef.current !== joinKey) {
        console.log('🎯 UserInfo now available, joining game with identification:', userInfo)
        socket.emit('join-game-with-user', {
          gameCode,
          userId: userInfo.userId,
          displayName: userInfo.displayName
        })
        hasJoinedRef.current = joinKey
      }
    }
  }, [socket, gameCode, userInfo, isConnected]) // ← This can change, but won't recreate socket

  useEffect(() => {
    if (!socket) return

    // Handle validation errors from server
    const handleValidationError = (data: { error: string; timestamp: string }) => {
      console.warn('🚨 Socket validation error:', data.error)
      
      // You can show a toast notification or set an error state
      // For now, we'll just log it, but you might want to show user feedback
      if (data.error.includes('Rate limit')) {
        // Handle rate limiting
        console.warn('Rate limited - slowing down socket requests')
      } else if (data.error.includes('Invalid')) {
        // Handle validation errors
        console.warn('Invalid data sent to server')
      }
    }

    // Handle vote confirmation
    const handleVoteConfirmed = (data: { roundId: string; timestamp: string }) => {
      console.log('✅ Vote confirmed for round:', data.roundId)
      // You can update UI to show vote was received
    }

    // Handle player connection events
    const handlePlayerConnected = (data: { userId: string; displayName: string; timestamp: string }) => {
      console.log('👥 Player connected:', data.displayName)
      // You can show a notification that a player joined
    }

    const handlePlayerLeft = (data: { userId: string; displayName: string; timestamp: string }) => {
      console.log('👋 Player left:', data.displayName)
      // You can show a notification that a player left
    }

    // Register event listeners
    socket.on('validation-error', handleValidationError)
    socket.on('vote-confirmed', handleVoteConfirmed)
    socket.on('player-connected', handlePlayerConnected)
    socket.on('player-left', handlePlayerLeft)

    // YOUR EXISTING EVENT HANDLERS HERE...

    // Cleanup
    return () => {
      socket.off('validation-error', handleValidationError)
      socket.off('vote-confirmed', handleVoteConfirmed)
      socket.off('player-connected', handlePlayerConnected)
      socket.off('player-left', handlePlayerLeft)
      // YOUR EXISTING CLEANUP HERE...
    }
  }, [socket, /* your other dependencies */])

  // Helper functions for sending events
  const updatePlayerStatus = (status: PlayerStatus) => {
    if (socket && gameCode) {
      socket.emit('update-player-status', {
        gameCode,
        playerUpdate: status
      })
    }
  }

  const sendGameAction = (action: string, payload: any) => {
    if (socket && gameCode) {
      socket.emit('game-action', {
        gameCode,
        action,
        payload
      })
    }
  }

  const submitVote = (vote: Vote) => {
    if (socket && gameCode) {
      socket.emit('submit-vote', {
        gameCode,
        vote
      })
    }
  }

  const revealVotes = (results: any) => {
    if (socket && gameCode) {
      socket.emit('reveal-votes', {
        gameCode,
        results
      })
    }
  }

  return {
    socket,
    isConnected,
    gameState,
    playerStatuses,
    updatePlayerStatus,
    sendGameAction,
    submitVote,
    revealVotes
  }
}