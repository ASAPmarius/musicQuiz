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
  webPlaybackScopeCheck?: TestResult
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

    // Test the specific URL that's failing
    try {
      console.log('🧪 Testing web-playback scope check...')
      const webPlaybackResponse = await fetch('https://api.spotify.com/v1/melody/v1/check_scope?scope=web-playback', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      
      results.webPlaybackScopeCheck = {
        status: webPlaybackResponse.status,
        ok: webPlaybackResponse.ok,
        error: webPlaybackResponse.ok ? undefined : await webPlaybackResponse.text()
      }
    } catch (error) {
      results.webPlaybackScopeCheck = {
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
  const requiredScopes = ['streaming', 'user-modify-playback-state', 'user-read-playback-state']
  const hasWebPlayback = currentScopes.includes('web-playback')

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
            <p><strong>Has web-playback:</strong> {hasWebPlayback ? '✅ Yes' : '❌ No'}</p>
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
            <p className={hasWebPlayback ? 'text-green-700' : 'text-red-700'}>
              {hasWebPlayback ? '✅' : '❌'} web-playback {hasWebPlayback ? '' : '(MISSING!)'}
            </p>
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
          
          {/* Web Playback Scope Check */}
          <div className="bg-white border rounded-lg p-4">
            <h4 className="font-bold mb-2">🎯 Web Playback Scope Check</h4>
            <p className="text-sm mb-2">This is the exact call that's failing in your player:</p>
            <div className="bg-gray-50 p-3 rounded">
              <p><strong>Status:</strong> {testResults.webPlaybackScopeCheck?.status}</p>
              <p><strong>Success:</strong> {testResults.webPlaybackScopeCheck?.ok ? '✅ Yes' : '❌ No'}</p>
              {testResults.webPlaybackScopeCheck?.error && (
                <p><strong>Error:</strong> <code className="text-red-600">{testResults.webPlaybackScopeCheck.error}</code></p>
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

      {/* Diagnosis */}
      {!hasWebPlayback && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mt-6">
          <h3 className="font-bold text-red-800 mb-3">🚨 Diagnosis: Missing web-playback Scope</h3>
          <div className="text-red-700 space-y-2">
            <p><strong>Problem:</strong> Your token doesn't have the `web-playback` scope that the Web Playback SDK requires.</p>
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
    </div>
  )
}