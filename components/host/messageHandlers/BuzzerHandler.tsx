/**
 * BuzzerHandler Component
 * Handles buzzer events from clients
 * Extracted from HostView for modularity
 */

import React from 'react';
import { Activity } from 'lucide-react';

export interface BuzzedClient {
  id: string;
  name: string;
  buzzTime: number;
}

interface BuzzerHandlerProps {
  buzzedClients: Map<string, number>;
  setBuzzedClients: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  onBuzzTriggered: (teamId: string | null) => void;
}

export const BuzzerHandler: React.FC<BuzzerHandlerProps> = ({
  buzzedClients,
  setBuzzedClients,
  onBuzzTriggered,
}) => {
  // Clear expired buzzes (older than 3 seconds)
  React.useEffect(() => {
    const now = Date.now();
    const BUZZ_DURATION = 3000;

    const interval = setInterval(() => {
      setBuzzedClients((prev: Map<string, number>) => {
        const updated = new Map(prev);
        for (const [clientId, timestamp] of prev.entries()) {
          if (now - timestamp > BUZZ_DURATION) {
            updated.delete(clientId);
          }
        }
        return updated;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Get buzzed team (first to buzz)
  const buzzedTeamId = React.useMemo(() => {
    if (buzzedClients.size === 0) return null;

    // Find earliest buzz
    let earliestTime = Infinity;
    let earliestClientId = '';

    buzzedClients.forEach((time, clientId) => {
      if (time < earliestTime) {
        earliestTime = time;
        earliestClientId = clientId;
      }
    });

    return earliestClientId;
  }, [buzzedClients]);

  // Handle buzz trigger
  React.useEffect(() => {
    if (buzzedTeamId) {
      onBuzzTriggered(buzzedTeamId);
    }
  }, [buzzedTeamId, onBuzzTriggered]);

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Buzzer Status
        </h3>
        <div className="bg-gray-800 px-3 py-1 rounded-full text-xs font-mono text-blue-400 border border-blue-500/30">
          {buzzedTeamId ? (
            <span className="text-green-400">Ready: {buzzedClients.size === 1 ? '1 team buzzing' : `${buzzedClients.size} teams buzzing`}</span>
          ) : (
            <span className="text-gray-400">Waiting...</span>
          )}
        </div>
      </div>

      {buzzedClients.size > 0 && (
        <div className="space-y-2">
          {Array.from(buzzedClients.entries()).map(([clientId, time], index) => (
            <div
              key={clientId}
              className="bg-gray-800 rounded-lg p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-green-400" />
                <span className="text-white font-medium">{`Client ${index + 1}`}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm">Buzzed {Math.round((Date.now() - time) / 1000)}s ago</span>
                <button
                  onClick={() => {
                    setBuzzedClients((prev) => {
                      const updated = new Map(prev);
                      updated.delete(clientId);
                      return updated;
                    });
                  }}
                  className="p-2 bg-red-600 hover:bg-red-500 text-white rounded"
                  title="Clear this buzz"
                >
                  Clear
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

BuzzerHandler.displayName = 'BuzzerHandler';
