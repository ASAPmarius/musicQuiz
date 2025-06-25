// 🆕 ADD THESE TO YOUR EXISTING lib/types/game.ts FILE:

// Database/Lobby Player (for game lobby and API routes)
export interface LobbyPlayer {
  userId: string
  displayName: string
  spotifyDeviceId: string | null
  deviceName: string
  playlistsSelected: string[]
  songsLoaded: boolean
  loadingProgress: number
  joinedAt: string
  isReady: boolean
  isHost: boolean
}

// Database Game Data (for API routes)
export interface GameData {
  id: string
  code: string
  status: 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED'
  maxPlayers: number
  targetScore: number
  currentPlayers: number
  players: LobbyPlayer[]
  settings: {
    maxPlayers: number
    targetScore: number
    createdAt: string
  }
  songCache: Song[]
  host: {
    id: string
    name: string
    image?: string
  }
  createdAt: string
  updatedAt: string
}

// 🆕 Type guard to safely convert JSON to LobbyPlayer[]
export function isLobbyPlayer(obj: any): obj is LobbyPlayer {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.userId === 'string' &&
    typeof obj.displayName === 'string' &&
    (obj.spotifyDeviceId === null || typeof obj.spotifyDeviceId === 'string') &&
    typeof obj.deviceName === 'string' &&
    Array.isArray(obj.playlistsSelected) &&
    typeof obj.songsLoaded === 'boolean' &&
    typeof obj.loadingProgress === 'number' &&
    typeof obj.joinedAt === 'string' &&
    typeof obj.isReady === 'boolean' &&
    typeof obj.isHost === 'boolean'
  )
}

// 🆕 Safe conversion function from Prisma JSON to LobbyPlayer[]
export function parsePlayersFromJSON(json: any): LobbyPlayer[] {
  if (!Array.isArray(json)) {
    return []
  }
  
  return json.filter(isLobbyPlayer)
}

// 🆕 Convert LobbyPlayer[] back to plain JSON for database storage
export function playersToJSON(players: LobbyPlayer[]): any {
  return players.map(player => ({
    userId: player.userId,
    displayName: player.displayName,
    spotifyDeviceId: player.spotifyDeviceId,
    deviceName: player.deviceName,
    playlistsSelected: player.playlistsSelected,
    songsLoaded: player.songsLoaded,
    loadingProgress: player.loadingProgress,
    joinedAt: player.joinedAt,
    isReady: player.isReady,
    isHost: player.isHost
  }))
}

// ================================
// YOUR EXISTING TYPES BELOW:
// (keep everything you already have)
// ================================

export interface GameState {
  code: string
  players: Map<string, Player>
  songPool: Song[]
  rounds: Round[]
  currentRound: number
}

export interface Player {
  id: string
  name: string
  spotifyId: string
}

export interface Song {
  id: string
  name: string
  artists: string
  album: string
  owners: OwnerInfo[]
}

export interface OwnerInfo {
  playerId: string
  playerName: string
  source: SongSource
}

export interface SongSource {
  type: 'playlist' | 'liked' | 'album'
  name: string
  id?: string
}

export interface Round {
  songId: string
  correctOwners: OwnerInfo[]
  guesses: Map<string, string[]>
}