# Networking Guide

How the three components (Host, Display Screen, Players) connect, and how to fix
connectivity problems.

## Topology

All communication is WebRTC data channels (PeerJS), peer-to-peer through the host:

```
Host (moderator) ──┬── Display Screen (ScreenView, big monitor)
                   ├── Player phones (MobileView)
                   └── ...more players/screens
```

A signalling server (`server/signalling-server.cjs`, PeerServer on port **9000**,
health HTTP on **9001**) is only used to exchange connection offers; game traffic never
touches it.

## Connection URLs

- **LAN mode** (recommended): host UI → enter the host machine's IP. Players scan the QR
  code: `http://<host-ip>:3000#/mobile?host=<id>&signalling=<host-ip>&session=<id>`.
  Display screen link is the same with `#/screen`.
- **Internet mode**: uses the default public PeerJS server; invite URL has no
  `signalling` parameter.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Screen/phone stuck on "Connecting" | Signalling server not running or wrong IP | Start `server/signalling-server.cjs`; check the IP in the host UI |
| Console shows `ICE state 'failed'` (both hooks log this) | WebRTC could not connect: Wi-Fi **AP/client isolation** on the router, or different subnets | Disable AP isolation on the router, or put all devices on the same network |
| Phones disconnect when screen locks | Browser suspends the tab | Keep the phone screen on; rejoin via QR if needed |
| Host unreachable after restart | Old host ID in the URL/QR | Re-scan the fresh QR code (the ScreenView error screen offers "Clear and reconnect") |

Verbose connection lifecycle logs are kept intentionally (concise, prefixed
`[P2P Host]` / `[P2P Client]`); `console.warn`/`error` mark real problems.

## Enabling a TURN relay (internet mode / restrictive networks)

By default PeerJS uses its built-in STUN (Google). STUN is enough for same-LAN play and
most home networks, but **symmetric NATs, carrier networks, and AP isolation need a TURN
relay**. To enable one, pass `config.iceServers` when creating the `Peer` in BOTH:

- `hooks/useP2PHost.ts` (`peerConfig` in the init effect)
- `hooks/useP2PClient.ts` (`new Peer(peerConfig)`)

```ts
peerConfig.config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:turn.example.com:3478',
      username: 'game',
      credential: 'secret'
    }
  ]
};
```

For a self-hosted LAN/internet relay, [coturn](https://github.com/coturn/coturn) is the
standard choice (`apt install coturn`, then a minimal `turnserver.conf` with
`listening-port=3478`, `fingerprint`, `lt-cred-mech`, and a `user=game:secret` line).
Run it on the host machine for internet games; LAN games don't need it.

> Note: the bundled signalling server only brokers connections — it does not relay
> media/data. TURN is the only relay option.
