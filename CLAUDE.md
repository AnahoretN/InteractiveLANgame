# InteractiveLANgame - AI Assistant Guidelines

## Knowledge Graph Integration

This project uses **Graphify** for codebase architecture analysis. The knowledge graph provides a comprehensive view of code relationships, dependencies, and community structure.

### When to Use the Graph

**Always check** `graphify-out/GRAPH_REPORT.md` first when:
- Understanding component relationships and dependencies
- Locating where specific functionality is implemented
- Finding the "why" behind architectural decisions
- Identifying potential impact of code changes
- Searching for cross-cutting concerns (P2P, media streaming, state sync)
- **Onboarding** to the codebase for the first time
- **Debugging** complex issues that span multiple files
- **Refactoring** - understanding what might break
- **Adding new features** - finding related components to extend
- **Code reviews** - verifying change impact
- **Performance investigations** - finding bottlenecks in highly connected areas

### Quick Reference

```
graphify-out/
├── GRAPH_REPORT.md    # START HERE - god nodes, communities, surprising connections
├── graph.json         # Full graph data for programmatic queries
└── labels.json        # Community labels (127 communities with semantic names)
```

### How to Use the Graphify Output

**1. Start with GRAPH_REPORT.md**
- Read the "God Nodes" section to understand the most connected/critical components
- Review "Communities" to see functional groupings
- Check "Surprising Connections" for non-obvious dependencies
- Use the "Search Guide" to locate specific functionality

**2. When implementing a feature:**
```
1. Search GRAPH_REPORT.md for related functionality
2. Identify which community(s) are involved
3. Check god nodes for potential impact areas
4. Review connected components before making changes
```

**3. When debugging:**
```
1. Find the problematic component in GRAPH_REPORT.md
2. Check its connections to understand upstream/downstream effects
3. Look for cyclic dependencies that might cause issues
4. Review related community members for similar patterns
```

**4. When refactoring:**
```
1. Check component's centrality (is it a god node?)
2. Review all connections in its community
3. Identify cross-community dependencies
4. Plan changes to minimize ripple effects
```

**5. For onboarding new developers:**
- Direct them to GRAPH_REPORT.md → "God Nodes" for critical components
- Show them the "Communities" section to understand the architecture
- Use the graph to visualize the codebase structure

### Key Architectural Insights

**God Nodes** (most connected components):
- `P2PConnectionPool` (26 edges) - P2P connection management
- `PerformanceMetricsTracker` (18 edges) - Performance monitoring
- `SequencedMessageQueue` (18 edges) - Ordered message delivery
- `BackgroundMediaPreloader` (17 edges) - Media preloading
- `DemoScreenMediaHandler` (16 edges) - Demo screen media

**Major Communities** (16 named):
1. Message Handlers & State Sync
2. Media Streaming & Chunking
3. Binary Protocol & Encoding
4. Sequenced Message Queue
5. Media Cache & File Management
6. P2P Connection Management
7. File System & Blob Handling
8. Game State & Timer Logic
9-15. UI Components, Hooks, Utilities

### Project Context

**Type**: Multi-device quiz game (Jeopardy-style)
**Architecture**: Host-Client via WebRTC P2P
**Tech Stack**: React 19, TypeScript 5.8, Vite 6, PeerJS, Tailwind CSS

**Key Features**:
- LAN/Internet P2P connections
- QR code join flow
- Real-time buzzer system
- Media streaming (images, video, audio)
- Pack editor for custom questions
- Demo screen for audience

### File Organization

```
components/
├── HostView.tsx          # Main host interface
├── MobileView.tsx        # Mobile client interface
├── ScreenView.tsx        # Demo/audience screen
└── host/
    ├── GamePlay.tsx      # Active game session
    ├── game/             # Game components (board, modals, etc.)
    ├── packeditor/       # Question pack editor
    └── messageHandlers/  # P2P message processing

hooks/
├── useP2PHost.ts         # Host-side P2P
├── useP2PClient.ts       # Client-side P2P
├── useGamePlayState.ts   # Game state management
└── useSequencedMessages.ts # Ordered message delivery

utils/
├── mediaManager.ts       # Media file handling
├── mediaStream.ts        # P2P media streaming
├── p2pConnectionPool.ts  # Connection pooling
└── binaryProtocol.ts     # Binary message encoding
```

### Recent Optimizations (2026-04)

- Removed duplicate MediaStreamer variants (kept Enhanced)
- Consolidated font utilities to `components/host/game/fontUtils.ts`
- Token reduction: 71.5x vs reading raw files

### Memory System

Project memories are stored in `C:\Users\Anahoret\.claude\projects\c--Users-Anahoret-Documents-InteractiveLANgame\memory\`

### Before Making Changes

1. Read `graphify-out/GRAPH_REPORT.md` for context
2. Check related community connections
3. Verify no duplicate implementations exist
4. Consider impact on P2P message flow
5. Test with both host and client views
