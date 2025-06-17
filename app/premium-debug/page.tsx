'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'

interface PremiumCheckResult {
  method: string
  isPremium: boolean
  evidence: any
  confidence: 'high' | 'medium' | 'low'
  details: string
}

interface DebugResults {
  tokenAnalysis?: any
  basicApi?: any
  premiumChecks?: PremiumCheckResult[]
  webPlaybackTest?: any
  melodyApiVariants?: any
  tokenFreshness?: any
  overallDiagnosis?: {
    isPremium: boolean
    confidence: string
    mainIssue: string
    recommendations: string[]
  }
}

export default function EnhancedPremiumDebugger() {
  const { data: session } = useSession()
  const [debugResults, setDebugResults] = useState<DebugResults>({})
  const [isRunning, setIsRunning] = useState(false)

  const runComprehensiveDiagnostic = async () => {
    if (!session?.accessToken) {
      setDebugResults({ overallDiagnosis: { 
        isPremium: false, 
        confidence: 'high', 
        mainIssue: 'No access token found',
        recommendations: ['Please sign in with Spotify']
      }})
      return
    }

    setIsRunning(true)
    const token = (session as any).accessToken
    const results: DebugResults = {}

    console.log('🔍 Starting ENHANCED premium diagnostic...')

    // STEP 1: Token Analysis
    try {
      console.log('🧪 Step 1: Deep token analysis...')
      const scopes = (session as any).scope?.split(' ') || []
      results.tokenAnalysis = {
        preview: token.substring(0, 30) + '...',
        length: token.length,
        startsWithBQ: token.startsWith('BQ'),
        isValidFormat: token.startsWith('BQ') && token.length > 100,
        containsSpaces: token.includes(' '),
        containsSpecialChars: /[^a-zA-Z0-9-_]/.test(token),
        scopes,
        scopeCount: scopes.length,
        hasWebPlayback: scopes.includes('web-playback'),
        hasStreaming: scopes.includes('streaming'),
        hasPlaybackModify: scopes.includes('user-modify-playback-state'),
        rawScopeString: (session as any).scope || '',
        tokenHealth: token.startsWith('BQ') && token.length > 100 && !token.includes(' ') ? '✅ Healthy' : '⚠️ Suspicious'
      }
    } catch (error) {
      results.tokenAnalysis = { error: 'Failed to analyze token' }
    }

    // STEP 2: Multiple Premium Detection Methods
    const premiumChecks: PremiumCheckResult[] = []

    // Method 1: Profile Product Check (most reliable)
    try {
      console.log('🧪 Step 2a: Profile product check...')
      const meResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (meResponse.ok) {
        const profile = await meResponse.json()
        const isPremium = profile.product === 'premium'
        premiumChecks.push({
          method: 'Profile Product Field',
          isPremium,
          evidence: { product: profile.product, country: profile.country },
          confidence: 'high',
          details: isPremium ? 
            `Account shows product: "${profile.product}" - this is premium!` : 
            `Account shows product: "${profile.product}" - this is NOT premium!`
        })

        // Store basic API results too
        results.basicApi = {
          status: 'success',
          statusCode: meResponse.status,
          accountType: profile.product,
          isPremium,
          premiumStatus: isPremium ? '✅ PREMIUM CONFIRMED' : '❌ FREE ACCOUNT DETECTED',
          country: profile.country,
          userId: profile.id,
          displayName: profile.display_name,
          email: profile.email,
          followers: profile.followers?.total || 0,
          explicitContent: profile.explicit_content || {}
        }
      } else {
        premiumChecks.push({
          method: 'Profile Product Field',
          isPremium: false,
          evidence: { error: `HTTP ${meResponse.status}`, response: await meResponse.text() },
          confidence: 'low',
          details: `Failed to get profile: ${meResponse.status}`
        })
      }
    } catch (error) {
      premiumChecks.push({
        method: 'Profile Product Field',
        isPremium: false,
        evidence: { error: error instanceof Error ? error.message : 'Unknown error' },
        confidence: 'low',
        details: 'Network error during profile check'
      })
    }

    // Method 2: Available Markets Check (premium has more markets)
    try {
      console.log('🧪 Step 2b: Markets availability check...')
      const marketsResponse = await fetch('https://api.spotify.com/v1/markets', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (marketsResponse.ok) {
        const marketsData = await marketsResponse.json()
        const marketCount = marketsData.markets?.length || 0
        // Premium accounts typically have access to 180+ markets
        const likelyPremium = marketCount > 150
        premiumChecks.push({
          method: 'Markets Count Analysis',
          isPremium: likelyPremium,
          evidence: { marketCount, markets: marketsData.markets?.slice(0, 10) },
          confidence: 'medium',
          details: `Account has access to ${marketCount} markets. Premium typically has 180+, free has fewer.`
        })
      }
    } catch (error) {
      // This is okay to fail, just skip this check
    }

    // Method 3: Playback State Check (premium can control playback)
    try {
      console.log('🧪 Step 2c: Playback capabilities check...')
      const playbackResponse = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (playbackResponse.status === 200) {
        const playbackData = await playbackResponse.json()
        premiumChecks.push({
          method: 'Playback State Access',
          isPremium: true,
          evidence: { device: playbackData?.device, is_playing: playbackData?.is_playing },
          confidence: 'high',
          details: 'Successfully accessed playback state - this strongly indicates premium!'
        })
      } else if (playbackResponse.status === 204) {
        // No active device, but API access suggests premium
        premiumChecks.push({
          method: 'Playback State Access',
          isPremium: true,
          evidence: { status: 204, meaning: 'No active device but API accessible' },
          confidence: 'medium',
          details: 'Playback API is accessible (no active device) - likely premium'
        })
      } else if (playbackResponse.status === 403) {
        premiumChecks.push({
          method: 'Playback State Access',
          isPremium: false,
          evidence: { status: 403, error: await playbackResponse.text() },
          confidence: 'high',
          details: '403 error on playback - this usually means free account'
        })
      }
    } catch (error) {
      // This check can fail, we'll just skip it
    }

    results.premiumChecks = premiumChecks

    // STEP 3: The Failing Web Playback Test (The Main Problem)
    try {
      console.log('🧪 Step 3: Testing the failing web-playback endpoint...')
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
        responseBody: webPlaybackResponse.ok ? await webPlaybackResponse.json() : await webPlaybackResponse.text(),
        diagnosis: webPlaybackResponse.status === 403 ? 
          'FREE ACCOUNT - Web Playback SDK requires Premium!' : 
          webPlaybackResponse.ok ? 'Premium account confirmed!' : 'Unexpected error'
      }
    } catch (error) {
      results.webPlaybackTest = { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error',
        diagnosis: 'Network error - could not test web playback scope'
      }
    }

    // STEP 4: Token Freshness Analysis
    try {
      console.log('🧪 Step 4: Token freshness analysis...')
      const tokenData = session as any
      results.tokenFreshness = {
        hasExpiresAt: !!tokenData.expiresAt,
        expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt * 1000).toLocaleString() : 'unknown',
        isExpired: tokenData.expiresAt ? tokenData.expiresAt < Date.now() / 1000 : 'unknown',
        timeUntilExpiry: tokenData.expiresAt ? Math.max(0, tokenData.expiresAt - Math.floor(Date.now() / 1000)) : 'unknown',
        hasRefreshToken: !!tokenData.refreshToken,
        refreshTokenPreview: tokenData.refreshToken?.substring(0, 20) + '...' || 'none',
        recommendation: tokenData.expiresAt && tokenData.expiresAt < Date.now() / 1000 ? 
          'Token is expired - refresh needed!' : 'Token appears fresh'
      }
    } catch (error) {
      results.tokenFreshness = { error: 'Token freshness check failed' }
    }

    // STEP 5: Overall Diagnosis
    const premiumVotes = premiumChecks.filter(check => check.isPremium && check.confidence === 'high').length
    const freeVotes = premiumChecks.filter(check => !check.isPremium && check.confidence === 'high').length
    const isPremiumOverall = premiumVotes > freeVotes

    let mainIssue = 'Unknown issue'
    const recommendations: string[] = []

    if (!isPremiumOverall) {
      mainIssue = 'Account is FREE, not Premium - Web Playback SDK requires Premium!'
      recommendations.push('Upgrade to Spotify Premium at https://spotify.com/premium')
      recommendations.push('Web Playback SDK only works with Premium accounts')
    } else if (results.webPlaybackTest?.status === 403) {
      mainIssue = 'Premium account detected, but Web Playback SDK not enabled in app settings'
      recommendations.push('Go to Spotify Developer Dashboard → Your App → Edit Settings')
      recommendations.push('Enable "Web Playback SDK" in the APIs section')
      recommendations.push('Save changes and wait 5-10 minutes')
      recommendations.push('Sign out and back in to refresh token with new permissions')
    } else if (!results.tokenAnalysis?.hasWebPlayback) {
      mainIssue = 'Premium account but missing web-playback scope in token'
      recommendations.push('Check your NextAuth configuration includes web-playback scope')
      recommendations.push('Ensure Web Playback SDK is enabled in Spotify Developer Dashboard')
      recommendations.push('Sign out and back in to get fresh token with correct scopes')
    } else {
      mainIssue = 'Unknown issue - Premium account with correct scopes but still failing'
      recommendations.push('Try clearing browser cache and cookies')
      recommendations.push('Check if Spotify is having API issues')
      recommendations.push('Verify your app has correct redirect URIs in Developer Dashboard')
    }

    results.overallDiagnosis = {
      isPremium: isPremiumOverall,
      confidence: premiumVotes + freeVotes > 0 ? 'high' : 'low',
      mainIssue,
      recommendations
    }

    setDebugResults(results)
    setIsRunning(false)
    console.log('🔍 Enhanced premium diagnostic complete!')
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🔬 Enhanced Premium Debugger</h1>
      
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h3 className="font-bold text-blue-800 mb-3">🎯 What This Debugger Does</h3>
        <div className="text-blue-700 space-y-2">
          <p>✅ <strong>Multiple Premium Checks:</strong> Uses 3+ different methods to verify premium status</p>
          <p>✅ <strong>Token Deep Analysis:</strong> Examines your authentication token for issues</p>
          <p>✅ <strong>Web Playback Testing:</strong> Tests the exact endpoint that's failing</p>
          <p>✅ <strong>Smart Diagnosis:</strong> Identifies the root cause and gives specific fix recommendations</p>
          <p className="font-medium mt-2 text-purple-700">🔍 This will definitively tell you if premium is the issue!</p>
        </div>
      </div>

      <button
        onClick={runComprehensiveDiagnostic}
        disabled={!session || isRunning}
        className="w-full bg-gradient-to-r from-red-500 to-purple-600 text-white py-4 px-6 rounded-lg font-medium text-lg hover:from-red-600 hover:to-purple-700 disabled:bg-gray-300 mb-6 transition-all"
      >
        {isRunning ? '🔄 Running Enhanced Diagnostic...' : '🔬 Run Enhanced Premium Diagnostic'}
      </button>

      {debugResults.overallDiagnosis && (
        <div className={`rounded-lg p-6 mb-6 border-2 ${
          debugResults.overallDiagnosis.isPremium 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <h3 className={`font-bold text-xl mb-3 ${
            debugResults.overallDiagnosis.isPremium ? 'text-green-800' : 'text-red-800'
          }`}>
            🎯 DIAGNOSIS: {debugResults.overallDiagnosis.isPremium ? 'PREMIUM ACCOUNT ✅' : 'FREE ACCOUNT ❌'}
          </h3>
          <div className={debugResults.overallDiagnosis.isPremium ? 'text-green-700' : 'text-red-700'}>
            <p className="text-lg mb-3"><strong>Main Issue:</strong> {debugResults.overallDiagnosis.mainIssue}</p>
            <div>
              <p className="font-bold mb-2">🔧 Recommended Actions:</p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                {debugResults.overallDiagnosis.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {Object.keys(debugResults).length > 0 && (
        <div className="space-y-6">
          {/* Premium Checks Results */}
          {debugResults.premiumChecks && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-bold mb-3">💎 Premium Status Checks</h3>
              <div className="space-y-3">
                {debugResults.premiumChecks.map((check, idx) => (
                  <div key={idx} className={`p-3 rounded border-l-4 ${
                    check.isPremium ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'
                  }`}>
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium">{check.method}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        check.isPremium ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                      }`}>
                        {check.isPremium ? 'PREMIUM' : 'FREE'} ({check.confidence} confidence)
                      </span>
                    </div>
                    <p className="text-sm mb-2">{check.details}</p>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-600">View evidence</summary>
                      <pre className="mt-2 bg-gray-100 p-2 rounded overflow-x-auto">
                        {JSON.stringify(check.evidence, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Token Analysis */}
          {debugResults.tokenAnalysis && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-bold mb-3">🔑 Token Analysis</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Token Preview:</strong> <code className="text-xs bg-gray-100 px-1">{debugResults.tokenAnalysis.preview}</code></p>
                  <p><strong>Length:</strong> {debugResults.tokenAnalysis.length} chars</p>
                  <p><strong>Format:</strong> {debugResults.tokenAnalysis.isValidFormat ? '✅ Valid BQ format' : '❌ Invalid format'}</p>
                  <p><strong>Health:</strong> {debugResults.tokenAnalysis.tokenHealth}</p>
                </div>
                <div>
                  <p><strong>Scope Count:</strong> {debugResults.tokenAnalysis.scopeCount}</p>
                  <p><strong>Has web-playback:</strong> {debugResults.tokenAnalysis.hasWebPlayback ? '✅ Yes' : '❌ No'}</p>
                  <p><strong>Has streaming:</strong> {debugResults.tokenAnalysis.hasStreaming ? '✅ Yes' : '❌ No'}</p>
                  <p><strong>Has playback-modify:</strong> {debugResults.tokenAnalysis.hasPlaybackModify ? '✅ Yes' : '❌ No'}</p>
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-gray-600">View all scopes</summary>
                <div className="mt-2 text-xs font-mono bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                  {debugResults.tokenAnalysis.rawScopeString || 'No scopes found'}
                </div>
              </details>
            </div>
          )}

          {/* Web Playback Test */}
          {debugResults.webPlaybackTest && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-bold mb-3">🎯 Web Playback Scope Test (The Failing Call)</h3>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-xs mb-2"><strong>URL:</strong> https://api.spotify.com/v1/melody/v1/check_scope?scope=web-playback</p>
                <p><strong>Status:</strong> <span className={`font-mono px-2 py-1 rounded ${
                  debugResults.webPlaybackTest.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {debugResults.webPlaybackTest.status} {debugResults.webPlaybackTest.statusText}
                </span></p>
                <p><strong>Diagnosis:</strong> <span className={
                  debugResults.webPlaybackTest.ok ? 'text-green-600' : 'text-red-600'
                }>{debugResults.webPlaybackTest.diagnosis}</span></p>
                {debugResults.webPlaybackTest.responseBody && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-gray-600">View response</summary>
                    <pre className="mt-2 text-xs bg-white p-2 rounded border overflow-x-auto">
                      {typeof debugResults.webPlaybackTest.responseBody === 'string' 
                        ? debugResults.webPlaybackTest.responseBody 
                        : JSON.stringify(debugResults.webPlaybackTest.responseBody, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}

          {/* Basic API Test */}
          {debugResults.basicApi && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-bold mb-3">🌐 Basic Spotify API Test</h3>
              <div className="text-sm space-y-1">
                <p><strong>Status:</strong> <span className={debugResults.basicApi.status === 'success' ? 'text-green-600' : 'text-red-600'}>
                  {debugResults.basicApi.statusCode} {debugResults.basicApi.status}
                </span></p>
                {debugResults.basicApi.status === 'success' && (
                  <>
                    <p><strong>Premium Status:</strong> <span className={debugResults.basicApi.isPremium ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                      {debugResults.basicApi.premiumStatus}
                    </span></p>
                    <p><strong>Account Type:</strong> {debugResults.basicApi.accountType}</p>
                    <p><strong>User:</strong> {debugResults.basicApi.displayName} ({debugResults.basicApi.userId})</p>
                    <p><strong>Country:</strong> {debugResults.basicApi.country}</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Token Freshness */}
          {debugResults.tokenFreshness && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-bold mb-3">⏰ Token Freshness</h3>
              <div className="text-sm space-y-1">
                <p><strong>Expires At:</strong> {debugResults.tokenFreshness.expiresAt}</p>
                <p><strong>Is Expired:</strong> {debugResults.tokenFreshness.isExpired === true ? '❌ Yes' : debugResults.tokenFreshness.isExpired === false ? '✅ No' : 'Unknown'}</p>
                <p><strong>Time Until Expiry:</strong> {debugResults.tokenFreshness.timeUntilExpiry === 'unknown' ? 'Unknown' : `${debugResults.tokenFreshness.timeUntilExpiry} seconds`}</p>
                <p><strong>Has Refresh Token:</strong> {debugResults.tokenFreshness.hasRefreshToken ? '✅ Yes' : '❌ No'}</p>
                <p><strong>Recommendation:</strong> <span className={debugResults.tokenFreshness.recommendation?.includes('expired') ? 'text-red-600' : 'text-green-600'}>
                  {debugResults.tokenFreshness.recommendation}
                </span></p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}