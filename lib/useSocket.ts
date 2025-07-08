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
    console.log('🔌 Creating socket connection...')
    
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
    }
  }, []) // ← EMPTY dependency array - create once and keep stable!

  // Update game room when gameCode changes
  useEffect(() => {
    if (socket && gameCode !== gameCodeRef.current) {
      // Leave old room
      if (gameCodeRef.current) {
        console.log('👋 Leaving old game room:', gameCodeRef.current)
        socket.emit('leave-game', gameCodeRef.current)
      }
      
      // Join new room
      if (gameCode) {
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