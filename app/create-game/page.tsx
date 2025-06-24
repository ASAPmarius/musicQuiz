'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function CreateGame() {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  
  // Game settings
  const [displayName, setDisplayName] = useState(session?.user?.name || '')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [roundCount, setRoundCount] = useState(15)

  const handleCreateGame = async () => {
    if (!session) {
      setError('You must be logged in to create a game')
      return
    }

    if (!displayName.trim()) {
      setError('Please enter a display name')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/game/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          maxPlayers,
          roundCount
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create game')
      }

      // Redirect to game lobby
      router.push(`/game/${data.game.code}`)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
    } finally {
      setLoading(false)
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">🎵 Create Game</h1>
          <p className="text-gray-600 mb-6">Please sign in to create a game</p>
          <button 
            onClick={() => router.push('/api/auth/signin')}
            className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors w-full"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-2xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🎵 Create Your Game</h1>
          <p className="text-gray-600">Set up your Spotify music quiz and invite friends!</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          
          {/* Host Info */}
          <div className="mb-8 p-4 bg-green-50 rounded-lg">
            <h2 className="text-lg font-semibold text-green-800 mb-2">👑 Game Host</h2>
            <div className="flex items-center gap-3">
              {session.user?.image && (
                <img 
                  src={session.user.image} 
                  alt="Profile" 
                  className="w-10 h-10 rounded-full"
                />
              )}
              <div>
                <div className="font-medium">{session.user?.name}</div>
                <div className="text-sm text-gray-600">{session.user?.email}</div>
              </div>
            </div>
          </div>

          {/* Game Settings */}
          <div className="space-y-6">
            
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Display Name in Game
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter your display name"
                maxLength={20}
              />
              <p className="text-xs text-gray-500 mt-1">This is how other players will see you</p>
            </div>

            {/* Max Players */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Players: {maxPlayers}
              </label>
              <input
                type="range"
                min="2"
                max="12"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>2 players</span>
                <span>12 players</span>
              </div>
            </div>

            {/* Round Count */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Rounds: {roundCount}
              </label>
              <input
                type="range"
                min="5"
                max="30"
                step="5"
                value={roundCount}
                onChange={(e) => setRoundCount(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>5 rounds</span>
                <span>30 rounds</span>
              </div>
            </div>

          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Create Button */}
          <div className="mt-8">
            <button
              onClick={handleCreateGame}
              disabled={loading || !displayName.trim()}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-4 px-6 rounded-lg font-semibold text-lg hover:from-purple-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating Game...
                </div>
              ) : (
                '🚀 Create Game & Get Room Code'
              )}
            </button>
          </div>

          {/* Info */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>After creating, you'll get a 6-character room code to share with friends!</p>
          </div>
        </div>

        {/* Back Button */}
        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/')}
            className="text-gray-600 hover:text-gray-800 transition-colors"
          >
            ← Back to Home
          </button>
        </div>

      </div>
    </div>
  )
}