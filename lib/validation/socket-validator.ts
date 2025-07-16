import { ZodSchema, ZodError } from 'zod'
import { preSanitizeInput } from './sanitizers'
import {
  SocketJoinGameSchema,
  SocketPlayerStatusSchema,
  SocketGameActionSchema,
  SocketVoteSchema,
  SocketJoinGameInput,
  SocketPlayerStatusInput,
  SocketGameActionInput,
  SocketVoteInput
} from './schemas'

/**
 * Socket rate limiting storage
 */
const socketRateLimitStore = new Map<string, { count: number; resetTime: number }>()

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
function checkSocketRateLimit(socketId: string, event: string): boolean {
  const now = Date.now()
  const key = `${socketId}:${event}`
  const limit = SOCKET_RATE_LIMITS[event as keyof typeof SOCKET_RATE_LIMITS] || SOCKET_RATE_LIMITS.default
  
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
export function validateSocketEvent<T>(
  socketId: string,
  event: string,
  data: any,
  schema: ZodSchema<T>
): { isValid: boolean; data?: T; error?: string } {
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
export function validateJoinGameEvent(socketId: string, data: any): { isValid: boolean; data?: SocketJoinGameInput; error?: string } {
  return validateSocketEvent(socketId, 'join-game-with-user', data, SocketJoinGameSchema)
}

export function validatePlayerStatusEvent(socketId: string, data: any): { isValid: boolean; data?: SocketPlayerStatusInput; error?: string } {
  return validateSocketEvent(socketId, 'update-player-status', data, SocketPlayerStatusSchema)
}

export function validateGameActionEvent(socketId: string, data: any): { isValid: boolean; data?: SocketGameActionInput; error?: string } {
  return validateSocketEvent(socketId, 'game-action', data, SocketGameActionSchema)
}

export function validateVoteEvent(socketId: string, data: any): { isValid: boolean; data?: SocketVoteInput; error?: string } {
  return validateSocketEvent(socketId, 'submit-vote', data, SocketVoteSchema)
}

/**
 * Validate leave game event (simple)
 */
export function validateLeaveGameEvent(socketId: string, data: any): { isValid: boolean; data?: string; error?: string } {
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
export function createSocketValidator<T>(eventName: string, schema: ZodSchema<T>) {
  return (socketId: string, data: any): { isValid: boolean; data?: T; error?: string } => {
    return validateSocketEvent(socketId, eventName, data, schema)
  }
}

/**
 * Clear rate limit for a socket (useful on disconnect)
 */
export function clearSocketRateLimit(socketId: string) {
  const keysToDelete: string[] = []
  
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
export function logSocketValidationError(socketId: string, event: string, error: string, data?: any) {
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
export function emitValidationError(socket: any, error: string) {
  socket.emit('validation-error', {
    error,
    timestamp: new Date().toISOString()
  })
}