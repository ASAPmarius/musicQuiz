import { NextRequest, NextResponse } from 'next/server'
import { ZodSchema, ZodError } from 'zod'
import { preSanitizeInput } from './sanitizers'

/**
 * Rate limiting storage (in production, use Redis)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

/**
 * Rate limiting configuration
 */
const RATE_LIMITS = {
  default: { maxRequests: 10, windowMs: 60000 }, // 10 requests per minute
  gameJoin: { maxRequests: 5, windowMs: 60000 },  // 5 join attempts per minute
  gameCreate: { maxRequests: 3, windowMs: 60000 }, // 3 create attempts per minute
  playerUpdate: { maxRequests: 30, windowMs: 60000 } // 30 updates per minute
}

/**
 * Check rate limit for a user
 */
function checkRateLimit(userId: string, endpoint: keyof typeof RATE_LIMITS = 'default'): boolean {
  const now = Date.now()
  const key = `${userId}:${endpoint}`
  const limit = RATE_LIMITS[endpoint]
  
  const userLimit = rateLimitStore.get(key)
  
  if (!userLimit) {
    rateLimitStore.set(key, { count: 1, resetTime: now + limit.windowMs })
    return true
  }
  
  // Reset if window expired
  if (now > userLimit.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + limit.windowMs })
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
 * Clean up expired rate limit entries
 */
function cleanupRateLimit() {
  const now = Date.now()
  // Fix: Use Array.from to avoid iteration error
  Array.from(rateLimitStore.entries()).forEach(([key, data]) => {
    if (now > data.resetTime) {
      rateLimitStore.delete(key)
    }
  })
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimit, 5 * 60 * 1000)

/**
 * Validation error response
 */
function createValidationErrorResponse(error: ZodError) {
  // Fix: Use error.issues instead of error.errors
  const firstError = error.issues[0]
  const friendlyMessages: Record<string, string> = {
    'Game code must be exactly 6 characters': 'Please enter a valid 6-character room code',
    'Display name is required': 'Please enter a display name',
    'Display name must be 20 characters or less': 'Display name is too long (max 20 characters)',
    'Game code must contain only letters and numbers': 'Room code can only contain letters and numbers',
    'Display name can only contain letters, numbers, spaces, hyphens, and underscores': 'Display name contains invalid characters'
  }
  
  const message = friendlyMessages[firstError.message] || firstError.message
  
  return NextResponse.json({
    error: message,
    // Fix: Use error.issues and add proper typing
    details: error.issues.map((err: any) => ({
      field: err.path.join('.'),
      message: err.message
    }))
  }, { status: 400 })
}

/**
 * Main validation middleware
 */
export async function validateRequest<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
  options: {
    userId?: string
    rateLimit?: keyof typeof RATE_LIMITS
    skipRateLimit?: boolean
  } = {}
): Promise<T> {
  const { userId, rateLimit = 'default', skipRateLimit = false } = options
  
  // Rate limiting
  if (!skipRateLimit && userId) {
    if (!checkRateLimit(userId, rateLimit)) {
      throw new Error('Too many requests. Please try again later.')
    }
  }
  
  try {
    // Parse request body
    const rawBody = await request.json()
    
    // Pre-sanitize input
    const sanitizedBody = preSanitizeInput(rawBody)
    
    // Validate with schema
    const validatedData = schema.parse(sanitizedBody)
    
    return validatedData
  } catch (error) {
    if (error instanceof ZodError) {
      throw createValidationErrorResponse(error)
    }
    throw error
  }
}

/**
 * Validate URL parameters
 */
export function validateParams<T>(
  params: any,
  schema: ZodSchema<T>
): T {
  try {
    const sanitizedParams = preSanitizeInput(params)
    return schema.parse(sanitizedParams)
  } catch (error) {
    if (error instanceof ZodError) {
      throw createValidationErrorResponse(error)
    }
    throw error
  }
}

/**
 * Validate query parameters
 */
export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: ZodSchema<T>
): T {
  try {
    const queryObj: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      queryObj[key] = value
    })
    
    const sanitizedQuery = preSanitizeInput(queryObj)
    return schema.parse(sanitizedQuery)
  } catch (error) {
    if (error instanceof ZodError) {
      throw createValidationErrorResponse(error)
    }
    throw error
  }
}

/**
 * Sanitize output data before sending to client
 */
export function sanitizeOutput(data: any): any {
  if (!data) return data
  
  if (typeof data === 'string') {
    // Remove any potential XSS in string outputs
    return data.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeOutput)
  }
  
  if (typeof data === 'object') {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeOutput(value)
    }
    return sanitized
  }
  
  return data
}

/**
 * Create a safe JSON response
 */
export function createSafeResponse(data: any, status: number = 200): NextResponse {
  const sanitizedData = sanitizeOutput(data)
  return NextResponse.json(sanitizedData, { status })
}

/**
 * Handle validation errors consistently
 */
export function handleValidationError(error: unknown): NextResponse {
  console.error('Validation error:', error)
  
  // If it's already a NextResponse (from createValidationErrorResponse), return it
  if (error instanceof NextResponse) {
    return error
  }
  
  // Rate limit error
  if (error instanceof Error && error.message.includes('Too many requests')) {
    return NextResponse.json({
      error: 'Too many requests. Please try again later.',
      retryAfter: 60
    }, { status: 429 })
  }
  
  // Generic validation error
  if (error instanceof Error) {
    return NextResponse.json({
      error: error.message || 'Invalid input'
    }, { status: 400 })
  }
  
  // Unknown error
  return NextResponse.json({
    error: 'Invalid request'
  }, { status: 400 })
}

/**
 * Type guard for validation errors
 */
export function isValidationError(error: unknown): error is ZodError {
  return error instanceof ZodError
}

/**
 * Utility to get user ID from session for rate limiting
 */
export function getUserIdForRateLimit(userId: string | undefined, fallback: string = 'anonymous'): string {
  return userId || fallback
}