// lib/rate-limiter.ts

/**
 * Token Bucket Rate Limiter for Spotify API
 * 
 * Think of this like a bucket that refills with tokens:
 * - Each API request needs 1 token
 * - Tokens refill automatically over time
 * - When bucket is empty, requests wait until tokens are available
 * - Prevents hitting Spotify's rate limits
 */

interface TokenBucket {
  tokens: number           // Current tokens available
  capacity: number         // Maximum tokens the bucket can hold
  refillRate: number       // Tokens added per second
  lastRefill: number       // Last time tokens were added
}

interface QueuedRequest {
  resolve: (value: any) => void
  reject: (error: Error) => void
  priority: number         // Higher number = higher priority
}

class SpotifyRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map()
  private queues: Map<string, QueuedRequest[]> = new Map()
  
  // Spotify API limits (conservative estimates)
  private readonly DEFAULT_CAPACITY = 50      // Max burst requests
  private readonly DEFAULT_REFILL_RATE = 1.5  // ~90 requests per minute
  private readonly PRIORITY_HIGH = 3          // User profile, devices
  private readonly PRIORITY_NORMAL = 2        // Playlists, tracks
  private readonly PRIORITY_LOW = 1           // Album details, etc.

  /**
   * Get or create a token bucket for a user
   * Each user gets their own bucket to prevent interference
   */
  private getBucket(userId: string): TokenBucket {
    if (!this.buckets.has(userId)) {
      this.buckets.set(userId, {
        tokens: this.DEFAULT_CAPACITY,
        capacity: this.DEFAULT_CAPACITY,
        refillRate: this.DEFAULT_REFILL_RATE,
        lastRefill: Date.now()
      })
    }
    return this.buckets.get(userId)!
  }

  /**
   * Refill tokens based on time elapsed
   * Like water slowly filling a bucket
   */
  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now()
    const timePassed = (now - bucket.lastRefill) / 1000 // Convert to seconds
    
    // Add tokens based on time passed
    const tokensToAdd = timePassed * bucket.refillRate
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now
  }

  /**
   * Get queue for a user (create if doesn't exist)
   */
  private getQueue(userId: string): QueuedRequest[] {
    if (!this.queues.has(userId)) {
      this.queues.set(userId, [])
    }
    return this.queues.get(userId)!
  }

  /**
   * Process queued requests for a user
   * Runs periodically to handle waiting requests
   */
  private processQueue(userId: string): void {
    const bucket = this.getBucket(userId)
    const queue = this.getQueue(userId)
    
    // Refill tokens first
    this.refillBucket(bucket)
    
    // Process requests in priority order
    queue.sort((a, b) => b.priority - a.priority)
    
    while (queue.length > 0 && bucket.tokens >= 1) {
      const request = queue.shift()!
      bucket.tokens -= 1
      
      // Resolve the promise to allow the request to proceed
      request.resolve(true)
    }
    
    // If there are still queued requests, check again soon
    if (queue.length > 0) {
      setTimeout(() => this.processQueue(userId), 100)
    }
  }

  /**
   * Request permission to make an API call
   * Returns a promise that resolves when it's safe to proceed
   */
  async requestToken(userId: string, priority: number = this.PRIORITY_NORMAL): Promise<void> {
    const bucket = this.getBucket(userId)
    const queue = this.getQueue(userId)
    
    // Refill tokens first
    this.refillBucket(bucket)
    
    // If tokens available, proceed immediately
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return Promise.resolve()
    }
    
    // Otherwise, queue the request
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject, priority })
      
      // Start processing queue
      setTimeout(() => this.processQueue(userId), 0)
    })
  }

  /**
   * Handle 429 (Too Many Requests) response from Spotify
   * Wait the specified time before allowing more requests
   */
  async handle429Error(userId: string, retryAfterSeconds: number): Promise<void> {
    const bucket = this.getBucket(userId)
    
    // Empty the bucket and wait
    bucket.tokens = 0
    bucket.lastRefill = Date.now() + (retryAfterSeconds * 1000)
    
    console.log(`⏱️ Rate limited for user ${userId}, waiting ${retryAfterSeconds}s`)
    
    // Wait the specified time
    await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000))
  }

  /**
   * Get current status for debugging
   */
  getStatus(userId: string): { tokens: number; queueLength: number } {
    const bucket = this.getBucket(userId)
    const queue = this.getQueue(userId)
    
    this.refillBucket(bucket)
    
    return {
      tokens: Math.floor(bucket.tokens),
      queueLength: queue.length
    }
  }

  /**
   * Priority constants for different types of requests
   */
  static readonly PRIORITY = {
    HIGH: 3,    // User profile, devices, playback state
    NORMAL: 2,  // Playlists, liked songs, main content
    LOW: 1      // Album details, track details, non-critical
  }
}

// Export a singleton instance
export const spotifyRateLimiter = new SpotifyRateLimiter()

// Export the class for testing
export { SpotifyRateLimiter }