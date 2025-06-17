'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: {
      Player: new (options: any) => any;
    };
  }
}

interface SpotifyWebPlayerProps {
  trackUri?: string
  onPlayerReady?: (deviceId: string) => void
}

export default function SpotifyWebPlayer({ trackUri, onPlayerReady }: SpotifyWebPlayerProps) {
  const { data: session } = useSession()
  const [player, setPlayer] = useState<any>(null)
  const [deviceId, setDeviceId] = useState<string>('')
  const [playerState, setPlayerState] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string>('')
  const [currentPosition, setCurrentPosition] = useState(0)
  const [deviceFullyReady, setDeviceFullyReady] = useState(false)

  // Simple validation - these scopes were already working!
  const validateToken = () => {
    if (!session?.accessToken) {
      return { valid: false, reason: 'No access token' }
    }

    const sessionData = session as any
    const requiredScopes = ['streaming', 'user-modify-playback-state', 'user-read-playback-state']
    const sessionScopes = sessionData?.scope || ''
    const hasRequiredScopes = requiredScopes.every(scope => sessionScopes.includes(scope))
    const tokenExpired = sessionData.expiresAt && sessionData.expiresAt < Date.now() / 1000

    console.log('🔍 Scope validation (working scopes only):', {
      sessionScopes: sessionScopes.split(' '),
      requiredScopes,
      hasRequiredScopes,
      tokenExpired
    })

    if (!hasRequiredScopes) {
      return { 
        valid: false, 
        reason: `Missing scopes: ${requiredScopes.filter(s => !sessionScopes.includes(s)).join(', ')}` 
      }
    }

    if (tokenExpired) {
      return { valid: false, reason: 'Token expired' }
    }

    return { valid: true, reason: 'Token has all required scopes for Web Playback SDK' }
  }

  useEffect(() => {
    const validation = validateToken()

    if (!validation.valid) {
      setError(validation.reason)
      setIsLoading(false)
      return
    }

    console.log('✅ Validation passed:', validation.reason)

    const loadSpotifySDK = () => {
      if (window.Spotify) {
        initializePlayer()
        return
      }

      console.log('📦 Loading Spotify SDK...')
      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      script.onload = () => console.log('📦 SDK script loaded')
      script.onerror = () => {
        setError('Failed to load Spotify SDK')
        setIsLoading(false)
      }
      document.body.appendChild(script)

      window.onSpotifyWebPlaybackSDKReady = () => {
        console.log('🎵 Spotify SDK ready!')
        initializePlayer()
      }
    }

    const initializePlayer = () => {
      const token = (session as any).accessToken
      console.log('🎵 Initializing player with working scopes')
      
      try {
        const spotifyPlayer = new window.Spotify.Player({
          name: 'Music Quiz Web Player',
          getOAuthToken: (cb: (token: string) => void) => {
            console.log('🔑 SDK requesting token...')
            cb(token)
          },
          volume: 0.5
        })

        spotifyPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
          console.log('🎵 🎉 Player ready! Device ID:', device_id)
          setDeviceId(device_id)
          setIsReady(true)
          setIsLoading(false)
          setError('')
          
          // 🎯 KEY FIX: Wait for device to be FULLY ready for API calls
          console.log('⏳ Waiting for device to be fully registered...')
          setTimeout(() => {
            setDeviceFullyReady(true)
            console.log('✅ Device is now fully ready for playback!')
            onPlayerReady?.(device_id)
          }, 3000) // 3 seconds should be enough for full registration
        })

        spotifyPlayer.addListener('not_ready', ({ device_id }: { device_id: string }) => {
          console.log('❌ Player not ready. Device ID:', device_id)
          setIsReady(false)
          setDeviceFullyReady(false)
          setError('Player not ready')
        })

        spotifyPlayer.addListener('initialization_error', ({ message }: { message: string }) => {
          console.error('❌ Initialization error:', message)
          setError(`Initialization failed: ${message}`)
          setIsLoading(false)
        })

        spotifyPlayer.addListener('authentication_error', ({ message }: { message: string }) => {
          console.error('❌ Authentication error:', message)
          console.log('🔍 Current scopes:', (session as any)?.scope)
          setError(`Authentication failed: ${message}. Your scopes: ${(session as any)?.scope}`)
          setIsLoading(false)
        })

        spotifyPlayer.addListener('account_error', ({ message }: { message: string }) => {
          console.error('❌ Account error:', message)
          setError(`Account error: ${message}. You need Spotify Premium.`)
          setIsLoading(false)
        })

        spotifyPlayer.addListener('player_state_changed', (state: any) => {
          console.log('🎵 Player state changed:', state)
          setPlayerState(state)
          if (state) {
            setCurrentPosition(state.position)
          }
        })

        console.log('🔗 Connecting to Spotify...')
        spotifyPlayer.connect().then((success: boolean) => {
          if (success) {
            console.log('✅ Successfully connected to Spotify!')
            setPlayer(spotifyPlayer)
          } else {
            console.error('❌ Failed to connect to Spotify')
            setError('Failed to connect to Spotify')
            setIsLoading(false)
          }
        })

      } catch (error) {
        console.error('❌ Error creating player:', error)
        setError('Error creating player: ' + (error instanceof Error ? error.message : 'Unknown error'))
        setIsLoading(false)
      }
    }

    loadSpotifySDK()

    return () => {
      if (player) {
        console.log('🧹 Disconnecting player...')
        player.disconnect()
      }
    }
  }, [session?.accessToken, (session as any)?.scope])

  // 🎯 KEY FIX: Better playback with device readiness check
  const playTrack = async (uri: string) => {
    if (!deviceId || !session?.accessToken) {
      setError('Cannot play: Player not ready')
      return
    }

    if (!deviceFullyReady) {
      console.log('⏳ Device not fully ready yet...')
      setError('Device still registering, please wait a few seconds...')
      return
    }

    try {
      console.log('🎵 Playing track on fully ready device:', uri)
      
      const response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${(session as any).accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceId,
          uris: [uri]
        })
      })

      if (!response.ok) {
        const errorData = await response.text()
        console.error('❌ Play failed:', response.status, errorData)
        
        if (response.status === 404) {
          setError('Device not found. Please wait a bit longer for device registration.')
        } else if (response.status === 403) {
          setError('You need Spotify Premium for playback control')
        } else {
          setError(`Playback failed: ${response.status}`)
        }
      } else {
        console.log('✅ Track playing successfully!')
        setError('')
      }
    } catch (error) {
      console.error('❌ Error playing track:', error)
      setError('Error playing track: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  // 🎯 KEY FIX: Smart controls with SDK + Web API fallbacks
  const smartTogglePlayback = async () => {
    if (!player || !deviceFullyReady) {
      setError('Player not fully ready')
      return
    }

    try {
      console.log('🎵 Trying SDK toggle...')
      await player.togglePlay()
      console.log('✅ SDK toggle worked!')
    } catch (sdkError) {
      console.warn('⚠️ SDK failed (probably _streamer issue), using Web API...', sdkError)
      
      // Smart fallback to Web API
      try {
        const action = playerState?.paused ? 'play' : 'pause'
        console.log(`🔄 Web API ${action} fallback...`)
        
        const response = await fetch(`https://api.spotify.com/v1/me/player/${action}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${(session as any).accessToken}`,
          }
        })
        
        if (response.ok) {
          console.log('✅ Web API fallback worked!')
        } else {
          throw new Error(`Web API failed: ${response.status}`)
        }
      } catch (apiError) {
        console.error('❌ Both SDK and Web API failed:', apiError)
        setError('Toggle failed - both methods failed')
      }
    }
  }

  const smartNextTrack = async () => {
    if (!player || !deviceFullyReady) {
      setError('Player not fully ready')
      return
    }

    try {
      console.log('🎵 Trying SDK next...')
      await player.nextTrack()
      console.log('✅ SDK next worked!')
    } catch (sdkError) {
      console.warn('⚠️ SDK next failed, using Web API...', sdkError)
      
      try {
        const response = await fetch('https://api.spotify.com/v1/me/player/next', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(session as any).accessToken}`,
          }
        })
        
        if (response.ok) {
          console.log('✅ Web API next worked!')
        } else {
          throw new Error(`Web API failed: ${response.status}`)
        }
      } catch (apiError) {
        console.error('❌ Both SDK and Web API failed:', apiError)
        setError('Next track failed')
      }
    }
  }

  const smartPreviousTrack = async () => {
    if (!player || !deviceFullyReady) {
      setError('Player not fully ready')
      return
    }

    try {
      console.log('🎵 Trying SDK previous...')
      await player.previousTrack()
      console.log('✅ SDK previous worked!')
    } catch (sdkError) {
      console.warn('⚠️ SDK previous failed, using Web API...', sdkError)
      
      try {
        const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(session as any).accessToken}`,
          }
        })
        
        if (response.ok) {
          console.log('✅ Web API previous worked!')
        } else {
          throw new Error(`Web API failed: ${response.status}`)
        }
      } catch (apiError) {
        console.error('❌ Both SDK and Web API failed:', apiError)
        setError('Previous track failed')
      }
    }
  }

  // Auto-play with proper timing
  useEffect(() => {
    if (trackUri && deviceFullyReady && !error) {
      console.log('🎵 Auto-playing track:', trackUri)
      setTimeout(() => playTrack(trackUri), 1000)
    }
  }, [trackUri, deviceFullyReady, error])

  const refreshAuth = async () => {
    await signOut({ redirect: false })
    window.location.href = '/api/auth/signin/spotify'
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-bold mb-4">🎵 Spotify Web Player (Working Version)</h3>
      
      {/* Status indicators */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <div className={`px-3 py-1 rounded-full text-sm ${isReady ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
          SDK: {isReady ? '✅ Ready' : '⏳ Loading'}
        </div>
        <div className={`px-3 py-1 rounded-full text-sm ${deviceFullyReady ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
          Device: {deviceFullyReady ? '✅ Ready' : '⏳ Registering'}
        </div>
        <div className="px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-700">
          No invalid scopes!
        </div>
      </div>
      
      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
          <p>Setting up player...</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-700 font-medium">❌ {error}</p>
          <button 
            onClick={refreshAuth}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            🔄 Re-authenticate
          </button>
        </div>
      )}
      
      {isReady && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-green-700">✅ Player ready with smart error handling!</p>
            <p className="text-green-600 text-sm">Uses SDK when possible, Web API when SDK fails</p>
            {!deviceFullyReady && (
              <p className="text-yellow-700 text-sm">⏳ Device still registering, please wait...</p>
            )}
          </div>
          
          {/* Smart controls */}
          <div className="flex space-x-2">
            <button 
              onClick={smartPreviousTrack}
              disabled={!deviceFullyReady}
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
              title="Previous (SDK + Web API fallback)"
            >
              ⏮️
            </button>
            <button 
              onClick={smartTogglePlayback}
              disabled={!deviceFullyReady}
              className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              title="Play/Pause (SDK + Web API fallback)"
            >
              {playerState?.paused === false ? '⏸️' : '▶️'}
            </button>
            <button 
              onClick={smartNextTrack}
              disabled={!deviceFullyReady}
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
              title="Next (SDK + Web API fallback)"
            >
              ⏭️
            </button>
          </div>
          
          {/* Track info */}
          {playerState?.track_window?.current_track && (
            <div className="bg-gray-50 p-3 rounded">
              <p className="font-medium">{playerState.track_window.current_track.name}</p>
              <p className="text-sm text-gray-600">
                {playerState.track_window.current_track.artists.map((artist: any) => artist.name).join(', ')}
              </p>
              <p className="text-xs text-gray-500">
                {formatTime(currentPosition)} / {formatTime(playerState.duration)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}