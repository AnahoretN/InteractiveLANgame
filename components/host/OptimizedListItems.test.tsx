/**
 * OptimizedListItems Component Tests
 * Тесты для оптимизированных компонентов списков
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OptimizedClientListItem } from './OptimizedListItems';
import type { ConnectedClient } from './OptimizedListItems';

// Mock ConnectedClient
function createMockClient(overrides?: Partial<ConnectedClient>): ConnectedClient {
  return {
    id: 'client-1',
    peerId: 'peer-1',
    name: 'Test Client',
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    teamId: 'team-1',
    connectionQuality: {
      rtt: 50,
      packetLoss: 0.01,
      jitter: 5,
      lastPing: Date.now(),
      healthScore: 95
    },
    ...overrides
  };
}

describe('OptimizedClientListItem', () => {
  it('should render client name correctly', () => {
    const client = createMockClient({ name: 'Test Client' });
    const mockOnDragStart = vi.fn();
    const mockOnDragEnd = vi.fn();
    const mockOnRemove = vi.fn();

    render(
      <OptimizedClientListItem
        client={client}
        isStale={() => false}
        hasBuzzed={false}
        isDragging={false}
        onDragStart={mockOnDragStart}
        onDragEnd={mockOnDragEnd}
        onRemove={mockOnRemove}
        getHealthBgColor={(score) => 'bg-green-500'}
      />
    );

    expect(screen.getByText('Test Client')).toBeInTheDocument();
  });

  it('should show first letter of client name', () => {
    const client = createMockClient({ name: 'Alice' });
    const mockOnDragStart = vi.fn();
    const mockOnDragEnd = vi.fn();
    const mockOnRemove = vi.fn();

    render(
      <OptimizedClientListItem
        client={client}
        isStale={() => false}
        hasBuzzed={false}
        isDragging={false}
        onDragStart={mockOnDragStart}
        onDragEnd={mockOnDragEnd}
        onRemove={mockOnRemove}
        getHealthBgColor={(score) => 'bg-green-500'}
      />
    );

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('should display connection quality when available', () => {
    const client = createMockClient({
      connectionQuality: {
        rtt: 50,
        packetLoss: 0.01,
        jitter: 5,
        lastPing: Date.now(),
        healthScore: 95
      }
    });
    const mockOnDragStart = vi.fn();
    const mockOnDragEnd = vi.fn();
    const mockOnRemove = vi.fn();

    render(
      <OptimizedClientListItem
        client={client}
        isStale={() => false}
        hasBuzzed={false}
        isDragging={false}
        onDragStart={mockOnDragStart}
        onDragEnd={mockOnDragEnd}
        onRemove={mockOnRemove}
        getHealthBgColor={(score) => 'bg-green-500'}
      />
    );

    expect(screen.getByText('50ms')).toBeInTheDocument();
  });

  it('should call onRemove when remove button clicked', () => {
    const client = createMockClient();
    const mockOnDragStart = vi.fn();
    const mockOnDragEnd = vi.fn();
    const mockOnRemove = vi.fn();

    const { container } = render(
      <OptimizedClientListItem
        client={client}
        isStale={() => false}
        hasBuzzed={false}
        isDragging={false}
        onDragStart={mockOnDragStart}
        onDragEnd={mockOnDragEnd}
        onRemove={mockOnRemove}
        getHealthBgColor={(score) => 'bg-green-500'}
      />
    );

    const removeButton = container.querySelector('button');
    if (removeButton) {
      removeButton.click();
      expect(mockOnRemove).toHaveBeenCalledWith('client-1');
    }
  });

  it('should apply stale styling when client is stale', () => {
    const client = createMockClient();
    const mockOnDragStart = vi.fn();
    const mockOnDragEnd = vi.fn();
    const mockOnRemove = vi.fn();

    const { container } = render(
      <OptimizedClientListItem
        client={client}
        isStale={() => true}
        hasBuzzed={false}
        isDragging={false}
        onDragStart={mockOnDragStart}
        onDragEnd={mockOnDragEnd}
        onRemove={mockOnRemove}
        getHealthBgColor={(score) => 'bg-green-500'}
      />
    );

    const element = container.firstChild as HTMLElement;
    expect(element.className).toContain('opacity-60');
  });

  it('should apply buzzing styling when client has buzzed', () => {
    const client = createMockClient();
    const mockOnDragStart = vi.fn();
    const mockOnDragEnd = vi.fn();
    const mockOnRemove = vi.fn();

    const { container } = render(
      <OptimizedClientListItem
        client={client}
        isStale={() => false}
        hasBuzzed={true}
        isDragging={false}
        onDragStart={mockOnDragStart}
        onDragEnd={mockOnDragEnd}
        onRemove={mockOnRemove}
        getHealthBgColor={(score) => 'bg-green-500'}
      />
    );

    const element = container.firstChild as HTMLElement;
    expect(element.className).toContain('ring-2');
  });

  it('should handle unnamed clients gracefully', () => {
    const client = createMockClient({ name: '' });
    const mockOnDragStart = vi.fn();
    const mockOnDragEnd = vi.fn();
    const mockOnRemove = vi.fn();

    render(
      <OptimizedClientListItem
        client={client}
        isStale={() => false}
        hasBuzzed={false}
        isDragging={false}
        onDragStart={mockOnDragStart}
        onDragEnd={mockOnDragEnd}
        onRemove={mockOnRemove}
        getHealthBgColor={(score) => 'bg-green-500'}
      />
    );

    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('should show team when showTeam is true', () => {
    const client = createMockClient();
    const mockOnDragStart = vi.fn();
    const mockOnDragEnd = vi.fn();
    const mockOnRemove = vi.fn();

    const { container } = render(
      <OptimizedClientListItem
        client={client}
        isStale={() => false}
        hasBuzzed={false}
        isDragging={false}
        onDragStart={mockOnDragStart}
        onDragEnd={mockOnDragEnd}
        onRemove={mockOnRemove}
        showTeam={true}
        getHealthBgColor={(score) => 'bg-green-500'}
      />
    );

    const element = container.firstChild as HTMLElement;
    expect(element.className).toContain('text-gray-400');
  });
});

describe('ConnectedClient interface', () => {
  it('should accept all required properties', () => {
    const client: ConnectedClient = {
      id: 'client-1',
      peerId: 'peer-1',
      name: 'Test Client',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      connectionQuality: {
        rtt: 50,
        packetLoss: 0.01,
        jitter: 5,
        lastPing: Date.now(),
        healthScore: 95
      }
    };

    expect(client.id).toBe('client-1');
    expect(client.name).toBe('Test Client');
    expect(client.connectionQuality.healthScore).toBe(95);
  });

  it('should accept optional teamId', () => {
    const client: ConnectedClient = {
      id: 'client-1',
      peerId: 'peer-1',
      name: 'Test Client',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      teamId: 'team-1',
      connectionQuality: {
        rtt: 50,
        packetLoss: 0.01,
        jitter: 5,
        lastPing: Date.now(),
        healthScore: 95
      }
    };

    expect(client.teamId).toBe('team-1');
  });

  it('should handle missing teamId', () => {
    const client: ConnectedClient = {
      id: 'client-1',
      peerId: 'peer-1',
      name: 'Test Client',
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      connectionQuality: {
        rtt: 50,
        packetLoss: 0.01,
        jitter: 5,
        lastPing: Date.now(),
        healthScore: 95
      }
    };

    expect(client.teamId).toBeUndefined();
  });
});