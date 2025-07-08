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
  const userInfoRef = useRef<UserInfo | undefined>(userInfo)

  useEffect(() => {
    // Initialize socket connection
    // Use current origin (works with ngrok, localhost, and production)
    const socketUrl = process.env.NODE_ENV === 'production' 
      ? undefined  // Use current origin in production
      : window.location.origin // Use current origin in development (supports ngrok)
    
    const newSocket = io(socketUrl)
    
    newSocket.on('connect', () => {
      console.log('🔌 Connected to server:', newSocket.id)
      setIsConnected(true)
      
      if (gameCodeRef.current && userInfoRef.current) {
        console.log('🎯 Joining game with user identification:', userInfoRef.current)
        newSocket.emit('join-game-with-user', {
          gameCode: gameCodeRef.current,
          userId: userInfoRef.current.userId,
          displayName: userInfoRef.current.displayName
        })
      }
    })

    newSocket.on('disconnect', () => {
      console.log('🔌 Disconnected from server')
      setIsConnected(false)
    })

    newSocket.on('game-updated', (data) => {
      console.log('🎮 Game updated:', data)
      // This will be handled by the game page component
      // We just log it here for debugging
    })

    // Listen for player status updates
    newSocket.on('player-status-updated', (data) => {
      console.log('🔄 Player status updated:', data)
      setPlayerStatuses(prev => {
        const updated = new Map(prev)
        updated.set(data.socketId, data)
        return updated
      })
    })

    // Listen for game state changes
    newSocket.on('game-state-changed', (data) => {
      console.log('🎮 Game state changed:', data)
      setGameState(data)
    })

    // Listen for votes
    newSocket.on('vote-submitted', (data) => {
      console.log('🗳️ Someone voted:', data)
      // Update UI to show someone voted (without revealing the vote)
    })

    newSocket.on('votes-revealed', (data) => {
      console.log('📊 Votes revealed:', data)
      // Show all votes and results
    })

    // 🆕 NEW: Listen for player connection/disconnection events
    newSocket.on('player-connected', (data) => {
      console.log('🟢 Player connected:', data)
      // This will be handled by the game page component
    })

    newSocket.on('player-disconnected', (data) => {
      console.log('🔴 Player disconnected:', data)
      // This will be handled by the game page component
    })

    // 🆕 NEW: Listen for legacy player joined/left events (for backward compatibility)
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
  }, [userInfo?.userId, userInfo?.displayName]) // Add userInfo to dependencies

  // Update refs when props change
  useEffect(() => {
    userInfoRef.current = userInfo
  }, [userInfo])

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
        if (userInfoRef.current) {
          console.log('🔄 Joining new game room with user identification:', gameCode, userInfoRef.current)
          socket.emit('join-game-with-user', {
            gameCode,
            userId: userInfoRef.current.userId,
            displayName: userInfoRef.current.displayName
          })
        } else {
          console.log('🔄 Joining new game room (legacy):', gameCode)
          socket.emit('join-game', gameCode)
        }
      }
      
      gameCodeRef.current = gameCode
    }
  }, [socket, gameCode])

  // Handle reconnection when user info changes
  useEffect(() => {
    if (socket && gameCode && userInfo && userInfoRef.current) {
      // Check if user info actually changed
      const prevUserInfo = userInfoRef.current
      if (prevUserInfo.userId !== userInfo.userId || prevUserInfo.displayName !== userInfo.displayName) {
        console.log('🔄 User info changed, reconnecting to room:', userInfo)
        socket.emit('join-game-with-user', {
          gameCode,
          userId: userInfo.userId,
          displayName: userInfo.displayName
        })
      }
    }
  }, [socket, gameCode, userInfo])

  useEffect(() => {
    // Join the game room when userInfo becomes available (and we're connected)
    if (socket && gameCode && userInfo && isConnected) {
      console.log('🎯 UserInfo now available, joining game with identification:', userInfo)
      socket.emit('join-game-with-user', {
        gameCode,
        userId: userInfo.userId,
        displayName: userInfo.displayName
      })
    }
  }, [socket, gameCode, userInfo, isConnected])

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