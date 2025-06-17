'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import SpotifyWebPlayer from '@/components/SpotifyWebPlayer' // Adjust path as needed

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
  uri: string // Spotify URI for Web Playback SDK
  preview_url: string | null
  album: string
  duration_ms: number
  hasPreview: boolean // ✅ New field
  canPlayWithSDK: boolean // ✅ New field
}

export default function SpotifyTestPage() {
  const { data: session, status } = useSession()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // 🆕 State for Web Player
  const [selectedTrackUri, setSelectedTrackUri] = useState<string>('')
  const [playerDeviceId, setPlayerDeviceId] = useState<string>('')
  const [playerReady, setPlayerReady] = useState(false)

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
      console.log('🔍 Fetching tracks for playlist:', playlistId)
      const response = await fetch(`/api/spotify/playlist/${playlistId}/tracks`)
      
      console.log('📋 Response status:', response.status)
      
      if (!response.ok) {
        const errorData = await response.text()
        console.error('❌ API Error:', response.status, errorData)
        throw new Error(`Failed to fetch tracks: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('✅ Tracks data received:', {
        totalTracks: data.tracks?.length || 0,
        metadata: data.metadata
      })
      
      setTracks(data.tracks || [])
      
      // Show metadata in console for debugging
      if (data.metadata) {
        console.log('📊 Track metadata:', data.metadata)
      }
      
    } catch (err) {
      console.error('Error fetching tracks:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch tracks')
    } finally {
      setLoading(false)
    }
  }

  // Load playlists when component mounts
  useEffect(() => {
    if (session?.accessToken) {
      fetchPlaylists()
    }
  }, [session])

  // 🆕 Play track using Web Playback SDK
  const playTrackFull = (track: Track) => {
    if (!playerReady) {
      setError('Player not ready. Please wait for the Spotify player to connect.')
      return
    }
    
    console.log('🎵 Playing full track:', track.name, 'URI:', track.uri)
    setSelectedTrackUri(track.uri)
  }

  // 🔄 Play preview (fallback for tracks without Web Playback)
  const playPreview = (track: Track) => {
    if (!track.preview_url) {
      setError('No preview available for this track. Use "Play Full" instead.')
      return
    }
    
    console.log('🎵 Playing preview:', track.name)
    const audio = new Audio(track.preview_url)
    audio.play().catch(err => {
      console.error('Preview playback failed:', err)
      setError('Failed to play preview')
    })
  }

  // 🆕 Callback when player is ready
  const handlePlayerReady = (deviceId: string) => {
    console.log('🎵 Player ready with device ID:', deviceId)
    setPlayerDeviceId(deviceId)
    setPlayerReady(true)
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor((ms / 1000) % 60)
    const minutes = Math.floor((ms / (1000 * 60)) % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

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
          <h1 className="text-2xl font-bold mb-4 text-gray-800">🎵 Spotify Web Player Test</h1>
          <p className="text-gray-600 mb-6">
            Sign in with Spotify to test full track playback with the Web Playback SDK
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> Full track playback requires Spotify Premium.
            </p>
          </div>
          <button
            onClick={() => signIn('spotify')}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-colors w-full"
          >
            Sign in with Spotify
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">🎵 Spotify Web Player Test</h1>
              <p className="text-gray-600">Testing full track playback with Web Playback SDK</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Welcome, {session.user?.name}</p>
              <div className={`text-xs px-2 py-1 rounded-full ${
                playerReady ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                Player: {playerReady ? 'Ready' : 'Connecting...'}
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">❌ {error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 🆕 Spotify Web Player */}
          <div className="lg:col-span-2">
            <SpotifyWebPlayer 
              trackUri={selectedTrackUri}
              onPlayerReady={handlePlayerReady}
            />
          </div>

          {/* Playlists Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Your Playlists</h2>
              <button
                onClick={fetchPlaylists}
                disabled={loading}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors text-sm"
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
                    className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-800">{track.name}</h4>
                        <p className="text-sm text-gray-600">{track.artists}</p>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <span>{track.album}</span>
                          <span>•</span>
                          <span>{formatDuration(track.duration_ms)}</span>
                          {!track.hasPreview && (
                            <>
                              <span>•</span>
                              <span className="text-blue-600">SDK only</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        {/* 🆕 Full Track Playback Button */}
                        <button
                          onClick={() => playTrackFull(track)}
                          disabled={!playerReady}
                          className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${
                            playerReady
                              ? 'bg-green-500 hover:bg-green-600 text-white'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          🎵 Play Full
                        </button>
                        
                        {/* 🔄 Keep preview as fallback */}
                        {track.hasPreview ? (
                          <button
                            onClick={() => playPreview(track)}
                            className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm transition-colors"
                          >
                            ▶️ Preview
                          </button>
                        ) : (
                          <button
                            disabled
                            className="px-3 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed"
                          >
                            No Preview
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {tracks.length === 0 && !loading && (
                  <p className="text-gray-500 text-center py-4">
                    No tracks found in this playlist
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

        {/* Loading Indicator */}
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                <span>Loading...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}