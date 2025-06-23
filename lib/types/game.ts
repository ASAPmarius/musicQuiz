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