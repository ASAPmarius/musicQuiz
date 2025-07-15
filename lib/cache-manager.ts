import { Redis } from 'ioredis'

// Types for cached data
interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in seconds
}

interface CacheConfig {
  memory: {
    maxSize: number
    ttl: number
  }
  redis: {
    ttl: number
    enabled: boolean
  }
}

class CacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>()
  private redis: Redis | null = null
  private config: CacheConfig

  constructor(config: CacheConfig) {
    this.config = config
    this.initializeRedis()
  }

  private initializeRedis() {
    if (this.config.redis.enabled && process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL)
        console.log('✅ Redis cache initialized')
      } catch (error) {
        console.warn('⚠️ Redis unavailable, using memory cache only:', error)
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    // L1: Check memory cache first (fastest)
    const memoryResult = this.getFromMemory<T>(key)
    if (memoryResult) {
      console.log(`🏃‍♂️ Memory cache HIT: ${key}`)
      return memoryResult
    }

    // L2: Check Redis cache
    if (this.redis) {
      const redisResult = await this.getFromRedis<T>(key)
      if (redisResult) {
        console.log(`🚀 Redis cache HIT: ${key}`)
        // Store in memory for next time
        this.setInMemory(key, redisResult, this.config.memory.ttl)
        return redisResult
      }
    }

    console.log(`❌ Cache MISS: ${key}`)
    return null
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const finalTtl = ttl || this.config.memory.ttl

    // Store in memory cache
    this.setInMemory(key, data, finalTtl)

    // Store in Redis cache
    if (this.redis) {
      await this.setInRedis(key, data, ttl || this.config.redis.ttl)
    }
  }

  private getFromMemory<T>(key: string): T | null {
    const entry = this.memoryCache.get(key)
    if (!entry) return null

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl * 1000) {
      this.memoryCache.delete(key)
      return null
    }

    return entry.data
  }

  private setInMemory<T>(key: string, data: T, ttl: number): void {
    // Clean up old entries if cache is full
    if (this.memoryCache.size >= this.config.memory.maxSize) {
    const oldestKey = this.memoryCache.keys().next().value
    if (oldestKey) {
        this.memoryCache.delete(oldestKey)
    }
    }

    this.memoryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  private async getFromRedis<T>(key: string): Promise<T | null> {
    if (!this.redis) return null
    
    try {
      const result = await this.redis.get(key)
      return result ? JSON.parse(result) : null
    } catch (error) {
      console.error('Redis get error:', error)
      return null
    }
  }

  private async setInRedis<T>(key: string, data: T, ttl: number): Promise<void> {
    if (!this.redis) return
    
    try {
      await this.redis.setex(key, ttl, JSON.stringify(data))
    } catch (error) {
      console.error('Redis set error:', error)
    }
  }

  // Cache invalidation methods
  async invalidate(key: string): Promise<void> {
    this.memoryCache.delete(key)
    if (this.redis) {
      await this.redis.del(key)
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // Clear matching keys from memory
    Array.from(this.memoryCache.keys()).forEach(key => {
    if (key.includes(pattern)) {
        this.memoryCache.delete(key)
    }
    })

    // Clear matching keys from Redis
    if (this.redis) {
      const keys = await this.redis.keys(`*${pattern}*`)
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    }
  }
}

// Create singleton instance
export const spotifyCache = new CacheManager({
  memory: {
    maxSize: 1000, // Store up to 1000 items in memory
    ttl: 300 // 5 minutes
  },
  redis: {
    ttl: 1800, // 30 minutes
    enabled: !!process.env.REDIS_URL
  }
})