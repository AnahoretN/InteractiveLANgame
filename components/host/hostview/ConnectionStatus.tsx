/**
 * ConnectionStatus Component
 * Отображение статуса подключения и количества клиентов
 */

import React, { memo } from 'react';
import { Users, Activity } from 'lucide-react';

interface ConnectionStatusProps {
  clientsCount: number;
  isOnline: boolean;
}

export const ConnectionStatus = memo(({ clientsCount, isOnline }: ConnectionStatusProps) => {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg">
        <Users className="w-4 h-4 text-blue-400" />
        <span className="text-gray-300">
          {clientsCount} {clientsCount === 1 ? 'player' : 'players'} connected
        </span>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg">
        <Activity className={`w-4 h-4 ${isOnline ? 'text-green-400' : 'text-red-400'}`} />
        <span className={isOnline ? 'text-green-400' : 'text-red-400'}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>
    </div>
  );
});

ConnectionStatus.displayName = 'ConnectionStatus';
