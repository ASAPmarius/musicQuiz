'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRetryableFetch } from '@/lib/hooks/useRetryableFetch'

interface Playlist {
  id: string
  name: string
  tracks: { total: number }
  images: Array<{ url: string }>
}

export default function TestMixer() {
  const { data: session } = useSession()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set())
  const [mixedSongs, setMixedSongs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'playlists' | 'songs'>('playlists')

  const { execute: executeWithRetry } = useRetryableFetch()

  const fetchPlaylists = async () => {
    setLoading(true)
    try {
      const data = await executeWithRetry(async () => {
        const response = await fetch('/api/spotify/playlists')
        
        if (!response.ok) {
          const error = new Error(`Failed to fetch playlists: ${response.status}`)
          ;(error as any).status = response.status
          throw error
        }
        
        return response.json()
      })
      
      setPlaylists(data)
    } catch (error) {
      console.error('Failed to fetch playlists:', error)
    } finally {
      setLoading(false)
    }
  }

  const togglePlaylistSelection = (playlistId: string) => {
    const newSelection = new Set(selectedPlaylistIds)
    if (newSelection.has(playlistId)) {
      newSelection.delete(playlistId)
    } else {
      newSelection.add(playlistId)
    }
    setSelectedPlaylistIds(newSelection)
  }

  const fetchSelectedSongs = async () => {
    setLoading(true)
    try {
      const mockPlayers = [
        { id: '1', name: session?.user?.name || 'Player 1' },
        { id: '2', name: 'Player 2 (also you)' }
      ]
      
      const data = await executeWithRetry(async () => {
        const response = await fetch('/api/game/mix-selected-songs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            players: mockPlayers,
            selectedPlaylistIds: Array.from(selectedPlaylistIds)
          })
        })
        
        if (!response.ok) {
          const error = new Error(`Mixing failed: ${response.status}`)
          ;(error as any).status = response.status
          throw error
        }
        
        return response.json()
      })
      
      setMixedSongs(data.songs)
      setStep('songs')
    } catch (error) {
      console.error('Mixing failed:', error)
    } finally {
      setLoading(false)
    }
  }

  if (step === 'playlists') {
    return (
      <div className="p-8">
        <h1 className="text-2xl mb-4">Select Playlists for Game</h1>
        
        <div className="mb-4">
          <button
            onClick={fetchPlaylists}
            disabled={loading}
            className="bg-green-500 text-white px-4 py-2 rounded mr-4"
          >
            {loading ? 'Loading...' : 'Load My Playlists'}
          </button>

          {selectedPlaylistIds.size > 0 && (
            <button
              onClick={fetchSelectedSongs}
              disabled={loading}
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Fetch Songs from {selectedPlaylistIds.size} Selected Playlist{selectedPlaylistIds.size !== 1 ? 's' : ''}
            </button>
          )}
        </div>

        {playlists.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xl mb-2">Choose Playlists ({selectedPlaylistIds.size} selected)</h2>
            {playlists.map(playlist => (
              <div key={playlist.id} className="flex items-center space-x-3 p-3 border rounded">
                <input
                  type="checkbox"
                  checked={selectedPlaylistIds.has(playlist.id)}
                  onChange={() => togglePlaylistSelection(playlist.id)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="font-bold">{playlist.name}</div>
                  <div className="text-sm text-gray-600">{playlist.tracks.total} tracks</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Songs step (similar to your original design)
  return (
    <div className="p-8">
      <div className="mb-4">
        <button
          onClick={() => setStep('playlists')}
          className="bg-gray-500 text-white px-4 py-2 rounded"
        >
          ← Back to Playlist Selection
        </button>
      </div>

      <h1 className="text-2xl mb-4">Mixed Songs from Selected Playlists</h1>
      
      {mixedSongs.length > 0 && (
        <div className="mt-4">
          <h2 className="text-xl mb-2">Mixed Songs ({mixedSongs.length})</h2>
          <div className="space-y-2">
            {mixedSongs.slice(0, 10).map(song => (
              <div key={song.id} className="border p-2 rounded">
                <div className="font-bold">{song.name}</div>
                <div className="text-sm text-gray-600">
                  {Array.isArray(song.artists) 
                    ? song.artists.map((artist: { name: string }) => artist.name).join(', ')
                    : song.artists
                  }
                </div>
                <div className="text-xs mt-1">
                  Owned by: {song.owners.map((o: any) => 
                    `${o.playerName} (${o.source.type}: ${o.source.name})`
                  ).join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}