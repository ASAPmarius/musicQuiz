const { createServer } = require('http')
const next = require('next')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = process.env.PORT || 3000

// Create Next.js app
const app = next({ dev, hostname, port })
const handler = app.getRequestHandler()

app.prepare().then(() => {
  // Create HTTP server
  const httpServer = createServer(handler)
  
  // Create Socket.io server
  const io = new Server(httpServer, {
    cors: {
      origin: dev ? [
        "http://localhost:3000",
        "https://localhost:3000", 
        /^https:\/\/.*\.ngrok\.io$/,
        /^https:\/\/.*\.ngrok-free\.app$/,
        /^https:\/\/.*\.ngrok\.app$/
      ] : undefined,
      methods: ["GET", "POST"],
      credentials: true
    }
  })

  global.io = io

  // Maps socket.id -> { userId, gameCode, displayName, joinedAt }
  const activeConnections = new Map()
  
  // Maps gameCode -> Set of socket.ids currently in that room
  const gameRooms = new Map()
  
  // Maps userId -> socket.id (for handling reconnections)
  const userToSocket = new Map()

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id)

  // Join a game room with user identification
  socket.on('join-game-with-user', (data) => {
    const { gameCode, userId, displayName } = data
    
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
    
    console.log(`✅ Active connections: ${activeConnections.size}, Game ${gameCode} has ${gameRooms.get(gameCode).size} players`)
  })

  // Keep the old join-game for backward compatibility, but update it
  socket.on('join-game', (gameCode) => {
    console.log(`⚠️ Socket ${socket.id} joined game ${gameCode} without user identification`)
    socket.join(gameCode)
    
    // Notify others in the room
    socket.to(gameCode).emit('player-joined', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    })
  })

    // Leave a game room
    socket.on('leave-game', (gameCode) => {
      socket.leave(gameCode)
      console.log(`👋 Socket ${socket.id} left game ${gameCode}`)
      
      // Notify others in the room
      socket.to(gameCode).emit('player-left', {
        socketId: socket.id,
        timestamp: new Date().toISOString()
      })
    })

    // Update player status (loading progress, device selection, etc.)
    socket.on('update-player-status', (data) => {
      const { gameCode, playerUpdate } = data
      console.log(`🔄 Player update in ${gameCode}:`, playerUpdate)
      
      // Broadcast to all players in the game
      io.to(gameCode).emit('player-status-updated', {
        socketId: socket.id,
        ...playerUpdate,
        timestamp: new Date().toISOString()
      })
    })

    socket.on('player-joined-game', (data) => {
    const { gameCode, playerData } = data
    console.log(`👥 Player joined ${gameCode}:`, playerData.displayName)
    
    // Broadcast to all players that someone joined
    io.to(gameCode).emit('game-updated', {
      action: 'player-joined',
      playerData,
      timestamp: new Date().toISOString()
    })
  })

  socket.on('player-ready-changed', (data) => {
    const { gameCode, userId, isReady, playerData } = data
    console.log(`✅ Player ready status changed in ${gameCode}:`, isReady)
    
    // Broadcast to all players
    io.to(gameCode).emit('game-updated', {
      action: 'player-ready-changed',
      userId,
      isReady,
      playerData,
      timestamp: new Date().toISOString()
    })
  })

  // Handle playlist selection updates
  socket.on('player-playlists-selected', (data) => {
    const { gameCode, userId, playlistCount } = data
    console.log(`📋 Player ${userId} selected ${playlistCount} playlists in ${gameCode}`)
    
    // Broadcast to all players in the game
    io.to(gameCode).emit('game-updated', {
      action: 'player-playlists-selected',
      userId,
      playlistCount,
      timestamp: new Date().toISOString()
    })
  })

  // Handle song loading progress updates with messages
  socket.on('player-loading-progress', (data) => {
    const { gameCode, userId, progress, message } = data
    console.log(`⏳ Player ${userId} loading progress: ${progress}% in ${gameCode}${message ? ` - ${message}` : ''}`)
    
    // Broadcast to all players in the game
    io.to(gameCode).emit('game-updated', {
      action: 'player-loading-progress',
      userId,
      progress,
      message,
      timestamp: new Date().toISOString()
    })
  })

  // Handle when a player finishes loading songs
  socket.on('player-songs-ready', (data) => {
    const { gameCode, userId, songCount, breakdown } = data
    console.log(`✅ Player ${userId} finished loading ${songCount} songs in ${gameCode}`)
    
    // Broadcast to all players in the game
    io.to(gameCode).emit('game-updated', {
      action: 'player-songs-ready',
      userId,
      songCount,
      breakdown,
      timestamp: new Date().toISOString()
    })
  })

  // Handle game start from song loading phase
  socket.on('start-quiz-game', (data) => {
    const { gameCode } = data
    console.log(`🚀 Starting quiz game in room ${gameCode}`)
    
    // Broadcast to all players that the game is starting
    io.to(gameCode).emit('game-updated', {
      action: 'quiz-game-starting',
      timestamp: new Date().toISOString()
    })
  })

    // Game state changes (start round, voting, etc.)
    socket.on('game-action', (data) => {
      const { gameCode, action, payload } = data
      console.log(`🎮 Game action in ${gameCode}:`, action)
      
      // Broadcast to all players in the game
      io.to(gameCode).emit('game-state-changed', {
        action,
        payload,
        from: socket.id,
        timestamp: new Date().toISOString()
      })
    })

    // Player voting
    socket.on('submit-vote', (data) => {
      const { gameCode, vote } = data
      console.log(`🗳️ Vote submitted in ${gameCode}:`, vote)
      
      // Broadcast to all players (but don't reveal votes yet)
      socket.to(gameCode).emit('vote-submitted', {
        from: socket.id,
        hasVoted: true, // Don't reveal actual vote until all votes are in
        timestamp: new Date().toISOString()
      })
    })

    // Reveal voting results
    socket.on('reveal-votes', (data) => {
      const { gameCode, results } = data
      console.log(`📊 Revealing votes in ${gameCode}`)
      
      // Broadcast results to all players
      io.to(gameCode).emit('votes-revealed', {
        results,
        timestamp: new Date().toISOString()
      })
    })

    socket.on('player-playlists-selected', (data) => {
    const { gameCode, userId, playlistCount } = data
    console.log(`📋 Player ${userId} selected ${playlistCount} playlists in ${gameCode}`)
    
    // Broadcast to all players in the game
    io.to(gameCode).emit('game-updated', {
      action: 'player-playlists-selected',
      userId,
      playlistCount,
      timestamp: new Date().toISOString()
    })
  })

  // Handle song loading progress updates
  socket.on('player-loading-progress', (data) => {
    const { gameCode, userId, progress } = data
    console.log(`⏳ Player ${userId} loading progress: ${progress}% in ${gameCode}`)
    
    // Broadcast to all players in the game
    io.to(gameCode).emit('game-updated', {
      action: 'player-loading-progress',
      userId,
      progress,
      timestamp: new Date().toISOString()
    })
  })

  // Handle when a player finishes loading songs
  socket.on('player-songs-ready', (data) => {
    const { gameCode, userId, songCount } = data
    console.log(`✅ Player ${userId} finished loading ${songCount} songs in ${gameCode}`)
    
    // Broadcast to all players in the game
    io.to(gameCode).emit('game-updated', {
      action: 'player-songs-ready',
      userId,
      songCount,
      timestamp: new Date().toISOString()
    })
  })

  // Handle game start from song loading phase
  socket.on('start-quiz-game', (data) => {
    const { gameCode } = data
    console.log(`🚀 Starting quiz game in room ${gameCode}`)
    
    // Broadcast to all players that the game is starting
    io.to(gameCode).emit('game-updated', {
      action: 'quiz-game-starting',
      timestamp: new Date().toISOString()
    })
  })

  // Handle disconnection with proper cleanup
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket ${socket.id} disconnected: ${reason}`)
    
    // Look up who this socket belonged to
    const connection = activeConnections.get(socket.id)
    
    if (connection) {
      const { userId, gameCode, displayName } = connection
      
      console.log(`👋 User ${displayName} (${userId}) disconnected from game ${gameCode}`)
      
      // Clean up all tracking
      activeConnections.delete(socket.id)
      userToSocket.delete(userId)
      
      // Remove from game room tracking
      if (gameRooms.has(gameCode)) {
        gameRooms.get(gameCode).delete(socket.id)
        
        // Clean up empty game rooms
        if (gameRooms.get(gameCode).size === 0) {
          gameRooms.delete(gameCode)
          console.log(`🗑️ Cleaned up empty game room: ${gameCode}`)
        }
      }
      
      // Notify other players in the game
      socket.to(gameCode).emit('player-disconnected', {
        userId,
        displayName,
        reason,
        timestamp: new Date().toISOString()
      })
      
      console.log(`🧹 Cleaned up connection for ${displayName}. Active connections: ${activeConnections.size}`)
    } else {
      console.log(`⚠️ No connection data found for socket ${socket.id}`)
    }
  })
  })

  // Start the server
  httpServer
    .once('error', (err) => {
      console.error('❌ Server error:', err)
      process.exit(1)
    })
    .listen(port, () => {
      console.log(`🚀 Server ready on http://${hostname}:${port}`)
      console.log(`🔌 Socket.io ready for connections`)
    })
})