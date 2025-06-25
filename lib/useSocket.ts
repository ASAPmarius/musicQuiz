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

export function useSocket(gameCode?: string) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [gameState, setGameState] = useState<any>(null)
  const [playerStatuses, setPlayerStatuses] = useState<Map<string, PlayerStatus>>(new Map())
  
  // Store the latest gameCode in a ref to avoid reconnecting unnecessarily
  const gameCodeRef = useRef<string | undefined>(gameCode)

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
      
      // Join the game room if we have a game code
      if (gameCodeRef.current) {
        newSocket.emit('join-game', gameCodeRef.current)
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

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  // Update game room when gameCode changes
  useEffect(() => {
    if (socket && gameCode !== gameCodeRef.current) {
      // Leave old room
      if (gameCodeRef.current) {
        socket.emit('leave-game', gameCodeRef.current)
      }
      
      // Join new room
      if (gameCode) {
        socket.emit('join-game', gameCode)
      }
      
      gameCodeRef.current = gameCode
    }
  }, [socket, gameCode])

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