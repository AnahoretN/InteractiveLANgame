# Interactive LAN Game

**Version:** 0.0.1

## Overview

Interactive LAN Game is a real-time cross-device latency testing application that uses Peer-to-Peer (P2P) WebRTC connections to measure network latency between multiple devices on the same local network.

The application uses a **custom WebSocket signalling server** for reliable LAN communication without depending on external public servers.

## Features

- **Host-Client Architecture**: One computer acts as the "host" that generates a session, and mobile devices/tablets connect as "clients"
- **QR Code Connection**: The host generates a QR code containing the connection details, which mobile devices can scan to join
- **Team Management**: Users can create teams and join them, with latency tracking per team
- **Real-time Latency Measurement**: The host can send ping requests to all connected devices, and clients respond to measure round-trip time
- **Live Monitoring**: The host sees a real-time dashboard showing all connected devices, their teams, and latency statistics
- **Custom Signalling Server**: Local WebSocket server for reliable P2P connections without external dependencies

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | ^19.2.3 | Frontend framework |
| TypeScript | ~5.8.2 | Type safety |
| Vite | ^6.2.0 | Build tool |
| WebRTC | Native API | P2P data channels |
| WebSocket | ^8.18.0 | Signalling server |
| Tailwind CSS | (via CDN) | UI styling |
| qrcode.react | ^4.2.0 | QR code generation |
| lucide-react | ^0.562.0 | Icons |
| date-fns | ^4.1.0 | Date formatting |
| concurrently | ^9.1.2 | Run multiple npm scripts |

## Project Structure

```
interactive-lan-game/
├── components/
│   ├── Button.tsx              # Reusable button component
│   ├── HostView.tsx            # Host interface (QR code, dashboard)
│   └── MobileView.tsx          # Mobile client interface
├── server/
│   └── signalling-server.js    # WebSocket signalling server (port 9000)
├── utils/
│   ├── p2p.ts                  # WebRTC P2P manager
│   └── messageQueue.ts         # Message queue for guaranteed delivery
├── types.ts                    # TypeScript type definitions
├── App.tsx                     # Main application router
├── index.tsx                   # Entry point
├── index.html                  # HTML template
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite configuration
└── start.bat                   # Windows launcher script
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the application (Windows):
```bash
start.bat
```

This will start both servers:
- **Signalling server** on `ws://localhost:9000`
- **Web server** on `http://localhost:3000`

3. Or run manually:
```bash
# Run both servers together
npm run start:all

# Or run separately
npm run server   # Signalling server only
npm run dev      # Web server only
```

4. Build for production:
```bash
npm run build
```

## Usage

### Host Mode

1. Run `start.bat` on your computer
2. Open `http://localhost:3000` in your browser
3. Enter your name and confirm your local IP address
4. The app will generate a QR code
5. Share the QR code with mobile devices to connect

### Mobile Mode

1. Open the URL displayed on the host screen on your mobile device
2. The link includes `?host=HOST_ID` parameter for connection
3. Enter your name
4. Enter the host's IP address (the same one shown on host screen)
5. Create or join a team
6. Wait for ping requests from the host

## How It Works

1. **Signalling Server**: A local WebSocket server (port 9000) facilitates the initial WebRTC handshake between peers
2. **Connection Setup**: The host registers with the signalling server and waits for clients
3. **QR Code Generation**: The host ID and connection details are encoded into a QR code
4. **Client Connection**: Mobile devices scan the QR code to get the host ID and establish a WebRTC connection
5. **P2P Communication**: After the initial handshake, all communication happens directly between peers using WebRTC DataChannels
6. **Latency Measurement**: The host sends timestamped ping messages; clients respond immediately
7. **Statistics Display**: Round-trip time, jitter, packet loss, and health score are calculated and displayed

## Key Components

### App.tsx
Handles URL routing between host (`#`) and mobile (`#/mobile`) views using hash-based navigation.

### HostView.tsx
- **Session Setup**: IP input, name entry, QR code generation, manages connected devices
- **Team Management**: Create teams and assign clients to teams
- **Live Dashboard**: Real-time latency monitoring with color-coded indicators (green/yellow/red)

### MobileView.tsx
- Three-screen flow: Name Entry → IP Input → Team Selection → Waiting Screen
- Maintains persistent connection with heartbeat messages
- Handles reconnection automatically with exponential backoff
- Vibration feedback on button press

### server/signalling-server.js
WebSocket server that handles:
- Host and client registration
- WebRTC signalling (offer/answer/ICE candidates)
- Connection tracking and broadcasting
- Automatic cleanup of stale connections

### utils/p2p.ts
Pure WebRTC P2P manager that:
- Manages peer connections without PeerJS dependency
- Handles ICE candidate exchange
- Creates and manages DataChannels
- Implements reconnection logic

## Use Cases

- **Gaming Events**: Synchronization testing for multiplayer games on LAN
- **Live Event Coordination**: Ensuring all devices are responsive in real-time scenarios
- **Network Performance Testing**: Measuring real-world latency between devices
- **IoT Device Testing**: Verifying communication latency with IoT devices
- **Educational Purposes**: Demonstrating network concepts and latency measurement

## License

Private project.
