'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'

interface SpotifyWebPlayerProps {
  trackUri?: string
  onPlayerReady?: (deviceId: string) => void
}

interface SpotifyDevice {
  id: string
  is_active: boolean
  is_private_session: boolean
  is_restricted: boolean
  name: string
  type: string
  volume_percent: number
  supports_volume: boolean
}

interface PlaybackState {
  device: SpotifyDevice
  shuffle_state: boolean
  repeat_state: string
  timestamp: number
  progress_ms: number
  is_playing: boolean
  item: {
    name: string
    artists: Array<{ name: string }>
    duration_ms: number
    uri: string
  }
}

export default function SpotifyWebPlayer({ trackUri, onPlayerReady }: SpotifyWebPlayerProps) {
  const { data: session } = useSession()
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [activeDevice, setActiveDevice] = useState<SpotifyDevice | null>(null)
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [transferringPlayback, setTransferringPlayback] = useState(false)

  // Helper to make Spotify API calls
  const spotifyFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    if (!session?.accessToken) throw new Error('No access token')
    
    const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${(session as any).accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    // Check for empty responses FIRST
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return null
    }

    // Only try to parse JSON if we have content
    let data = null
    try {
      data = await response.json()
    } catch (e) {
      // If JSON parsing fails on a successful response, just return null
      if (response.ok) return null
      // Otherwise throw an error
      throw new Error(`API Error: ${response.status}`)
    }
    
    if (!response.ok) {
      const errorMessage = data?.error?.message || `API Error: ${response.status}`
      throw new Error(errorMessage)
    }
    
    return data
  }, [session])

  // Fetch available devices
  const fetchDevices = useCallback(async () => {
    try {
      const data = await spotifyFetch('/me/player/devices')
      const deviceList = data?.devices || []
      setDevices(deviceList)
      
      // Find active device
      const active = deviceList.find((d: SpotifyDevice) => d.is_active)
      setActiveDevice(active || null)
      
      // If we have devices but none are active, notify parent
      if (deviceList.length > 0 && !active && onPlayerReady) {
        onPlayerReady(deviceList[0].id)
      }
      
      return deviceList
    } catch (error) {
      console.error('Failed to fetch devices:', error)
      setError('Failed to fetch devices')
      return []
    }
  }, [spotifyFetch, onPlayerReady])

  // Fetch current playback state
  const fetchPlaybackState = useCallback(async () => {
    try {
      const state = await spotifyFetch('/me/player')
      setPlaybackState(state)
      
      if (state?.device) {
        setActiveDevice(state.device)
      }
      
      return state
    } catch (error) {
      // No active playback is not an error
      if (error instanceof Error && error.message.includes('204')) {
        setPlaybackState(null)
      }
      return null
    }
  }, [spotifyFetch])

  // Transfer playback to a specific device
  const transferPlayback = useCallback(async (deviceId: string, play: boolean = false) => {
    setTransferringPlayback(true)
    setError('')
    
    try {
      await spotifyFetch('/me/player', {
        method: 'PUT',
        body: JSON.stringify({
          device_ids: [deviceId],
          play
        })
      })
      
      // Wait a bit for transfer to complete
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Refresh devices and state
      await fetchDevices()
      await fetchPlaybackState()
      
      return true
    } catch (error) {
      console.error('Transfer failed:', error)
      setError(error instanceof Error ? error.message : 'Failed to transfer playback')
      return false
    } finally {
      setTransferringPlayback(false)
    }
  }, [spotifyFetch, fetchDevices, fetchPlaybackState])

  // Play a specific track
  const playTrack = useCallback(async (uri: string, deviceId?: string) => {
    try {
      const targetDevice = deviceId || activeDevice?.id
      
      if (!targetDevice) {
        // No device available, try to get one
        const deviceList = await fetchDevices()
        if (deviceList.length === 0) {
          setError('No Spotify devices found. Please open Spotify on your device.')
          return
        }
        
        // Transfer to first available device
        await transferPlayback(deviceList[0].id)
        
        // Try playing on the newly activated device
        await spotifyFetch(`/me/player/play?device_id=${deviceList[0].id}`, {
          method: 'PUT',
          body: JSON.stringify({ uris: [uri] })
        })
      } else {
        // Play on specific device
        await spotifyFetch(`/me/player/play${targetDevice ? `?device_id=${targetDevice}` : ''}`, {
          method: 'PUT',
          body: JSON.stringify({ uris: [uri] })
        })
      }
      
      // Update state after playing
      setTimeout(fetchPlaybackState, 500)
    } catch (error) {
      console.error('Play failed:', error)
      setError(error instanceof Error ? error.message : 'Failed to play track')
    }
  }, [activeDevice, spotifyFetch, fetchDevices, transferPlayback, fetchPlaybackState])

  // Playback controls
  const togglePlayback = useCallback(async () => {
    try {
      if (playbackState?.is_playing) {
        await spotifyFetch('/me/player/pause', { method: 'PUT' })
      } else {
        await spotifyFetch('/me/player/play', { method: 'PUT' })
      }
      
      // Update state
      setTimeout(fetchPlaybackState, 300)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Playback control failed')
    }
  }, [playbackState, spotifyFetch, fetchPlaybackState])

  const skipToNext = useCallback(async () => {
    try {
      await spotifyFetch('/me/player/next', { method: 'POST' })
      setTimeout(fetchPlaybackState, 500)
    } catch (error) {
      setError('Failed to skip track')
    }
  }, [spotifyFetch, fetchPlaybackState])

  const skipToPrevious = useCallback(async () => {
    try {
      await spotifyFetch('/me/player/previous', { method: 'POST' })
      setTimeout(fetchPlaybackState, 500)
    } catch (error) {
      setError('Failed to go to previous track')
    }
  }, [spotifyFetch, fetchPlaybackState])

  // Format time helper
  const formatTime = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Initial load
  useEffect(() => {
    if (!session?.accessToken) {
      setIsLoading(false)
      return
    }

    const initialize = async () => {
      setIsLoading(true)
      await fetchDevices()
      await fetchPlaybackState()
      setIsLoading(false)
    }

    initialize()

    // Poll for updates every 5 seconds
    const interval = setInterval(() => {
      fetchPlaybackState()
    }, 5000)

    return () => clearInterval(interval)
  }, [session, fetchDevices, fetchPlaybackState])

  // Handle trackUri changes
  useEffect(() => {
    if (trackUri && activeDevice) {
      playTrack(trackUri)
    }
  }, [trackUri, activeDevice, playTrack])

  // UI
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-lg font-bold mb-4">🎵 Spotify Player (Web API)</h3>
      
      {/* Status indicators */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className={`px-3 py-1 rounded-full text-sm ${devices.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
          Devices: {devices.length}
        </div>
        <div className={`px-3 py-1 rounded-full text-sm ${activeDevice ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
          Active: {activeDevice ? activeDevice.name : 'None'}
        </div>
        {playbackState && (
          <div className={`px-3 py-1 rounded-full text-sm ${playbackState.is_playing ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
            {playbackState.is_playing ? '▶️ Playing' : '⏸️ Paused'}
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
          <p>Connecting to Spotify...</p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-700">❌ {error}</p>
        </div>
      )}

      {/* No devices warning */}
      {!isLoading && devices.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <h4 className="font-bold text-yellow-800 mb-2">No Spotify devices found</h4>
          <p className="text-yellow-700 text-sm mb-3">
            Please open Spotify on one of your devices:
          </p>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• Spotify desktop app</li>
            <li>• Spotify mobile app</li>
            <li>• Spotify web player (open.spotify.com)</li>
          </ul>
          <button 
            onClick={fetchDevices} 
            className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
          >
            🔄 Refresh Devices
          </button>
        </div>
      )}

      {/* Device selector */}
      {devices.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Select Device:</label>
          <div className="flex gap-2">
            <select 
              value={activeDevice?.id || ''} 
              onChange={(e) => transferPlayback(e.target.value)}
              disabled={transferringPlayback}
              className="flex-1 px-3 py-2 border rounded-md"
            >
              <option value="">Choose a device...</option>
              {devices.map(device => (
                <option key={device.id} value={device.id}>
                  {device.name} ({device.type}) {device.is_active ? '✓' : ''}
                </option>
              ))}
            </select>
            {transferringPlayback && (
              <div className="px-3 py-2 bg-purple-100 text-purple-700 rounded">
                🔄 Transferring...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Playback controls */}
      {activeDevice && (
        <div className="space-y-4">
          <div className="flex justify-center items-center gap-4">
            <button 
              onClick={skipToPrevious}
              className="p-3 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors"
              title="Previous Track"
            >
              ⏮️
            </button>
            
            <button 
              onClick={togglePlayback}
              className="p-4 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
              title={playbackState?.is_playing ? "Pause" : "Play"}
            >
              {playbackState?.is_playing ? '⏸️' : '▶️'}
            </button>
            
            <button 
              onClick={skipToNext}
              className="p-3 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors"
              title="Next Track"
            >
              ⏭️
            </button>
          </div>

          {/* Current track info */}
          {playbackState?.item && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="font-semibold">{playbackState.item.name}</p>
              <p className="text-sm text-gray-600">
                {playbackState.item.artists.map(a => a.name).join(', ')}
              </p>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{formatTime(playbackState.progress_ms || 0)}</span>
                  <span>{formatTime(playbackState.item.duration_ms)}</span>
                </div>
                <div className="mt-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ 
                      width: `${(playbackState.progress_ms / playbackState.item.duration_ms) * 100}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}