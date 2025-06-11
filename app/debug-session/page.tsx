'use client'

import { useSession } from "next-auth/react"
import { signIn, signOut } from "next-auth/react"

export default function DebugSession() {
  const { data: session, status } = useSession()

  const testServerSession = async () => {
    try {
      const response = await fetch('/api/debug-session')
      const data = await response.json()
      console.log('Server session data:', data)
      alert('Check console for server session data')
    } catch (error) {
      console.error('Error fetching server session:', error)
    }
  }

  if (status === "loading") {
    return <div className="p-8">Loading session...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold mb-6">🔍 Session Debug Tool</h1>
          
          {!session ? (
            <div className="text-center">
              <p className="mb-4">No session found. Please sign in.</p>
              <button
                onClick={() => signIn('spotify')}
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium"
              >
                Sign in with Spotify
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Sign Out Button */}
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Session Data Analysis</h2>
                <div className="space-x-2">
                  <button
                    onClick={testServerSession}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    Test Server Session
                  </button>
                  <button
                    onClick={() => signOut()}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    Sign Out
                  </button>
                </div>
              </div>

              {/* Client-side Session */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-bold text-blue-800 mb-3">🖥️ Client-side Session (useSession)</h3>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p><strong>Status:</strong> {status}</p>
                      <p><strong>User Name:</strong> {session.user?.name || 'Not available'}</p>
                      <p><strong>User Email:</strong> {session.user?.email || 'Not available'}</p>
                      <p><strong>User Image:</strong> {session.user?.image ? '✅ Yes' : '❌ No'}</p>
                    </div>
                    <div>
                      <p><strong>Access Token:</strong> {(session as any).accessToken ? '✅ Present' : '❌ Missing'}</p>
                      <p><strong>Refresh Token:</strong> {(session as any).refreshToken ? '✅ Present' : '❌ Missing'}</p>
                      <p><strong>Spotify ID:</strong> {(session as any).spotifyId || 'Not available'}</p>
                      <p><strong>Expires:</strong> {(session as any).expires || 'Not available'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Access Token Details */}
              {(session as any).accessToken ? (
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-bold text-green-800 mb-3">✅ Access Token Found</h3>
                  <div className="text-sm text-green-700">
                    <p><strong>Token starts with:</strong> {(session as any).accessToken.substring(0, 20)}...</p>
                    <p><strong>Token length:</strong> {(session as any).accessToken.length} characters</p>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 p-4 rounded-lg">
                  <h3 className="font-bold text-red-800 mb-3">❌ Access Token Missing</h3>
                  <p className="text-red-700 text-sm">
                    This is the problem! Your session doesn't have the Spotify access token.
                    This usually means the NextAuth configuration needs to be fixed.
                  </p>
                </div>
              )}

              {/* Raw Session Data */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-bold text-gray-800 mb-3">🔍 Raw Session Object</h3>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-64">
                  {JSON.stringify(session, null, 2)}
                </pre>
              </div>

              {/* Recommendations */}
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                <h3 className="font-bold text-yellow-800 mb-3">🛠️ Next Steps</h3>
                <ul className="text-yellow-700 text-sm space-y-1 list-disc list-inside">
                  <li>If access token is missing, we need to fix the NextAuth configuration</li>
                  <li>Click "Test Server Session" to see what the server-side session looks like</li>
                  <li>Check the browser console for additional debug information</li>
                  <li>Try signing out and signing in again after fixing the config</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}