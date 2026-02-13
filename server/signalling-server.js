/**
 * Simple WebSocket Signalling Server for PeerJS (LAN mode)
 * This server facilitates WebRTC peer discovery within local network
 *
 * Run with: node server/signalling-server.js
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const PORT = 9000;
const HTTP_PORT = 9001;

// Create HTTP server for health check
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', mode: 'lan-signalling' }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('LAN Signalling Server running on port ' + PORT);
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

console.log(`[Signalling Server] Starting on port ${PORT}...`);

// Track connected peers
const peers = new Map();

wss.on('listening', () => {
  console.log(`[Signalling Server] WebSocket listening on ws://0.0.0.0:${PORT}`);
  console.log(`[Signalling Server] HTTP server on http://0.0.0.0:${HTTP_PORT}`);
});

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[Signalling Server] New connection from ${clientIp}`);

  ws.on('error', (error) => {
    console.error(`[Signalling Server] WebSocket error:`, error);
  });

  // Handle PeerJS protocol messages
  ws.on('message', (data, isBinary) => {
    // Just forward all messages - PeerJS handles the signalling protocol
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === 1) { // 1 = OPEN
        client.send(data, { binary: isBinary });
      }
    });
  });

  ws.on('close', () => {
    console.log(`[Signalling Server] Client disconnected: ${clientIp}`);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    server: 'lan-signalling',
    timestamp: Date.now()
  }));
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('\n[Signalling Server] Shutting down...');
  wss.close();
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Signalling Server] Shutting down...');
  wss.close();
  httpServer.close();
  process.exit(0);
});

// Start HTTP server for health checks
httpServer.listen(HTTP_PORT, () => {
  console.log(`[Signalling Server] HTTP health check on port ${HTTP_PORT}`);
});
