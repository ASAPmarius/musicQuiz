export default function TestEnv() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-4">🔧 Environment Variables Test</h1>
        
        <div className="space-y-4">
          <div className="p-4 bg-green-50 rounded">
            <h3 className="font-semibold text-green-800">✅ NEXTAUTH_URL</h3>
            <p className="text-green-600">
              {process.env.NEXTAUTH_URL || "❌ Not set"}
            </p>
          </div>
          
          <div className="p-4 bg-blue-50 rounded">
            <h3 className="font-semibold text-blue-800">✅ SPOTIFY_CLIENT_ID</h3>
            <p className="text-blue-600">
              {process.env.SPOTIFY_CLIENT_ID ? "✓ Set (starts with: " + process.env.SPOTIFY_CLIENT_ID.substring(0, 8) + "...)" : "❌ Not set"}
            </p>
          </div>
          
          <div className="p-4 bg-purple-50 rounded">
            <h3 className="font-semibold text-purple-800">🔒 SPOTIFY_CLIENT_SECRET</h3>
            <p className="text-purple-600">
              {process.env.SPOTIFY_CLIENT_SECRET ? "✓ Set (hidden for security)" : "❌ Not set"}
            </p>
          </div>
          
          <div className="p-4 bg-yellow-50 rounded">
            <h3 className="font-semibold text-yellow-800">🔑 NEXTAUTH_SECRET</h3>
            <p className="text-yellow-600">
              {process.env.NEXTAUTH_SECRET ? "✓ Set (hidden for security)" : "❌ Not set"}
            </p>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-gray-50 rounded">
          <p className="text-sm text-gray-600">
            🛡️ Secrets are hidden for security. Only their presence is checked.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Current URL: {typeof window !== 'undefined' ? window.location.href : 'Server-side'}
          </p>
        </div>
      </div>
    </div>
  )
}
