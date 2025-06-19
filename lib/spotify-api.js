// Helper to get fresh token
const getAccessToken = async () => {
  const response = await fetch('/api/auth/session');
  const session = await response.json();
  return session?.accessToken;
};

// Base function for Spotify API calls
const spotifyFetch = async (endpoint, options = {}) => {
  const token = await getAccessToken();
  
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Spotify API error');
  }

  return response.json();
};

// Get available devices
export const getDevices = async () => {
  const data = await spotifyFetch('/me/player/devices');
  return data.devices;
};

// Get current playback state
export const getPlaybackState = async () => {
  try {
    return await spotifyFetch('/me/player');
  } catch (error) {
    // No active device returns 204 No Content
    return null;
  }
};

// Play a track or playlist
export const play = async (options = {}) => {
  // options can include:
  // - device_id: specific device to play on
  // - uris: array of track URIs ['spotify:track:...']
  // - context_uri: playlist/album URI 'spotify:playlist:...'
  // - offset: where to start in the playlist
  
  await spotifyFetch('/me/player/play', {
    method: 'PUT',
    body: JSON.stringify(options)
  });
};

// Pause playback
export const pause = async () => {
  await spotifyFetch('/me/player/pause', {
    method: 'PUT'
  });
};

// Skip to next track
export const skipToNext = async () => {
  await spotifyFetch('/me/player/next', {
    method: 'POST'
  });
};

// Skip to previous track
export const skipToPrevious = async () => {
  await spotifyFetch('/me/player/previous', {
    method: 'POST'
  });
};

// Set volume (0-100)
export const setVolume = async (volumePercent) => {
  await spotifyFetch(`/me/player/volume?volume_percent=${volumePercent}`, {
    method: 'PUT'
  });
};

// Transfer playback to a different device
export const transferPlayback = async (deviceId, play = true) => {
  await spotifyFetch('/me/player', {
    method: 'PUT',
    body: JSON.stringify({
      device_ids: [deviceId],
      play
    })
  });
};