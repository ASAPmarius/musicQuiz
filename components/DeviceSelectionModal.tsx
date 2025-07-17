'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRetryableFetch } from '@/lib/hooks/useRetryableFetch'

interface SpotifyDevice {
  id: string
  is_active: boolean
  is_private_session: boolean
  is_restricted: boolean
  name: string
  type: string
  volume_percent: number
  supports_volume: boolean
}

interface DeviceSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onDeviceSelect: (deviceId: string | null, deviceName: string) => void
  currentDeviceId: string | null
  currentDeviceName: string
}

export default function DeviceSelectionModal({ 
  isOpen, 
  onClose, 
  onDeviceSelect, 
  currentDeviceId, 
  currentDeviceName 
}: DeviceSelectionModalProps) {
  const { data: session } = useSession()
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Add retry hook
  const { execute: executeWithRetry, loading: retryLoading, error: retryError } = useRetryableFetch()

  // Reuse the same spotify fetch logic from SpotifyWebPlayer
  const spotifyFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    if (!session?.accessToken) throw new Error('No access token')
    
    const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${(session as any).accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return null
    }

    let data = null
    try {
      data = await response.json()
    } catch (e) {
      if (response.ok) return null
      throw new Error(`API Error: ${response.status}`)
    }
    
    if (!response.ok) {
      const errorMessage = data?.error?.message || `API Error: ${response.status}`
      throw new Error(errorMessage)
    }
    
    return data
  }, [session])

  // Enhanced fetchDevices with retry mechanism
  const fetchDevices = useCallback(async () => {
    if (!isOpen) return // Only fetch when modal is open
    
    setLoading(true)
    setError('')
    
    try {
      const data = await executeWithRetry(() => spotifyFetch('/me/player/devices'))
      const deviceList = data?.devices || []
      setDevices(deviceList)
    } catch (error) {
      console.error('Failed to fetch devices:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch devices')
    } finally {
      setLoading(false)
    }
  }, [isOpen, executeWithRetry, spotifyFetch])

  // Fetch devices when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchDevices()
    }
  }, [isOpen, fetchDevices])

  if (!isOpen) return null

  const handleDeviceChoice = (deviceId: string | null, deviceName: string) => {
    onDeviceSelect(deviceId, deviceName)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">🎧 Select Spotify Device</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Choose where you want to hear the quiz music. If you're in the same room as other players, you can select "No device".
          </p>

          {/* Loading state - Updated to include retry loading */}
          {(loading || retryLoading) && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-2"></div>
              <p>Finding your devices...</p>
              {retryLoading && (
                <p className="text-xs text-gray-500 mt-1">Retrying...</p>
              )}
            </div>
          )}

          {/* Error state - Enhanced with retry information */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-700">❌ {error}</p>
              {retryError && (
                <p className="text-xs text-red-500 mt-1">
                  Attempted multiple retries
                </p>
              )}
              <button 
                onClick={fetchDevices}
                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Device list - Updated loading condition */}
          {!(loading || retryLoading) && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {/* No device option */}
              <button
                onClick={() => handleDeviceChoice(null, 'No device selected')}
                className={`w-full p-3 rounded-lg border text-left transition-colors ${
                  currentDeviceId === null 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">🔇 No device</div>
                    <div className="text-sm text-gray-500">Silent mode (good for same room)</div>
                  </div>
                  {currentDeviceId === null && (
                    <div className="text-purple-600">✓</div>
                  )}
                </div>
              </button>

              {/* Available devices */}
              {devices.map(device => (
                <button
                  key={device.id}
                  onClick={() => handleDeviceChoice(device.id, `${device.name} (${device.type})`)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    currentDeviceId === device.id 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{device.name}</div>
                      <div className="text-sm text-gray-500">
                        {device.type} {device.is_active ? '(Currently active)' : ''}
                      </div>
                    </div>
                    {currentDeviceId === device.id && (
                      <div className="text-green-600">✓</div>
                    )}
                  </div>
                </button>
              ))}

              {/* No devices found - Updated loading condition */}
              {devices.length === 0 && !(loading || retryLoading) && !error && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-800 mb-2">No Spotify devices found</h4>
                  <p className="text-sm text-yellow-700 mb-3">
                    Please open Spotify on one of your devices:
                  </p>
                  <ul className="text-sm text-yellow-700 space-y-1 mb-3">
                    <li>• Spotify desktop app</li>
                    <li>• Spotify mobile app</li> 
                    <li>• Spotify web player (open.spotify.com)</li>
                  </ul>
                  <button 
                    onClick={fetchDevices}
                    className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
                  >
                    🔄 Refresh
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}