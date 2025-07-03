'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useSocket } from '@/lib/useSocket'
import { LobbyPlayer, GameData } from '@/lib/types/game'

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

  const { isConnected, updatePlayerStatus, socket } = useSocket(gameCode)

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
    if (session && gameCode) {
      console.log('🚀 Starting to fetch game details...')
      setError('') // Clear any previous errors
      fetchGameDetails(true) // Force initial fetch
    }
  }, [session, gameCode])

  // Socket event listeners
  useEffect(() => {
    if (!socket) return
    
    const handleGameUpdate = (data: any) => {
      console.log('🔔 Received game update:', data)
      
      if (data.action === 'player-loading-progress') {
        // Handle progress updates locally without refetching
        if (data.userId === session?.user?.id && data.message) {
          setLoadingMessage(data.message)
        }
        
        // Update other players' progress in local state
        setGame(prevGame => {
          if (!prevGame) return prevGame
          
          const updatedPlayers = prevGame.players?.map(player => 
            player.userId === data.userId 
              ? { ...player, loadingProgress: data.progress }
              : player
          ) || []
          
          return { ...prevGame, players: updatedPlayers }
        })
      }
      else if (data.action === 'player-playlists-selected') {
        // Update playlist selection in local state
        setGame(prevGame => {
          if (!prevGame) return prevGame
          
          const updatedPlayers = prevGame.players?.map(player => 
            player.userId === data.userId 
              ? { ...player, playlistsSelected: data.playlistIds || player.playlistsSelected }
              : player
          ) || []
          
          return { ...prevGame, players: updatedPlayers }
        })
      }
      else if (data.action === 'player-songs-ready') {
        // Handle song completion - only refresh for major changes
        console.log('🔄 Player finished loading songs, refreshing game data...')
        
        // Clear the timeout if it exists
        if (fetchTimeout.current) {
          clearTimeout(fetchTimeout.current)
        }
        
        // Debounced fetch - wait 1 second in case multiple events come in
        fetchTimeout.current = setTimeout(() => {
          if (gameCode) {
            fetchGameDetails(true) // Force refresh for major changes
          }
        }, 1000)
      }
    }
    
    socket.on('game-updated', handleGameUpdate)
    return () => {
      socket.off('game-updated', handleGameUpdate)
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current)
      }
    }
  }, [socket, gameCode, session?.user?.id]) // Add gameCode as dependency

  const fetchGameDetails = async (force = false) => {
    if (!gameCode) {
      console.error('❌ No gameCode available for API call')
      setLoading(false)
      return
    }

    // Debouncing: prevent too frequent API calls (unless forced)
    const now = Date.now()
    if (!force && now - lastFetchTime.current < 2000) {
      console.log('🚫 Skipping API call - too soon since last fetch')
      return
    }
    lastFetchTime.current = now
    
    setLoading(true)
    
    try {
      console.log('🔄 Fetching game details for code:', gameCode)
      const response = await fetch(`/api/game/${gameCode}`)
      
      console.log('📡 API Response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ API Error:', response.status, errorText)
        throw new Error(`Game not found (${response.status})`)
      }
      
      const apiResponse = await response.json()
      console.log('✅ API Response received')
      
      // Handle the actual API response structure: { success: true, game: {...} }
      if (!apiResponse.success || !apiResponse.game) {
        console.error('❌ Invalid API response structure:', apiResponse)
        throw new Error('Invalid API response')
      }
      
      const gameData: GameData = apiResponse.game
      console.log('🎮 Game data loaded')
      setGame(gameData)
      
      const player = gameData.players?.find(p => p.userId === session?.user?.id)
      if (player) {
        console.log('👤 Current player found')
        setCurrentPlayer(player)
        // Restore selected playlists from database
        setSelectedPlaylistIds(new Set(player.playlistsSelected || []))
      } else {
        console.error('❌ Current player not found in game')
      }
    } catch (err) {
      console.error('💥 Failed to load game:', err)
      setError(err instanceof Error ? err.message : 'Failed to load game')
    } finally {
      setLoading(false)
    }
  }

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

  // Helper function to estimate total songs
  const getEstimatedSongCount = () => {
    const playlistSongs = Array.from(selectedPlaylistIds)
      .map(id => playlists.find(p => p.id === id)?.tracks?.total || 0)
      .reduce((sum, count) => sum + count, 0)
    
    return playlistSongs + 200 + 300 // + estimated liked songs + estimated albums
  }

  // Load user's playlists
  const fetchPlaylists = async () => {
    setLoadingPlaylists(true)
    try {
      const response = await fetch('/api/spotify/playlists')
      const data: Playlist[] = await response.json()
      setPlaylists(data)
      
      // Pre-select all playlists (user can uncheck what they don't want)
      const allIds = new Set<string>(data.map((p: Playlist) => p.id))
      setSelectedPlaylistIds(allIds)
      
      // Update database with pre-selected playlists
      const updates: Partial<LobbyPlayer> = { 
        playlistsSelected: Array.from(allIds) 
      }
      await updatePlayerInDB(updates)
      
      // Update socket status
      const statusUpdate = { 
        playlistsSelected: Array.from(allIds) 
      }
      updatePlayerStatus(statusUpdate)
      
    } catch (error) {
      console.error('Failed to fetch playlists:', error)
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
    
    // Update database and notify other players
    const updates: Partial<LobbyPlayer> = { 
      playlistsSelected: Array.from(newSelection) 
    }
    await updatePlayerInDB(updates)
    
    // Update socket status
    const statusUpdate = { 
      playlistsSelected: Array.from(newSelection) 
    }
    updatePlayerStatus(statusUpdate)
    
    // Emit socket event
    if (socket) {
      socket.emit('game-action', {
        gameCode,
        action: 'player-playlists-selected',
        payload: { playlistCount: newSelection.size }
      })
    }
  }

  const loadSelectedSongs = async () => {
    if (selectedPlaylistIds.size === 0) {
      alert('Please select at least one playlist!')
      return
    }

    setLoadingSongs(true)
    setLoadingMessage('Starting to load your music...')
    
    try {
      // Call your existing API endpoint for loading songs
      const response = await fetch(`/api/game/${gameCode}/load-songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          selectedPlaylistIds: Array.from(selectedPlaylistIds)
        })
      })
      
      if (!response.ok) throw new Error('Failed to load songs')
      
      const result = await response.json()
      
      // Store breakdown info
      if (result.breakdown) {
        setSongBreakdown(result.breakdown)
      }
      
      // Mark player as having songs loaded
      const updates = { 
        songsLoaded: true, 
        loadingProgress: 100 
      }
      await updatePlayerInDB(updates)
      updatePlayerStatus(updates)
      
      // Notify via socket
      if (socket) {
        socket.emit('game-action', {
          gameCode,
          action: 'player-songs-ready',
          payload: { songCount: result.songCount }
        })
      }
      
      setLoadingMessage(`✅ Loaded ${result.songCount} songs successfully!`)
      
    } catch (error) {
      console.error('Failed to load songs:', error)
      alert('Failed to load songs. Please try again.')
      setLoadingMessage('')
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
            if (gameCode) fetchGameDetails(true)
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Try Again
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
              {loadingPlaylists ? 'Loading...' : 'Load My Playlists'}
            </button>
          )}

          {/* Explanation of what gets loaded */}
          {playlists.length > 0 && !currentPlayer.songsLoaded && (
            <div className="mb-6 p-4 bg-blue-100 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">🎵 What will be loaded for the quiz:</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>All your Liked Songs</strong> (automatically included)</li>
                <li>• <strong>All your Saved Albums</strong> (automatically included)</li>
                <li>• <strong>Selected Playlists below</strong> ({selectedPlaylistIds.size} selected)</li>
              </ul>
              <div className="mt-2 text-xs text-blue-600">
                Estimated total: ~{getEstimatedSongCount()} songs from your library
              </div>
            </div>
          )}

          {/* Step 2: Select Playlists */}
          {playlists.length > 0 && !currentPlayer.songsLoaded && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">
                  Choose Playlists ({selectedPlaylistIds.size} selected)
                </h3>
                <button
                  onClick={loadSelectedSongs}
                  disabled={loadingSongs || selectedPlaylistIds.size === 0}
                  className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  {loadingSongs ? 'Loading Songs...' : `Load Songs from Library`}
                </button>
              </div>
              
              <div className="max-h-60 overflow-y-auto space-y-2">
                {playlists.map(playlist => (
                  <div key={playlist.id} className="flex items-center space-x-3 p-2 border rounded bg-white">
                    <input
                      type="checkbox"
                      checked={selectedPlaylistIds.has(playlist.id)}
                      onChange={() => togglePlaylistSelection(playlist.id)}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{playlist.name}</div>
                      <div className="text-sm text-gray-600">{playlist.tracks.total} tracks</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Loading Progress */}
          {loadingSongs && (
            <div className="space-y-3">
              <div className="bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-blue-500 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${currentPlayer.loadingProgress || 0}%` }}
                />
              </div>
              <div className="text-sm text-gray-700">
                {loadingMessage || `Loading your music library... ${currentPlayer.loadingProgress || 0}%`}
              </div>
              <div className="text-xs text-gray-500">
                This includes your liked songs, saved albums, and selected playlists
              </div>
            </div>
          )}

          {/* Step 4: Songs Loaded */}
          {currentPlayer.songsLoaded && (
            <div className="space-y-2">
              <div className="text-green-600 font-medium">
                ✅ Songs loaded successfully!
              </div>
              {songBreakdown && (
                <div className="text-sm text-gray-600 space-y-1">
                  <div>📚 {songBreakdown.likedSongs} songs from Liked Songs</div>
                  <div>💿 {songBreakdown.savedAlbums} songs from Saved Albums</div>
                  <div>📋 {songBreakdown.playlists} songs from {selectedPlaylistIds.size} playlists</div>
                  <div className="font-medium pt-1">
                    🎵 Total: {songBreakdown.likedSongs + songBreakdown.savedAlbums + songBreakdown.playlists} songs ready for quiz!
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Other Players' Status */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Other Players</h2>
          {game.players
            ?.filter(p => p.userId !== currentPlayer.userId)
            .map(player => (
              <div key={player.userId} className="border rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">{player.displayName}</h3>
                  <div className="text-sm">
                    {player.songsLoaded ? (
                      <span className="text-green-600">✅ Ready</span>
                    ) : (player.playlistsSelected?.length || 0) > 0 ? (
                      <span className="text-blue-600">🎵 Loading music library...</span>
                    ) : (
                      <span className="text-gray-500">⏳ Selecting playlists...</span>
                    )}
                  </div>
                </div>
                
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${player.loadingProgress || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>{player.playlistsSelected?.length || 0} playlists + albums + liked songs</span>
                    <span>{player.loadingProgress || 0}%</span>
                  </div>
                  {/* Show loading message if they're actively loading */}
                  {(player.loadingProgress || 0) > 0 && (player.loadingProgress || 0) < 100 && (
                    <div className="text-xs text-blue-600 mt-1">
                      Loading their music collection...
                    </div>
                  )}
                </div>
              </div>
            )) || []}
        </div>

        {/* Start Game Button (Host Only) */}
        {currentPlayer?.isHost && (
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