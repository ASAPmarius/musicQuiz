'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useSocket } from '@/lib/useSocket'
import { useTokenRefresh } from '@/lib/hooks/useTokenRefresh'
import { LobbyPlayer, GameData } from '@/lib/types/game'
import { useRetryableFetch } from '@/lib/hooks/useRetryableFetch'

interface SongLoadingProps {
  params: Promise<{
    code: string
  }>
}

interface Playlist {
  id: string
  name: string
  tracks: { total: number }
  images: Array<{ url: string }>
}

export default function SongLoading({ params }: SongLoadingProps) {
  const { data: session } = useSession()
  const router = useRouter()
  
  // 🆕 ADD TOKEN REFRESH HOOK
  const { isAuthenticated, needsReauth } = useTokenRefresh()
  
  const [gameCode, setGameCode] = useState<string>('')
  const [game, setGame] = useState<GameData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [currentPlayer, setCurrentPlayer] = useState<LobbyPlayer | null>(null)
  
  // Playlist selection state (for current player)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set())
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [loadingSongs, setLoadingSongs] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string>('')
  const [songBreakdown, setSongBreakdown] = useState<any>(null)

  // Add ref to prevent excessive API calls
  const lastFetchTime = useRef<number>(0)
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null)

  const { execute: executeWithRetry } = useRetryableFetch({
    maxRetries: 3,
    baseDelay: 1000
  })

  const userInfo = useMemo(() => {
    if (session?.user?.id && currentPlayer?.displayName) {
      return { userId: session.user.id, displayName: currentPlayer.displayName }
    }
    return undefined
  }, [session?.user?.id, currentPlayer?.displayName]) // Only change when these values actually change

  const { isConnected, updatePlayerStatus, socket } = useSocket(gameCode, userInfo)

  if (needsReauth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg p-8 max-w-md">
          <h2 className="text-xl font-semibold mb-4 text-yellow-800">🔄 Refreshing Authentication</h2>
          <p className="text-yellow-700 mb-4">
            Your Spotify session has expired. We're refreshing your connection...
          </p>
          <div className="animate-spin w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center bg-red-50 border border-red-200 rounded-lg p-8 max-w-md">
          <h2 className="text-xl font-semibold mb-4 text-red-800">❌ Authentication Required</h2>
          <p className="text-red-700 mb-4">
            Please sign in to continue loading songs.
          </p>
          <button 
            onClick={() => router.push('/')}
            className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  // Extract game code from params
  useEffect(() => {
    async function extractGameCode() {
      try {
        const resolvedParams = await params
        const extractedCode = resolvedParams.code.toUpperCase()
        console.log('🎯 Extracted gameCode:', extractedCode)
        setGameCode(extractedCode)
      } catch (err) {
        console.error('❌ Failed to extract game code:', err)
        setLoading(false)
      }
    }
    
    extractGameCode()
  }, [params])

  // Fetch game details when we have session and game code
  useEffect(() => {
    if (isAuthenticated && gameCode) {
      console.log('🚀 Starting to fetch game details...')
      setError('') // Clear any previous errors
      fetchGameDetails() // Force initial fetch
    }
  }, [isAuthenticated, gameCode])

  // Add this useEffect to fetch initial game data
  useEffect(() => {
    const initializeGame = async () => {
      if (!gameCode) return
      
      console.log('🚀 Initializing game data for:', gameCode)
      await fetchGameDetails()
    }
    
    initializeGame()
  }, [gameCode]) // Only run when gameCode changes

  // Socket event listeners
  useEffect(() => {
    if (!socket) return
    
    const handleGameUpdate = (data: any) => {
      console.log('🎮 Received game update:', data)
      console.log('🔍 Current game state before update:', game?.players?.map(p => ({
        name: p.displayName,
        playlists: p.playlistsSelected?.length || 0
      })))
      
      if (data.action === 'playlists-changed') {
        console.log('🔄 Player playlists changed, refreshing game data...')
        
        if (fetchTimeout.current) {
          clearTimeout(fetchTimeout.current)
        }
        
        fetchTimeout.current = setTimeout(async () => {
          if (gameCode) {
            await fetchGameDetails()
          }
        }, 500)
      }
      
      if (data.action === 'player-loading-progress') {
        console.log(`📊 Progress update: Player ${data.userId} at ${data.progress}%`)
        
        // 🔧 FIX: Update current player's local state for their own progress
        if (data.userId === session?.user?.id) {
          console.log('📊 Updating MY progress locally:', data.progress)
          setCurrentPlayer(prev => prev ? { 
            ...prev, 
            loadingProgress: Math.round(data.progress) // Round to integer
          } : null)
          
          if (data.message) {
            setLoadingMessage(data.message)
          }
        }
        
        // Update other players' progress in local state
        setGame(prevGame => {
          if (!prevGame) return prevGame
          
          const updatedPlayers = prevGame.players?.map(player => 
            player.userId === data.userId 
              ? { ...player, loadingProgress: Math.round(data.progress) } // Round to integer
              : player
          ) || []
          
          return { ...prevGame, players: updatedPlayers }
        })
      }
      else if (data.action === 'player-songs-ready') {
        console.log('🔄 Player finished loading songs, refreshing game data...')
        
        // Clear any existing timeout
        if (fetchTimeout.current) {
          clearTimeout(fetchTimeout.current)
        }
        
        // Debounced fetch - wait 1 second in case multiple events come in
        fetchTimeout.current = setTimeout(async () => {
          if (gameCode) {
            await fetchGameDetails()
          }
        }, 1000)
      }
      else if (data.action === 'playlists-changed') {
        console.log('🔄 Player playlists changed, refreshing game data...')
        
        // Clear any existing timeout
        if (fetchTimeout.current) {
          clearTimeout(fetchTimeout.current)
        }
        
        // Debounced fetch - wait 500ms in case multiple events come in
        fetchTimeout.current = setTimeout(async () => {
          if (gameCode) {
            await fetchGameDetails()
          }
        }, 500)
      }
    }
    
    socket.on('game-updated', handleGameUpdate)
    
    return () => {
      socket.off('game-updated', handleGameUpdate)
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current)
      }
    }
  }, [socket, gameCode, game, session?.user?.id])

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
      
      // 🔧 CHANGE THIS: Use direct fetch instead of executeWithRetry
      const response = await fetch(`/api/game/${currentGameCode}`)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ API Error:', response.status, errorText)
        throw new Error(`Server error: ${response.status}`)
      }
      
      const data = await response.json()

      console.log('✅ Raw API response:', data.game)
      console.log('🔍 Players playlist data:', data.game.players?.map((p: LobbyPlayer) => ({
        name: p.displayName,
        userId: p.userId,
        playlistsSelected: p.playlistsSelected,
        playlistCount: p.playlistsSelected?.length || 0
      })))

      setGame(data.game)      
      console.log('✅ Received game data:', data.game)
      setGame(data.game)
      
      // Find current player logic stays the same...
      const player = data.game.players.find((p: LobbyPlayer) => p.userId === session?.user?.id)
      setCurrentPlayer(player || null)

    } catch (err) {
      console.error('❌ Fetch error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  const updatePlayerInDB = async (updates: Partial<LobbyPlayer>) => {
    const timestamp = new Date().toISOString()
    console.log(`🔍 ${timestamp} - About to send updates to API:`, updates)
    
    try {
      const response = await fetch(`/api/game/${gameCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerUpdate: updates })
      })
      
      console.log(`🔍 ${timestamp} - API response status:`, response.status)
    } catch (err) {
      console.error(`🔍 ${timestamp} - Failed to update player in DB:`, err)
    }
  }

  // Helper function to estimate total songs
  const getEstimatedSongCount = () => {
    const playlistSongs = Array.from(selectedPlaylistIds)
      .map(id => playlists.find(p => p.id === id)?.tracks?.total || 0)
      .reduce((sum, count) => sum + count, 0)
    
    return playlistSongs + 200 + 300 // + estimated liked songs + estimated albums
  }

  const fetchPlaylists = async () => {
    if (!session?.accessToken) return
    
    setLoadingPlaylists(true)
    
    try {
      // 🔧 CHANGE: Use direct fetch instead of executeWithRetry
      const response = await fetch('/api/spotify/playlists')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch playlists: ${response.status}`)
      }
      
      const data = await response.json()

      setPlaylists(data)
      const allPlaylistIds = new Set<string>(data.map((p: Playlist) => p.id))
      setSelectedPlaylistIds(allPlaylistIds)

    } catch (error) {
      console.error('Failed to fetch playlists:', error)
      setError(error instanceof Error ? error.message : 'Failed to load playlists')
    } finally {
      setLoadingPlaylists(false)
    }
  }

  const togglePlaylistSelection = async (playlistId: string) => {
    const newSelection = new Set<string>(selectedPlaylistIds)
    if (newSelection.has(playlistId)) {
      newSelection.delete(playlistId)
    } else {
      newSelection.add(playlistId)
    }
    setSelectedPlaylistIds(newSelection)
    
    const updates: Partial<LobbyPlayer> = { 
      playlistsSelected: Array.from(newSelection) 
    }
    
    console.log('🔍 DEBUG: About to call updatePlayerInDB with:', updates)
    console.log('🔍 DEBUG: newSelection size:', newSelection.size)
    console.log('🔍 DEBUG: Array.from(newSelection):', Array.from(newSelection))
    
    await updatePlayerInDB(updates)
  }

  const loadSelectedSongs = async () => {
    if (selectedPlaylistIds.size === 0) {
      alert('Please select at least one playlist!')
      return
    }

    setLoadingSongs(true)
    setLoadingMessage('Starting song collection...')
    setSongBreakdown(null)

    try {
      // 🔧 FIX: Use the existing load-songs route with proper progress tracking
      const response = await fetch(`/api/game/${gameCode}/load-songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedPlaylistIds: Array.from(selectedPlaylistIds)
        })
      })

      // Handle token refresh errors
      if (response.status === 401) {
        const errorData = await response.json()
        if (errorData.needsReauth) {
          setError('Your Spotify session has expired. Please refresh the page.')
          return
        }
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to load songs: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log('✅ Songs loaded successfully:', result)
      
      // Map the response to match what your UI expects
      const breakdown = {
        totalSongs: result.songCount || 0,
        sources: [] as string[]
      }
      
      // Add breakdown details if available
      if (result.breakdown) {
        if (result.breakdown.playlists > 0) {
          breakdown.sources.push(`Playlists (${result.breakdown.playlists} songs)`)
        }
        if (result.breakdown.likedSongs > 0) {
          breakdown.sources.push(`Liked Songs (${result.breakdown.likedSongs} songs)`)
        }
        if (result.breakdown.savedAlbums > 0) {
          breakdown.sources.push(`Albums (${result.breakdown.savedAlbums} songs)`)
        }
      } else {
        breakdown.sources = [`Selected Playlists (${selectedPlaylistIds.size} playlists)`]
      }
      
      setSongBreakdown(breakdown)
      setLoadingMessage(`Songs loaded successfully! Found ${breakdown.totalSongs} songs.`)

      // The load-songs route already handles:
      // - Database updates (songsLoaded: true, loadingProgress: 100)
      // - Socket events (player-songs-ready)
      // - Progress tracking
      // So we just need to update local state

      setCurrentPlayer(prev => prev ? { 
        ...prev, 
        songsLoaded: true, 
        loadingProgress: 100 
      } : null)

      console.log('🎉 Song loading process completed successfully!')

    } catch (error) {
      console.error('Failed to load songs:', error)
      setError(error instanceof Error ? error.message : 'Failed to load songs')
      setLoadingMessage('')
      
      // Reset progress on error
      setCurrentPlayer(prev => prev ? { ...prev, loadingProgress: 0 } : null)
      
    } finally {
      setLoadingSongs(false)
    }
  }

  const handleStartGame = () => {
    if (currentPlayer?.isHost && game) {
      const allSongsLoaded = game.players?.every(p => p.songsLoaded) ?? false
      
      if (allSongsLoaded) {
        router.push(`/game/${gameCode}/play`)
      } else {
        alert('All players must load their songs before starting!')
      }
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="text-lg">Loading game...</div>
        {gameCode && <div className="text-sm text-gray-600 mt-2">Game Code: {gameCode}</div>}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 text-lg mb-4">❌ {error}</div>
        <div className="text-sm text-gray-600 mb-4">Game Code: {gameCode}</div>
        <button 
          onClick={() => {
            setError('')
            setLoading(true)
            if (gameCode) fetchGameDetails()
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
        >
          Try Again
        </button>
        <button 
          onClick={() => router.push('/')}
          className="bg-gray-500 text-white px-4 py-2 rounded"
        >
          Go Home
        </button>
      </div>
    )
  }

  if (!game || !currentPlayer) {
    return <div className="p-8">Game not found</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Song Loading - Room {gameCode}</h1>
        <p className="text-gray-600">Select your playlists and load songs for the quiz</p>
      </div>

      <div className="grid gap-6">
        {/* Current Player's Section */}
        <div className="border rounded-lg p-4 bg-blue-50">
          <h2 className="text-xl font-semibold mb-4">
            {currentPlayer.displayName} (You)
          </h2>
          
          {/* Step 1: Load Playlists */}
          {playlists.length === 0 && (
            <button
              onClick={fetchPlaylists}
              disabled={loadingPlaylists}
              className="bg-green-500 text-white px-4 py-2 rounded mr-4 disabled:opacity-50"
            >
              {loadingPlaylists ? 'Loading Playlists...' : 'Load My Playlists'}
            </button>
          )}

          {/* Step 2: Playlist Selection */}
          {playlists.length > 0 && !currentPlayer.songsLoaded && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">
                  Select Playlists ({selectedPlaylistIds.size} selected):
                </h3>
                <div className="max-h-60 overflow-y-auto border rounded p-2">
                  {playlists.map(playlist => (
                    <label key={playlist.id} className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded">
                      <input
                        type="checkbox"
                        checked={selectedPlaylistIds.has(playlist.id)}
                        onChange={() => togglePlaylistSelection(playlist.id)}
                        className="rounded"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{playlist.name}</div>
                        <div className="text-sm text-gray-600">{playlist.tracks.total} songs</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {playlists.length > 0 && !currentPlayer.songsLoaded && !loadingSongs && (
                <div className="flex items-center space-x-4">
                  <button
                    onClick={loadSelectedSongs}
                    disabled={selectedPlaylistIds.size === 0}
                    className="bg-blue-500 text-white px-6 py-2 rounded disabled:opacity-50"
                  >
                    Load Selected Songs
                  </button>
                  
                  {selectedPlaylistIds.size > 0 && (
                    <div className="text-sm text-gray-600">
                      Estimated {getEstimatedSongCount()} songs total
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Loading Progress */}
          {(loadingSongs || (currentPlayer.loadingProgress > 0 && currentPlayer.loadingProgress < 100)) && !currentPlayer.songsLoaded && (
            <div className="mt-4 p-4 bg-yellow-50 rounded">
              <div className="font-medium">Loading songs...</div>
              <div className="text-sm text-gray-600 mt-1">{loadingMessage}</div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(currentPlayer.loadingProgress || 0)}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {Math.round(currentPlayer.loadingProgress || 0)}% complete
              </div>
            </div>
          )}

          {/* Step 4: Completion - UPDATED VERSION */}
          {currentPlayer.songsLoaded && songBreakdown && (
            <div className="mt-4 p-4 bg-green-50 rounded">
              <div className="font-medium text-green-800">✅ Songs loaded successfully!</div>
              <div className="text-sm text-green-600 mt-1">
                Total: {songBreakdown.totalSongs} songs from {songBreakdown.sources?.join(', ')}
              </div>
            </div>
          )}
        </div>

        {/* Other Players Section */}
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Other Players</h2>
          <div className="space-y-3">
            {game.players?.filter(p => p.userId !== currentPlayer.userId).map(player => (
              <div key={player.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <div className="font-medium">{player.displayName}</div>
                  <div className="text-sm text-gray-600">
                    {player.playlistsSelected?.length || 0} playlists selected
                  </div>
                </div>
                <div className="text-right">
                  {player.songsLoaded ? (
                    <span className="text-green-600 font-medium">✅ Ready</span>
                  ) : (
                    <div>
                      <div className="text-sm text-gray-600">{Math.round(player.loadingProgress || 0)}%</div>
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round(player.loadingProgress || 0)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Start Game Button (Host Only) */}
        {currentPlayer.isHost && (
          <div className="text-center">
            <button
              onClick={handleStartGame}
              disabled={!(game.players?.every(p => p.songsLoaded) ?? false)}
              className="bg-green-600 text-white px-8 py-3 rounded-lg text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(game.players?.every(p => p.songsLoaded) ?? false)
                ? 'Start Quiz Game!' 
                : 'Waiting for all players to load songs...'
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}