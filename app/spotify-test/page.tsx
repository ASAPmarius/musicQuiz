'use client'

import { useSession } from "next-auth/react"
import { signIn } from "next-auth/react"
import { useState, useEffect } from "react"

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: Array<{ url: string }>;
  tracks: { total: number };
  owner: { display_name: string };
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  preview_url: string | null;
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
}

export default function SpotifyTest() {
  const { data: session, status } = useSession()
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null)
  const [tracks, setTracks] = useState<SpotifyTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null)

  // Load user's playlists when they log in
  useEffect(() => {
    if (session?.accessToken) {
      fetchPlaylists()
    }
  }, [session])

  const fetchPlaylists = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/spotify/playlists')
      if (!response.ok) throw new Error('Failed to fetch playlists')
      
      const data = await response.json()
      setPlaylists(data.items || [])
    } catch (err) {
      setError('Failed to load playlists: ' + (err as Error).message)
      console.error('Error fetching playlists:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPlaylistTracks = async (playlistId: string) => {
    setLoading(true)
    setError(null)
    setSelectedPlaylist(playlistId)
    try {
      // Fetch tracks with previews only (for the quiz)
      const response = await fetch(`/api/spotify/playlist/${playlistId}/tracks?previews_only=true`)
      if (!response.ok) throw new Error('Failed to fetch tracks')
      
      const data = await response.json()
      const trackList = data.items?.map((item: any) => item.track) || []
      setTracks(trackList)
    } catch (err) {
      setError('Failed to load tracks: ' + (err as Error).message)
      console.error('Error fetching tracks:', err)
    } finally {
      setLoading(false)
    }
  }

  const playPreview = (previewUrl: string, trackId: string) => {
    // Stop any currently playing audio
    const currentAudio = document.querySelector('audio[data-playing="true"]') as HTMLAudioElement
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.removeAttribute('data-playing')
    }

    // If clicking the same track, just stop
    if (currentlyPlaying === trackId) {
      setCurrentlyPlaying(null)
      return
    }

    // Play new audio
    const audio = new Audio(previewUrl)
    audio.setAttribute('data-playing', 'true')
    audio.play()
    setCurrentlyPlaying(trackId)

    // Stop when audio ends
    audio.addEventListener('ended', () => {
      setCurrentlyPlaying(null)
    })
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-r from-green-400 to-blue-500 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">🎵 Spotify API Test</h1>
          <p className="mb-6 text-gray-600">
            Sign in to test your Spotify integration
          </p>
          <button
            onClick={() => signIn('spotify')}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg w-full transition-colors"
          >
            Sign in with Spotify
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🎵 Spotify API Test Dashboard
          </h1>
          <p className="text-gray-600">
            Welcome, {session.user?.name}! Let's test your Spotify integration.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">❌ {error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Playlists Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Your Playlists</h2>
              <button
                onClick={fetchPlaylists}
                disabled={loading}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {loading ? '🔄 Loading...' : '🔄 Refresh'}
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {playlists.length === 0 && !loading ? (
                <p className="text-gray-500 text-center py-8">
                  No playlists found. Try refreshing or check your Spotify account.
                </p>
              ) : (
                playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedPlaylist === playlist.id
                        ? 'bg-green-50 border-green-200'
                        : 'hover:bg-gray-50 border-gray-200'
                    }`}
                    onClick={() => fetchPlaylistTracks(playlist.id)}
                  >
                    <div className="flex items-center space-x-3">
                      {playlist.images?.[0] && (
                        <img
                          src={playlist.images[0].url}
                          alt={playlist.name}
                          className="w-12 h-12 rounded object-cover"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {playlist.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {playlist.tracks.total} tracks • by {playlist.owner.display_name}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tracks Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              Tracks with Previews
              {selectedPlaylist && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({tracks.length} playable tracks)
                </span>
              )}
            </h2>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {!selectedPlaylist ? (
                <p className="text-gray-500 text-center py-8">
                  👈 Select a playlist to see tracks with preview clips
                </p>
              ) : tracks.length === 0 && !loading ? (
                <p className="text-gray-500 text-center py-8">
                  😕 No tracks with preview clips found in this playlist.
                  <br />
                  <span className="text-sm">Try a different playlist!</span>
                </p>
              ) : (
                tracks.map((track) => (
                  <div
                    key={track.id}
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {track.album.images?.[0] && (
                        <img
                          src={track.album.images[0].url}
                          alt={track.album.name}
                          className="w-12 h-12 rounded object-cover"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">
                          {track.name}
                        </h4>
                        <p className="text-sm text-gray-500 truncate">
                          {track.artists.map(artist => artist.name).join(', ')}
                        </p>
                      </div>
                      {track.preview_url && (
                        <button
                          onClick={() => playPreview(track.preview_url!, track.id)}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                            currentlyPlaying === track.id
                              ? 'bg-red-500 text-white hover:bg-red-600'
                              : 'bg-green-500 text-white hover:bg-green-600'
                          }`}
                        >
                          {currentlyPlaying === track.id ? '⏹️ Stop' : '▶️ Play'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Success Message */}
        {playlists.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mt-6">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">🎉</span>
              <div>
                <h3 className="font-bold text-green-800">
                  Spotify API Integration Working!
                </h3>
                <p className="text-green-700">
                  Successfully loaded {playlists.length} playlists. 
                  Try clicking on playlists to see tracks with preview clips.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}