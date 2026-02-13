/**
 * Network utility
 * Provides network-related utility functions
 */

const DEFAULT_SIGNALLING_SERVER = 'wss://0.peerjs.com'; // Public PeerJS server
const LOCAL_SIGNALLING_PORT = 9000; // Local signalling server port

/**
 * Get the appropriate signalling server URL based on LAN mode and configuration
 * @param isLanMode - Whether LAN mode is enabled
 * @param signallingUrl - Optional custom signalling server URL
 * @param lockedIp - Optional locked IP address for LAN mode
 * @returns The signalling server URL to use
 */
export function getSignallingServer(
  isLanMode: boolean,
  signallingUrl?: string,
  lockedIp?: string
): string {
  if (isLanMode) {
    // In LAN mode, use local signalling server
    if (lockedIp) {
      return `ws://${lockedIp}:${LOCAL_SIGNALLING_PORT}`;
    }
  }
  // Use configured or default public server
  return signallingUrl || DEFAULT_SIGNALLING_SERVER;
}

export { DEFAULT_SIGNALLING_SERVER, LOCAL_SIGNALLING_PORT };
