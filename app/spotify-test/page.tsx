// app/spotify-test/page.tsx
'use client'

import { useSession } from "next-auth/react"
import { signIn, signOut } from "next-auth/react"
import { useState, useEffect } from "react"

interface Track {
  id: string
  name: string
  artists: string
  preview_url: string
  album: string
  duration_ms: number
}

interface Playlist {
  id: string
  name: string
  description: string
  tracks: { total: number }
  images: Array<{ url: string }>
  owner: string
  public: boolean
}

export default function SpotifyTest() {
  const { data: session, status } = useSession()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [playingTrack, setPlayingTrack] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch playlists when user is authenticated
  useEffect(() => {
    if (session?.accessToken) {
      fetchPlaylists()
    }
  }, [session])

  const fetchPlaylists = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/spotify/playlists')
      if (!response.ok) {
        throw new Error(`Failed to fetch playlists: ${response.status}`)
      }
      
      const data = await response.json()
      setPlaylists(data.playlists)
    } catch (err) {
      console.error('Error fetching playlists:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch playlists')
    } finally {
      setLoading(false)
    }
  }

  const fetchTracks = async (playlistId: string) => {
    try {
      setLoading(true)
      setError(null)
      setSelectedPlaylist(playlistId)
      
      const response = await fetch(`/api/spotify/playlist/${playlistId}/tracks`)
      if (!response.ok) {
        throw new Error(`Failed to fetch tracks: ${response.status}`)
      }
      
      const data = await response.json()
      setTracks(data.tracks)
    } catch (err) {
      console.error('Error fetching tracks:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch tracks')
    } finally {
      setLoading(false)
    }
  }

  const playPreview = (track: Track) => {
    // Stop current audio if playing
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
    }

    if (playingTrack === track.id) {
      // If same track, stop playing
      setPlayingTrack(null)
      setCurrentAudio(null)
      return
    }

    // Play new track
    const audio = new Audio(track.preview_url)
    audio.play()
    setCurrentAudio(audio)
    setPlayingTrack(track.id)

    // Auto-stop when track ends
    audio.onended = () => {
      setPlayingTrack(null)
      setCurrentAudio(null)
    }
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
          <h1 className="text-2xl font-bold mb-4 text-gray-800">🎵 Spotify Test</h1>
          <p className="text-gray-600 mb-6">
            Sign in with Spotify to test playlist loading and track previews
          </p>
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
              <h1 className="text-3xl font-bold text-gray-800">🎵 Spotify Test</h1>
              <p className="text-gray-600">Welcome, {session.user?.name}!</p>
            </div>
            <button
              onClick={() => signOut()}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Playlists */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Your Playlists</h2>
              <button
                onClick={fetchPlaylists}
                disabled={loading}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm transition-colors"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  onClick={() => fetchTracks(playlist.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedPlaylist === playlist.id
                      ? 'bg-green-100 border-2 border-green-500'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {playlist.images[0] && (
                      <img
                        src={playlist.images[0].url}
                        alt={playlist.name}
                        className="w-12 h-12 rounded"
                      />
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-800">{playlist.name}</h3>
                      <p className="text-sm text-gray-600">{playlist.tracks.total} tracks</p>
                    </div>
                  </div>
                </div>
              ))}
              
              {playlists.length === 0 && !loading && (
                <p className="text-gray-500 text-center py-4">No playlists found</p>
              )}
            </div>
          </div>

          {/* Tracks */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Track Previews</h2>
            
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
                        <p className="text-xs text-gray-500">{track.album} • {formatDuration(track.duration_ms)}</p>
                      </div>
                      <button
                        onClick={() => playPreview(track)}
                        className={`ml-4 px-4 py-2 rounded-lg font-medium transition-colors ${
                          playingTrack === track.id
                            ? 'bg-red-500 hover:bg-red-600 text-white'
                            : 'bg-green-500 hover:bg-green-600 text-white'
                        }`}
                      >
                        {playingTrack === track.id ? '⏹️ Stop' : '▶️ Play'}
                      </button>
                    </div>
                  </div>
                ))}
                
                {tracks.length === 0 && !loading && (
                  <p className="text-gray-500 text-center py-4">
                    No tracks with previews found in this playlist
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