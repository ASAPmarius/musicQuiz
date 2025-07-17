const { ZodError } = require('zod')
const { preSanitizeInput } = require('./sanitizers')
const {
  SocketJoinGameSchema,
  SocketPlayerStatusSchema,
  SocketGameActionSchema,
  SocketVoteSchema
} = require('./schemas')

/**
 * Socket rate limiting storage
 */
const socketRateLimitStore = new Map()

/**
 * Socket rate limiting configuration
 */
const SOCKET_RATE_LIMITS = {
  'join-game-with-user': { maxRequests: 5, windowMs: 60000 },
  'update-player-status': { maxRequests: 30, windowMs: 60000 },
  'game-action': { maxRequests: 20, windowMs: 60000 },
  'submit-vote': { maxRequests: 10, windowMs: 60000 },
  'leave-game': { maxRequests: 10, windowMs: 60000 },
  default: { maxRequests: 50, windowMs: 60000 }
}

/**
 * Check socket rate limit
 */
function checkSocketRateLimit(socketId, event) {
  const now = Date.now()
  const key = `${socketId}:${event}`
  const limit = SOCKET_RATE_LIMITS[event] || SOCKET_RATE_LIMITS.default
  
  const userLimit = socketRateLimitStore.get(key)
  
  if (!userLimit) {
    socketRateLimitStore.set(key, { count: 1, resetTime: now + limit.windowMs })
    return true
  }
  
  // Reset if window expired
  if (now > userLimit.resetTime) {
    socketRateLimitStore.set(key, { count: 1, resetTime: now + limit.windowMs })
    return true
  }
  
  // Check if under limit
  if (userLimit.count < limit.maxRequests) {
    userLimit.count++
    return true
  }
  
  return false
}

/**
 * Clean up expired socket rate limit entries
 */
function cleanupSocketRateLimit() {
  const now = Date.now()
  // Fix: Use Array.from to avoid iteration error
  Array.from(socketRateLimitStore.entries()).forEach(([key, data]) => {
    if (now > data.resetTime) {
      socketRateLimitStore.delete(key)
    }
  })
}

// Run cleanup every 5 minutes
setInterval(cleanupSocketRateLimit, 5 * 60 * 1000)

/**
 * Validate socket event data
 */
function validateSocketEvent(socketId, event, data, schema) {
  try {
    // Check rate limit
    if (!checkSocketRateLimit(socketId, event)) {
      return {
        isValid: false,
        error: 'Rate limit exceeded. Please slow down.'
      }
    }
    
    // Sanitize input
    const sanitizedData = preSanitizeInput(data)
    
    // Validate with schema
    const validatedData = schema.parse(sanitizedData)
    
    return {
      isValid: true,
      data: validatedData
    }
  } catch (error) {
    let errorMessage = 'Invalid event data'
    
    if (error instanceof ZodError) {
      const firstError = error.issues[0]
      errorMessage = firstError.message || errorMessage
    }
    
    return {
      isValid: false,
      error: errorMessage
    }
  }
}

/**
 * Validate specific socket events
 */
function validateJoinGameEvent(socketId, data) {
  return validateSocketEvent(socketId, 'join-game-with-user', data, SocketJoinGameSchema)
}

function validatePlayerStatusEvent(socketId, data) {
  return validateSocketEvent(socketId, 'update-player-status', data, SocketPlayerStatusSchema)
}

function validateGameActionEvent(socketId, data) {
  return validateSocketEvent(socketId, 'game-action', data, SocketGameActionSchema)
}

function validateVoteEvent(socketId, data) {
  return validateSocketEvent(socketId, 'submit-vote', data, SocketVoteSchema)
}

/**
 * Validate leave game event (simple)
 */
function validateLeaveGameEvent(socketId, data) {
  try {
    // Check rate limit
    if (!checkSocketRateLimit(socketId, 'leave-game')) {
      return {
        isValid: false,
        error: 'Rate limit exceeded'
      }
    }
    
    // For leave game, data should be a game code string
    if (typeof data !== 'string') {
      return {
        isValid: false,
        error: 'Game code must be a string'
      }
    }
    
    const sanitizedCode = preSanitizeInput({ gameCode: data }).gameCode
    
    // Validate game code format
    if (!sanitizedCode || sanitizedCode.length !== 6) {
      return {
        isValid: false,
        error: 'Invalid game code format'
      }
    }
    
    return {
      isValid: true,
      data: sanitizedCode
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid leave game data'
    }
  }
}

/**
 * Generic socket event validator
 */
function createSocketValidator(eventName, schema) {
  return (socketId, data) => {
    return validateSocketEvent(socketId, eventName, data, schema)
  }
}

/**
 * Clear rate limit for a socket (useful on disconnect)
 */
function clearSocketRateLimit(socketId) {
  const keysToDelete = []
  
  // Fix: Use Array.from to avoid iteration error  
  Array.from(socketRateLimitStore.keys()).forEach(key => {
    if (key.startsWith(`${socketId}:`)) {
      keysToDelete.push(key)
    }
  })
  
  keysToDelete.forEach(key => socketRateLimitStore.delete(key))
}

/**
 * Log socket validation errors
 */
function logSocketValidationError(socketId, event, error, data) {
  console.warn(`🚨 Socket validation error:`, {
    socketId,
    event,
    error,
    data: data ? JSON.stringify(data).slice(0, 200) : undefined,
    timestamp: new Date().toISOString()
  })
}

/**
 * Helper to emit validation error back to client
 */
function emitValidationError(socket, error) {
  socket.emit('validation-error', {
    error,
    timestamp: new Date().toISOString()
  })
}

// Export all functions
module.exports = {
  validateJoinGameEvent,
  validatePlayerStatusEvent,
  validateGameActionEvent,
  validateVoteEvent,
  validateLeaveGameEvent,
  createSocketValidator,
  clearSocketRateLimit,
  logSocketValidationError,
  emitValidationError,
  validateSocketEvent
}