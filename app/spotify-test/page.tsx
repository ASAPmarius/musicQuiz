'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signIn } from 'next-auth/react'
import SpotifyWebPlayer from '@/components/SpotifyWebPlayer'

interface Playlist {
  id: string
  name: string
  description: string
  tracks: { total: number }
  images: Array<{ url: string }>
  owner: string
}

interface Track {
  id: string
  name: string
  artists: string
  uri: string
  preview_url: string | null
  album: string
  duration_ms: number
  hasPreview: boolean
  canPlayWithSDK: boolean
}

interface DeviceStatus {
  hasDevices: boolean
  hasActiveDevice: boolean
  devices: any[]
}

export default function SpotifyTestPage() {
  const { data: session, status } = useSession()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({ 
    hasDevices: false, 
    hasActiveDevice: false, 
    devices: [] 
  })
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)

  // Helper to get fresh token
  const getAccessToken = useCallback(async () => {
    const response = await fetch('/api/auth/session')
    const sessionData = await response.json()
    return sessionData?.accessToken
  }, [])

  // Check device status
  const checkDeviceStatus = useCallback(async () => {
    try {
      const token = await getAccessToken()
      const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        const hasActiveDevice = data.devices.some((d: any) => d.is_active)
        
        setDeviceStatus({ 
          hasDevices: data.devices.length > 0, 
          hasActiveDevice,
          devices: data.devices
        })
        
        return { 
          hasDevices: data.devices.length > 0, 
          hasActiveDevice,
          devices: data.devices
        }
      }
    } catch (error) {
      console.error('Failed to check device status:', error)
    }
    return { hasDevices: false, hasActiveDevice: false, devices: [] }
  }, [getAccessToken])

  // Play a track using Web API
  const playTrack = useCallback(async (trackUri: string, trackId: string) => {
    try {
      setError('')
      setPlayingTrackId(trackId)
      
      const token = await getAccessToken()
      
      // First check if we have any devices
      const status = await checkDeviceStatus()
      
      if (!status.hasDevices) {
        setError('No Spotify devices found. Please open Spotify on your phone, desktop, or web player.')
        setPlayingTrackId(null)
        return
      }
      
      // Try to play on the active device (or first available)
      const playResponse = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [trackUri]
        })
      })

      if (playResponse.status === 404) {
        // No active device, try to transfer to first available
        if (status.devices.length > 0) {
          const firstDevice = status.devices[0]
          
          // Transfer playback
          await fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              device_ids: [firstDevice.id],
              play: false
            })
          })
          
          // Wait a moment for transfer
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Try playing again
          const retryResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${firstDevice.id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              uris: [trackUri]
            })
          })
          
          if (!retryResponse.ok && retryResponse.status !== 204) {
            throw new Error('Failed to play after device transfer')
          }
        } else {
          setError('No active Spotify device. Please open Spotify first.')
          setPlayingTrackId(null)
          return
        }
      } else if (!playResponse.ok && playResponse.status !== 204) {
        throw new Error(`Failed to play track: ${playResponse.status}`)
      }

      console.log('✅ Playing track:', trackUri)
      
      // Update device status after successful play
      setTimeout(checkDeviceStatus, 1000)
      
    } catch (error) {
      console.error('Failed to play track:', error)
      setError(error instanceof Error ? error.message : 'Failed to play track')
      setPlayingTrackId(null)
    }
  }, [getAccessToken, checkDeviceStatus])

  // Play preview (30 seconds)
  const playPreview = useCallback((track: Track) => {
    if (!track.preview_url) {
      setError('No preview available for this track.')
      return
    }
    
    console.log('🎵 Playing preview:', track.name)
    const audio = new Audio(track.preview_url)
    audio.play().catch(err => {
      console.error('Preview playback failed:', err)
      setError('Failed to play preview')
    })
  }, [])

  // Fetch user's playlists
  const fetchPlaylists = async () => {
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch('/api/spotify/playlists')
      if (!response.ok) {
        throw new Error('Failed to fetch playlists')
      }
      
      const data = await response.json()
      setPlaylists(data.playlists || [])
    } catch (err) {
      console.error('Error fetching playlists:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch playlists')
    } finally {
      setLoading(false)
    }
  }

  // Fetch tracks from selected playlist
  const fetchTracks = async (playlistId: string) => {
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch(`/api/spotify/playlist/${playlistId}/tracks`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch tracks: ${response.status}`)
      }
      
      const data = await response.json()
      setTracks(data.tracks || [])
      
    } catch (err) {
      console.error('Error fetching tracks:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch tracks')
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Load playlists and check devices when component mounts
  useEffect(() => {
    if (session?.accessToken) {
      fetchPlaylists()
      checkDeviceStatus()
      
      // Poll device status every 10 seconds
      const interval = setInterval(checkDeviceStatus, 10000)
      return () => clearInterval(interval)
    }
  }, [session, checkDeviceStatus])

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center">
        <div className="text-xl text-green-800">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4 text-gray-800">🎵 Spotify Music Player</h1>
          <p className="text-gray-600 mb-6">
            Sign in with Spotify to play your music
          </p>
          <button 
            onClick={() => signIn('spotify')}
            className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors"
          >
            Sign in with Spotify
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🎵 Spotify Music Player</h1>
          <p className="text-gray-600">Welcome, {(session as any)?.user?.name || 'User'}!</p>
        </div>

        {/* Device Status Alert */}
        {!deviceStatus.hasActiveDevice && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-bold text-yellow-800 mb-2">⚠️ No Active Spotify Device</h3>
            <p className="text-yellow-700 mb-3">
              To play music, you need to have Spotify open on one of your devices:
            </p>
            <ul className="text-sm text-yellow-700 space-y-1 mb-3">
              <li>• Spotify desktop app</li>
              <li>• Spotify mobile app</li>
              <li>• Spotify web player (open.spotify.com)</li>
            </ul>
            <button 
              onClick={checkDeviceStatus}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              🔄 Check Again
            </button>
          </div>
        )}

        {/* Available Devices */}
        {deviceStatus.devices.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-bold text-blue-800 mb-2">📱 Available Devices</h3>
            <div className="space-y-2">
              {deviceStatus.devices.map((device: any) => (
                <div key={device.id} className="flex items-center justify-between">
                  <span className="text-blue-700">
                    {device.name} ({device.type})
                  </span>
                  {device.is_active && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
                      Active
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">❌ {error}</p>
          </div>
        )}

        {/* Spotify Web Player Component */}
        <SpotifyWebPlayer />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Playlists Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Your Playlists</h2>
              <button 
                onClick={fetchPlaylists}
                disabled={loading}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  onClick={() => {
                    setSelectedPlaylist(playlist)
                    fetchTracks(playlist.id)
                  }}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedPlaylist?.id === playlist.id
                      ? 'bg-green-100 border border-green-300'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {playlist.images[0] && (
                      <img
                        src={playlist.images[0].url}
                        alt={playlist.name}
                        className="w-12 h-12 rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">{playlist.name}</h3>
                      <p className="text-sm text-gray-600">{playlist.tracks.total} tracks</p>
                      <p className="text-xs text-gray-500">by {playlist.owner}</p>
                    </div>
                  </div>
                </div>
              ))}
              
              {playlists.length === 0 && !loading && (
                <p className="text-gray-500 text-center py-4">
                  No playlists found. Click "Refresh" to load your playlists.
                </p>
              )}
            </div>
          </div>

          {/* Tracks Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {selectedPlaylist ? `Tracks from "${selectedPlaylist.name}"` : 'Select a Playlist'}
            </h2>

            {selectedPlaylist ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    className={`p-3 rounded-lg transition-colors ${
                      playingTrackId === track.id 
                        ? 'bg-green-50 border border-green-200' 
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-800">{track.name}</h4>
                        <p className="text-sm text-gray-600">{track.artists}</p>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <span>{track.album}</span>
                          <span>•</span>
                          <span>{formatDuration(track.duration_ms)}</span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        {/* Main Play Button - Uses Spotify Device */}
                        <button
                          onClick={() => playTrack(track.uri, track.id)}
                          disabled={!deviceStatus.hasDevices}
                          className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${
                            deviceStatus.hasDevices
                              ? 'bg-green-500 hover:bg-green-600 text-white'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                          title={deviceStatus.hasDevices ? 'Play on Spotify device' : 'No Spotify device available'}
                        >
                          {playingTrackId === track.id ? '⏸️' : '▶️'} Play
                        </button>
                        
                        {/* Preview Button - 30 second preview */}
                        {track.hasPreview && (
                          <button
                            onClick={() => playPreview(track)}
                            className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors text-sm"
                            title="Play 30s preview in browser"
                          >
                            🎵 Preview
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {tracks.length === 0 && !loading && (
                  <p className="text-gray-500 text-center py-8">
                    No tracks in this playlist
                  </p>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                Select a playlist to view tracks
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}