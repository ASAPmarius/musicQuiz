'use client'

import { useState, useEffect } from 'react'
import { useSocket } from '@/lib/useSocket'

export default function SocketTest() {
  const [gameCode, setGameCode] = useState<string>('TEST123')
  const [displayName, setDisplayName] = useState<string>('TestPlayer')
  const [loadingProgress, setLoadingProgress] = useState<number>(0)
  const [currentUrl, setCurrentUrl] = useState<string>('Loading...')
  const [socketUrl, setSocketUrl] = useState<string>('Loading...')

  // Set URLs after component mounts (prevents hydration mismatch)
  useEffect(() => {
    setCurrentUrl(window.location.origin)
    setSocketUrl(process.env.NODE_ENV === 'production' ? 'same origin' : window.location.origin)
  }, [])
  
  const { 
    socket, 
    isConnected, 
    gameState, 
    playerStatuses,
    updatePlayerStatus,
    sendGameAction 
  } = useSocket(gameCode)

  const handleUpdateStatus = () => {
    updatePlayerStatus({
      displayName,
      loadingProgress,
      spotifyDeviceId: 'test-device',
      deviceName: 'Test Device',
      songsLoaded: loadingProgress >= 100,
      isReady: loadingProgress >= 100
    })
  }

  const handleGameAction = () => {
    sendGameAction('test-action', {
      message: 'Hello from player!',
      timestamp: new Date().toISOString()
    })
  }

  const simulateLoading = () => {
    setLoadingProgress(0)
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 10
      })
    }, 500)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">🔌 Socket.io Test Page</h1>
      
      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-lg bg-gray-100">
        <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            {socket && <span className="text-sm text-gray-600">ID: {socket.id}</span>}
          </div>
          <div className="text-sm text-gray-600">
            <div>Current URL: {currentUrl}</div>
            <div>Socket connecting to: {socketUrl}</div>
          </div>
        </div>
      </div>

      {/* Game Code */}
      <div className="mb-6 p-4 rounded-lg bg-blue-50">
        <h2 className="text-xl font-semibold mb-2">Game Room</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={gameCode}
            onChange={(e) => setGameCode(e.target.value)}
            className="px-3 py-2 border rounded"
            placeholder="Game Code"
          />
          <span className="px-3 py-2 text-sm text-gray-600">
            Current room: {gameCode}
          </span>
        </div>
      </div>

      {/* Player Controls */}
      <div className="mb-6 p-4 rounded-lg bg-green-50">
        <h2 className="text-xl font-semibold mb-2">Player Status</h2>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="px-3 py-2 border rounded"
              placeholder="Display Name"
            />
          </div>
          
          <div className="flex gap-2 items-center">
            <span>Loading Progress:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={loadingProgress}
              onChange={(e) => setLoadingProgress(Number(e.target.value))}
              className="flex-1"
            />
            <span>{loadingProgress}%</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleUpdateStatus}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              disabled={!isConnected}
            >
              Update Status
            </button>
            
            <button
              onClick={simulateLoading}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              disabled={!isConnected}
            >
              Simulate Loading
            </button>
            
            <button
              onClick={handleGameAction}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
              disabled={!isConnected}
            >
              Send Game Action
            </button>
          </div>
        </div>
      </div>

      {/* Player Statuses */}
      <div className="mb-6 p-4 rounded-lg bg-yellow-50">
        <h2 className="text-xl font-semibold mb-2">All Players ({playerStatuses.size})</h2>
        {playerStatuses.size === 0 ? (
          <p className="text-gray-600">No other players detected</p>
        ) : (
          <div className="space-y-2">
            {Array.from(playerStatuses.entries()).map(([socketId, status]) => (
              <div key={socketId} className="p-2 bg-white rounded border">
                <div className="font-medium">{status.displayName || 'Unknown Player'}</div>
                <div className="text-sm text-gray-600">Socket: {socketId}</div>
                <div className="text-sm">
                  Progress: {status.loadingProgress || 0}% 
                  {status.songsLoaded && <span className="text-green-600"> ✓ Loaded</span>}
                  {status.isReady && <span className="text-blue-600"> ✓ Ready</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Game State */}
      <div className="mb-6 p-4 rounded-lg bg-red-50">
        <h2 className="text-xl font-semibold mb-2">Latest Game State</h2>
        {gameState ? (
          <pre className="text-sm bg-white p-2 rounded border overflow-auto">
            {JSON.stringify(gameState, null, 2)}
          </pre>
        ) : (
          <p className="text-gray-600">No game state received</p>
        )}
      </div>

      {/* Instructions */}
      <div className="p-4 rounded-lg bg-gray-50">
        <h2 className="text-xl font-semibold mb-2">🧪 Test Instructions</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Open this page in multiple browser tabs/windows</li>
          <li>Make sure they all show "Connected"</li>
          <li>Use the same Game Code in all tabs</li>
          <li>Update player status in one tab - others should see it</li>
          <li>Send game actions and see them appear in other tabs</li>
          <li>Test the simulate loading feature</li>
        </ol>
      </div>
    </div>
  )
}