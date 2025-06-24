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

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id)

    // Join a game room
    socket.on('join-game', (gameCode) => {
      socket.join(gameCode)
      console.log(`👥 Socket ${socket.id} joined game ${gameCode}`)
      
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

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('🔌 User disconnected:', socket.id)
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