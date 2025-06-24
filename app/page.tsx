'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-xl text-purple-800">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="mb-6">
            <h1 className="text-4xl font-bold mb-2">🎵 Spotify Quiz</h1>
            <p className="text-gray-600">
              Guess who owns which songs in this multiplayer music quiz game!
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="text-left text-sm text-gray-600 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>Play songs from your Spotify playlists</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>Guess which player owns each song</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>Real-time multiplayer with friends</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                <span>Works on mobile and desktop</span>
              </div>
            </div>

            <button 
              onClick={() => signIn('spotify')}
              className="w-full bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              <span>🎧</span>
              Sign in with Spotify
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            We only access your playlists and basic profile info
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">🎵 Spotify Quiz</h1>
          <p className="text-xl text-gray-600 mb-6">
            Guess who owns which songs with your friends!
          </p>
          
          {/* User Info */}
          <div className="inline-flex items-center gap-3 bg-white px-4 py-2 rounded-lg shadow">
            {session.user?.image && (
              <img 
                src={session.user.image} 
                alt="Profile" 
                className="w-8 h-8 rounded-full"
              />
            )}
            <span className="font-medium">Welcome, {session.user?.name}!</span>
            <button
              onClick={() => signOut()}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Main Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          
          {/* Create Game */}
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🎮</div>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Create Game</h2>
            <p className="text-gray-600 mb-6">
              Start a new game and invite your friends to join. You'll be the host and control the game settings.
            </p>
            <button
              onClick={() => router.push('/create-game')}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 px-6 rounded-lg font-semibold text-lg hover:from-purple-600 hover:to-blue-600 transition-all"
            >
              🚀 Create New Game
            </button>
          </div>

          {/* Join Game */}
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Join Game</h2>
            <p className="text-gray-600 mb-6">
              Have a room code from a friend? Enter it here to join their game and start playing together.
            </p>
            <button
              onClick={() => router.push('/join-game')}
              className="w-full bg-gradient-to-r from-green-500 to-blue-500 text-white py-3 px-6 rounded-lg font-semibold text-lg hover:from-green-600 hover:to-blue-600 transition-all"
            >
              🎯 Join Existing Game
            </button>
          </div>
        </div>

        {/* How to Play */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">🎲 How to Play</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-4xl mb-3">1️⃣</div>
              <h3 className="font-semibold mb-2">Create or Join</h3>
              <p className="text-sm text-gray-600">Host creates a room and shares the code, or join with a friend's code</p>
            </div>
            
            <div>
              <div className="text-4xl mb-3">2️⃣</div>
              <h3 className="font-semibold mb-2">Select Music</h3>
              <p className="text-sm text-gray-600">Choose which playlists to include and set up your Spotify device</p>
            </div>
            
            <div>
              <div className="text-4xl mb-3">3️⃣</div>
              <h3 className="font-semibold mb-2">Vote & Guess</h3>
              <p className="text-sm text-gray-600">Listen to songs and vote for who you think owns each track</p>
            </div>
            
            <div>
              <div className="text-4xl mb-3">4️⃣</div>
              <h3 className="font-semibold mb-2">Win Points</h3>
              <p className="text-sm text-gray-600">Get +3 points for each correct guess, -1 for wrong guesses</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 text-center">
          <div className="inline-flex gap-4">
            <button
              onClick={() => router.push('/spotify-test')}
              className="text-gray-600 hover:text-gray-800 transition-colors"
            >
              🧪 Test Spotify Connection
            </button>
            <span className="text-gray-400">•</span>
            <button
              onClick={() => router.push('/socket-test')}
              className="text-gray-600 hover:text-gray-800 transition-colors"
            >
              🔌 Test Real-time Features
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}