/**
 * Input sanitization utilities
 * These functions clean and normalize user input before validation
 */

// HTML/Script injection prevention
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /on\w+\s*=/gi, // onclick, onload, etc.
  /<[^>]*>/g // Remove all HTML tags
]

// SQL injection prevention (even though Prisma protects us)
const SQL_PATTERNS = [
  /('|(\\')|(;)|(\\;)|(--)|(--)|(\\--)|(#)|(\\#))/gi,
  /(union|select|insert|update|delete|drop|create|alter|exec|execute)/gi,
  /(script|javascript|vbscript|onload|onerror|onclick)/gi
]

// Profanity filter (basic - you can expand this)
const PROFANITY_PATTERNS = [
  /\b(fuck|shit|damn|asshole|bitch)\b/gi,
  // Add more as needed
]

/**
 * Remove dangerous HTML/script content
 */
function sanitizeHtml(input) {
  if (!input || typeof input !== 'string') return ''
  
  let cleaned = input
  
  // Remove dangerous patterns
  DANGEROUS_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '')
  })
  
  return cleaned
}

/**
 * Remove potential SQL injection attempts
 */
function sanitizeSql(input) {
  if (!input || typeof input !== 'string') return ''
  
  let cleaned = input
  
  SQL_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '')
  })
  
  return cleaned
}

/**
 * Basic profanity filter
 */
function sanitizeProfanity(input) {
  if (!input || typeof input !== 'string') return ''
  
  let cleaned = input
  
  PROFANITY_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '***')
  })
  
  return cleaned
}

/**
 * Normalize whitespace and encoding
 */
function normalizeString(input) {
  if (!input || typeof input !== 'string') return ''
  
  return input
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\u00A0/g, ' ') // Replace non-breaking spaces
    .normalize('NFC') // Normalize Unicode
}

/**
 * Sanitize game code input
 */
function sanitizeGameCode(input) {
  if (!input || typeof input !== 'string') return ''
  
  return normalizeString(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // Only allow letters and numbers
    .slice(0, 6) // Limit to 6 characters
}

/**
 * Sanitize display name input
 */
function sanitizeDisplayName(input) {
  if (!input || typeof input !== 'string') return ''
  
  let cleaned = normalizeString(input)
  cleaned = sanitizeHtml(cleaned)
  cleaned = sanitizeSql(cleaned)
  cleaned = sanitizeProfanity(cleaned)
  
  // Only allow safe characters
  cleaned = cleaned.replace(/[^a-zA-Z0-9\s\-_]/g, '')
  
  // Limit length
  return cleaned.slice(0, 20)
}

/**
 * Sanitize device name input
 */
function sanitizeDeviceName(input) {
  if (!input || typeof input !== 'string') return 'No device selected'
  
  let cleaned = normalizeString(input)
  cleaned = sanitizeHtml(cleaned)
  cleaned = sanitizeSql(cleaned)
  
  // Allow more characters for device names but still be safe
  cleaned = cleaned.replace(/[<>;"']/g, '')
  
  return cleaned.slice(0, 100)
}

/**
 * Sanitize Spotify ID (playlist, device, etc.)
 */
function sanitizeSpotifyId(input) {
  if (!input || typeof input !== 'string') return ''
  
  // Spotify IDs are alphanumeric with some special characters
  return input
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, 50)
}

/**
 * Sanitize user ID
 */
function sanitizeUserId(input) {
  if (!input || typeof input !== 'string') return ''
  
  // User IDs should be clean already (from auth), but sanitize just in case
  return input
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '')
    .slice(0, 50)
}

/**
 * Sanitize generic string input
 */
function sanitizeGenericString(input, maxLength = 100) {
  if (!input || typeof input !== 'string') return ''
  
  let cleaned = normalizeString(input)
  cleaned = sanitizeHtml(cleaned)
  cleaned = sanitizeSql(cleaned)
  
  return cleaned.slice(0, maxLength)
}

/**
 * Sanitize entire object recursively
 */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item))
  }
  
  const sanitized = {}
  
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeGenericString(key, 50)
    
    if (typeof value === 'string') {
      sanitized[sanitizedKey] = sanitizeGenericString(value)
    } else if (typeof value === 'object') {
      sanitized[sanitizedKey] = sanitizeObject(value)
    } else {
      sanitized[sanitizedKey] = value
    }
  }
  
  return sanitized
}

/**
 * Pre-sanitize input before validation
 * This applies appropriate sanitization based on the field type
 */
function preSanitizeInput(data) {
  if (!data || typeof data !== 'object') return data
  
  const sanitized = { ...data }
  
  // Game code
  if (sanitized.gameCode) {
    sanitized.gameCode = sanitizeGameCode(sanitized.gameCode)
  }
  
  // Display name
  if (sanitized.displayName) {
    sanitized.displayName = sanitizeDisplayName(sanitized.displayName)
  }
  
  // Device name
  if (sanitized.deviceName) {
    sanitized.deviceName = sanitizeDeviceName(sanitized.deviceName)
  }
  
  // Spotify device ID
  if (sanitized.spotifyDeviceId) {
    sanitized.spotifyDeviceId = sanitizeSpotifyId(sanitized.spotifyDeviceId)
  }
  
  // User ID
  if (sanitized.userId) {
    sanitized.userId = sanitizeUserId(sanitized.userId)
  }
  
  // Playlist IDs
  if (sanitized.playlistsSelected && Array.isArray(sanitized.playlistsSelected)) {
    sanitized.playlistsSelected = sanitized.playlistsSelected.map(sanitizeSpotifyId)
  }
  
  // Action (for socket events)
  if (sanitized.action) {
    sanitized.action = sanitizeGenericString(sanitized.action, 50)
  }
  
  return sanitized
}

// Export all functions
module.exports = {
  sanitizeHtml,
  sanitizeSql,
  sanitizeProfanity,
  normalizeString,
  sanitizeGameCode,
  sanitizeDisplayName,
  sanitizeDeviceName,
  sanitizeSpotifyId,
  sanitizeUserId,
  sanitizeGenericString,
  sanitizeObject,
  preSanitizeInput
}