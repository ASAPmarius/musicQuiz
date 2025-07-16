'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function JoinGame() {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  
  const [gameCode, setGameCode] = useState('')
  const [displayName, setDisplayName] = useState(session?.user?.name || '')

  const handleJoinGame = async () => {
    if (!session) {
      setError('You must be logged in to join a game')
      return
    }

    // Basic client-side validation (this now matches server validation)
    if (!gameCode.trim() || gameCode.length !== 6) {
      setError('Please enter a valid 6-character room code')
      return
    }

    if (!displayName.trim()) {
      setError('Please enter a display name')
      return
    }

    if (displayName.length > 20) {
      setError('Display name must be 20 characters or less')
      return
    }

    // Check for invalid characters
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(displayName)) {
      setError('Display name can only contain letters, numbers, spaces, hyphens, and underscores')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/game/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameCode: gameCode.trim(),
          displayName: displayName.trim()
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle specific validation errors
        if (response.status === 429) {
          setError('Too many requests. Please wait a moment and try again.')
        } else if (data.suggestions && data.suggestions.length > 0) {
          // Show suggestions for display name conflicts
          setError(`${data.error} Try: ${data.suggestions.join(', ')}`)
        } else if (data.details && data.details.length > 0) {
          // Show detailed validation errors
          const detailedErrors = data.details.map((detail: any) => detail.message).join(', ')
          setError(detailedErrors)
        } else {
          setError(data.error || 'Failed to join game')
        }
        return
      }

      // Success - redirect to game lobby
      router.push(`/game/${data.game.code}`)

    } catch (err) {
      console.error('Join game error:', err)
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  // Format game code as user types (add spaces every 3 chars)
  const handleGameCodeChange = (value: string) => {
    // Remove spaces and convert to uppercase
    const cleaned = value.replace(/\s/g, '').toUpperCase()
    
    // Limit to 6 characters
    const limited = cleaned.slice(0, 6)
    
    setGameCode(limited)
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">🎵 Join Game</h1>
          <p className="text-gray-600 mb-6">Please sign in to join a game</p>
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <div className="max-w-md mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🎵 Join Game</h1>
          <p className="text-gray-600">Enter the room code to join your friends!</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          
          {/* Player Info */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-800 mb-2">👤 Your Info</h2>
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

          {/* Form */}
          <div className="space-y-6">
            
            {/* Room Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                6-Character Room Code
              </label>
              <input
                type="text"
                value={gameCode}
                onChange={(e) => handleGameCodeChange(e.target.value)}
                className="w-full px-4 py-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-center text-2xl font-bold tracking-widest uppercase"
                placeholder="ABC123"
                maxLength={6}
              />
              <p className="text-xs text-gray-500 mt-1">Ask the host for the room code</p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Display Name in Game
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Enter your display name"
                maxLength={20}
              />
              <p className="text-xs text-gray-500 mt-1">This is how other players will see you</p>
            </div>

          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Join Button */}
          <div className="mt-8">
            <button
              onClick={handleJoinGame}
              disabled={loading || !gameCode.trim() || !displayName.trim() || gameCode.length !== 6}
              className="w-full bg-gradient-to-r from-green-500 to-blue-500 text-white py-4 px-6 rounded-lg font-semibold text-lg hover:from-green-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Joining Game...
                </div>
              ) : (
                '🎯 Join Game'
              )}
            </button>
          </div>

          {/* Requirements */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Make sure you have the correct 6-character room code!</p>
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