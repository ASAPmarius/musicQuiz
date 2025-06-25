'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useSocket } from '@/lib/useSocket'
import { LobbyPlayer, GameData } from '@/lib/types/game'
import DeviceSelectionModal from '@/components/DeviceSelectionModal'

interface GameLobbyProps {
  params: Promise<{
    code: string
  }>
}

export default function GameLobby({ params }: GameLobbyProps) {
  const { data: session } = useSession()
  const router = useRouter()
  
  const [gameCode, setGameCode] = useState<string>('')
  const [game, setGame] = useState<GameData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [currentPlayer, setCurrentPlayer] = useState<LobbyPlayer | null>(null)
  const [showDeviceModal, setShowDeviceModal] = useState(false)

  // Socket.io connection for real-time updates
const { 
  isConnected, 
  updatePlayerStatus, 
  sendGameAction,
  socket  // Add this to access socket directly
} = useSocket(gameCode)

useEffect(() => {
  if (!socket) return
  
  const handleGameUpdate = (data: any) => {
    console.log('🎮 Received game update:', data)
    
    if (data.action === 'player-joined') {
      console.log('👥 Someone joined, refreshing game data...')
      fetchGameDetails(gameCode)
    }
    // 🆕 ADD THIS - Handle ready status changes
    else if (data.action === 'player-ready-changed') {
      console.log('✅ Player ready status changed, refreshing game data...')
      fetchGameDetails(gameCode)
    }
  }
  
  socket.on('game-updated', handleGameUpdate)
  
  return () => {
    socket.off('game-updated', handleGameUpdate)
  }
}, [socket, gameCode])

useEffect(() => {
  console.log('🎯 Extracting gameCode from params...')
  params.then(resolvedParams => {
    const extractedCode = resolvedParams.code.toUpperCase()
    console.log('✅ GameCode extracted:', extractedCode)
    setGameCode(extractedCode)
  }).catch(err => {
    console.error('❌ Failed to extract params:', err)
    setLoading(false)
  })
}, [params])

// Load game on mount (only when we have gameCode)
useEffect(() => {
  console.log('🔄 Fetch trigger - session:', !!session, 'gameCode:', gameCode)
  
  if (session && gameCode) {
    console.log('🚀 Triggering fetchGameDetails...')
    fetchGameDetails()
  }
}, [session, gameCode])

// Fetch game details
const fetchGameDetails = async (codeToUse?: string) => {    
  const currentGameCode = codeToUse || gameCode
  console.log('🔍 fetchGameDetails called with gameCode:', currentGameCode)
  
  if (!currentGameCode || currentGameCode.length !== 6) {
    console.log('⚠️ Invalid gameCode, stopping loading')
    setLoading(false)
    return
  }

  try {
    console.log('📡 Making API call to:', `/api/game/${currentGameCode}`)
    const response = await fetch(`/api/game/${currentGameCode}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ API Error:', response.status, errorText)
      throw new Error(`Server error: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('✅ Received game data:', data.game)
    
    setGame(data.game)
    
    // Find current player
    const player = data.game.players.find((p: LobbyPlayer) => p.userId === session?.user?.id)
    setCurrentPlayer(player || null)

  } catch (err) {
    console.error('❌ Fetch error:', err)
    setError(err instanceof Error ? err.message : 'Failed to load game')
  } finally {
    console.log('🏁 Setting loading to false')
    setLoading(false)
  }
}

  // Update player status in database
  const updatePlayerInDB = async (updates: Partial<LobbyPlayer>) => {
    try {
      await fetch(`/api/game/${gameCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerUpdate: updates })
      })
    } catch (err) {
      console.error('Failed to update player in DB:', err)
    }
  }

// Handle device selection
const handleDeviceSelect = async (deviceId: string | null, deviceName: string) => {
  const updates = {
    spotifyDeviceId: deviceId,
    deviceName: deviceName
  }

  // Update local state immediately (for instant feedback)
  if (currentPlayer) {
    const updatedPlayer = { ...currentPlayer, ...updates }
    setCurrentPlayer(updatedPlayer)

    // Update other players via socket
    updatePlayerStatus(updates)

    // Update database
    await updatePlayerInDB(updates)
    
    // 🆕 ADD THIS: Refresh game state from database to get the latest data
    await fetchGameDetails()
  }
}

  const handleReadyToggle = async () => {
    if (!currentPlayer) return

    const newReadyStatus = !currentPlayer.isReady
    const updates = { isReady: newReadyStatus }

    // Update local state
    const updatedPlayer = { ...currentPlayer, isReady: newReadyStatus }
    setCurrentPlayer(updatedPlayer)

    // Update database
    await updatePlayerInDB(updates)

    // Notify other players via socket (with null check)
    if (socket && gameCode) {
      socket.emit('player-ready-changed', {
        gameCode,
        userId: currentPlayer.userId,
        isReady: newReadyStatus,
        playerData: updatedPlayer
      })
    }
  }

  // Handle start game (host only)
  const handleStartGame = () => {
    if (currentPlayer?.isHost && game) {
      const allPlayersReady = game.players.every(p => p.isReady)
      
      if (allPlayersReady) {
        sendGameAction('start-game', { gameCode })
        // Navigate to actual game
        router.push(`/game/${gameCode}/play`)
      } else {
        alert('All players must be ready before starting!')
      }
    }
  }

  // Copy room code to clipboard
  const copyRoomCode = () => {
    navigator.clipboard.writeText(gameCode)
    alert('Room code copied to clipboard!')
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">🎵 Join Game</h1>
          <p className="text-gray-600 mb-6">Please sign in to join the game</p>
          <button 
            onClick={() => router.push('/api/auth/signin')}
            className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors w-full"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  if (loading || !gameCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game...</p>
        </div>
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">❌ Error</h1>
          <p className="text-red-600 mb-6">{error || 'Game not found'}</p>
          <button 
            onClick={() => router.push('/')}
            className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors w-full"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🎵 Game Lobby</h1>
          <div className="flex items-center justify-center gap-4">
            <div className="bg-white px-4 py-2 rounded-lg shadow">
              <span className="text-sm text-gray-600">Room Code:</span>
              <button 
                onClick={copyRoomCode}
                className="ml-2 text-2xl font-bold text-purple-600 hover:text-purple-800"
              >
                {gameCode}
              </button>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Game Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">🎮 Game Info</h2>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Host:</span>
                  <span className="font-medium">{game.host.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Players:</span>
                  <span className="font-medium">{game.players.length}/{game.maxPlayers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Rounds:</span>
                  <span className="font-medium">{game.targetScore}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="font-medium capitalize">{game.status}</span>
                </div>
              </div>

              {/* Device Selection */}
              <div className="mt-6 pt-4 border-t">
                <h3 className="font-semibold mb-2">🎧 Your Spotify Device</h3>
                <div className="text-sm">
                  <div className="font-medium">{currentPlayer?.deviceName || 'No device selected'}</div>
                  <button 
                    onClick={() => setShowDeviceModal(true)}
                    className="text-purple-600 hover:text-purple-800 mt-1 underline"
                  >
                    {currentPlayer?.spotifyDeviceId ? 'Change Device' : 'Select Device'}
                  </button>
                </div>
              </div>

              {/* Ready Status */}
              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={handleReadyToggle}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                    currentPlayer?.isReady 
                      ? 'bg-green-500 text-white hover:bg-green-600' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {currentPlayer?.isReady ? '✅ Ready!' : '⏳ Not Ready'}
                </button>
              </div>

              {/* Start Game (Host Only) */}
              {currentPlayer?.isHost && (
                <div className="mt-4">
                  <button
                    onClick={handleStartGame}
                    disabled={!game.players.every(p => p.isReady)}
                    className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white py-3 px-4 rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🚀 Start Game
                  </button>
                  {!game.players.every(p => p.isReady) && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      All players must be ready to start
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Players List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">👥 Players ({game.players.length})</h2>
              
              <div className="space-y-3">
                {game.players.map((player) => (
                  <div 
                    key={player.userId}
                    className={`p-4 border rounded-lg ${
                      player.userId === session?.user?.id ? 'border-purple-300 bg-purple-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {player.isHost && <span className="text-yellow-500">👑</span>}
                          <span className="font-medium">{player.displayName}</span>
                          {player.userId === session?.user?.id && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">You</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Device Status */}
                        <div className={`text-xs px-2 py-1 rounded ${
                          player.spotifyDeviceId ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {player.spotifyDeviceId ? '🎧' : '🚫'} {player.deviceName}
                        </div>
                        
                        {/* Ready Status */}
                        <div className={`text-xs px-2 py-1 rounded ${
                          player.isReady ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {player.isReady ? '✅ Ready' : '⏳ Not Ready'}
                        </div>
                      </div>
                    </div>

                    {/* Loading Progress */}
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Songs loaded:</span>
                        <span>{player.loadingProgress}%</span>
                      </div>
                      <div className="bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all"
                          style={{ width: `${player.loadingProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Invite More Players */}
              {game.players.length < game.maxPlayers && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg text-center">
                  <p className="text-gray-600 mb-2">Invite more players!</p>
                  <p className="text-sm text-gray-500">Share this room code: <strong>{gameCode}</strong></p>
                </div>
              )}

              {/* Device Selection Modal */}
              <DeviceSelectionModal
                isOpen={showDeviceModal}
                onClose={() => setShowDeviceModal(false)}
                onDeviceSelect={handleDeviceSelect}
                currentDeviceId={currentPlayer?.spotifyDeviceId || null}
                currentDeviceName={currentPlayer?.deviceName || 'No device selected'}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}