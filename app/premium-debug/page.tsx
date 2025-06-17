'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'

export default function ComprehensiveDebugger() {
  const { data: session } = useSession()
  const [debugResults, setDebugResults] = useState<any>({})
  const [isRunning, setIsRunning] = useState(false)

  const runFullDiagnostic = async () => {
    if (!session?.accessToken) {
      setDebugResults({ error: 'No access token' })
      return
    }

    setIsRunning(true)
    const token = (session as any).accessToken
    const results: any = {}

    console.log('🔍 Starting comprehensive diagnostic...')

    // Test 1: Analyze the token itself
    try {
      console.log('🧪 Step 1: Analyzing token...')
      results.tokenAnalysis = {
        preview: token.substring(0, 25) + '...',
        length: token.length,
        startsWithBQ: token.startsWith('BQ'),
        containsSpaces: token.includes(' '),
        containsSpecialChars: /[^a-zA-Z0-9-_]/.test(token),
        scopes: (session as any).scope?.split(' ') || [],
        scopeCount: ((session as any).scope || '').split(' ').length,
        rawScopeString: (session as any).scope || ''
      }
    } catch (error) {
      results.tokenAnalysis = { error: 'Failed to analyze token' }
    }

    // Test 2: Basic Spotify API test + Premium Check
    try {
      console.log('🧪 Step 2: Testing basic Spotify API + Premium check...')
      const meResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (meResponse.ok) {
        const profile = await meResponse.json()
        const isPremium = profile.product === 'premium'
        results.basicApi = {
          status: 'success',
          statusCode: meResponse.status,
          accountType: profile.product,
          isPremium,
          premiumStatus: isPremium ? '✅ PREMIUM CONFIRMED' : '❌ FREE ACCOUNT - THIS IS THE PROBLEM!',
          country: profile.country,
          userId: profile.id,
          displayName: profile.display_name,
          email: profile.email,
          followers: profile.followers?.total || 0,
          marketData: {
            market: profile.country,
            explicitContent: profile.explicit_content || {}
          }
        }
      } else {
        results.basicApi = {
          status: 'error',
          statusCode: meResponse.status,
          error: await meResponse.text()
        }
      }
    } catch (error) {
      results.basicApi = { status: 'error', error: 'Request failed' }
    }

    // Test 3: The exact failing endpoint with detailed analysis
    try {
      console.log('🧪 Step 3: Testing the failing endpoint...')
      const webPlaybackResponse = await fetch('https://api.spotify.com/v1/melody/v1/check_scope?scope=web-playback', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
      
      const responseHeaders: any = {}
      webPlaybackResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      results.webPlaybackTest = {
        status: webPlaybackResponse.status,
        statusText: webPlaybackResponse.statusText,
        ok: webPlaybackResponse.ok,
        headers: responseHeaders,
        url: webPlaybackResponse.url,
        error: webPlaybackResponse.ok ? null : await webPlaybackResponse.text()
      }
    } catch (error) {
      results.webPlaybackTest = { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
    }

    // Test 4: Try alternative endpoints in the melody API
    try {
      console.log('🧪 Step 4: Testing melody API variants...')
      const variants = [
        'https://api.spotify.com/v1/melody/v1/check_scope',
        'https://api.spotify.com/v1/melody/v1/check_scope?scope=streaming',
        'https://api.spotify.com/v1/melody/v1/check_scope?scope=user-modify-playback-state'
      ]

      const variantResults: any = {}
      
      for (const url of variants) {
        try {
          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          variantResults[url] = {
            status: response.status,
            ok: response.ok,
            error: response.ok ? null : await response.text()
          }
        } catch (error) {
          variantResults[url] = { error: 'Request failed' }
        }
      }
      
      results.melodyVariants = variantResults
    } catch (error) {
      results.melodyVariants = { error: 'Variant tests failed' }
    }

    // Test 5: Check app configuration via token introspection
    try {
      console.log('🧪 Step 5: Token introspection...')
      
      // Try to get more info about the token by checking what APIs it can access
      const apiTests = [
        { name: 'Playlists', url: 'https://api.spotify.com/v1/me/playlists?limit=1' },
        { name: 'Player Devices', url: 'https://api.spotify.com/v1/me/player/devices' },
        { name: 'Current Playing', url: 'https://api.spotify.com/v1/me/player/currently-playing' },
        { name: 'Recently Played', url: 'https://api.spotify.com/v1/me/player/recently-played?limit=1' }
      ]

      const apiResults: any = {}
      
      for (const test of apiTests) {
        try {
          const response = await fetch(test.url, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          apiResults[test.name] = {
            status: response.status,
            ok: response.ok || response.status === 204, // 204 is OK for some endpoints
            accessible: response.ok || response.status === 204
          }
        } catch (error) {
          apiResults[test.name] = { error: 'Request failed', accessible: false }
        }
      }
      
      results.apiAccessibility = apiResults
    } catch (error) {
      results.apiAccessibility = { error: 'API tests failed' }
    }

    // Test 6: Check environment and request details
    try {
      console.log('🧪 Step 6: Environment check...')
      results.environment = {
        userAgent: navigator.userAgent,
        origin: window.location.origin,
        protocol: window.location.protocol,
        hostname: window.location.hostname,
        port: window.location.port,
        timestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language
      }
    } catch (error) {
      results.environment = { error: 'Environment check failed' }
    }

    // Test 7: Check if this is a token refresh issue
    try {
      console.log('🧪 Step 7: Token freshness check...')
      const tokenData = (session as any)
      results.tokenFreshness = {
        expiresAt: tokenData.expiresAt,
        currentTime: Math.floor(Date.now() / 1000),
        isExpired: tokenData.expiresAt ? tokenData.expiresAt < Date.now() / 1000 : 'unknown',
        timeUntilExpiry: tokenData.expiresAt ? tokenData.expiresAt - Math.floor(Date.now() / 1000) : 'unknown',
        hasRefreshToken: !!tokenData.refreshToken,
        refreshTokenPreview: tokenData.refreshToken?.substring(0, 20) + '...' || 'none'
      }
    } catch (error) {
      results.tokenFreshness = { error: 'Token freshness check failed' }
    }

    setDebugResults(results)
    setIsRunning(false)
    console.log('🔍 Comprehensive diagnostic complete!')
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">🔬 Comprehensive Web Playback SDK Debugger</h1>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h3 className="font-bold text-blue-800 mb-3">🎯 Current Situation</h3>
        <div className="text-blue-700 space-y-1">
          <p>✅ Web Playback SDK enabled in Developer Dashboard</p>
          <p>✅ Spotify Premium account</p>
          <p>❌ Still getting 403 error on web-playback scope check</p>
          <p className="font-medium mt-2">This suggests a deeper configuration or token issue. Let's investigate...</p>
        </div>
      </div>

      <button
        onClick={runFullDiagnostic}
        disabled={!session || isRunning}
        className="w-full bg-red-500 text-white py-3 px-6 rounded-lg font-medium hover:bg-red-600 disabled:bg-gray-300 mb-6"
      >
        {isRunning ? '🔄 Running Diagnostic...' : '🔬 Run Comprehensive Diagnostic'}
      </button>

      {Object.keys(debugResults).length > 0 && (
        <div className="space-y-6">
          {/* Token Analysis */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-bold mb-3">🔑 Token Analysis</h3>
            {debugResults.tokenAnalysis && (
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Token Preview:</strong> <code className="text-xs">{debugResults.tokenAnalysis.preview}</code></p>
                  <p><strong>Length:</strong> {debugResults.tokenAnalysis.length} chars</p>
                  <p><strong>Format:</strong> {debugResults.tokenAnalysis.startsWithBQ ? '✅ Starts with BQ' : '❌ Unusual format'}</p>
                  <p><strong>Clean:</strong> {!debugResults.tokenAnalysis.containsSpaces && !debugResults.tokenAnalysis.containsSpecialChars ? '✅ No spaces/special chars' : '❌ Contains unusual characters'}</p>
                </div>
                <div>
                  <p><strong>Scope Count:</strong> {debugResults.tokenAnalysis.scopeCount}</p>
                  <p><strong>Raw Scopes:</strong></p>
                  <div className="text-xs font-mono bg-gray-50 p-2 rounded mt-1 max-h-20 overflow-y-auto">
                    {debugResults.tokenAnalysis.rawScopeString || 'None'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Basic API Test */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-bold mb-3">🌐 Basic Spotify API Test</h3>
            {debugResults.basicApi && (
              <div className="text-sm">
                <p><strong>Status:</strong> <span className={debugResults.basicApi.status === 'success' ? 'text-green-600' : 'text-red-600'}>
                  {debugResults.basicApi.statusCode} {debugResults.basicApi.status}
                </span></p>
                {debugResults.basicApi.status === 'success' && (
                  <>
                    <p><strong>Account:</strong> {debugResults.basicApi.accountType} ({debugResults.basicApi.country})</p>
                    <p><strong>User:</strong> {debugResults.basicApi.displayName} ({debugResults.basicApi.userId})</p>
                  </>
                )}
                {debugResults.basicApi.error && (
                  <p><strong>Error:</strong> <code className="text-red-600 text-xs">{debugResults.basicApi.error}</code></p>
                )}
              </div>
            )}
          </div>

          {/* Web Playback Test */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-bold mb-3">🎯 Web Playback Scope Test (The Failing Call)</h3>
            {debugResults.webPlaybackTest && (
              <div className="text-sm space-y-2">
                <p><strong>URL:</strong> <code className="text-xs">https://api.spotify.com/v1/melody/v1/check_scope?scope=web-playback</code></p>
                <p><strong>Status:</strong> <span className={`font-mono ${debugResults.webPlaybackTest.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {debugResults.webPlaybackTest.status} {debugResults.webPlaybackTest.statusText}
                </span></p>
                
                {debugResults.webPlaybackTest.headers && (
                  <div>
                    <p><strong>Response Headers:</strong></p>
                    <div className="text-xs font-mono bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                      {Object.entries(debugResults.webPlaybackTest.headers).map(([key, value]: [string, any]) => (
                        <div key={key}>{key}: {value}</div>
                      ))}
                    </div>
                  </div>
                )}
                
                {debugResults.webPlaybackTest.error && (
                  <div>
                    <p><strong>Error Response:</strong></p>
                    <div className="text-xs font-mono bg-red-50 p-2 rounded text-red-700">
                      {debugResults.webPlaybackTest.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* API Accessibility */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-bold mb-3">🔍 API Accessibility Test</h3>
            {debugResults.apiAccessibility && (
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                {Object.entries(debugResults.apiAccessibility).map(([name, result]: [string, any]) => (
                  <div key={name} className="bg-gray-50 p-3 rounded">
                    <p><strong>{name}:</strong></p>
                    <p className={result.accessible ? 'text-green-600' : 'text-red-600'}>
                      {result.status} {result.accessible ? '✅' : '❌'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Token Freshness */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-bold mb-3">⏰ Token Freshness</h3>
            {debugResults.tokenFreshness && (
              <div className="text-sm">
                <p><strong>Expires At:</strong> {debugResults.tokenFreshness.expiresAt ? new Date(debugResults.tokenFreshness.expiresAt * 1000).toLocaleString() : 'Unknown'}</p>
                <p><strong>Is Expired:</strong> <span className={debugResults.tokenFreshness.isExpired ? 'text-red-600' : 'text-green-600'}>
                  {debugResults.tokenFreshness.isExpired ? '❌ Yes' : '✅ No'}
                </span></p>
                <p><strong>Time Until Expiry:</strong> {debugResults.tokenFreshness.timeUntilExpiry !== 'unknown' ? `${Math.floor(debugResults.tokenFreshness.timeUntilExpiry / 60)} minutes` : 'Unknown'}</p>
                <p><strong>Has Refresh Token:</strong> {debugResults.tokenFreshness.hasRefreshToken ? '✅ Yes' : '❌ No'}</p>
              </div>
            )}
          </div>

          {/* Analysis */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="font-bold text-yellow-800 mb-3">🔍 Analysis & Next Steps</h3>
            <div className="text-yellow-700 space-y-2">
              {debugResults.basicApi?.status === 'success' && debugResults.webPlaybackTest?.status === 403 && (
                <div className="bg-red-100 border border-red-300 rounded p-3">
                  <p className="text-red-700 font-bold">🎯 Token Works for Basic API but Fails for Web Playback</p>
                  <p className="text-red-700 text-sm">This suggests your app configuration might not be fully propagated, or there's a specific issue with the melody API endpoint.</p>
                </div>
              )}
              
              {debugResults.tokenFreshness?.isExpired && (
                <div className="bg-orange-100 border border-orange-300 rounded p-3">
                  <p className="text-orange-700 font-bold">⏰ Token is Expired</p>
                  <p className="text-orange-700 text-sm">Try signing out and signing back in to get a fresh token.</p>
                </div>
              )}

              <div className="bg-blue-100 border border-blue-300 rounded p-3">
                <p className="text-blue-700 font-bold">🛠️ Possible Solutions:</p>
                <ul className="text-blue-700 text-sm mt-2 list-disc list-inside space-y-1">
                  <li>Wait 10-15 minutes for Spotify's systems to propagate your Web Playback SDK enablement</li>
                  <li>Try creating a completely new Spotify app from scratch</li>
                  <li>Check if your redirect URI exactly matches: <code>http://localhost:3000/api/auth/callback/spotify</code></li>
                  <li>Contact Spotify Developer Support with this diagnostic data</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {!session && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-700 mb-3">Sign in to run comprehensive diagnostic</p>
          <a
            href="/api/auth/signin/spotify"
            className="inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            🎵 Sign In with Spotify
          </a>
        </div>
      )}
    </div>
  )
}