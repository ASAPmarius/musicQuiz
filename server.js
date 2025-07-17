const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')

// Import validation functions
const { 
  validateJoinGameEvent, 
  validatePlayerStatusEvent, 
  validateGameActionEvent, 
  validateVoteEvent, 
  validateLeaveGameEvent,
  clearSocketRateLimit,
  logSocketValidationError,
  emitValidationError
} = require('./lib/validation/socket-validator')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = process.env.PORT || 3000

// Create Next.js app
const nextApp = next({ dev, hostname, port })
const handle = nextApp.getRequestHandler()

// In-memory storage for game state (in production, use Redis)
const activeConnections = new Map()
const userToSocket = new Map()
const gameRooms = new Map()

nextApp.prepare().then(() => {
  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('Internal server error')
    }
  })

  // Create Socket.io server
  const io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? ["https://your-app.herokuapp.com"] // Update this with your actual domain
        : ["http://localhost:3000"],
      methods: ["GET", "POST"]
    }
  })

  // Make io available globally for API routes
  global.io = io

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id)

    // LEGACY VERSION: Simple join game (for backward compatibility)
    socket.on('join-game', (gameCode) => {
      if (typeof gameCode !== 'string') {
        socket.emit('error', 'Invalid game code')
        return
      }
      
      console.log(`📱 Legacy join game: ${gameCode}`)
      
      // Join the Socket.io room
      socket.join(gameCode)
      
      // Add basic tracking (without user identification)
      activeConnections.set(socket.id, {
        userId: socket.id, // Use socket.id as fallback
        gameCode,
        displayName: 'Anonymous',
        joinedAt: new Date()
      })
      
      // Add to game room tracking
      if (!gameRooms.has(gameCode)) {
        gameRooms.set(gameCode, new Set())
      }
      gameRooms.get(gameCode).add(socket.id)
      
      // Notify others in the room
      socket.to(gameCode).emit('player-joined', {
        userId: socket.id,
        displayName: 'Anonymous',
        timestamp: new Date().toISOString()
      })
    })

    // SECURE VERSION: Join a game room with user identification
    socket.on('join-game-with-user', (data) => {
      const validation = validateJoinGameEvent(socket.id, data)
      
      if (!validation.isValid) {
        logSocketValidationError(socket.id, 'join-game-with-user', validation.error, data)
        emitValidationError(socket, validation.error)
        return
      }

      const { gameCode, userId, displayName } = validation.data
      
      console.log(`👥 User ${displayName} (${userId}) connected with socket ${socket.id} to game ${gameCode}`)
      
      // Handle reconnection - if user already has a socket, remove the old one
      if (userToSocket.has(userId)) {
        const oldSocketId = userToSocket.get(userId)
        console.log(`🔄 User ${userId} reconnecting - removing old socket ${oldSocketId}`)
        
        // Clean up old socket
        if (activeConnections.has(oldSocketId)) {
          const oldConnection = activeConnections.get(oldSocketId)
          if (oldConnection && gameRooms.has(oldConnection.gameCode)) {
            gameRooms.get(oldConnection.gameCode).delete(oldSocketId)
          }
          activeConnections.delete(oldSocketId)
        }
      }
      
      // Add new connection tracking
      activeConnections.set(socket.id, {
        userId,
        gameCode,
        displayName,
        joinedAt: new Date()
      })
      
      // Update user-to-socket mapping
      userToSocket.set(userId, socket.id)
      
      // Add to game room tracking
      if (!gameRooms.has(gameCode)) {
        gameRooms.set(gameCode, new Set())
      }
      gameRooms.get(gameCode).add(socket.id)
      
      // Join the Socket.io room
      socket.join(gameCode)
      
      // Notify others in the room that this user connected (matching client expectations)
      socket.to(gameCode).emit('player-joined', {
        userId,
        displayName,
        timestamp: new Date().toISOString()
      })
      
      // Also emit game-updated for consistency with API
      socket.to(gameCode).emit('game-updated', {
        action: 'player-joined',
        playerData: { userId, displayName },
        timestamp: new Date().toISOString()
      })
    })

    // SECURE VERSION: Game action events
    socket.on('game-action', (data) => {
      const validation = validateGameActionEvent(socket.id, data)
      
      if (!validation.isValid) {
        logSocketValidationError(socket.id, 'game-action', validation.error, data)
        emitValidationError(socket, validation.error)
        return
      }

      const { gameCode, action, payload } = validation.data
      
      console.log(`🎮 Game action in ${gameCode}: ${action}`, payload)
      
      // Verify the socket is actually in this game room
      const connection = activeConnections.get(socket.id)
      if (!connection || connection.gameCode !== gameCode) {
        logSocketValidationError(socket.id, 'game-action', 'Not in specified game room', data)
        emitValidationError(socket, 'You are not in this game room')
        return
      }
      
      // Broadcast the action to all players in the room (matching client expectations)
      io.to(gameCode).emit('game-updated', {
        action,
        payload,
        fromUserId: connection.userId,
        fromDisplayName: connection.displayName,
        timestamp: new Date().toISOString()
      })
      
      // Also emit game-state-changed for state transitions
      if (action === 'start-game' || action === 'next-round' || action === 'game-ended') {
        io.to(gameCode).emit('game-state-changed', {
          action,
          payload,
          fromUserId: connection.userId,
          fromDisplayName: connection.displayName,
          timestamp: new Date().toISOString()
        })
      }
    })

    // SECURE VERSION: Submit vote
    socket.on('submit-vote', (data) => {
      const validation = validateVoteEvent(socket.id, data)
      
      if (!validation.isValid) {
        logSocketValidationError(socket.id, 'submit-vote', validation.error, data)
        emitValidationError(socket, validation.error)
        return
      }

      const { gameCode, vote } = validation.data
      
      console.log(`🗳️ Vote submitted for ${gameCode}:`, vote)
      
      // Verify the socket is actually in this game room
      const connection = activeConnections.get(socket.id)
      if (!connection || connection.gameCode !== gameCode) {
        logSocketValidationError(socket.id, 'submit-vote', 'Not in specified game room', data)
        emitValidationError(socket, 'You are not in this game room')
        return
      }
      
      // Broadcast vote received (without revealing the vote content)
      socket.to(gameCode).emit('vote-received', {
        fromUserId: connection.userId,
        fromDisplayName: connection.displayName,
        roundId: vote.roundId,
        timestamp: vote.timestamp
      })
      
      // Confirm to the voter
      socket.emit('vote-confirmed', {
        roundId: vote.roundId,
        timestamp: new Date().toISOString()
      })
    })

    // SECURE VERSION: Leave game
    socket.on('leave-game', (data) => {
      const validation = validateLeaveGameEvent(socket.id, data)
      
      if (!validation.isValid) {
        logSocketValidationError(socket.id, 'leave-game', validation.error, data)
        emitValidationError(socket, validation.error)
        return
      }

      const gameCode = validation.data
      
      console.log(`👋 User leaving game ${gameCode}`)
      
      // Get connection info before cleanup
      const connection = activeConnections.get(socket.id)
      
      if (connection && connection.gameCode === gameCode) {
        // Remove from game room
        if (gameRooms.has(gameCode)) {
          gameRooms.get(gameCode).delete(socket.id)
          
          // If room is empty, clean it up
          if (gameRooms.get(gameCode).size === 0) {
            gameRooms.delete(gameCode)
          }
        }
        
        // Remove from user mapping
        userToSocket.delete(connection.userId)
        
        // Remove from active connections
        activeConnections.delete(socket.id)
        
        // Leave the Socket.io room
        socket.leave(gameCode)
        
        // Notify others in the room (matching client expectations)
        socket.to(gameCode).emit('player-left', {
          userId: connection.userId,
          displayName: connection.displayName,
          timestamp: new Date().toISOString()
        })
        
        // Also emit game-updated for consistency
        socket.to(gameCode).emit('game-updated', {
          action: 'player-left',
          playerData: { userId: connection.userId, displayName: connection.displayName },
          timestamp: new Date().toISOString()
        })
      }
    })

    // SECURE VERSION: Reveal votes
    socket.on('reveal-votes', (data) => {
      if (!data || typeof data !== 'object') {
        socket.emit('error', 'Invalid reveal votes data')
        return
      }
      
      const { gameCode, results } = data
      
      console.log(`🎯 Revealing votes for ${gameCode}`)
      
      // Verify the socket is actually in this game room
      const connection = activeConnections.get(socket.id)
      if (!connection || connection.gameCode !== gameCode) {
        socket.emit('error', 'You are not in this game room')
        return
      }
      
      // Broadcast vote results to all players
      io.to(gameCode).emit('votes-revealed', {
        results,
        fromUserId: connection.userId,
        fromDisplayName: connection.displayName,
        timestamp: new Date().toISOString()
      })
    })

    // Handle socket disconnect
    socket.on('disconnect', (reason) => {
      console.log(`🔌 User disconnected: ${socket.id} (${reason})`)
      
      // Clean up rate limiting
      clearSocketRateLimit(socket.id)
      
      // Get connection info before cleanup
      const connection = activeConnections.get(socket.id)
      
      if (connection) {
        const { userId, gameCode, displayName } = connection
        
        // Remove from game room
        if (gameRooms.has(gameCode)) {
          gameRooms.get(gameCode).delete(socket.id)
          
          // If room is empty, clean it up
          if (gameRooms.get(gameCode).size === 0) {
            gameRooms.delete(gameCode)
          }
        }
        
        // Remove from user mapping
        userToSocket.delete(userId)
        
        // Remove from active connections
        activeConnections.delete(socket.id)
        
        // Notify others in the room (matching client expectations)
        socket.to(gameCode).emit('player-left', {
          userId,
          displayName,
          timestamp: new Date().toISOString()
        })
        
        // Also emit game-updated for consistency
        socket.to(gameCode).emit('game-updated', {
          action: 'player-left',
          playerData: { userId, displayName },
          timestamp: new Date().toISOString()
        })
      }
    })
  })

  // Start server
  server.listen(port, (err) => {
    if (err) throw err
    console.log(`🚀 Server ready at http://${hostname}:${port}`)
    console.log(`🔌 Socket.io server is running`)
  })
})