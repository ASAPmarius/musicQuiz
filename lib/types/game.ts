// 🆕 Updated Database/Lobby Player interface
export interface LobbyPlayer {
  id: string              
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