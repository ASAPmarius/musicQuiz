'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'

interface TestResult {
  status: number | string
  ok?: boolean
  error?: string
  data?: any
}

interface DiagnosticResults {
  streamingScopeCheck?: TestResult
  basicApiTest?: TestResult
  devicesTest?: TestResult
  error?: string
}

export default function ScopeDiagnostic() {
  const { data: session } = useSession()
  const [testResults, setTestResults] = useState<DiagnosticResults>({})

  const testScopes = async () => {
    if (!session?.accessToken) {
      setTestResults({ error: 'No access token' })
      return
    }

    const token = (session as any).accessToken
    const results: DiagnosticResults = {}

    // ✅ Test streaming scope by checking devices endpoint
    try {
      console.log('🧪 Testing streaming scope via devices endpoint...')
      const streamingResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      results.streamingScopeCheck = {
        status: streamingResponse.status,
        ok: streamingResponse.ok,
        error: streamingResponse.ok ? undefined : await streamingResponse.text()
      }
    } catch (error) {
      results.streamingScopeCheck = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Test basic Spotify API
    try {
      console.log('🧪 Testing basic Spotify API...')
      const basicResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      results.basicApiTest = {
        status: basicResponse.status,
        ok: basicResponse.ok,
        data: basicResponse.ok ? await basicResponse.json() : await basicResponse.text()
      }
    } catch (error) {
      results.basicApiTest = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Test streaming capabilities
    try {
      console.log('🧪 Testing available devices...')
      const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      results.devicesTest = {
        status: devicesResponse.status,
        ok: devicesResponse.ok,
        data: devicesResponse.ok ? await devicesResponse.json() : await devicesResponse.text()
      }
    } catch (error) {
      results.devicesTest = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    setTestResults(results)
  }

  const currentScopes = ((session as any)?.scope || '').split(' ').filter(Boolean)
  
  // ✅ Updated with correct required scopes for Web Playback SDK
  const requiredScopes = [
    'streaming',                    // The ONLY scope needed for Web Playback SDK
    'user-read-email',             // Required for Web Playback SDK  
    'user-read-private',           // Required for Web Playback SDK
    'user-modify-playback-state',  // For controlling playback
    'user-read-playback-state'     // For reading playback state
  ]
  
  // ✅ Check if all required scopes are present
  const hasAllRequiredScopes = requiredScopes.every(scope => currentScopes.includes(scope))
  const hasStreamingScope = currentScopes.includes('streaming')

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">🔍 Spotify Scope Diagnostic</h1>
      
      {/* Current Status */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-bold mb-3">📋 Current Session</h3>
          <div className="text-sm space-y-1">
            <p><strong>Signed in:</strong> {session ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Total scopes:</strong> {currentScopes.length}</p>
            <p><strong>Has streaming:</strong> {hasStreamingScope ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Has all required:</strong> {hasAllRequiredScopes ? '✅ Yes' : '❌ No'}</p>
            <p><strong>Token preview:</strong> {(session as any)?.accessToken?.substring(0, 20) + '...' || 'None'}</p>
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded">
          <h3 className="font-bold mb-3">🎯 Scope Analysis</h3>
          <div className="text-sm space-y-1">
            {requiredScopes.map((scope: string) => {
              const hasScope = currentScopes.includes(scope)
              return (
                <p key={scope} className={hasScope ? 'text-green-700' : 'text-red-700'}>
                  {hasScope ? '✅' : '❌'} {scope}
                </p>
              )
            })}
          </div>
        </div>
      </div>

      {/* All Current Scopes */}
      <div className="bg-gray-50 p-4 rounded mb-6">
        <h3 className="font-bold mb-3">📝 All Current Scopes</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          {currentScopes.map((scope: string) => (
            <div key={scope} className="font-mono bg-white px-2 py-1 rounded">
              {scope}
            </div>
          ))}
        </div>
      </div>

      {/* Test Button */}
      <button
        onClick={testScopes}
        disabled={!session}
        className="bg-blue-500 text-white px-6 py-3 rounded hover:bg-blue-600 disabled:bg-gray-300 mb-6"
      >
        🧪 Run Diagnostic Tests
      </button>

      {/* Test Results */}
      {Object.keys(testResults).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold">🧪 Test Results</h3>
          
          {/* ✅ Updated Streaming Scope Check */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-bold mb-2">🎯 Streaming Scope Check</h4>
            <p className="text-sm mb-2">Testing streaming capabilities via devices endpoint:</p>
            <div className="bg-gray-50 p-3 rounded">
              <p><strong>Status:</strong> {testResults.streamingScopeCheck?.status}</p>
              <p><strong>Success:</strong> {testResults.streamingScopeCheck?.ok ? '✅ Yes' : '❌ No'}</p>
              {testResults.streamingScopeCheck?.error && (
                <p><strong>Error:</strong> <code className="text-red-600">{testResults.streamingScopeCheck.error}</code></p>
              )}
            </div>
          </div>

          {/* Basic API Test */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-bold mb-2">🔍 Basic Spotify API Test</h4>
            <div className="bg-gray-50 p-3 rounded">
              <p><strong>Status:</strong> {testResults.basicApiTest?.status}</p>
              <p><strong>Success:</strong> {testResults.basicApiTest?.ok ? '✅ Yes' : '❌ No'}</p>
              {testResults.basicApiTest?.data && (
                <div>
                  <p><strong>User:</strong> {testResults.basicApiTest.data.display_name || 'No name'}</p>
                  <p><strong>Product:</strong> {testResults.basicApiTest.data.product || 'Unknown'}</p>
                </div>
              )}
            </div>
          </div>

          {/* Devices Test */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-bold mb-2">🎵 Available Devices Test</h4>
            <div className="bg-gray-50 p-3 rounded">
              <p><strong>Status:</strong> {testResults.devicesTest?.status}</p>
              <p><strong>Success:</strong> {testResults.devicesTest?.ok ? '✅ Yes' : '❌ No'}</p>
              {testResults.devicesTest?.data?.devices && (
                <p><strong>Devices:</strong> {testResults.devicesTest.data.devices.length} found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ✅ Updated Diagnosis */}
      {!hasAllRequiredScopes && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mt-6">
          <h3 className="font-bold text-red-800 mb-3">🚨 Diagnosis: Missing Required Scopes</h3>
          <div className="text-red-700 space-y-2">
            <p><strong>Problem:</strong> Your token doesn't have all the scopes that the Web Playback SDK requires.</p>
            <p><strong>Required Scopes:</strong> streaming, user-read-email, user-read-private, user-modify-playback-state, user-read-playback-state</p>
            <p><strong>Missing Scopes:</strong> {requiredScopes.filter(scope => !currentScopes.includes(scope)).join(', ')}</p>
            <p><strong>Most Likely Cause:</strong> Your Spotify app in the Developer Dashboard doesn't have "Web Playback SDK" enabled.</p>
            <p><strong>Solution:</strong></p>
            <ol className="list-decimal list-inside ml-4 space-y-1">
              <li>Go to <a href="https://developer.spotify.com/dashboard" className="underline" target="_blank">Spotify Developer Dashboard</a></li>
              <li>Find your app and click "Edit Settings"</li>
              <li>Look for "APIs Used" or "Select APIs"</li>
              <li>Make sure "Web Playback SDK" is checked/enabled</li>
              <li>Save changes and wait a few minutes</li>
              <li>Sign out and back in to your app</li>
            </ol>
          </div>
        </div>
      )}

      {/* ✅ Success message when all scopes are present */}
      {hasAllRequiredScopes && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mt-6">
          <h3 className="font-bold text-green-800 mb-3">✅ All Required Scopes Present!</h3>
          <div className="text-green-700 space-y-2">
            <p><strong>Great news!</strong> Your token has all the required scopes for the Web Playback SDK.</p>
            <p><strong>Next steps:</strong> You should now be able to use the Web Playback SDK successfully. If you're still having issues, they're likely related to premium account status or network connectivity.</p>
          </div>
        </div>
      )}
    </div>
  )
}