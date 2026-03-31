/**
 * Utility Functions Tests
 * Тесты для критических утилит
 */

import { describe, it, expect } from 'vitest';
import { convertYouTubeToEmbed } from './mediaUtils';
import { generateUUID } from './uuid';
import { getHealthBgColor } from './healthColor';

describe('convertYouTubeToEmbed', () => {
  it('should convert standard YouTube watch URL', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const result = convertYouTubeToEmbed(url);

    expect(result).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('should convert youtu.be short URL', () => {
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    const result = convertYouTubeToEmbed(url);

    expect(result).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('should convert embed URL', () => {
    const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    const result = convertYouTubeToEmbed(url);

    expect(result).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('should return original URL if not YouTube', () => {
    const url = 'https://example.com/video.mp4';
    const result = convertYouTubeToEmbed(url);

    expect(result).toBe(url);
  });

  it('should handle video ID only', () => {
    const url = 'dQw4w9WgXcQ';
    const result = convertYouTubeToEmbed(url);

    expect(result).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('should return empty string for empty input', () => {
    const result = convertYouTubeToEmbed('');

    expect(result).toBe('');
  });

  it('should return undefined for null input', () => {
    const result = convertYouTubeToEmbed(null as any);

    expect(result).toBeNull();
  });
});

describe('generateUUID', () => {
  it('should generate unique IDs', () => {
    const id1 = generateUUID();
    const id2 = generateUUID();

    expect(id1).not.toBe(id2);
  });

  it('should generate IDs with consistent format', () => {
    const id = generateUUID();

    expect(id1).toMatch(/^[a-z0-9_-]+$/);
    expect(id.length).toBeGreaterThan(10);
  });

  it('should not generate empty IDs', () => {
    const id = generateUUID();

    expect(id).toBeTruthy();
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('getHealthBgColor', () => {
  it('should return green class for high scores (80+)', () => {
    const result = getHealthBgColor(85);
    expect(result).toContain('green');
  });

  it('should return yellow class for medium scores (50-79)', () => {
    const result = getHealthBgColor(65);
    expect(result).toContain('yellow');
  });

  it('should return red class for low scores (<50)', () => {
    const result = getHealthBgColor(30);
    expect(result).toContain('red');
  });

  it('should return red class for zero score', () => {
    const result = getHealthBgColor(0);
    expect(result).toContain('red');
  });

  it('should handle edge case of exactly 50', () => {
    const result = getHealthBgColor(50);
    expect(result).toContain('yellow');
  });

  it('should handle edge case of exactly 80', () => {
    const result = getHealthBgColor(80);
    expect(result).toContain('green');
  });
});

describe('Utility Integration Tests', () => {
  it('should handle YouTube URL conversion chain correctly', () => {
    // Test typical user workflow
    const userUrl = 'https://youtu.be/dQw4w9WgXcQ';
    const converted = convertYouTubeToEmbed(userUrl);

    expect(converted).toContain('youtube.com/embed/');
    expect(converted).toContain('dQw4w9WgXcQ');
  });

  it('should generate valid UUIDs for different purposes', () => {
    const ids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const id = generateUUID();
      ids.add(id);
    }

    // All IDs should be unique
    expect(ids.size).toBe(100);
  });

  it('should provide consistent health scoring', () => {
    const scores = [100, 75, 50, 25, 0];
    const colors = scores.map(getHealthBgColor);

    // Each score should map to correct color
    expect(colors[0]).toContain('green');
    expect(colors[1]).toContain('green');
    expect(colors[2]).toContain('yellow');
    expect(colors[3]).toContain('red');
    expect(colors[4]).toContain('red');
  });
});
