'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

// 🎵 Types for the Spotify Web Playback SDK
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

  useEffect(() => {
    // ✅ Check we have the right scopes before initializing
    const sessionScopes = (session as any)?.scope || ''
    const requiredScopes = ['streaming', 'user-modify-playback-state', 'user-read-playback-state']
    const hasRequiredScopes = requiredScopes.every(scope => sessionScopes.includes(scope))

    console.log('🔍 Scope check:', {
      sessionScopes,
      requiredScopes,
      hasRequiredScopes
    })

    if (!session?.accessToken) {
      setError('No access token available')
      setIsLoading(false)
      return
    }

    if (!hasRequiredScopes) {
      setError(`Missing required scopes. Have: ${sessionScopes}. Need: ${requiredScopes.join(', ')}`)
      setIsLoading(false)
      return
    }

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
        console.error('❌ Failed to load SDK script')
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
      console.log('🎵 Initializing player with token:', (session as any).accessToken.substring(0, 20) + '...')
      
      try {
        const spotifyPlayer = new window.Spotify.Player({
          name: 'Music Quiz Web Player',
          getOAuthToken: (cb: (token: string) => void) => {
            console.log('🔑 Player requesting token...')
            cb((session as any).accessToken)
          },
          volume: 0.5
        })

        // Event listeners
        spotifyPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
          console.log('🎵 Player ready! Device ID:', device_id)
          setDeviceId(device_id)
          setIsReady(true)
          setIsLoading(false)
          setError('')
          onPlayerReady?.(device_id)
        })

        spotifyPlayer.addListener('not_ready', ({ device_id }: { device_id: string }) => {
          console.log('❌ Player not ready. Device ID:', device_id)
          setError('Player not ready')
          setIsLoading(false)
        })

        spotifyPlayer.addListener('initialization_error', ({ message }: { message: string }) => {
          console.error('❌ Initialization error:', message)
          setError(`Initialization error: ${message}`)
          setIsLoading(false)
        })

        spotifyPlayer.addListener('authentication_error', ({ message }: { message: string }) => {
          console.error('❌ Authentication error:', message)
          console.log('🔍 Token scopes:', (session as any)?.scope)
          console.log('🔍 Token preview:', (session as any)?.accessToken?.substring(0, 20) + '...')
          setError(`Authentication error: ${message}. Check console for token details.`)
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

        // Connect to Spotify
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

    // Cleanup
    return () => {
      if (player) {
        console.log('🧹 Disconnecting player...')
        player.disconnect()
      }
    }
  }, [session?.accessToken, (session as any)?.scope])

  // Play track function
  const playTrack = async (uri: string) => {
    if (!deviceId || !session?.accessToken) {
      console.log('❌ Cannot play: no device or token')
      return
    }

    try {
      console.log('🎵 Playing track:', uri, 'on device:', deviceId)
      
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

      console.log('🎵 Play response status:', response.status)

      if (!response.ok) {
        const errorData = await response.text()
        console.error('❌ Play failed:', errorData)
        setError(`Failed to play: ${response.status} ${errorData}`)
      } else {
        console.log('✅ Track started playing')
      }
    } catch (error) {
      console.error('❌ Error playing track:', error)
      setError('Error playing track')
    }
  }

  // Auto-play when trackUri changes
  useEffect(() => {
    if (trackUri && isReady && !error) {
      console.log('🎵 Auto-playing track:', trackUri)
      playTrack(trackUri)
    }
  }, [trackUri, isReady, error])

  // Control functions
  const togglePlayback = () => player?.togglePlay()
  const nextTrack = () => player?.nextTrack()
  const previousTrack = () => player?.previousTrack()

  // Format time helper
  const formatTime = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
          <span>Loading Spotify Player...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-red-500">❌</span>
          <span className="text-red-700 font-semibold">Player Error</span>
        </div>
        <p className="text-red-600 text-sm">{error}</p>
        <div className="mt-3 text-xs text-red-500">
          <p><strong>Session scopes:</strong> {(session as any)?.scope || 'None'}</p>
          <p><strong>Token preview:</strong> {(session as any)?.accessToken?.substring(0, 20) + '...' || 'None'}</p>
        </div>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <p className="text-yellow-700">Player is connecting to Spotify...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">🎵 Spotify Player</h3>
        <div className="text-sm text-gray-500">
          Device: {deviceId.substring(0, 8)}...
        </div>
      </div>

      {playerState?.track_window?.current_track && (
        <div className="mb-6">
          {/* Track Info */}
          <div className="flex items-center space-x-4 mb-4">
            {playerState.track_window.current_track.album.images[0] && (
              <img
                src={playerState.track_window.current_track.album.images[0].url}
                alt="Album Cover"
                className="w-16 h-16 rounded-lg"
              />
            )}
            <div className="flex-1">
              <h4 className="font-semibold text-gray-800">
                {playerState.track_window.current_track.name}
              </h4>
              <p className="text-sm text-gray-600">
                {playerState.track_window.current_track.artists.map((artist: any) => artist.name).join(', ')}
              </p>
              <p className="text-xs text-gray-500">
                {playerState.track_window.current_track.album.name}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{formatTime(currentPosition)}</span>
              <span>{formatTime(playerState.track_window.current_track.duration_ms)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-1000"
                style={{
                  width: `${(currentPosition / playerState.track_window.current_track.duration_ms) * 100}%`
                }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={previousTrack}
          className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          ⏮️
        </button>
        <button
          onClick={togglePlayback}
          className="p-3 rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors"
        >
          {playerState?.paused ? '▶️' : '⏸️'}
        </button>
        <button
          onClick={nextTrack}
          className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          ⏭️
        </button>
      </div>

      {!playerState?.track_window?.current_track && (
        <div className="text-center text-gray-500 py-8">
          <p>Ready to play music! 🎵</p>
          <p className="text-sm">Select a track to start playing.</p>
        </div>
      )}
    </div>
  )
}