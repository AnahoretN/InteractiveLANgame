/**
 * Interactive LAN Game - Signalling Server
 *
 * This is a simple WebSocket signalling server that enables P2P connections
 * between the host and mobile clients in the same local network.
 *
 * The server only facilitates the initial WebRTC handshake - all actual
 * game communication happens directly between peers using WebRTC DataChannel.
 */

import { WebSocketServer } from 'ws';

const PORT = 9000;

// Store connected peers: { id: { ws, type, metadata } }
const peers = new Map();

// Store host info
const hosts = new Map();

console.log(`
╔════════════════════════════════════════════════════════════╗
║          Interactive LAN Game - Signalling Server          ║
╠════════════════════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(50)}║
╚════════════════════════════════════════════════════════════╝
`);

const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log(`[OK] Signalling server listening on ws://localhost:${PORT}`);
  console.log(`[OK] Ready for connections...\n`);
});

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[CONNECT] New connection from ${clientIp}`);

  // Send welcome message - client must identify itself
  ws.send(JSON.stringify({
    type: 'WELCOME',
    serverTime: Date.now()
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(ws, message);
    } catch (e) {
      console.error(`[ERROR] Failed to parse message:`, e);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (e) => {
    console.error(`[ERROR] WebSocket error:`, e);
  });
});

function handleMessage(ws, message) {
  switch (message.type) {
    case 'REGISTER_HOST': {
      // Support both old (hostId/hostName) and new (peerId/peerName) field names
      const hostId = message.hostId || message.peerId;
      const hostName = message.hostName || message.peerName;
      const metadata = message.metadata;

      if (!hostId) {
        console.error('[ERROR] REGISTER_HOST missing hostId');
        return;
      }

      console.log(`[HOST] Registered: ${hostName} (${hostId})`);

      peers.set(hostId, {
        ws,
        type: 'host',
        id: hostId,
        name: hostName,
        metadata: metadata || {},
        registeredAt: Date.now()
      });

      hosts.set(hostId, {
        id: hostId,
        name: hostName,
        metadata: metadata || {},
        clientCount: 0,
        createdAt: Date.now()
      });

      ws.send(JSON.stringify({
        type: 'REGISTERED',
        peerId: hostId,
        serverTime: Date.now()
      }));

      broadcastHostList();
      break;
    }

    case 'REGISTER_CLIENT': {
      // Support both old (clientId/clientName) and new (peerId/peerName) field names
      const clientId = message.clientId || message.peerId;
      const clientName = message.clientName || message.peerName;
      const targetHostId = message.targetHostId;

      if (!clientId || !targetHostId) {
        console.error('[ERROR] REGISTER_CLIENT missing clientId or targetHostId');
        return;
      }

      console.log(`[CLIENT] Registered: ${clientName} (${clientId}) -> host: ${targetHostId}`);

      peers.set(clientId, {
        ws,
        type: 'client',
        id: clientId,
        name: clientName,
        targetHostId,
        registeredAt: Date.now()
      });

      // Notify client they're registered
      ws.send(JSON.stringify({
        type: 'REGISTERED',
        peerId: clientId,
        serverTime: Date.now()
      }));

      // Notify host about new client
      const host = peers.get(targetHostId);
      console.log(`[SERVER] Looking for host ${targetHostId}, found:`, !!host, host ? `readyState: ${host.ws.readyState}` : '');
      if (host && host.ws.readyState === 1) {
        console.log(`[SERVER] Sending CLIENT_ANNOUNCE to host and HOST_INFO to client`);
        host.ws.send(JSON.stringify({
          type: 'CLIENT_ANNOUNCE',
          clientId,
          clientName,
          serverTime: Date.now()
        }));

        // Send host info back to client
        ws.send(JSON.stringify({
          type: 'HOST_INFO',
          hostId: targetHostId,
          hostName: host.name,
          serverTime: Date.now()
        }));
      } else {
        console.log(`[SERVER] Host not available for connection`);
      }

      // Update host client count
      if (hosts.has(targetHostId)) {
        const hostInfo = hosts.get(targetHostId);
        hostInfo.clientCount = (hostInfo.clientCount || 0) + 1;
        hosts.set(targetHostId, hostInfo);
        broadcastHostList();
      }
      break;
    }

    case 'OFFER': {
      const { from, to, offer } = message;
      console.log(`[SIGNAL] OFFER: ${from} -> ${to}`);

      const targetPeer = peers.get(to);
      if (targetPeer && targetPeer.ws.readyState === 1) {
        targetPeer.ws.send(JSON.stringify({
          type: 'OFFER',
          from,
          offer,
          serverTime: Date.now()
        }));
      } else {
        // Target not available, send error back
        ws.send(JSON.stringify({
          type: 'ERROR',
          code: 'PEER_UNAVAILABLE',
          message: `Target peer ${to} is not available`,
          serverTime: Date.now()
        }));
      }
      break;
    }

    case 'ANSWER': {
      const { from, to, answer } = message;
      console.log(`[SIGNAL] ANSWER: ${from} -> ${to}`);

      const targetPeer = peers.get(to);
      if (targetPeer && targetPeer.ws.readyState === 1) {
        targetPeer.ws.send(JSON.stringify({
          type: 'ANSWER',
          from,
          answer,
          serverTime: Date.now()
        }));
      }
      break;
    }

    case 'ICE_CANDIDATE': {
      const { from, to, candidate } = message;
      // Don't log every ICE candidate (too verbose)
      // console.log(`[SIGNAL] ICE: ${from} -> ${to}`);

      const targetPeer = peers.get(to);
      if (targetPeer && targetPeer.ws.readyState === 1) {
        targetPeer.ws.send(JSON.stringify({
          type: 'ICE_CANDIDATE',
          from,
          candidate,
          serverTime: Date.now()
        }));
      }
      break;
    }

    case 'HEARTBEAT': {
      const { from } = message;
      const peer = peers.get(from);
      if (peer) {
        peer.lastSeen = Date.now();
        // Echo heartbeat back
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'HEARTBEAT_ACK',
            serverTime: Date.now()
          }));
        }
      }
      break;
    }

    case 'RELAY': {
      // Relay message between peers when P2P data channel is not available
      const { from, to, payload } = message;
      console.log(`[RELAY] ${from} -> ${to}: ${payload.type}`);

      const targetPeer = peers.get(to);
      if (targetPeer && targetPeer.ws.readyState === 1) {
        targetPeer.ws.send(JSON.stringify({
          type: 'RELAY',
          from,
          to,
          payload,
          serverTime: Date.now()
        }));
      } else {
        console.log(`[RELAY] Target ${to} not available`);
      }
      break;
    }

    case 'GET_HOSTS': {
      const hostList = Array.from(hosts.values()).map(h => ({
        id: h.id,
        name: h.name,
        clientCount: h.clientCount || 0,
        createdAt: h.createdAt
      }));

      ws.send(JSON.stringify({
        type: 'HOST_LIST',
        hosts: hostList,
        serverTime: Date.now()
      }));
      break;
    }

    default:
      console.log(`[UNKNOWN] Message type: ${message.type}`);
  }
}

function handleDisconnect(ws) {
  // Find and remove the disconnected peer
  for (const [id, peer] of peers.entries()) {
    if (peer.ws === ws) {
      console.log(`[DISCONNECT] ${peer.type}: ${peer.name} (${id})`);

      if (peer.type === 'host') {
        // Notify all connected clients that host disconnected
        for (const [clientId, clientPeer] of peers.entries()) {
          if (clientPeer.type === 'client' && clientPeer.targetHostId === id) {
            if (clientPeer.ws.readyState === 1) {
              clientPeer.ws.send(JSON.stringify({
                type: 'HOST_DISCONNECTED',
                hostId: id,
                serverTime: Date.now()
              }));
            }
          }
        }
        hosts.delete(id);
        broadcastHostList();
      } else if (peer.type === 'client') {
        // Notify host about client disconnect
        const host = peers.get(peer.targetHostId);
        if (host && host.ws.readyState === 1) {
          host.ws.send(JSON.stringify({
            type: 'CLIENT_DISCONNECTED',
            clientId: id,
            serverTime: Date.now()
          }));

          // Update host client count
          if (hosts.has(peer.targetHostId)) {
            const hostInfo = hosts.get(peer.targetHostId);
            hostInfo.clientCount = Math.max(0, (hostInfo.clientCount || 1) - 1);
            hosts.set(peer.targetHostId, hostInfo);
            broadcastHostList();
          }
        }
      }

      peers.delete(id);
      break;
    }
  }

  broadcastHostList();
}

function broadcastHostList() {
  const hostList = Array.from(hosts.values()).map(h => ({
    id: h.id,
    name: h.name,
    clientCount: h.clientCount || 0,
    createdAt: h.createdAt
  }));

  const message = JSON.stringify({
    type: 'HOST_LIST',
    hosts: hostList,
    serverTime: Date.now()
  });

  // Send to all connected clients
  for (const peer of peers.values()) {
    if (peer.ws.readyState === 1) {
      peer.ws.send(message);
    }
  }
}

// Periodic cleanup of stale connections
const CLEANUP_INTERVAL = 30000; // 30 seconds

setInterval(() => {
  const now = Date.now();
  const staleThreshold = 60000; // 60 seconds without heartbeat

  for (const [id, peer] of peers.entries()) {
    if (peer.lastSeen && (now - peer.lastSeen) > staleThreshold) {
      console.log(`[CLEANUP] Removing stale peer: ${peer.name} (${id})`);
      if (peer.ws.readyState === 1) {
        peer.ws.close();
      }
      peers.delete(id);
      if (peer.type === 'host') {
        hosts.delete(id);
      }
    }
  }

  // Also clean up peers with closed connections
  for (const [id, peer] of peers.entries()) {
    if (peer.ws.readyState !== 1) {
      peers.delete(id);
      if (peer.type === 'host') {
        hosts.delete(id);
      }
    }
  }

  // Status logging removed
}, CLEANUP_INTERVAL);

// Graceful shutdown - suppress output for clean exit
process.on('SIGINT', () => {
  wss.close(() => {
    process.exit(0);
  });
});
