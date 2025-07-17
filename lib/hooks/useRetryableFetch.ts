import { useState, useCallback, useRef, useEffect } from 'react'

interface RetryConfig {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  retryCondition?: (error: any) => boolean
}

interface RetryState {
  loading: boolean
  error: string | null
  retryCount: number
  lastAttempt: number
}

interface RetryResult<T> {
  execute: (fetchFn: () => Promise<T>) => Promise<T>
  loading: boolean
  error: string | null
  retryCount: number
  reset: () => void
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds max
  backoffMultiplier: 2,
  retryCondition: (error: any) => {
    // Retry on network errors and 5xx server errors
    if (error instanceof Error) {
      // Network errors, timeouts, connection issues
      return error.message.includes('fetch') || 
             error.message.includes('network') || 
             error.message.includes('timeout') ||
             error.message.includes('connection')
    }
    
    // HTTP errors - check status codes
    if (error.status) {
      const status = error.status
      // Retry on 5xx server errors and 429 (rate limit)
      return status >= 500 || status === 429
    }
    
    return false
  }
}

/**
 * Hook for retrying failed API calls with exponential backoff
 * 
 * Think of this like a "persistent assistant" that keeps trying
 * when the network is unreliable, but knows when to give up
 */
export function useRetryableFetch<T = any>(config: RetryConfig = {}): RetryResult<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  const [state, setState] = useState<RetryState>({
    loading: false,
    error: null,
    retryCount: 0,
    lastAttempt: 0
  })

  // Use ref to track if component is still mounted
  const mountedRef = useRef(true)
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const execute = useCallback(async (fetchFn: () => Promise<T>): Promise<T> => {
    if (!mountedRef.current) {
      // Don't throw error during navigation - just return a rejected promise silently
      return Promise.reject(new Error('Navigation in progress'))
    }
    
    // Reset state for new execution
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      retryCount: 0,
      lastAttempt: Date.now()
    }))

    let lastError: any = null
    
            for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      // Check if component is still mounted before each attempt
      if (!mountedRef.current) {
        console.log('🚪 Component unmounted during retry, stopping gracefully')
        return Promise.reject(new Error('Navigation in progress'))
      }
      
      try {
        console.log(`🔄 Fetch attempt ${attempt + 1}/${finalConfig.maxRetries + 1}`)
        
        const result = await fetchFn()
        
        if (mountedRef.current) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: null,
            retryCount: attempt
          }))
        }
        
        return result
        
      } catch (error) {
        lastError = error
        console.error(`❌ Fetch attempt ${attempt + 1} failed:`, error)
        
        // Update retry count if still mounted
        if (mountedRef.current) {
          setState(prev => ({
            ...prev,
            retryCount: attempt + 1
          }))
        } else {
          // Component unmounted during retry, stop gracefully
          console.log('🚪 Component unmounted during retry, stopping gracefully')
          return Promise.reject(new Error('Navigation in progress'))
        }
        
        // If this is the last attempt, don't retry
        if (attempt === finalConfig.maxRetries) {
          break
        }
        
        // Check if we should retry this error
        if (!finalConfig.retryCondition(error)) {
          console.log('🚫 Error not retryable, giving up')
          break
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt),
          finalConfig.maxDelay
        )
        
        console.log(`⏱️ Retrying in ${delay}ms...`)
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    // All attempts failed
    const errorMessage = lastError?.message || 'Request failed after retries'
    
    // Only update state if component is still mounted
    if (mountedRef.current) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))
    } else {
      // Component unmounted, just return the error without updating state
      console.log('🚪 Component unmounted, skipping error state update')
    }
    
    throw lastError || new Error(errorMessage)
  }, [finalConfig])

  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      retryCount: 0,
      lastAttempt: 0
    })
  }, [])

  return {
    execute,
    loading: state.loading,
    error: state.error,
    retryCount: state.retryCount,
    reset
  }
}