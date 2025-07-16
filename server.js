// ADD THESE IMPORTS TO THE TOP OF YOUR server.js FILE
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

// REPLACE YOUR EXISTING SOCKET EVENT HANDLERS WITH THESE SECURE VERSIONS:

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id)

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
    
    // Notify others in the room that this user connected
    socket.to(gameCode).emit('player-connected', {
      userId,
      displayName,
      timestamp: new Date().toISOString()
    })
  })

  // SECURE VERSION: Update player status
  socket.on('update-player-status', (data) => {
    const validation = validatePlayerStatusEvent(socket.id, data)
    
    if (!validation.isValid) {
      logSocketValidationError(socket.id, 'update-player-status', validation.error, data)
      emitValidationError(socket, validation.error)
      return
    }

    const { gameCode, playerUpdate } = validation.data
    
    console.log(`🔄 Player status update for ${gameCode}:`, playerUpdate)
    
    // Verify the socket is actually in this game room
    const connection = activeConnections.get(socket.id)
    if (!connection || connection.gameCode !== gameCode) {
      logSocketValidationError(socket.id, 'update-player-status', 'Not in specified game room', data)
      emitValidationError(socket, 'You are not in this game room')
      return
    }
    
    // Broadcast the update to all players in the room
    socket.to(gameCode).emit('player-status-updated', {
      userId: connection.userId,
      displayName: connection.displayName,
      playerUpdate,
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
    
    // Broadcast the action to all players in the room
    io.to(gameCode).emit('game-action-received', {
      action,
      payload,
      fromUserId: connection.userId,
      fromDisplayName: connection.displayName,
      timestamp: new Date().toISOString()
    })
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
      // Clean up tracking
      activeConnections.delete(socket.id)
      userToSocket.delete(connection.userId)
      
      if (gameRooms.has(gameCode)) {
        gameRooms.get(gameCode).delete(socket.id)
      }
      
      // Leave the socket room
      socket.leave(gameCode)
      
      // Notify others in the room
      socket.to(gameCode).emit('player-left', {
        userId: connection.userId,
        displayName: connection.displayName,
        timestamp: new Date().toISOString()
      })
    }
  })

  // SECURE VERSION: Handle disconnect
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id)
    
    // Get connection info before cleanup
    const connection = activeConnections.get(socket.id)
    
    if (connection) {
      // Clean up all tracking
      activeConnections.delete(socket.id)
      userToSocket.delete(connection.userId)
      
      if (gameRooms.has(connection.gameCode)) {
        gameRooms.get(connection.gameCode).delete(socket.id)
      }
      
      // Notify others in the room
      socket.to(connection.gameCode).emit('player-disconnected', {
        userId: connection.userId,
        displayName: connection.displayName,
        timestamp: new Date().toISOString()
      })
    }
    
    // Clear rate limiting for this socket
    clearSocketRateLimit(socket.id)
  })

  // Generic error handler
  socket.on('error', (error) => {
    console.error('Socket error:', error)
    emitValidationError(socket, 'An error occurred')
  })
})

// Clean up abandoned connections every 30 minutes
setInterval(() => {
  const now = Date.now()
  const thirtyMinutes = 30 * 60 * 1000
  
  for (const [socketId, connection] of activeConnections.entries()) {
    const age = now - connection.joinedAt.getTime()
    if (age > thirtyMinutes) {
      console.log(`🧹 Cleaning up abandoned connection: ${socketId}`)
      activeConnections.delete(socketId)
      userToSocket.delete(connection.userId)
      
      if (gameRooms.has(connection.gameCode)) {
        gameRooms.get(connection.gameCode).delete(socketId)
      }
    }
  }
}, 30 * 60 * 1000)