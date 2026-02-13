# P2P Network Setup Guide

## Overview

This project now uses WebRTC via PeerJS for peer-to-peer communication between host and clients. Two connection modes are supported:

1. **LAN Mode** - Uses local signalling server for Wi-Fi network play
2. **Internet Mode** - Uses public PeerJS signalling server for remote play

## Architecture

```
Host (WebRTC) <---> Client 1 (WebRTC)
     ^                     ^
     |                     |
     +---> Signalling Server (WebSocket)

The signalling server only facilitates initial peer discovery.
All game data flows directly between host and clients via WebRTC.
```

## Message Types

### STATE Messages (guaranteed delivery, ordered)
- `TEAM_STATE` - Client joins/leaves a team
- `UPDATE_SCORE` - Score updates
- `BUZZER_STATE` - Buzzer timer state changes

### EVENT Messages (low latency, can be dropped)
- `BUZZ` - Client pressed buzzer
- `SUPER_GAME_BET` - Super game bet placed
- `SUPER_GAME_ANSWER` - Super game answer submitted
- `BROADCAST` - Generic broadcast from host

### SYNC Messages (periodic, can be dropped)
- `STATE_SYNC` - Full state synchronization

### CONTROL Messages (connection management)
- `HANDSHAKE` - Initial client handshake
- `HANDSHAKE_RESPONSE` - Host handshake response
- `PING` - Connection quality check
- `PONG` - Ping response

## Setup Instructions

### For LAN Play (Local Wi-Fi)

1. **Start the signalling server** (optional, for better performance):
   ```bash
   npm run server
   ```
   This starts the signalling server on port 9000.

2. **Open Host View**:
   - Enter your local IP address (e.g., 192.168.1.100)
   - Click "LAN" button to enable LAN mode
   - Click "OK" to confirm and generate QR code

3. **Clients connect**:
   - Scan QR code OR open the invitation link
   - The link format: `http://IP:3000#/mobile?host=HOST_ID&signalling=IP`
   - Client will automatically connect to host

### For Internet Play (Remote)

1. **Open Host View**:
   - Make sure "LAN" button is OFF (gray)
   - No IP address needed
   - QR code will be generated with public signalling server

2. **Share invitation link**:
   - Click "Copy invitation link"
   - Share with players via any messaging app
   - Link format: `http://your-domain.com#/mobile?host=HOST_ID`

## File Structure

```
types.ts                    # P2P message type definitions
hooks/
  useP2PHost.ts           # Host-side P2P hook
  useP2PClient.ts         # Client-side P2P hook
server/
  signalling-server.js      # Local signalling server for LAN mode
components/
  HostView.tsx            # Host view with P2P integration
  MobileView.tsx           # Mobile view with P2P integration
```

## Configuration

### Signalling Server Ports
- LAN mode: `ws://IP:9000` (local server)
- Internet mode: `wss://0.peerjs.com` (public server)

### Protocol Version
- Current: `1.0.0`
- Defined in: `types.ts` - `PROTOCOL_VERSION`

## Troubleshooting

### Clients can't connect in LAN mode
1. Check signalling server is running: `npm run server`
2. Verify IP address is correct
3. Check firewall allows port 9000
4. Ensure all devices are on same Wi-Fi network

### Connection unstable
1. Check Wi-Fi signal strength
2. Verify no network congestion
3. Check connection quality indicator on host/client

### Protocol version mismatch
1. Ensure host and client have same code version
2. Clear browser cache and reload
