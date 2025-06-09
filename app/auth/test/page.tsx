'use client'

import { useSession } from "next-auth/react"
import { signIn, signOut } from "next-auth/react"

export default function AuthTest() {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-green-400 to-purple-500 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">
          🎵 Spotify Authentication Test
        </h1>
        
        {!session ? (
          <div className="text-center">
            <p className="mb-4 text-gray-600">
              You are not signed in
            </p>
            <button
              onClick={() => signIn('spotify')}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-colors w-full"
            >
              Sign in with Spotify
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="mb-4">
              {session.user?.image && (
                <img
                  src={session.user.image}
                  alt="Profile"
                  className="w-16 h-16 rounded-full mx-auto mb-4"
                />
              )}
              <h2 className="text-xl font-semibold">
                Welcome, {session.user?.name}!
              </h2>
              <p className="text-gray-600">{session.user?.email}</p>
            </div>
            
            <div className="mb-4 p-3 bg-green-50 rounded">
              <p className="text-sm text-green-800">
                ✅ Authentication successful!
              </p>
              <p className="text-xs text-green-600 mt-1">
                Spotify ID: {(session as any).spotifyId || 'Not available'}
              </p>
            </div>
            
            <button
              onClick={() => signOut()}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-colors w-full"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}