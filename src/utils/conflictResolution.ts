import { ConflictResolutionResult, SyncStatusCode } from '../types';

const DEVICE_ID_KEY = 'taxguard_device_id';

/**
 * Returns a persistent unique device identifier for Last-Write-Wins tie-breaking.
 */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id || id.trim().length === 0) {
      id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev-client-session';
  }
}

/**
 * Parses timestamp input into deterministic epoch milliseconds.
 * Supports ISO 8601 UTC strings, timestamps, and epoch numbers.
 */
export function parseTimestampEpoch(val: unknown): number {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val;
  }
  if (!val) return 0;
  if (val instanceof Date) {
    return val.getTime();
  }
  const str = String(val).trim();
  const d = new Date(str);
  const time = d.getTime();
  if (!isNaN(time)) {
    return time;
  }
  const parsedNum = Number(str);
  return isNaN(parsedNum) ? 0 : parsedNum;
}

/**
 * MULTI-DEVICE CONFLICT RESOLUTION (Last-Write-Wins with deterministic tie-break):
 * 1. Timestamp-Based Conflict Resolution:
 *    - Compare incoming device payload's updatedAt / versionTimestamp against database's existing record.
 * 2. Rejection & Overwrite Logic:
 *    - If incoming < existing: REJECT completely (REJECTED_STALE_DATA).
 *    - If incoming > existing: ACCEPT and overwrite (SYNC_SUCCESS).
 *    - If incoming === existing: Deterministic tie-break on deviceId / payload hash.
 */
export function resolveLastWriteWins<T extends Record<string, any>>(
  incoming: T,
  existing?: T | null
): ConflictResolutionResult<T> {
  // If no prior record exists in the database, the write is accepted
  if (!existing || Object.keys(existing).length === 0) {
    return {
      status: 'SYNC_SUCCESS',
      code: 'SYNC_SUCCESS',
      winner: 'incoming',
      data: incoming,
      message: 'New record accepted into database.',
    };
  }

  const incomingTs = parseTimestampEpoch(
    incoming.updatedAt || incoming.versionTimestamp || incoming.createdAt
  );
  const existingTs = parseTimestampEpoch(
    existing.updatedAt || existing.versionTimestamp || existing.createdAt
  );

  // 1. Outdated Payload: Incoming timestamp is OLDER than database record
  if (incomingTs < existingTs) {
    return {
      status: 'REJECTED_STALE_DATA',
      code: 'REJECTED_STALE_DATA',
      winner: 'remote',
      remoteData: existing,
      data: incoming,
      message: `REJECTED_STALE_DATA: Incoming payload (${new Date(incomingTs).toISOString()}) is older than remote database (${new Date(existingTs).toISOString()}).`,
    };
  }

  // 2. Up-to-Date Payload: Incoming timestamp is NEWER than database record
  if (incomingTs > existingTs) {
    return {
      status: 'SYNC_SUCCESS',
      code: 'SYNC_SUCCESS',
      winner: 'incoming',
      data: incoming,
      remoteData: existing,
      message: 'SYNC_SUCCESS: Incoming payload is newer and overwrites remote database.',
    };
  }

  // 3. Timestamps are identical: Deterministic fallback (compare device ID or record hash)
  const incomingDevice = String(incoming.lastModifiedByDeviceId || incoming.id || '');
  const existingDevice = String(existing.lastModifiedByDeviceId || existing.id || '');

  if (incomingDevice > existingDevice) {
    return {
      status: 'SYNC_SUCCESS',
      code: 'SYNC_SUCCESS',
      winner: 'incoming',
      data: incoming,
      remoteData: existing,
      message: 'SYNC_SUCCESS: Identical timestamps resolved by deterministic device tie-break (incoming wins).',
    };
  } else if (incomingDevice < existingDevice) {
    return {
      status: 'REJECTED_STALE_DATA',
      code: 'REJECTED_STALE_DATA',
      winner: 'remote',
      remoteData: existing,
      data: incoming,
      message: 'REJECTED_STALE_DATA: Identical timestamps resolved by deterministic device tie-break (remote wins).',
    };
  }

  // Final fallback: Content tie-breaker
  const incomingStr = JSON.stringify(incoming);
  const existingStr = JSON.stringify(existing);
  if (incomingStr >= existingStr) {
    return {
      status: 'SYNC_SUCCESS',
      code: 'SYNC_SUCCESS',
      winner: 'incoming',
      data: incoming,
      remoteData: existing,
      message: 'SYNC_SUCCESS: Content hash tie-break accepted.',
    };
  }

  return {
    status: 'REJECTED_STALE_DATA',
    code: 'REJECTED_STALE_DATA',
    winner: 'remote',
    remoteData: existing,
    data: incoming,
    message: 'REJECTED_STALE_DATA: Content hash tie-break rejected.',
  };
}

/**
 * Decorates a record or state mutation with immutable createdAt, current updatedAt,
 * versionTimestamp epoch, and originating deviceId.
 */
export function createVersionedRecord<T extends Record<string, any>>(
  data: T,
  existingCreatedAt?: number | string
): T & {
  createdAt: string | number;
  updatedAt: string;
  versionTimestamp: number;
  lastModifiedByDeviceId: string;
} {
  const now = new Date();
  const nowIso = now.toISOString();
  const epoch = now.getTime();
  const deviceId = getDeviceId();

  const lockedCreatedAt =
    existingCreatedAt || data.createdAt || nowIso;

  return {
    ...data,
    createdAt: lockedCreatedAt,
    updatedAt: nowIso,
    versionTimestamp: epoch,
    lastModifiedByDeviceId: deviceId,
  };
}
