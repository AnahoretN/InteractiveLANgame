/**
 * PeerJS Signalling Server for LAN mode
 * This server facilitates WebRTC peer discovery within local network
 */

const { PeerServer } = require('peer');
const express = require('express');
const net = require('net');

const PORT = 9000;
const HTTP_PORT = 9001;

// Check if port is already in use
const isPortInUse = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
};

// Start server only if port is available
isPortInUse(PORT).then((inUse) => {
  if (inUse) {
    console.error(`[Signalling Server] ❌ Port ${PORT} is already in use!`);
    console.error(`[Signalling Server] Kill the existing process or use a different port.`);
    process.exit(1);
  }
  console.log(`[Signalling Server] Starting on port ${PORT}...`);
  startServer();
});

function startServer() {

// Create PeerJS server
const peerServer = PeerServer({
  port: PORT,
  path: '/peerjs',
  allow_discovery: true,
  debug: true
});

  // Event logging (compact format to avoid cluttering)
  peerServer.on('connection', (client) => {
    console.log(`[Signalling Server] + ${client.getId()}`);
  });

  peerServer.on('disconnect', (client) => {
    console.log(`[Signalling Server] - ${client.getId()}`);
  });

  peerServer.on('error', (error) => {
    console.error(`[Signalling Server] Error:`, error.message);
  });

// Create HTTP server for health check (separate port)
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode: 'peerjs-lan', timestamp: Date.now() });
});

app.get('/', (req, res) => {
  res.send('PeerJS Signalling Server running on port ' + PORT);
});

  const httpServer = app.listen(HTTP_PORT, () => {
    console.log(`[Signalling Server] HTTP health check on port ${HTTP_PORT}`);
    console.log(`[Signalling Server] PeerJS ready on ws://0.0.0.0:${PORT}/peerjs`);
    console.log(''); // Empty line for separation
  });

  // Handle server shutdown
  const shutdown = () => {
    console.log('\n[Signalling Server] Shutting down...');
    peerServer.close();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}