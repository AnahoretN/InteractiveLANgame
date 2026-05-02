/**
 * Binary Protocol for Message Serialization
 * Reduces message size and improves transmission efficiency
 *
 * Protocol Format:
 * - Header (4 bytes): [Version (1 byte) | Flags (1 byte) | Type ID (1 byte) | Category ID (1 byte)]
 * - Timestamp (8 bytes): uint64LE
 * - Sender ID (variable): string
 * - Message ID (variable): string
 * - Payload Length (4 bytes): uint32LE
 * - Payload (variable): varies by type
 * - Checksum (4 bytes): CRC32
 */

import { P2PSMessage, MessageCategory } from '../types';

// Protocol version
export const PROTOCOL_VERSION = 1;

// Message type IDs (compact representation)
export enum MessageTypeId {
  HANDSHAKE = 0,
  HANDSHAKE_RESPONSE = 1,
  PING = 2,
  PONG = 3,
  JOIN_TEAM = 4,
  LEAVE_TEAM = 5,
  UPDATE_SCORE = 6,
  TIMER_STATE = 7,
  BUZZ = 8,
  STATE_SYNC = 9,
  STATE_SYNC_REQUEST = 10,
  STATE_DELTA = 11,
  STATE_DELTA_V2 = 12,
  TEAM_CONFIRMED = 13,
  MEDIA_TRANSFER = 14,
  MEDIA_REQUEST = 15,
  MEDIA_READINESS_QUERY = 16,
  MEDIA_READINESS_RESPONSE = 17,
  MEDIA_STATUS_REPORT = 18,
  TIMER_CONTROL = 19,
  TIMER_DISPLAY = 20,
  QR_CODE_STATE = 21,
  TEAM_UPDATE = 22,
  TEAMS_SYNC = 23,
  COMMANDS_LIST = 24,
  GET_COMMANDS = 25,
  MODERATOR_ACTION = 26,
  SUPER_GAME_BET = 27,
  SUPER_GAME_ANSWER = 28,
  BROADCAST = 29,
  BUZZ_EVENT = 30,
  TIMER_PHASE_SWITCH = 31
}

// Message category IDs
export enum CategoryId {
  STATE = 0,
  EVENT = 1,
  SYNC = 2,
  CONTROL = 3
}

// Protocol flags
export const ProtocolFlags = {
  HAS_SEQUENCE: 0x01,
  HAS_SENDER_ID: 0x02,
  COMPRESSED: 0x04,
  ENCRYPTED: 0x08,
  HAS_CHECKSUM: 0x10
};

/**
 * Get message type ID from message type string
 */
export function getMessageTypeId(type: string): MessageTypeId {
  const typeMap: Record<string, MessageTypeId> = {
    'HANDSHAKE': MessageTypeId.HANDSHAKE,
    'HANDSHAKE_RESPONSE': MessageTypeId.HANDSHAKE_RESPONSE,
    'PING': MessageTypeId.PING,
    'PONG': MessageTypeId.PONG,
    'JOIN_TEAM': MessageTypeId.JOIN_TEAM,
    'LEAVE_TEAM': MessageTypeId.LEAVE_TEAM,
    'UPDATE_SCORE': MessageTypeId.UPDATE_SCORE,
    'TIMER_STATE': MessageTypeId.TIMER_STATE,
    'BUZZ': MessageTypeId.BUZZ,
    'STATE_SYNC': MessageTypeId.STATE_SYNC,
    'STATE_SYNC_REQUEST': MessageTypeId.STATE_SYNC_REQUEST,
    'STATE_DELTA': MessageTypeId.STATE_DELTA,
    'STATE_DELTA_V2': MessageTypeId.STATE_DELTA_V2,
    'TEAM_CONFIRMED': MessageTypeId.TEAM_CONFIRMED,
    'MEDIA_TRANSFER': MessageTypeId.MEDIA_TRANSFER,
    'MEDIA_REQUEST': MessageTypeId.MEDIA_REQUEST,
    'MEDIA_READINESS_QUERY': MessageTypeId.MEDIA_READINESS_QUERY,
    'MEDIA_READINESS_RESPONSE': MessageTypeId.MEDIA_READINESS_RESPONSE,
    'MEDIA_STATUS_REPORT': MessageTypeId.MEDIA_STATUS_REPORT,
    'TIMER_CONTROL': MessageTypeId.TIMER_CONTROL,
    'TIMER_DISPLAY': MessageTypeId.TIMER_DISPLAY,
    'QR_CODE_STATE': MessageTypeId.QR_CODE_STATE,
    'TEAM_UPDATE': MessageTypeId.TEAM_UPDATE,
    'TEAMS_SYNC': MessageTypeId.TEAMS_SYNC,
    'COMMANDS_LIST': MessageTypeId.COMMANDS_LIST,
    'GET_COMMANDS': MessageTypeId.GET_COMMANDS,
    'MODERATOR_ACTION': MessageTypeId.MODERATOR_ACTION,
    'SUPER_GAME_BET': MessageTypeId.SUPER_GAME_BET,
    'SUPER_GAME_ANSWER': MessageTypeId.SUPER_GAME_ANSWER,
    'BROADCAST': MessageTypeId.BROADCAST,
    'BUZZ_EVENT': MessageTypeId.BUZZ_EVENT,
    'TIMER_PHASE_SWITCH': MessageTypeId.TIMER_PHASE_SWITCH
  };

  return typeMap[type] ?? MessageTypeId.BROADCAST;
}

/**
 * Get message type string from type ID
 */
export function getMessageTypeName(typeId: MessageTypeId): string {
  const nameMap: Record<MessageTypeId, string> = {
    [MessageTypeId.HANDSHAKE]: 'HANDSHAKE',
    [MessageTypeId.HANDSHAKE_RESPONSE]: 'HANDSHAKE_RESPONSE',
    [MessageTypeId.PING]: 'PING',
    [MessageTypeId.PONG]: 'PONG',
    [MessageTypeId.JOIN_TEAM]: 'JOIN_TEAM',
    [MessageTypeId.LEAVE_TEAM]: 'LEAVE_TEAM',
    [MessageTypeId.UPDATE_SCORE]: 'UPDATE_SCORE',
    [MessageTypeId.TIMER_STATE]: 'TIMER_STATE',
    [MessageTypeId.BUZZ]: 'BUZZ',
    [MessageTypeId.STATE_SYNC]: 'STATE_SYNC',
    [MessageTypeId.STATE_SYNC_REQUEST]: 'STATE_SYNC_REQUEST',
    [MessageTypeId.STATE_DELTA]: 'STATE_DELTA',
    [MessageTypeId.STATE_DELTA_V2]: 'STATE_DELTA_V2',
    [MessageTypeId.TEAM_CONFIRMED]: 'TEAM_CONFIRMED',
    [MessageTypeId.MEDIA_TRANSFER]: 'MEDIA_TRANSFER',
    [MessageTypeId.MEDIA_REQUEST]: 'MEDIA_REQUEST',
    [MessageTypeId.MEDIA_READINESS_QUERY]: 'MEDIA_READINESS_QUERY',
    [MessageTypeId.MEDIA_READINESS_RESPONSE]: 'MEDIA_READINESS_RESPONSE',
    [MessageTypeId.MEDIA_STATUS_REPORT]: 'MEDIA_STATUS_REPORT',
    [MessageTypeId.TIMER_CONTROL]: 'TIMER_CONTROL',
    [MessageTypeId.TIMER_DISPLAY]: 'TIMER_DISPLAY',
    [MessageTypeId.QR_CODE_STATE]: 'QR_CODE_STATE',
    [MessageTypeId.TEAM_UPDATE]: 'TEAM_UPDATE',
    [MessageTypeId.TEAMS_SYNC]: 'TEAMS_SYNC',
    [MessageTypeId.COMMANDS_LIST]: 'COMMANDS_LIST',
    [MessageTypeId.GET_COMMANDS]: 'GET_COMMANDS',
    [MessageTypeId.MODERATOR_ACTION]: 'MODERATOR_ACTION',
    [MessageTypeId.SUPER_GAME_BET]: 'SUPER_GAME_BET',
    [MessageTypeId.SUPER_GAME_ANSWER]: 'SUPER_GAME_ANSWER',
    [MessageTypeId.BROADCAST]: 'BROADCAST',
    [MessageTypeId.BUZZ_EVENT]: 'BUZZ_EVENT',
    [MessageTypeId.TIMER_PHASE_SWITCH]: 'TIMER_PHASE_SWITCH'
  };

  return nameMap[typeId] ?? 'BROADCAST';
}

/**
 * Get category ID from message category
 */
export function getCategoryId(category: MessageCategory): CategoryId {
  const categoryMap: Record<MessageCategory, CategoryId> = {
    'state': CategoryId.STATE,
    'event': CategoryId.EVENT,
    'sync': CategoryId.SYNC,
    'control': CategoryId.CONTROL
  };

  return categoryMap[category] ?? CategoryId.STATE;
}

/**
 * Get message category from category ID
 */
export function getCategoryFromId(categoryId: CategoryId): MessageCategory {
  const categoryMap: Record<CategoryId, MessageCategory> = {
    [CategoryId.STATE]: 'state',
    [CategoryId.EVENT]: 'event',
    [CategoryId.SYNC]: 'sync',
    [CategoryId.CONTROL]: 'control'
  };

  return categoryMap[categoryId] ?? 'state';
}

/**
 * Binary Encoder
 */
export class BinaryEncoder {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset: number;

  constructor(initialSize = 1024) {
    this.buffer = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buffer);
    this.offset = 0;
  }

  /**
   * Ensure buffer has enough space
   */
  private ensureCapacity(required: number): void {
    while (this.offset + required > this.buffer.byteLength) {
      const newBuffer = new ArrayBuffer(this.buffer.byteLength * 2);
      new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer);
    }
  }

  /**
   * Write uint8
   */
  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  /**
   * Write uint16 (little endian)
   */
  writeUint16LE(value: number): void {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  /**
   * Write uint32 (little endian)
   */
  writeUint32LE(value: number): void {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  /**
   * Write uint64 (little endian) - stores as two uint32
   */
  writeUint64LE(value: number): void {
    this.ensureCapacity(8);
    // Split into high and low 32 bits
    const low = value >>> 0;
    const high = Math.floor(value / 0x100000000) >>> 0;
    this.view.setUint32(this.offset, low, true);
    this.view.setUint32(this.offset + 4, high, true);
    this.offset += 8;
  }

  /**
   * Write string (UTF-8)
   */
  writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    this.writeUint16LE(bytes.length); // Length prefix
    this.ensureCapacity(bytes.length);
    new Uint8Array(this.buffer).set(bytes, this.offset);
    this.offset += bytes.length;
  }

  /**
   * Write bytes
   */
  writeBytes(bytes: Uint8Array): void {
    this.writeUint32LE(bytes.length);
    this.ensureCapacity(bytes.length);
    new Uint8Array(this.buffer).set(bytes, this.offset);
    this.offset += bytes.length;
  }

  /**
   * Get encoded data
   */
  getData(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.offset);
  }

  /**
   * Get current offset
   */
  getOffset(): number {
    return this.offset;
  }
}

/**
 * Binary Decoder
 */
export class BinaryDecoder {
  private view: DataView;
  private offset: number;
  private readonly length: number;

  constructor(data: ArrayBuffer | Uint8Array) {
    if (data instanceof Uint8Array) {
      this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    } else {
      this.view = new DataView(data);
    }
    this.offset = 0;
    this.length = this.view.byteLength;
  }

  /**
   * Check if there's enough data to read
   */
  private ensureAvailable(required: number): void {
    if (this.offset + required > this.length) {
      throw new Error(`Not enough data: need ${required}, have ${this.length - this.offset}`);
    }
  }

  /**
   * Read uint8
   */
  readUint8(): number {
    this.ensureAvailable(1);
    return this.view.getUint8(this.offset++);
  }

  /**
   * Read uint16 (little endian)
   */
  readUint16LE(): number {
    this.ensureAvailable(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  /**
   * Read uint32 (little endian)
   */
  readUint32LE(): number {
    this.ensureAvailable(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  /**
   * Read uint64 (little endian) - reads as two uint32
   */
  readUint64LE(): number {
    this.ensureAvailable(8);
    const low = this.view.getUint32(this.offset, true);
    const high = this.view.getUint32(this.offset + 4, true);
    this.offset += 8;
    // Combine high and low
    return high * 0x100000000 + low;
  }

  /**
   * Read string (UTF-8)
   */
  readString(): string {
    const length = this.readUint16LE();
    this.ensureAvailable(length);
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }

  /**
   * Read bytes
   */
  readBytes(): Uint8Array {
    const length = this.readUint32LE();
    this.ensureAvailable(length);
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return bytes;
  }

  /**
   * Check if at end of data
   */
  atEnd(): boolean {
    return this.offset >= this.length;
  }

  /**
   * Get current offset
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Get remaining bytes
   */
  getRemaining(): number {
    return this.length - this.offset;
  }
}

/**
 * Calculate CRC32 checksum
 */
export function calculateCRC32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc >>>= 1;
      }
    }
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Encode message to binary format
 */
export function encodeMessage(message: P2PSMessage): Uint8Array {
  const encoder = new BinaryEncoder();

  // Write header
  const typeId = getMessageTypeId(message.type);
  const categoryId = getCategoryId(message.category);
  const flags = 0;

  encoder.writeUint8(PROTOCOL_VERSION); // Version
  encoder.writeUint8(flags); // Flags
  encoder.writeUint8(typeId); // Type ID
  encoder.writeUint8(categoryId); // Category ID

  // Write timestamp
  encoder.writeUint64LE(message.timestamp);

  // Write sender ID
  encoder.writeString(message.senderId);

  // Write message ID
  encoder.writeString(message.id);

  // Serialize payload as JSON (for simplicity, could be optimized per type)
  const payloadJson = JSON.stringify(message.payload);
  const payloadBytes = new TextEncoder().encode(payloadJson);
  encoder.writeBytes(payloadBytes);

  // Calculate and write checksum
  const dataWithoutChecksum = encoder.getData();
  const checksum = calculateCRC32(dataWithoutChecksum);
  encoder.writeUint32LE(checksum);

  return encoder.getData();
}

/**
 * Decode message from binary format
 */
export function decodeMessage(data: ArrayBuffer | Uint8Array): P2PSMessage | null {
  try {
    const decoder = new BinaryDecoder(data);

    // Read header
    const version = decoder.readUint8();
    if (version !== PROTOCOL_VERSION) {
      console.warn(`[BinaryProtocol] Unsupported protocol version: ${version}`);
      return null;
    }

    const flags = decoder.readUint8();
    const typeId = decoder.readUint8() as MessageTypeId;
    const categoryId = decoder.readUint8() as CategoryId;

    // Read timestamp
    const timestamp = decoder.readUint64LE();

    // Read sender ID
    const senderId = decoder.readString();

    // Read message ID
    const id = decoder.readString();

    // Read payload
    const payloadBytes = decoder.readBytes();
    const payloadJson = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadJson);

    // Verify checksum
    const checksumOffset = decoder.getOffset();
    if (checksumOffset + 4 <= decoder.getRemaining() + checksumOffset) {
      // Read checksum
      const expectedChecksum = decoder.readUint32LE();
      const dataWithoutChecksum = new Uint8Array(data as ArrayBuffer, 0, checksumOffset);
      const actualChecksum = calculateCRC32(dataWithoutChecksum);

      if (expectedChecksum !== actualChecksum) {
        console.warn(`[BinaryProtocol] Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`);
        return null;
      }
    }

    // Construct message
    const type = getMessageTypeName(typeId);
    const category = getCategoryFromId(categoryId);

    return {
      id,
      category,
      timestamp,
      type,
      senderId,
      payload
    } as P2PSMessage;
  } catch (error) {
    console.error('[BinaryProtocol] Decode error:', error);
    return null;
  }
}

/**
 * Check if message should use binary encoding
 * Some messages benefit more from binary encoding than others
 */
export function shouldUseBinaryEncoding(message: P2PSMessage): boolean {
  // Always use binary for control and sync messages
  if (message.category === 'control' || message.category === 'sync') {
    return true;
  }

  // Use binary for state messages with simple payloads
  if (message.category === 'state') {
    const simpleTypes = ['TIMER_CONTROL', 'TIMER_STATE', 'UPDATE_SCORE'];
    return simpleTypes.includes(message.type);
  }

  // Use JSON for complex event messages
  return false;
}

/**
 * Estimate size reduction of binary encoding vs JSON
 */
export function estimateSizeReduction(message: P2PSMessage): number {
  const jsonSize = JSON.stringify(message).length;
  const binarySize = encodeMessage(message).length;
  return Math.round((1 - binarySize / jsonSize) * 100);
}

/**
 * Binary Protocol Statistics
 */
export class BinaryProtocolStats {
  private encoded = 0;
  private decoded = 0;
  private jsonFallback = 0;
  private totalJsonSize = 0;
  private totalBinarySize = 0;
  private checksumErrors = 0;

  recordEncoded(jsonSize: number, binarySize: number): void {
    this.encoded++;
    this.totalJsonSize += jsonSize;
    this.totalBinarySize += binarySize;
  }

  recordDecoded(): void {
    this.decoded++;
  }

  recordJsonFallback(): void {
    this.jsonFallback++;
  }

  recordChecksumError(): void {
    this.checksumErrors++;
  }

  getStats(): {
    encoded: number;
    decoded: number;
    jsonFallback: number;
    checksumErrors: number;
    avgSizeReduction: number;
    totalBytesSaved: number;
  } {
    const avgSizeReduction = this.totalJsonSize > 0
      ? Math.round((1 - this.totalBinarySize / this.totalJsonSize) * 100)
      : 0;

    return {
      encoded: this.encoded,
      decoded: this.decoded,
      jsonFallback: this.jsonFallback,
      checksumErrors: this.checksumErrors,
      avgSizeReduction,
      totalBytesSaved: this.totalJsonSize - this.totalBinarySize
    };
  }

  reset(): void {
    this.encoded = 0;
    this.decoded = 0;
    this.jsonFallback = 0;
    this.totalJsonSize = 0;
    this.totalBinarySize = 0;
    this.checksumErrors = 0;
  }
}

// Global stats instance
export const binaryProtocolStats = new BinaryProtocolStats();

export default {
  encodeMessage,
  decodeMessage,
  shouldUseBinaryEncoding,
  estimateSizeReduction,
  stats: binaryProtocolStats
};
