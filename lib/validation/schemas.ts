import { z } from 'zod'

// Base validation helpers
const gameCodeSchema = z.string()
  .trim()
  .toUpperCase()
  .length(6, 'Game code must be exactly 6 characters')
  .regex(/^[A-Z0-9]+$/, 'Game code must contain only letters and numbers')

const displayNameSchema = z.string()
  .trim()
  .min(1, 'Display name is required')
  .max(20, 'Display name must be 20 characters or less')
  .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Display name can only contain letters, numbers, spaces, hyphens, and underscores')

const userIdSchema = z.string()
  .trim()
  .min(1, 'User ID is required')
  .max(50, 'User ID too long')

const deviceIdSchema = z.string()
  .trim()
  .max(100, 'Device ID too long')
  .nullable()

const deviceNameSchema = z.string()
  .trim()
  .min(1, 'Device name is required')
  .max(100, 'Device name too long')
  .default('No device selected')

// Game-related schemas
export const GameJoinSchema = z.object({
  gameCode: gameCodeSchema,
  displayName: displayNameSchema
})

export const GameCreationSchema = z.object({
  maxPlayers: z.number()
    .int()
    .min(2, 'Must have at least 2 players')
    .max(8, 'Cannot have more than 8 players')
    .default(8),
  targetScore: z.number()
    .int()
    .min(10, 'Target score must be at least 10')
    .max(100, 'Target score cannot exceed 100')
    .default(30),
  displayName: displayNameSchema
})

export const PlayerUpdateSchema = z.object({
  spotifyDeviceId: deviceIdSchema.optional(),
  deviceName: deviceNameSchema.optional(),
  playlistsSelected: z.array(z.string().trim().max(50)).optional(),
  songsLoaded: z.boolean().optional(),
  loadingProgress: z.number().min(0).max(100).optional(),
  isReady: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
})

// Socket event schemas
export const SocketJoinGameSchema = z.object({
  gameCode: gameCodeSchema,
  userId: userIdSchema,
  displayName: displayNameSchema
})

export const SocketPlayerStatusSchema = z.object({
  gameCode: gameCodeSchema,
  playerUpdate: PlayerUpdateSchema
})

export const SocketGameActionSchema = z.object({
  gameCode: gameCodeSchema,
  action: z.string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9\-_]+$/, 'Action must contain only letters, numbers, hyphens, and underscores'),
  payload: z.record(z.string(), z.any()).optional()})

export const SocketVoteSchema = z.object({
  gameCode: gameCodeSchema,
  vote: z.object({
    roundId: z.string().trim().max(50),
    selectedPlayers: z.array(userIdSchema).max(8, 'Cannot vote for more than 8 players'),
    timestamp: z.string().datetime()
  })
})

// Spotify-related schemas
export const SpotifyPlaylistSchema = z.object({
  playlistIds: z.array(z.string().trim().max(50)).max(50, 'Cannot select more than 50 playlists')
})

export const SpotifyDeviceSchema = z.object({
  deviceId: deviceIdSchema,
  deviceName: deviceNameSchema
})

// API parameter schemas
export const GameCodeParamSchema = z.object({
  code: gameCodeSchema
})

// Type exports for TypeScript
export type GameJoinInput = z.infer<typeof GameJoinSchema>
export type GameCreationInput = z.infer<typeof GameCreationSchema>
export type PlayerUpdateInput = z.infer<typeof PlayerUpdateSchema>
export type SocketJoinGameInput = z.infer<typeof SocketJoinGameSchema>
export type SocketPlayerStatusInput = z.infer<typeof SocketPlayerStatusSchema>
export type SocketGameActionInput = z.infer<typeof SocketGameActionSchema>
export type SocketVoteInput = z.infer<typeof SocketVoteSchema>
export type SpotifyPlaylistInput = z.infer<typeof SpotifyPlaylistSchema>
export type SpotifyDeviceInput = z.infer<typeof SpotifyDeviceSchema>
export type GameCodeParam = z.infer<typeof GameCodeParamSchema>