'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'

export default function TestMixer() {
  const { data: session } = useSession()
  const [mixedSongs, setMixedSongs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  
  const testMixing = async () => {
    setLoading(true)
    try {
      // For testing, use current user as multiple players
      const mockPlayers = [
        { id: '1', name: session?.user?.name || 'Player 1' },
        { id: '2', name: 'Player 2 (also you)' }
      ]
      
      const response = await fetch('/api/game/mix-songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: mockPlayers })
      })
      
      const data = await response.json()
      setMixedSongs(data.songs)
    } catch (error) {
      console.error('Mixing failed:', error)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="p-8">
      <h1 className="text-2xl mb-4">Song Mixer Test</h1>
      
      <button
        onClick={testMixing}
        disabled={loading}
        className="bg-green-500 text-white px-4 py-2 rounded"
      >
        {loading ? 'Mixing...' : 'Test Song Mixing'}
      </button>
      
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