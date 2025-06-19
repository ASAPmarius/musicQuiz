'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'

interface PremiumCheck {
  method: string
  isPremium: boolean
  evidence: any
  confidence: 'high' | 'medium' | 'low'
  details: string
}

interface DiagnosticResults {
  tokenAnalysis?: {
    hasToken: boolean
    tokenPreview: string
    hasStreaming: boolean
    hasPlaybackModify: boolean
    hasReadPrivate: boolean
    scopeCount: number
    rawScopeString: string
    tokenExpired: boolean
  }
  premiumChecks?: PremiumCheck[]
  streamingTest?: {
    status: number | string
    ok?: boolean
    diagnosis: string
    error?: string
    statusText?: string
    headers?: any
    url?: string
    responseBody?: any
  }
  tokenFreshness?: {
    hasExpiresAt: boolean
    expiresAt: string | number
    isExpired: boolean | string
    timeUntilExpiry: number | string
    hasRefreshToken: boolean
    refreshTokenPreview: string
    recommendation: string
    error?: string
  }
  basicApi?: {
    status: string
    userInfo?: any
    error?: string
  }
  overallDiagnosis?: {
    isPremium: boolean
    confidence: string
    mainIssue: string
    recommendations: string[]
  }
}

export default function EnhancedPremiumDebugger() {
  const { data: session } = useSession()
  const [debugResults, setDebugResults] = useState<DiagnosticResults>({})
  const [isRunning, setIsRunning] = useState(false)

  const runComprehensiveDiagnostic = async () => {
    if (!session?.accessToken) {
      setDebugResults({ tokenAnalysis: { hasToken: false } } as any)
      return
    }

    setIsRunning(true)
    console.log('🔬 Starting comprehensive premium diagnostic...')
    
    const token = (session as any).accessToken
    const results: DiagnosticResults = {}

    // STEP 1: Token Analysis
    try {
      console.log('🧪 Step 1: Deep token analysis...')
      const sessionData = session as any
      const scopes = sessionData?.scope || ''
      const scopeArray = scopes.split(' ').filter(Boolean)
      
      results.tokenAnalysis = {
        hasToken: !!token,
        tokenPreview: token.substring(0, 25) + '...',
        hasStreaming: scopeArray.includes('streaming'),
        hasPlaybackModify: scopeArray.includes('user-modify-playback-state'),
        hasReadPrivate: scopeArray.includes('user-read-private'),
        scopeCount: scopeArray.length,
        rawScopeString: scopes,
        tokenExpired: sessionData.expiresAt ? sessionData.expiresAt < Date.now() / 1000 : false
      }
      
      console.log('🔍 Token analysis complete:', results.tokenAnalysis)
    } catch (error) {
      results.tokenAnalysis = { 
        hasToken: false, 
        error: error instanceof Error ? error.message : 'Token analysis failed' 
      } as any
    }

    // STEP 2: Multiple Premium Detection Methods
    const premiumChecks: PremiumCheck[] = []

    // Method 1: User Profile Check (most reliable for premium detection)
    try {
      console.log('🧪 Step 2a: User profile premium check...')
      const profileResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        const isPremium = profileData.product === 'premium'
        
        premiumChecks.push({
          method: 'User Profile Check',
          isPremium,
          evidence: { 
            product: profileData.product, 
            country: profileData.country,
            followers: profileData.followers?.total 
          },
          confidence: 'high',
          details: `Profile shows product: "${profileData.product}" - ${isPremium ? 'Premium confirmed!' : 'Free account detected'}`
        })

        results.basicApi = {
          status: 'success',
          userInfo: {
            name: profileData.display_name,
            product: profileData.product,
            country: profileData.country,
            followers: profileData.followers?.total
          }
        }
      } else {
        premiumChecks.push({
          method: 'User Profile Check',
          isPremium: false,
          evidence: { status: profileResponse.status, error: await profileResponse.text() },
          confidence: 'medium',
          details: `Profile API failed with ${profileResponse.status} - might indicate API issues`
        })
      }
    } catch (error) {
      premiumChecks.push({
        method: 'User Profile Check',
        isPremium: false,
        evidence: { error: error instanceof Error ? error.message : 'Unknown error' },
        confidence: 'low',
        details: 'Profile check failed due to network/API error'
      })
    }

    // Method 2: Top Tracks Check (premium users typically have more)
    try {
      console.log('🧪 Step 2b: Top tracks count check...')
      const topTracksResponse = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=50', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (topTracksResponse.ok) {
        const topTracksData = await topTracksResponse.json()
        const trackCount = topTracksData.items?.length || 0
        
        premiumChecks.push({
          method: 'Top Tracks Analysis',
          isPremium: trackCount > 20, // Rough heuristic
          evidence: { trackCount, total: topTracksData.total },
          confidence: 'low',
          details: `Found ${trackCount} top tracks. Premium typically has 180+, free has fewer.`
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

    // STEP 3: ✅ Fixed Streaming Test (instead of non-existent web-playback)
    try {
      console.log('🧪 Step 3: Testing streaming capabilities...')
      const streamingResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })
      
      const responseHeaders: any = {}
      streamingResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      results.streamingTest = {
        status: streamingResponse.status,
        statusText: streamingResponse.statusText,
        ok: streamingResponse.ok,
        headers: responseHeaders,
        url: streamingResponse.url,
        responseBody: streamingResponse.ok ? await streamingResponse.json() : await streamingResponse.text(),
        diagnosis: streamingResponse.status === 403 ? 
          'FREE ACCOUNT - Streaming requires Premium!' : 
          streamingResponse.ok ? 'Streaming capabilities confirmed!' : 'Unexpected streaming error'
      }
    } catch (error) {
      results.streamingTest = { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error',
        diagnosis: 'Network error - could not test streaming capabilities'
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
      results.tokenFreshness = { error: 'Token freshness check failed' } as any
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
    } else if (results.streamingTest?.status === 403) {
      mainIssue = 'Premium account detected, but Web Playback SDK not enabled in app settings'
      recommendations.push('Go to Spotify Developer Dashboard → Your App → Edit Settings')
      recommendations.push('Enable "Web Playback SDK" in the APIs section')
      recommendations.push('Save changes and wait 5-10 minutes')
      recommendations.push('Sign out and back in to refresh token with new permissions')
    } else if (!results.tokenAnalysis?.hasStreaming) {
      mainIssue = 'Premium account but missing streaming scope in token'
      recommendations.push('Check your NextAuth configuration includes streaming scope')
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
          <p>✅ <strong>Streaming Testing:</strong> Tests streaming capabilities properly</p>
          <p>✅ <strong>Smart Diagnosis:</strong> Identifies the root cause and gives specific fix recommendations</p>
          <p className="font-medium mt-2 text-purple-700">🔍 This will definitively tell you if premium is the issue!</p>
        </div>
      </div>

      <button
        onClick={runComprehensiveDiagnostic}
        disabled={!session || isRunning}
        className="w-full bg-gradient-to-r from-red-500 to-purple-600 text-white py-4 px-6 rounded-lg font-medium text-lg hover:from-red-600 hover:to-purple-700 disabled:bg-gray-300 mb-6 transition-all"
      >
        {isRunning ? '🔄 Running Comprehensive Diagnostic...' : '🚀 Run Enhanced Premium Diagnostic'}
      </button>

      {/* Results Display */}
      {Object.keys(debugResults).length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">📊 Diagnostic Results</h2>

          {/* Overall Diagnosis */}
          {debugResults.overallDiagnosis && (
            <div className={`border rounded-lg p-6 ${
              debugResults.overallDiagnosis.isPremium ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <h3 className={`font-bold mb-3 ${
                debugResults.overallDiagnosis.isPremium ? 'text-green-800' : 'text-red-800'
              }`}>
                🎯 Overall Diagnosis: {debugResults.overallDiagnosis.isPremium ? 'Premium Account ✅' : 'Free Account ❌'}
              </h3>
              <div className={debugResults.overallDiagnosis.isPremium ? 'text-green-700' : 'text-red-700'}>
                <p className="font-medium mb-2">{debugResults.overallDiagnosis.mainIssue}</p>
                <p className="text-sm mb-3">Confidence: {debugResults.overallDiagnosis.confidence}</p>
                <div>
                  <p className="font-medium mb-2">🛠️ Recommendations:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {debugResults.overallDiagnosis.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Token Analysis */}
          {debugResults.tokenAnalysis && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-bold mb-3">🔑 Token Analysis</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Has Token:</strong> {debugResults.tokenAnalysis.hasToken ? '✅ Yes' : '❌ No'}</p>
                  <p><strong>Token Preview:</strong> {debugResults.tokenAnalysis.tokenPreview || 'None'}</p>
                  <p><strong>Scope Count:</strong> {debugResults.tokenAnalysis.scopeCount || 0}</p>
                  <p><strong>Token Expired:</strong> {debugResults.tokenAnalysis.tokenExpired ? '❌ Yes' : '✅ No'}</p>
                </div>
                <div>
                  <p><strong>Has streaming:</strong> {debugResults.tokenAnalysis.hasStreaming ? '✅ Yes' : '❌ No'}</p>
                  <p><strong>Has playback-modify:</strong> {debugResults.tokenAnalysis.hasPlaybackModify ? '✅ Yes' : '❌ No'}</p>
                  <p><strong>Has user-read-private:</strong> {debugResults.tokenAnalysis.hasReadPrivate ? '✅ Yes' : '❌ No'}</p>
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

          {/* ✅ Updated Streaming Test */}
          {debugResults.streamingTest && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-bold mb-3">🎵 Streaming Capabilities Test</h3>
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-xs mb-2"><strong>URL:</strong> https://api.spotify.com/v1/me/player/devices</p>
                <p><strong>Status:</strong> <span className={`font-mono px-2 py-1 rounded ${
                  debugResults.streamingTest.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {debugResults.streamingTest.status} {debugResults.streamingTest.statusText}
                </span></p>
                <p><strong>Diagnosis:</strong> <span className={
                  debugResults.streamingTest.ok ? 'text-green-600' : 'text-red-600'
                }>{debugResults.streamingTest.diagnosis}</span></p>
                {debugResults.streamingTest.responseBody && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-gray-600">View response</summary>
                    <pre className="mt-2 text-xs bg-white p-2 rounded border overflow-x-auto">
                      {typeof debugResults.streamingTest.responseBody === 'string' 
                        ? debugResults.streamingTest.responseBody 
                        : JSON.stringify(debugResults.streamingTest.responseBody, null, 2)}
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
                <p><strong>Status:</strong> <span className={debugResults.basicApi.status === 'success' ? 
                  'text-green-600' : 'text-red-600'}>{debugResults.basicApi.status}</span></p>
                {debugResults.basicApi.userInfo && (
                  <div className="bg-gray-50 p-3 rounded mt-2">
                    <p><strong>User:</strong> {debugResults.basicApi.userInfo.name || 'Unknown'}</p>
                    <p><strong>Product:</strong> <span className={`font-bold ${
                      debugResults.basicApi.userInfo.product === 'premium' ? 'text-green-600' : 'text-red-600'
                    }`}>{debugResults.basicApi.userInfo.product || 'Unknown'}</span></p>
                    <p><strong>Country:</strong> {debugResults.basicApi.userInfo.country || 'Unknown'}</p>
                    <p><strong>Followers:</strong> {debugResults.basicApi.userInfo.followers || 0}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Premium Checks */}
          {debugResults.premiumChecks && debugResults.premiumChecks.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-bold mb-3">🔍 Premium Detection Methods</h3>
              <div className="space-y-3">
                {debugResults.premiumChecks.map((check, i) => (
                  <div key={i} className={`p-3 rounded border-l-4 ${
                    check.isPremium ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{check.method}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        check.isPremium ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {check.isPremium ? 'PREMIUM' : 'FREE'} ({check.confidence})
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{check.details}</p>
                    <details>
                      <summary className="cursor-pointer text-xs text-gray-500">View evidence</summary>
                      <pre className="mt-1 text-xs bg-white p-2 rounded border">
                        {JSON.stringify(check.evidence, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Token Freshness */}
          {debugResults.tokenFreshness && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-bold mb-3">⏰ Token Freshness Analysis</h3>
              <div className="text-sm space-y-1">
                <p><strong>Expires At:</strong> {debugResults.tokenFreshness.expiresAt}</p>
                <p><strong>Is Expired:</strong> {debugResults.tokenFreshness.isExpired ? '❌ Yes' : '✅ No'}</p>
                <p><strong>Time Until Expiry:</strong> {debugResults.tokenFreshness.timeUntilExpiry} seconds</p>
                <p><strong>Has Refresh Token:</strong> {debugResults.tokenFreshness.hasRefreshToken ? '✅ Yes' : '❌ No'}</p>
                <p className={`font-medium ${debugResults.tokenFreshness.recommendation.includes('expired') ? 'text-red-600' : 'text-green-600'}`}>
                  <strong>Recommendation:</strong> {debugResults.tokenFreshness.recommendation}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}