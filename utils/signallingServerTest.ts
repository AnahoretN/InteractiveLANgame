/**
 * Utility to test if a PeerJS signalling server is accessible
 * This helps diagnose connection issues before attempting to connect
 */

export async function testSignallingServer(serverUrl: string): Promise<{
  accessible: boolean;
  httpApi: boolean;
  webSocket: boolean;
  error?: string;
  details?: string[];
}> {
  const results = {
    error: undefined as string | undefined,
    accessible: false,
    httpApi: false,
    webSocket: false,
    details: [] as string[]
  };

  // Extract hostname and port from URL
  let host: string;
  let port: number;
  let secure: boolean;

  try {
    if (serverUrl.startsWith('ws://')) {
      const url = new URL(serverUrl);
      host = url.hostname;
      port = parseInt(url.port);
      secure = false;
    } else if (serverUrl.startsWith('wss://')) {
      const url = new URL(serverUrl);
      host = url.hostname;
      port = parseInt(url.port) || 443;
      secure = true;
    } else {
      return {
        ...results,
        error: 'Invalid signalling server URL. Must start with ws:// or wss://'
      };
    }

    results.details.push(`📡 Testing server: ${host}:${port} (${secure ? 'secure' : 'insecure'})`);

    // Test HTTP API (PeerJS uses HTTP for peer ID registration)
    try {
      const httpProtocol = secure ? 'https' : 'http';
      const httpUrl = `${httpProtocol}://${host}:${port}/peerjs`;
      results.details.push(`🔍 Testing HTTP API: ${httpUrl}`);

      const response = await fetch(httpUrl, {
        method: 'GET',
        mode: 'cors',
        // Short timeout to avoid hanging
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        results.httpApi = true;
        results.details.push(`✅ HTTP API accessible (status: ${response.status})`);
      } else {
        results.details.push(`⚠️ HTTP API returned status: ${response.status}`);
      }
    } catch (httpError) {
      results.details.push(`❌ HTTP API not accessible: ${(httpError as Error).message}`);
      results.details.push(`   PeerJS requires HTTP API for peer ID registration`);
    }

    // Test WebSocket connection
    try {
      const wsUrl = serverUrl;
      results.details.push(`🔍 Testing WebSocket: ${wsUrl}`);

      await new Promise<void>((resolve, reject) => {
        const ws = secure ? new WebSocket(wsUrl) : new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          results.webSocket = true;
          results.details.push(`✅ WebSocket connection successful`);
          ws.close();
          resolve();
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          reject(new Error('WebSocket connection failed'));
        };
      });
    } catch (wsError) {
      results.details.push(`❌ WebSocket not accessible: ${(wsError as Error).message}`);
    }

    results.accessible = results.httpApi && results.webSocket;

    if (!results.accessible) {
      if (!results.httpApi && !results.webSocket) {
        results.error = 'Server not accessible. Check if server is running and firewall allows connections.';
      } else if (!results.httpApi) {
        results.error = 'HTTP API not available. PeerJS requires HTTP API for peer ID management.';
      } else {
        results.error = 'WebSocket not available. WebRTC signalling requires WebSocket.';
      }
    }

    return results;
  } catch (error) {
    return {
      ...results,
      error: `Server test failed: ${(error as Error).message}`
    };
  }
}

/**
 * Run diagnostic tests and print results to console
 */
export async function diagnoseSignallingServer(serverUrl: string): Promise<void> {

  const results = await testSignallingServer(serverUrl);


  if (results.error) {
  }

  if (results.details && results.details.length > 0) {
    results.details.forEach(detail => console.log('   ' + detail));
  }


  if (!results.accessible) {
    if (!results.httpApi) {
    }
    if (!results.webSocket) {
    }
  }
}