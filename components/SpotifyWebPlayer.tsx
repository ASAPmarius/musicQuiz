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

export default function EnhancedSpotifyPlayer({ trackUri, onPlayerReady }: SpotifyWebPlayerProps) {
  const { data: session } = useSession()
  const [player, setPlayer] = useState<any>(null)
  const [deviceId, setDeviceId] = useState<string>('')
  const [playerState, setPlayerState] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string>('')
  const [currentPosition, setCurrentPosition] = useState(0)
  const [deviceFullyReady, setDeviceFullyReady] = useState(false)
  const [isActiveDevice, setIsActiveDevice] = useState(false) // 🆕 Track if we're the active device
  const [transferringPlayback, setTransferringPlayback] = useState(false) // 🆕 Track transfer state

  // Enhanced validation
  const validateToken = () => {
    if (!session?.accessToken) {
      return { valid: false, reason: 'No access token' }
    }

    const sessionData = session as any
    const requiredScopes = ['streaming', 'user-modify-playback-state', 'user-read-playback-state']
    const sessionScopes = sessionData?.scope || ''
    const hasRequiredScopes = requiredScopes.every(scope => sessionScopes.includes(scope))
    const tokenExpired = sessionData.expiresAt && sessionData.expiresAt < Date.now() / 1000

    if (!hasRequiredScopes) {
      return { 
        valid: false, 
        reason: `Missing scopes: ${requiredScopes.filter(s => !sessionScopes.includes(s)).join(', ')}` 
      }
    }

    if (tokenExpired) {
      return { valid: false, reason: 'Token expired' }
    }

    return { valid: true }
  }

  // 🆕 Check if this device is the active device
  const checkActiveDevice = async () => {
    if (!session?.accessToken || !deviceId) return false

    try {
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { 'Authorization': `Bearer ${(session as any).accessToken}` }
      })

      if (response.ok) {
        const data = await response.json()
        const isActive = data?.device?.id === deviceId
        setIsActiveDevice(isActive)
        console.log('🎯 Active device check:', { 
          ourDevice: deviceId, 
          activeDevice: data?.device?.id, 
          isActive 
        })
        return isActive
      }
    } catch (error) {
      console.error('❌ Error checking active device:', error)
    }
    return false
  }

  // 🆕 Transfer playback to this device
  const transferPlaybackToThisDevice = async () => {
    if (!session?.accessToken || !deviceId || transferringPlayback) return false

    setTransferringPlayback(true)
    setError('')

    try {
      console.log('🔄 Transferring playback to web player...')
      
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${(session as any).accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_ids: [deviceId],
          play: false // Don't start playing automatically
        })
      })

      if (response.ok) {
        console.log('✅ Playback transferred successfully!')
        setIsActiveDevice(true)
        setTransferringPlayback(false)
        
        // Check again in a moment to be sure
        setTimeout(checkActiveDevice, 1000)
        return true
      } else {
        const errorText = await response.text()
        console.error('❌ Transfer failed:', response.status, errorText)
        setError(`Transfer failed: ${response.status}`)
        setTransferringPlayback(false)
        return false
      }
    } catch (error) {
      console.error('❌ Error transferring playback:', error)
      setError('Error transferring playback')
      setTransferringPlayback(false)
      return false
    }
  }

  useEffect(() => {
    const validation = validateToken()
    if (!validation.valid) {
      setError(validation.reason || 'Token validation failed')
      setIsLoading(false)
      return
    }

    const initializePlayer = () => {
      if (!window.Spotify) {
        console.error('❌ Spotify SDK not loaded')
        return
      }

      try {
        console.log('🎵 Creating enhanced Spotify player...')
        
        const spotifyPlayer = new window.Spotify.Player({
          name: 'Enhanced Web Quiz Player',
          getOAuthToken: (cb: (token: string) => void) => {
            cb((session as any).accessToken)
          },
          volume: 0.5
        })

        // Enhanced event listeners
        spotifyPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
          console.log('✅ Player ready with device ID:', device_id)
          setDeviceId(device_id)
          setIsReady(true)
          setIsLoading(false)
          onPlayerReady?.(device_id)
          
          // Check if we're active after a short delay
          setTimeout(() => {
            checkActiveDevice()
            setDeviceFullyReady(true)
          }, 2000)
        })

        spotifyPlayer.addListener('not_ready', ({ device_id }: { device_id: string }) => {
          console.log('❌ Device went offline:', device_id)
          setIsReady(false)
          setDeviceFullyReady(false)
          setIsActiveDevice(false)
        })

        spotifyPlayer.addListener('initialization_error', ({ message }: { message: string }) => {
          console.error('❌ Initialization error:', message)
          setError(`Initialization error: ${message}`)
          setIsLoading(false)
        })

        spotifyPlayer.addListener('authentication_error', ({ message }: { message: string }) => {
          console.error('❌ Authentication error:', message)
          setError(`Authentication error: ${message}`)
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

        console.log('🔗 Connecting enhanced player...')
        spotifyPlayer.connect().then((success: boolean) => {
          if (success) {
            console.log('✅ Successfully connected!')
            setPlayer(spotifyPlayer)
          } else {
            console.error('❌ Failed to connect')
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

    // Load SDK if needed
    if (window.Spotify) {
      initializePlayer()
    } else {
      console.log('📦 Loading Spotify SDK...')
      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      script.onload = () => console.log('📦 SDK loaded')
      script.onerror = () => {
        setError('Failed to load Spotify SDK')
        setIsLoading(false)
      }
      document.body.appendChild(script)

      window.onSpotifyWebPlaybackSDKReady = initializePlayer
    }

    return () => {
      if (player) {
        console.log('🧹 Cleaning up player...')
        player.disconnect()
      }
    }
  }, [session?.accessToken])

  // 🎯 ENHANCED: Smart play with device activation
  const playTrack = async (uri: string) => {
    if (!deviceId || !session?.accessToken) {
      setError('Player not ready')
      return
    }

    // First, make sure we're the active device
    if (!isActiveDevice) {
      console.log('📱 Not active device, transferring playback first...')
      const transferred = await transferPlaybackToThisDevice()
      if (!transferred) {
        setError('Could not activate device for playback')
        return
      }
      // Wait a moment for transfer to complete
      await new Promise(resolve => setTimeout(resolve, 1500))
    }

    try {
      console.log('🎵 Playing track on active device:', uri)
      
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
        setError(`Play failed: ${response.status}`)
      } else {
        console.log('✅ Track playing successfully!')
        setError('')
      }
    } catch (error) {
      console.error('❌ Error playing track:', error)
      setError('Error playing track')
    }
  }

  // 🎯 ENHANCED: Smart pause/play with proper device handling
  const smartTogglePlayback = async () => {
    if (!player || !deviceId) {
      setError('Player not ready')
      return
    }

    // Ensure we're the active device first
    if (!isActiveDevice) {
      console.log('📱 Not active device, transferring first...')
      const transferred = await transferPlaybackToThisDevice()
      if (!transferred) {
        setError('Cannot control playback - device transfer failed')
        return
      }
      // Wait for transfer to complete
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    try {
      console.log('🎵 Attempting toggle on active device...')
      
      // Try SDK first
      await player.togglePlay()
      console.log('✅ SDK toggle successful!')
      
      // Force state refresh
      setTimeout(() => {
        if (player.getCurrentState) {
          player.getCurrentState().then((state: any) => {
            if (state) {
              setPlayerState(state)
              console.log('🔄 State refreshed:', state.paused ? 'Paused' : 'Playing')
            }
          })
        }
      }, 500)
      
    } catch (sdkError) {
      console.warn('⚠️ SDK failed, trying Web API...', sdkError)
      
      // Web API fallback
      try {
        const action = playerState?.paused ? 'play' : 'pause'
        console.log(`🔄 Web API ${action}...`)
        
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
        console.error('❌ Both methods failed:', apiError)
        setError('Playback control failed')
      }
    }
  }

  // Enhanced next track
  const smartNextTrack = async () => {
    if (!isActiveDevice) {
      await transferPlaybackToThisDevice()
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    try {
      await player.nextTrack()
      console.log('✅ Next track!')
    } catch (error) {
      console.error('❌ Next failed:', error)
      setError('Next track failed')
    }
  }

  // Enhanced previous track
  const smartPreviousTrack = async () => {
    if (!isActiveDevice) {
      await transferPlaybackToThisDevice()
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    try {
      await player.previousTrack()
      console.log('✅ Previous track!')
    } catch (error) {
      console.error('❌ Previous failed:', error)
      setError('Previous track failed')
    }
  }

  // Auto-play with device activation
  useEffect(() => {
    if (trackUri && deviceFullyReady && !error) {
      console.log('🎵 Auto-playing track:', trackUri)
      setTimeout(() => playTrack(trackUri), 1000)
    }
  }, [trackUri, deviceFullyReady, error])

  // Periodic active device check
  useEffect(() => {
    if (deviceId && isReady) {
      const interval = setInterval(checkActiveDevice, 10000) // Check every 10 seconds
      return () => clearInterval(interval)
    }
  }, [deviceId, isReady])

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
      <h3 className="text-xl font-bold mb-4">🎵 Enhanced Spotify Player</h3>
      
      {/* Enhanced status indicators */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <div className={`px-3 py-1 rounded-full text-sm ${isReady ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
          SDK: {isReady ? '✅ Ready' : '⏳ Loading'}
        </div>
        <div className={`px-3 py-1 rounded-full text-sm ${deviceFullyReady ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
          Device: {deviceFullyReady ? '✅ Registered' : '⏳ Registering'}
        </div>
        <div className={`px-3 py-1 rounded-full text-sm ${isActiveDevice ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
          Active: {isActiveDevice ? '✅ Yes' : '❌ No'}
        </div>
        {transferringPlayback && (
          <div className="px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-700">
            🔄 Transferring...
          </div>
        )}
      </div>
      
      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
          <p>Setting up enhanced player...</p>
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
          {/* Device activation section */}
          {!isActiveDevice && deviceFullyReady && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-orange-800">🎯 Device Not Active</h4>
                  <p className="text-orange-700 text-sm">
                    This device isn't controlling playback. Click to make it active.
                  </p>
                </div>
                <button
                  onClick={transferPlaybackToThisDevice}
                  disabled={transferringPlayback}
                  className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 disabled:bg-orange-300"
                >
                  {transferringPlayback ? '🔄 Activating...' : '🎯 Activate Device'}
                </button>
              </div>
            </div>
          )}

          {isActiveDevice && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-green-700">✅ This device is active and ready for playback control!</p>
            </div>
          )}
          
          {/* Enhanced controls */}
          <div className="flex space-x-2">
            <button 
              onClick={smartPreviousTrack}
              disabled={!isActiveDevice}
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
              title={isActiveDevice ? "Previous Track" : "Device not active"}
            >
              ⏮️
            </button>
            <button 
              onClick={smartTogglePlayback}
              disabled={!isActiveDevice}
              className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              title={isActiveDevice ? "Play/Pause" : "Device not active - click Activate Device first"}
            >
              {playerState?.paused === false ? '⏸️' : '▶️'}
            </button>
            <button 
              onClick={smartNextTrack}
              disabled={!isActiveDevice}
              className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
              title={isActiveDevice ? "Next Track" : "Device not active"}
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
              <p className="text-xs text-gray-500 mt-1">
                Status: {playerState.paused ? '⏸️ Paused' : '▶️ Playing'} | 
                Device: {isActiveDevice ? '🎯 Active' : '💤 Inactive'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}