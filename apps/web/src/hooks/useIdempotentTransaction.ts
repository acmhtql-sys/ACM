import { useState, useCallback, useRef, useEffect } from 'react';
import {
  IdempotencyState,
  ImmutableRequestSnapshot,
  IdempotencyErrorCategory,
  AuthoritativeReconciliationProof,
  IdempotencyStatusCheckResult,
  StockConflictItem,
} from '../types/stock-transactions';
import { parseStockError } from '../services/stock-error-parser';

export function generateUUID(): string {
  // Use crypto.randomUUID if available, else fallback RFC4122 v4
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Ambiguous Session Persistence (Minimal Metadata & Fail-Closed Guard)
 * Prevents escaping lock by modal close or remount while a transaction has unverified commit status.
 * Stores non-sensitive transaction metadata (userId, endpoint, key, state, timestamp).
 * Never stores authorization tokens, secrets, or arbitrary unverified payloads.
 */
export interface AmbiguousSessionMeta {
  endpoint: string;
  userId: string;
  idempotencyKey: string;
  state: 'AMBIGUOUS_OUTCOME' | 'RECONCILIATION_REQUIRED' | 'SUBMITTING';
  errorMessage: string | null;
  errorCategory: IdempotencyErrorCategory | null;
  timestamp: number;
  metadataSummary?: {
    itemCount?: number;
    notes?: string;
  };
  isPreDispatchPending?: boolean;
}

export interface AmbiguousSessionEntry<TPayload = any> {
  endpoint: string;
  userId: string;
  idempotencyKey: string;
  state: 'AMBIGUOUS_OUTCOME' | 'RECONCILIATION_REQUIRED';
  snapshot: ImmutableRequestSnapshot<TPayload> | null;
  errorMessage: string | null;
  errorCategory: IdempotencyErrorCategory | null;
  conflict: StockConflictItem | null;
  timestamp: number;
}

const memoryAmbiguousRegistry = new Map<string, AmbiguousSessionEntry>();

export function getSessionStorageKey(userId: string, endpoint: string): string {
  return `acm_ambiguous_stock_session_${userId}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export function isValidAmbiguousSessionMeta(
  data: any,
  expectedUserId: string,
  expectedEndpoint: string
): data is AmbiguousSessionMeta {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.endpoint !== 'string' || data.endpoint !== expectedEndpoint) return false;
  if (typeof data.userId !== 'string' || data.userId !== expectedUserId) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof data.idempotencyKey !== 'string' || !uuidRegex.test(data.idempotencyKey)) return false;
  if (
    data.state !== 'AMBIGUOUS_OUTCOME' &&
    data.state !== 'RECONCILIATION_REQUIRED' &&
    data.state !== 'SUBMITTING'
  ) {
    return false;
  }
  if (typeof data.timestamp !== 'number' || isNaN(data.timestamp) || data.timestamp <= 0) return false;
  // Security Guard: Never allow authorization tokens or secrets in sessionStorage
  if ('authorizationSecretOrToken' in data || 'token' in data || 'secret' in data) return false;
  return true;
}

export function getPerKeyStorageKey(userId: string, endpoint: string, idempotencyKey: string): string {
  return `${getSessionStorageKey(userId, endpoint)}__key_${idempotencyKey}`;
}

export function isMarkerUnresolved(state?: string, isPreDispatch?: boolean): boolean {
  return (
    isPreDispatch === true ||
    state === 'SUBMITTING' ||
    state === 'AMBIGUOUS_OUTCOME' ||
    state === 'RECONCILIATION_REQUIRED'
  );
}

export interface StorageScanResult {
  hasCorrupted: boolean;
  corruptedDetails?: string;
  unresolvedEntries: AmbiguousSessionEntry[];
}

function metaToEntry<TPayload = any>(parsed: AmbiguousSessionMeta): AmbiguousSessionEntry<TPayload> {
  const isPreDispatch = parsed.state === 'SUBMITTING' || parsed.isPreDispatchPending === true;
  const restoredState: 'AMBIGUOUS_OUTCOME' | 'RECONCILIATION_REQUIRED' =
    parsed.state === 'RECONCILIATION_REQUIRED' ? 'RECONCILIATION_REQUIRED' : 'AMBIGUOUS_OUTCOME';
  const restoredErrorMessage = isPreDispatch
    ? (parsed.errorMessage || 'Giao dịch đã được phát đi nhưng phiên làm việc bị gián đoạn trước khi nhận được phản hồi. Trạng thái bất định, cần tra cứu máy chủ (GET Idempotency).')
    : (parsed.errorMessage || null);

  return {
    endpoint: parsed.endpoint,
    userId: parsed.userId,
    idempotencyKey: parsed.idempotencyKey,
    state: restoredState,
    snapshot: null,
    errorMessage: restoredErrorMessage,
    errorCategory: parsed.errorCategory || (isPreDispatch ? 'NETWORK_TIMEOUT' : null),
    conflict: null,
    timestamp: parsed.timestamp,
  };
}

export function scanAllStorageMarkers(
  userId: string,
  endpoint: string
): StorageScanResult {
  const result: StorageScanResult = {
    hasCorrupted: false,
    unresolvedEntries: [],
  };

  const primaryStorageKey = getSessionStorageKey(userId, endpoint);
  const perKeyPrefix = `${primaryStorageKey}__key_`;
  const primaryMemoryKey = `${userId}::${endpoint}`;
  const perKeyMemoryPrefix = `${primaryMemoryKey}::`;

  // 1. Scan memory registry
  for (const [key, entry] of memoryAmbiguousRegistry.entries()) {
    if (key === primaryMemoryKey || key.startsWith(perKeyMemoryPrefix)) {
      if (entry && isMarkerUnresolved(entry.state)) {
        if (!result.unresolvedEntries.some((e) => e.idempotencyKey === entry.idempotencyKey)) {
          result.unresolvedEntries.push(entry);
        }
      }
    }
  }

  // 2. Scan sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      // Check primary slot
      const primaryRaw = window.sessionStorage.getItem(primaryStorageKey);
      if (primaryRaw !== null) {
        let parsed: any;
        try {
          parsed = JSON.parse(primaryRaw);
        } catch {
          result.hasCorrupted = true;
          result.corruptedDetails = 'Primary slot contains invalid JSON';
          return result;
        }

        if (!isValidAmbiguousSessionMeta(parsed, userId, endpoint)) {
          result.hasCorrupted = true;
          result.corruptedDetails = 'Primary slot contains invalid session schema';
          return result;
        }

        if (isMarkerUnresolved(parsed.state, parsed.isPreDispatchPending)) {
          const entry = metaToEntry(parsed);
          if (!result.unresolvedEntries.some((e) => e.idempotencyKey === entry.idempotencyKey)) {
            result.unresolvedEntries.push(entry);
          }
        }
      }

      // Scan all per-key slots
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(perKeyPrefix)) {
          const raw = window.sessionStorage.getItem(k);
          if (raw !== null) {
            let parsed: any;
            try {
              parsed = JSON.parse(raw);
            } catch {
              result.hasCorrupted = true;
              result.corruptedDetails = `Per-key slot ${k} contains invalid JSON`;
              return result;
            }

            if (!isValidAmbiguousSessionMeta(parsed, userId, endpoint)) {
              result.hasCorrupted = true;
              result.corruptedDetails = `Per-key slot ${k} contains invalid session schema`;
              return result;
            }

            if (isMarkerUnresolved(parsed.state, parsed.isPreDispatchPending)) {
              const entry = metaToEntry(parsed);
              if (!result.unresolvedEntries.some((e) => e.idempotencyKey === entry.idempotencyKey)) {
                result.unresolvedEntries.push(entry);
              }
            }
          }
        }
      }
    } catch {
      result.hasCorrupted = true;
      result.corruptedDetails = 'SessionStorage access failure';
      return result;
    }
  }

  return result;
}

export function clearMemoryRegistryOnly(): void {
  memoryAmbiguousRegistry.clear();
}

export function recordPreDispatchMarker(params: {
  endpoint: string;
  userId: string;
  idempotencyKey: string;
  itemCount?: number;
}): boolean {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return false;
  }
  const primaryStorageKey = getSessionStorageKey(params.userId, params.endpoint);
  const perKeyStorageKey = getPerKeyStorageKey(params.userId, params.endpoint, params.idempotencyKey);
  const memoryKey = `${params.userId}::${params.endpoint}`;

  // 1. Scan all storage markers
  const scanResult = scanAllStorageMarkers(params.userId, params.endpoint);
  if (scanResult.hasCorrupted) {
    // TASK 3: Corrupted storage must fail closed
    return false;
  }

  // 2. TASK 1: If ANY unresolved marker exists with a different key, FAIL CLOSED!
  if (scanResult.unresolvedEntries.some((e) => e.idempotencyKey !== params.idempotencyKey)) {
    return false;
  }

  const meta: AmbiguousSessionMeta = {
    endpoint: params.endpoint,
    userId: params.userId,
    idempotencyKey: params.idempotencyKey,
    state: 'SUBMITTING',
    isPreDispatchPending: true,
    errorMessage:
      'Giao dịch đã được phát đi nhưng phiên làm việc bị gián đoạn trước khi nhận được phản hồi. Trạng thái bất định, cần tra cứu máy chủ (GET Idempotency).',
    errorCategory: 'NETWORK_TIMEOUT',
    timestamp: Date.now(),
    metadataSummary: params.itemCount ? { itemCount: params.itemCount } : undefined,
  };

  const serialized = JSON.stringify(meta);
  let prevPrimaryRaw: string | null = null;
  let prevPerKeyRaw: string | null = null;

  try {
    prevPrimaryRaw = window.sessionStorage.getItem(primaryStorageKey);
    prevPerKeyRaw = window.sessionStorage.getItem(perKeyStorageKey);
  } catch {
    return false;
  }

  let primaryWritten = false;
  let perKeyWritten = false;

  try {
    // Step A: Write primary slot
    window.sessionStorage.setItem(primaryStorageKey, serialized);
    primaryWritten = true;

    // Step B: Write per-key slot
    window.sessionStorage.setItem(perKeyStorageKey, serialized);
    perKeyWritten = true;

    // Step C: Verify read-back strictly for BOTH
    const readPrimary = window.sessionStorage.getItem(primaryStorageKey);
    const readPerKey = window.sessionStorage.getItem(perKeyStorageKey);
    if (!readPrimary || !readPerKey) {
      throw new Error('Read-back verification failed');
    }
    const parsedPrim = JSON.parse(readPrimary);
    const parsedKey = JSON.parse(readPerKey);
    if (
      parsedPrim.idempotencyKey !== params.idempotencyKey ||
      parsedKey.idempotencyKey !== params.idempotencyKey
    ) {
      throw new Error('IdempotencyKey verification mismatch');
    }

    // Step D: Storage persistence guaranteed! Now update memory registry.
    const memoryEntry: AmbiguousSessionEntry = {
      endpoint: params.endpoint,
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: meta.errorMessage,
      errorCategory: meta.errorCategory,
      conflict: null,
      timestamp: meta.timestamp,
    };

    memoryAmbiguousRegistry.set(memoryKey, memoryEntry);
    memoryAmbiguousRegistry.set(`${memoryKey}::${params.idempotencyKey}`, memoryEntry);

    return true;
  } catch {
    // TRANSACTION ROLLBACK (TASK 2):
    // Roll back primary slot if written
    if (primaryWritten) {
      try {
        if (prevPrimaryRaw !== null) {
          window.sessionStorage.setItem(primaryStorageKey, prevPrimaryRaw);
        } else {
          window.sessionStorage.removeItem(primaryStorageKey);
        }
      } catch {
        // Rollback attempt
      }
    }

    // Roll back per-key slot if written
    if (perKeyWritten) {
      try {
        if (prevPerKeyRaw !== null) {
          window.sessionStorage.setItem(perKeyStorageKey, prevPerKeyRaw);
        } else {
          window.sessionStorage.removeItem(perKeyStorageKey);
        }
      } catch {
        // Rollback attempt
      }
    }

    // Do NOT update memory registry!
    return false;
  }
}

export function getPendingAmbiguousSession<TPayload = any>(
  userId: string,
  endpoint: string,
  idempotencyKey?: string
): AmbiguousSessionEntry<TPayload> | null {
  const primaryMemoryKey = `${userId}::${endpoint}`;

  // 1. Scan all storage markers
  const scanResult = scanAllStorageMarkers(userId, endpoint);

  // 2. TASK 3: If storage is corrupted, fail-closed!
  if (scanResult.hasCorrupted) {
    const corruptedEntry: AmbiguousSessionEntry<any> = {
      endpoint,
      userId,
      idempotencyKey: idempotencyKey || '00000000-0000-0000-0000-000000000000',
      state: 'RECONCILIATION_REQUIRED',
      snapshot: null,
      errorMessage: 'Dữ liệu phiên đối soát bị lỗi hoặc bị can thiệp. Kích hoạt khóa an toàn fail-closed.',
      errorCategory: 'UNKNOWN',
      conflict: null,
      timestamp: Date.now(),
    };
    memoryAmbiguousRegistry.set(primaryMemoryKey, corruptedEntry);
    return corruptedEntry;
  }

  // 3. If specific idempotencyKey requested:
  if (idempotencyKey) {
    const match = scanResult.unresolvedEntries.find((e) => e.idempotencyKey === idempotencyKey);
    if (match) {
      return match as AmbiguousSessionEntry<TPayload>;
    }
    const memPerKey = memoryAmbiguousRegistry.get(`${primaryMemoryKey}::${idempotencyKey}`);
    if (memPerKey) {
      return memPerKey as AmbiguousSessionEntry<TPayload>;
    }
    const memPrim = memoryAmbiguousRegistry.get(primaryMemoryKey);
    if (memPrim && memPrim.idempotencyKey === idempotencyKey) {
      return memPrim as AmbiguousSessionEntry<TPayload>;
    }
    return null;
  }

  // 4. If no specific idempotencyKey requested (mount / reload / recovery):
  // Check if primary slot has an unresolved entry
  const primaryStorageKey = typeof window !== 'undefined' ? getSessionStorageKey(userId, endpoint) : '';
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const primaryRaw = window.sessionStorage.getItem(primaryStorageKey);
    if (primaryRaw) {
      try {
        const parsed = JSON.parse(primaryRaw);
        if (isMarkerUnresolved(parsed.state, parsed.isPreDispatchPending)) {
          const entry = metaToEntry<TPayload>(parsed);
          memoryAmbiguousRegistry.set(primaryMemoryKey, entry);
          return entry;
        }
      } catch {
        // Handled in scan
      }
    }
  }

  const memPrim = memoryAmbiguousRegistry.get(primaryMemoryKey);
  if (memPrim && isMarkerUnresolved(memPrim.state)) {
    return memPrim as AmbiguousSessionEntry<TPayload>;
  }

  // TASK 1 & MARKER-08: If primary slot is empty or resolved, but per-key slot has an unresolved entry:
  // PROMOTE the first unresolved per-key marker to primary so it is visible and can be resolved!
  if (scanResult.unresolvedEntries.length > 0) {
    const nextEntry = scanResult.unresolvedEntries[0] as AmbiguousSessionEntry<TPayload>;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const nextMeta: AmbiguousSessionMeta = {
        endpoint: nextEntry.endpoint,
        userId: nextEntry.userId,
        idempotencyKey: nextEntry.idempotencyKey,
        state: nextEntry.state,
        errorMessage: nextEntry.errorMessage,
        errorCategory: nextEntry.errorCategory,
        timestamp: nextEntry.timestamp,
      };
      try {
        window.sessionStorage.setItem(primaryStorageKey, JSON.stringify(nextMeta));
      } catch {
        // Ignore
      }
    }
    memoryAmbiguousRegistry.set(primaryMemoryKey, nextEntry);
    return nextEntry;
  }

  return null;
}

export function savePendingAmbiguousSession<TPayload = any>(
  entry: AmbiguousSessionEntry<TPayload>
): void {
  const primaryMemoryKey = `${entry.userId}::${entry.endpoint}`;
  const perKeyMemoryKey = `${primaryMemoryKey}::${entry.idempotencyKey}`;
  const primaryStorageKey =
    typeof window !== 'undefined' ? getSessionStorageKey(entry.userId, entry.endpoint) : '';
  const perKeyStorageKey =
    typeof window !== 'undefined' ? getPerKeyStorageKey(entry.userId, entry.endpoint, entry.idempotencyKey) : '';

  // 1. Scan storage markers first
  const scanResult = scanAllStorageMarkers(entry.userId, entry.endpoint);
  if (scanResult.hasCorrupted) {
    // TASK 3 & MARKER-10: Corrupted storage!
    // NEVER silently overwrite corrupted storage! Fail-closed!
    const corruptedEntry: AmbiguousSessionEntry<any> = {
      endpoint: entry.endpoint,
      userId: entry.userId,
      idempotencyKey: '00000000-0000-0000-0000-000000000000',
      state: 'RECONCILIATION_REQUIRED',
      snapshot: null,
      errorMessage: 'Dữ liệu phiên đối soát bị lỗi hoặc bị can thiệp. Kích hoạt khóa an toàn fail-closed.',
      errorCategory: 'UNKNOWN',
      conflict: null,
      timestamp: Date.now(),
    };
    memoryAmbiguousRegistry.set(primaryMemoryKey, corruptedEntry);
    return;
  }

  const meta: AmbiguousSessionMeta = {
    endpoint: entry.endpoint,
    userId: entry.userId,
    idempotencyKey: entry.idempotencyKey,
    state: entry.state,
    errorMessage: entry.errorMessage,
    errorCategory: entry.errorCategory,
    timestamp: entry.timestamp,
    metadataSummary: (entry.snapshot?.exactPayload as any)?.items
      ? {
          itemCount: Array.isArray((entry.snapshot?.exactPayload as any).items)
            ? (entry.snapshot?.exactPayload as any).items.length
            : 1,
        }
      : undefined,
  };
  const serialized = JSON.stringify(meta);

  // Check whether primary slot belongs to another key
  let primaryBelongsToAnotherKey = false;
  if (scanResult.unresolvedEntries.some((e) => e.idempotencyKey !== entry.idempotencyKey)) {
    const existingMemory = memoryAmbiguousRegistry.get(primaryMemoryKey);
    if (existingMemory && existingMemory.idempotencyKey !== entry.idempotencyKey) {
      primaryBelongsToAnotherKey = true;
    }
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const existingRaw = window.sessionStorage.getItem(primaryStorageKey);
      if (existingRaw) {
        try {
          const parsed = JSON.parse(existingRaw);
          if (parsed && parsed.idempotencyKey !== entry.idempotencyKey) {
            primaryBelongsToAnotherKey = true;
          }
        } catch {
          // Handled
        }
      }
    }
  }

  // 2. Write to storage with rollback protection
  const hasStorage = typeof window !== 'undefined' && !!window.sessionStorage;
  if (hasStorage) {
    let primaryWritten = false;
    let perKeyWritten = false;
    let prevPrimaryRaw: string | null = null;
    let prevPerKeyRaw: string | null = null;

    try {
      prevPrimaryRaw = window.sessionStorage.getItem(primaryStorageKey);
      prevPerKeyRaw = window.sessionStorage.getItem(perKeyStorageKey);

      if (!primaryBelongsToAnotherKey) {
        window.sessionStorage.setItem(primaryStorageKey, serialized);
        primaryWritten = true;
      }
      window.sessionStorage.setItem(perKeyStorageKey, serialized);
      perKeyWritten = true;
    } catch {
      // Rollback on storage failure!
      if (primaryWritten && !primaryBelongsToAnotherKey) {
        try {
          if (prevPrimaryRaw !== null) {
            window.sessionStorage.setItem(primaryStorageKey, prevPrimaryRaw);
          } else {
            window.sessionStorage.removeItem(primaryStorageKey);
          }
        } catch {
          // Ignore
        }
      }
      if (perKeyWritten) {
        try {
          if (prevPerKeyRaw !== null) {
            window.sessionStorage.setItem(perKeyStorageKey, prevPerKeyRaw);
          } else {
            window.sessionStorage.removeItem(perKeyStorageKey);
          }
        } catch {
          // Ignore
        }
      }
      return;
    }
  }

  // 3. Only update memory registry AFTER storage write succeeds
  if (!primaryBelongsToAnotherKey) {
    memoryAmbiguousRegistry.set(primaryMemoryKey, entry);
  }
  memoryAmbiguousRegistry.set(perKeyMemoryKey, entry);
}

export function clearPendingAmbiguousSession(
  userId: string,
  endpoint: string,
  expectedKey?: string
): void {
  const primaryMemoryKey = `${userId}::${endpoint}`;
  const primaryStorageKey =
    typeof window !== 'undefined' ? getSessionStorageKey(userId, endpoint) : '';

  if (expectedKey) {
    // 1. Clear per-key memory slot
    memoryAmbiguousRegistry.delete(`${primaryMemoryKey}::${expectedKey}`);

    // 2. Clear per-key storage slot
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.removeItem(getPerKeyStorageKey(userId, endpoint, expectedKey));
      } catch {
        // Ignore
      }
    }

    // 3. Clear primary memory slot ONLY IF it matches expectedKey
    const existingMemory = memoryAmbiguousRegistry.get(primaryMemoryKey);
    if (existingMemory && existingMemory.idempotencyKey === expectedKey) {
      memoryAmbiguousRegistry.delete(primaryMemoryKey);
    }

    // 4. Clear primary storage slot ONLY IF it matches expectedKey
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const item = window.sessionStorage.getItem(primaryStorageKey);
        if (item) {
          try {
            const parsed = JSON.parse(item);
            if (parsed && parsed.idempotencyKey === expectedKey) {
              window.sessionStorage.removeItem(primaryStorageKey);
            }
          } catch {
            // Handled
          }
        }
      } catch {
        // Ignore
      }
    }

    // 5. TASK 1: If primary slot was cleared, check if there is ANOTHER unresolved per-key marker:
    // Promote the next unresolved marker to primary slot!
    const remainingScan = scanAllStorageMarkers(userId, endpoint);
    if (!remainingScan.hasCorrupted && remainingScan.unresolvedEntries.length > 0) {
      const nextEntry = remainingScan.unresolvedEntries[0];
      const nextMeta: AmbiguousSessionMeta = {
        endpoint: nextEntry.endpoint,
        userId: nextEntry.userId,
        idempotencyKey: nextEntry.idempotencyKey,
        state: nextEntry.state,
        errorMessage: nextEntry.errorMessage,
        errorCategory: nextEntry.errorCategory,
        timestamp: nextEntry.timestamp,
      };
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          window.sessionStorage.setItem(primaryStorageKey, JSON.stringify(nextMeta));
        } catch {
          // Ignore
        }
      }
      memoryAmbiguousRegistry.set(primaryMemoryKey, nextEntry);
    }
    return;
  }

  // Unconditional clear of all slots for userId and endpoint
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(primaryStorageKey);
      const perKeyPrefix = `${primaryStorageKey}__key_`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(perKeyPrefix)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      // Ignore
    }
  }

  memoryAmbiguousRegistry.delete(primaryMemoryKey);
  const perKeyMemPrefix = `${primaryMemoryKey}::`;
  for (const k of Array.from(memoryAmbiguousRegistry.keys())) {
    if (k.startsWith(perKeyMemPrefix)) {
      memoryAmbiguousRegistry.delete(k);
    }
  }
}

export function clearAllPendingAmbiguousSessions(): void {
  memoryAmbiguousRegistry.clear();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith('acm_ambiguous_stock_session_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      // Ignore
    }
  }
}

export interface UseIdempotentTransactionOptions<TPayload, TResult> {
  endpoint: string;
  userId: string;
  onSuccess?: (result: TResult, snapshot: ImmutableRequestSnapshot<TPayload> | null) => void;
  onError?: (error: any, snapshot: ImmutableRequestSnapshot<TPayload> | null) => void;
  onConflict?: (conflict: StockConflictItem, snapshot: ImmutableRequestSnapshot<TPayload> | null) => void;
}

export function useIdempotentTransaction<TPayload = any, TResult = any>(
  options: UseIdempotentTransactionOptions<TPayload, TResult>
) {
  const { endpoint, userId, onSuccess, onError, onConflict } = options;

  // Keep live references to options to support account-scoped async isolation (Task 2)
  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;

  const currentEndpointRef = useRef(endpoint);
  currentEndpointRef.current = endpoint;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;

  // Restore ambiguous session if one is pending to prevent lock escape via unmount/remount
  const pendingSession = getPendingAmbiguousSession<TPayload>(userId, endpoint);

  const [state, setState] = useState<IdempotencyState>(() =>
    pendingSession ? pendingSession.state : 'DRAFT'
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    pendingSession ? pendingSession.idempotencyKey : generateUUID()
  );
  const [snapshot, setSnapshot] = useState<ImmutableRequestSnapshot<TPayload> | null>(() =>
    pendingSession ? pendingSession.snapshot : null
  );
  const [error, setError] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    pendingSession ? pendingSession.errorMessage : null
  );
  const [errorCategory, setErrorCategory] = useState<IdempotencyErrorCategory | null>(() =>
    pendingSession ? pendingSession.errorCategory : null
  );
  const [conflict, setConflict] = useState<StockConflictItem | null>(() =>
    pendingSession ? pendingSession.conflict : null
  );
  const [result, setResult] = useState<TResult | null>(null);

  // Live ref for idempotencyKey to prevent stale responses from matching when intent changes
  const currentKeyRef = useRef(idempotencyKey);
  currentKeyRef.current = idempotencyKey;

  // Request Generation tracks lifecycle of the active business intent.
  // Increments ONLY when identity or intent actually changes (account switch, endpoint change, resetToDraft).
  // Never increments on ordinary React re-renders.
  const requestGenerationRef = useRef<number>(1);

  // Execution lock bound to active operation identity (preventing stale responses from releasing locks of new operations)
  const activeOperationIdRef = useRef<string | null>(null);

  // Track in-flight execution to strictly prevent double submit synchronously
  const isExecutingRef = useRef<boolean>(false);

  // Account switch isolation guard (Task 3):
  // When userId or endpoint changes, isolate accounts completely.
  // 1. NEVER clear pending session of old user.
  // 2. NEVER clear pending session of new user.
  // 3. DO NOT reset to DRAFT if new user has an unreconciled/ambiguous transaction.
  // 4. Restore corresponding state for the exact userId & endpoint.
  // 5. DO NOT share Idempotency-Key across accounts.
  const prevAccountEndpointRef = useRef<string>(`${userId}::${endpoint}`);
  useEffect(() => {
    const currentKey = `${userId}::${endpoint}`;
    if (prevAccountEndpointRef.current !== currentKey) {
      prevAccountEndpointRef.current = currentKey;
      requestGenerationRef.current += 1;

      // If active lock belongs to another account/endpoint, release it for the new context
      if (
        activeOperationIdRef.current &&
        !activeOperationIdRef.current.includes(`::${userId}::${endpoint}::`)
      ) {
        activeOperationIdRef.current = null;
        isExecutingRef.current = false;
      }

      const newPending = getPendingAmbiguousSession<TPayload>(userId, endpoint);
      if (newPending) {
        setState(newPending.state);
        setIdempotencyKey(newPending.idempotencyKey);
        currentKeyRef.current = newPending.idempotencyKey;
        setSnapshot(newPending.snapshot);
        setError(null);
        setErrorMessage(newPending.errorMessage);
        setErrorCategory(newPending.errorCategory);
        setConflict(newPending.conflict);
        setResult(null);
      } else {
        const freshKey = generateUUID();
        setState('DRAFT');
        setIdempotencyKey(freshKey);
        currentKeyRef.current = freshKey;
        setSnapshot(null);
        setError(null);
        setErrorMessage(null);
        setErrorCategory(null);
        setConflict(null);
        setResult(null);
      }
    }
  }, [userId, endpoint]);

  /**
   * Categorizes API errors, especially HTTP 409 conflict subtypes and network timeout
   */
  const parseErrorCategory = (
    err: any
  ): { category: IdempotencyErrorCategory; message: string; conflict?: StockConflictItem } => {
    const parsed = parseStockError(err);

    if (parsed.type === 'SNAPSHOT_CONFLICT') {
      return {
        category: 'SNAPSHOT_CONFLICT',
        message: parsed.message,
        conflict: parsed.conflict,
      };
    }

    if (parsed.type === 'IDEMPOTENCY_IN_PROGRESS') {
      return {
        category: 'IN_PROGRESS',
        message: parsed.message,
      };
    }

    if (parsed.type === 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
      return {
        category: 'PAYLOAD_MISMATCH',
        message: parsed.message,
      };
    }

    if (parsed.type === 'NETWORK_TIMEOUT_AMBIGUOUS' || parsed.type === 'SERVER_ERROR_AMBIGUOUS') {
      return {
        category: 'NETWORK_TIMEOUT',
        message: parsed.message,
      };
    }

    if (parsed.type === 'INSUFFICIENT_STOCK') {
      return {
        category: 'INSUFFICIENT_STOCK',
        message: parsed.message,
      };
    }

    if (parsed.type === 'VALIDATION_ERROR') {
      return {
        category: 'VALIDATION_FAILED',
        message: parsed.message,
      };
    }

    if (parsed.type === 'FORBIDDEN_RBAC') {
      return {
        category: 'FORBIDDEN',
        message: parsed.message,
      };
    }

    return {
      category: 'UNKNOWN',
      message: parsed.message,
    };
  };

  /**
   * Submits a transaction with strict state transitions and frozen snapshot.
   * STRICT GUARD: Only permits submission when in valid DRAFT state.
   */
  const submit = useCallback(
    async (
      payload: TPayload,
      mutationFn: (payload: TPayload, key: string) => Promise<TResult>
    ): Promise<TResult | null> => {
      // Guard against submitting when not in DRAFT or during in-flight execution
      if (activeOperationIdRef.current !== null || isExecutingRef.current || state !== 'DRAFT') {
        const msg = `Chỉ được phép gửi giao dịch mới khi ở trạng thái DRAFT (Trạng thái hiện tại: ${state}).`;
        setErrorMessage(msg);
        return null;
      }

      // TASK 2: Bind each submit to userId, endpoint, idempotencyKey, and generation captured at dispatch time
      const capturedUserId = userId;
      const capturedEndpoint = endpoint;
      const capturedKey = idempotencyKey;
      const capturedGeneration = requestGenerationRef.current;
      const operationId = `SUBMIT::${capturedUserId}::${capturedEndpoint}::${capturedKey}::${capturedGeneration}`;

      activeOperationIdRef.current = operationId;
      isExecutingRef.current = true;
      currentKeyRef.current = capturedKey;

      setError(null);
      setErrorMessage(null);
      setErrorCategory(null);
      setConflict(null);

      // Freeze immutable snapshot
      const frozenSnapshot: ImmutableRequestSnapshot<TPayload> = {
        endpoint: capturedEndpoint,
        idempotencyKey: capturedKey,
        exactPayload: JSON.parse(JSON.stringify(payload)), // Deep clone for immutability
        userId: capturedUserId,
        submittedAt: new Date().toISOString(),
      };

      setSnapshot(frozenSnapshot);

      // TASK 1: PRE-DISPATCH PENDING MARKER
      // Record minimal metadata BEFORE dispatching mutationFn.
      // If marker cannot be securely guaranteed, fail closed and abort dispatch!
      const itemCount = Array.isArray((payload as any)?.items)
        ? (payload as any).items.length
        : undefined;

      const markerRecorded = recordPreDispatchMarker({
        endpoint: capturedEndpoint,
        userId: capturedUserId,
        idempotencyKey: capturedKey,
        itemCount,
      });

      if (!markerRecorded) {
        if (activeOperationIdRef.current === operationId) {
          activeOperationIdRef.current = null;
          isExecutingRef.current = false;
        }

        // Check if an unresolved marker already exists for this context
        const existingUnresolved = getPendingAmbiguousSession(capturedUserId, capturedEndpoint);
        if (
          existingUnresolved &&
          existingUnresolved.idempotencyKey !== capturedKey &&
          isMarkerUnresolved(existingUnresolved.state)
        ) {
          const conflictMsg =
            existingUnresolved.errorMessage ||
            'Tồn tại giao dịch bất định khác chưa đối soát cho tài khoản và endpoint này. Khóa dispatch để bảo đảm an toàn.';
          setErrorMessage(conflictMsg);
          setState(existingUnresolved.state);
          setIdempotencyKey(existingUnresolved.idempotencyKey);
          currentKeyRef.current = existingUnresolved.idempotencyKey;
          return null;
        }

        const failClosedMsg =
          'Không thể ghi nhận marker an toàn trước khi phát yêu cầu (Storage Error/Unavailable). Hủy phát yêu cầu để bảo đảm an toàn.';
        setErrorMessage(failClosedMsg);
        setState('DRAFT');
        return null;
      }

      setState('SUBMITTING');

      // Helper: check if the hook instance's current account/endpoint/key/generation still matches captured request identity
      const isIdentityStillActive = () =>
        currentUserIdRef.current === capturedUserId &&
        currentEndpointRef.current === capturedEndpoint &&
        currentKeyRef.current === capturedKey &&
        requestGenerationRef.current === capturedGeneration;

      let responseData: TResult;
      try {
        responseData = await mutationFn(frozenSnapshot.exactPayload, capturedKey);
      } catch (err: any) {
        // Only release execution lock if the active lock belongs to this exact operation!
        if (activeOperationIdRef.current === operationId) {
          activeOperationIdRef.current = null;
          isExecutingRef.current = false;
        }

        // Handle mutationFn errors strictly separated from onSuccess
        const parsed = parseStockError(err);
        const { category, message, conflict: conflictData } = parseErrorCategory(err);

        if (isIdentityStillActive()) {
          setError(err);
          setErrorMessage(message);
          setErrorCategory(category);
          if (conflictData) {
            setConflict(conflictData);
          }
        }

        // Branch 1: Snapshot Conflict: requires user review of diff, never auto-retry
        if (category === 'SNAPSHOT_CONFLICT') {
          savePendingAmbiguousSession({
            endpoint: capturedEndpoint,
            userId: capturedUserId,
            idempotencyKey: capturedKey,
            state: 'RECONCILIATION_REQUIRED',
            snapshot: frozenSnapshot,
            errorMessage: message,
            errorCategory: category,
            conflict: conflictData || null,
            timestamp: Date.now(),
          });
          if (isIdentityStillActive()) {
            setState('RECONCILIATION_REQUIRED');
            try {
              onConflictRef.current?.(conflictData!, frozenSnapshot);
            } catch (cbErr) {
              console.error('Error in onConflict callback:', cbErr);
            }
            try {
              onErrorRef.current?.(err, frozenSnapshot);
            } catch (cbErr) {
              console.error('Error in onError callback:', cbErr);
            }
          }
          return null;
        }

        // Branch 2: Timeout or network failure or 5xx: transition to AMBIGUOUS_OUTCOME (do not rotate key!)
        if (
          category === 'NETWORK_TIMEOUT' ||
          parsed.type === 'NETWORK_TIMEOUT_AMBIGUOUS' ||
          parsed.type === 'SERVER_ERROR_AMBIGUOUS'
        ) {
          savePendingAmbiguousSession({
            endpoint: capturedEndpoint,
            userId: capturedUserId,
            idempotencyKey: capturedKey,
            state: 'AMBIGUOUS_OUTCOME',
            snapshot: frozenSnapshot,
            errorMessage: message,
            errorCategory: 'NETWORK_TIMEOUT',
            conflict: conflictData || null,
            timestamp: Date.now(),
          });
          if (isIdentityStillActive()) {
            setState('AMBIGUOUS_OUTCOME');
            try {
              onErrorRef.current?.(err, frozenSnapshot);
            } catch (cbErr) {
              console.error('Error in onError callback:', cbErr);
            }
          }
          return null;
        }

        // Branch 3: HTTP 409 Conflict handling:
        // - IN_PROGRESS: keep frozen snapshot, do not allow new submit, remain in AMBIGUOUS_OUTCOME
        // - PAYLOAD_MISMATCH / TENANT_MISMATCH / UNKNOWN: require explicit reconciliation
        if (err?.response?.status === 409) {
          const targetState =
            category === 'IN_PROGRESS' ? 'AMBIGUOUS_OUTCOME' : 'RECONCILIATION_REQUIRED';
          savePendingAmbiguousSession({
            endpoint: capturedEndpoint,
            userId: capturedUserId,
            idempotencyKey: capturedKey,
            state: targetState,
            snapshot: frozenSnapshot,
            errorMessage: message,
            errorCategory: category,
            conflict: conflictData || null,
            timestamp: Date.now(),
          });
          if (isIdentityStillActive()) {
            setState(targetState);
            try {
              onErrorRef.current?.(err, frozenSnapshot);
            } catch (cbErr) {
              console.error('Error in onError callback:', cbErr);
            }
          }
          return null;
        }

        // Branch 4: Guaranteed Deterministic Client Rejection (400, 401, 403, 422, or standard 404)
        // Backend contract guarantees request was rejected before ANY ledger write!
        const status = parsed.statusCode ?? err?.response?.status;
        const isDeterministicFailure =
          !parsed.isAmbiguous &&
          typeof status === 'number' &&
          (status === 400 ||
            status === 401 ||
            status === 403 ||
            status === 422 ||
            (status === 404 && parsed.type !== 'NOT_FOUND_AMBIGUOUS')) &&
          category !== 'UNKNOWN';

        if (isDeterministicFailure) {
          clearPendingAmbiguousSession(capturedUserId, capturedEndpoint, capturedKey);
          if (isIdentityStillActive()) {
            setState('CONFIRMED_FAILURE');
            try {
              onErrorRef.current?.(err, frozenSnapshot);
            } catch (cbErr) {
              console.error('Error in onError callback:', cbErr);
            }
          }
          return null;
        }

        // Branch 5: UNKNOWN / Generic Error / Malformed Response / Unclassified Error
        // Must remain AMBIGUOUS! Do NOT clear pending marker! Do NOT set CONFIRMED_FAILURE!
        savePendingAmbiguousSession({
          endpoint: capturedEndpoint,
          userId: capturedUserId,
          idempotencyKey: capturedKey,
          state: 'AMBIGUOUS_OUTCOME',
          snapshot: frozenSnapshot,
          errorMessage:
            message ||
            'Đã xảy ra lỗi không xác định. Trạng thái cam kết chưa rõ, giữ nguyên khóa và đối soát.',
          errorCategory: category || 'UNKNOWN',
          conflict: conflictData || null,
          timestamp: Date.now(),
        });
        if (isIdentityStillActive()) {
          setState('AMBIGUOUS_OUTCOME');
          try {
            onErrorRef.current?.(err, frozenSnapshot);
          } catch (cbErr) {
            console.error('Error in onError callback:', cbErr);
          }
        }
        return null;
      }

      // --- DISPATCH SUCCESS (mutationFn resolved without error) ---
      // Ledger write succeeded reliably! Clear pending marker for the captured request identity
      clearPendingAmbiguousSession(capturedUserId, capturedEndpoint, capturedKey);

      if (activeOperationIdRef.current === operationId) {
        activeOperationIdRef.current = null;
        isExecutingRef.current = false;
      }

      if (isIdentityStillActive()) {
        setResult(responseData);
        setState('CONFIRMED_SUCCESS');
        // Separate onSuccess callback so any exception inside consumer callback NEVER flips transaction state!
        try {
          onSuccessRef.current?.(responseData, frozenSnapshot);
        } catch (cbErr) {
          console.error('Error in onSuccess callback:', cbErr);
        }
      }

      return responseData;
    },
    [endpoint, idempotencyKey, state, userId]
  );

  /**
   * Queries the backend idempotency record (GET) to verify whether the transaction
   * has already been COMMITTED, CONFIRMED_FAILED, or is still IN_PROGRESS.
   * STRICT GUARD: NEVER issues a POST retry while commit status is unverified.
   * TASK 2: Restored session GET recovery uses recovered idempotencyKey, NOT requiring snapshot.
   */
  const checkAmbiguousStatus = useCallback(
    async (
      queryStatusFn: (key: string) => Promise<any>
    ): Promise<IdempotencyStatusCheckResult> => {
      if (!idempotencyKey || (state !== 'AMBIGUOUS_OUTCOME' && state !== 'RECONCILIATION_REQUIRED')) {
        return {
          resolved: false,
          outcome: 'UNKNOWN',
          message: 'Không có giao dịch bất định cần tra cứu trạng thái.',
        };
      }

      // TASK 2: Bind checkAmbiguousStatus to identity captured at dispatch time
      const capturedUserId = userId;
      const capturedEndpoint = endpoint;
      const capturedKey = idempotencyKey;
      const capturedGeneration = requestGenerationRef.current;
      const operationId = `STATUS_CHECK::${capturedUserId}::${capturedEndpoint}::${capturedKey}::${capturedGeneration}`;

      activeOperationIdRef.current = operationId;
      isExecutingRef.current = true;

      const isIdentityStillActive = () =>
        currentUserIdRef.current === capturedUserId &&
        currentEndpointRef.current === capturedEndpoint &&
        currentKeyRef.current === capturedKey &&
        requestGenerationRef.current === capturedGeneration;

      if (isIdentityStillActive()) {
        setErrorMessage(null);
      }

      try {
        const data = await queryStatusFn(capturedKey);
        if (activeOperationIdRef.current === operationId) {
          activeOperationIdRef.current = null;
          isExecutingRef.current = false;
        }

        // Case 1: Backend confirms COMMITTED -> Display result, do NOT POST
        if (data?.status === 'COMMITTED' && data.transaction) {
          clearPendingAmbiguousSession(capturedUserId, capturedEndpoint, capturedKey);
          if (isIdentityStillActive()) {
            setState('CONFIRMED_SUCCESS');
            setResult(data.transaction as TResult);
            try {
              onSuccessRef.current?.(data.transaction as TResult, snapshot);
            } catch (cbErr) {
              console.error('Error in onSuccess callback:', cbErr);
            }
          }
          return {
            resolved: true,
            outcome: 'COMMITTED',
            message: 'Giao dịch đã được máy chủ ghi nhận thực thi thành công trước đó.',
            transaction: data.transaction,
          };
        }

        // Case 2: Backend confirms CONFIRMED_FAILED -> Fail-closed terminal state
        if (data?.status === 'CONFIRMED_FAILED') {
          clearPendingAmbiguousSession(capturedUserId, capturedEndpoint, capturedKey);
          const failMsg = data.error?.message || 'Giao dịch đã được máy chủ ghi nhận thất bại.';
          if (isIdentityStillActive()) {
            setState('CONFIRMED_FAILURE');
            setErrorMessage(failMsg);
          }
          return {
            resolved: true,
            outcome: 'CONFIRMED_FAILED',
            message: failMsg,
          };
        }

        // Case 3: Backend reports IN_PROGRESS -> Still processing, remain locked
        if (data?.status === 'IN_PROGRESS') {
          const inProgMsg =
            'Giao dịch vẫn đang được máy chủ xử lý đồng thời (IN_PROGRESS). Vui lòng đợi hoặc tra cứu lại sau.';
          if (isIdentityStillActive()) {
            setErrorMessage(inProgMsg);
          }
          return {
            resolved: false,
            outcome: 'IN_PROGRESS',
            message: inProgMsg,
          };
        }

        // Case 4: Status UNKNOWN -> Still ambiguous, do NOT POST
        const unkMsg =
          'Máy chủ chưa xác nhận trạng thái giao dịch (UNKNOWN). Trạng thái vẫn bất định, không được tự gửi lại.';
        if (isIdentityStillActive()) {
          setErrorMessage(unkMsg);
        }
        return {
          resolved: false,
          outcome: 'UNKNOWN',
          message: unkMsg,
        };
      } catch (queryErr: any) {
        if (activeOperationIdRef.current === operationId) {
          activeOperationIdRef.current = null;
          isExecutingRef.current = false;
        }
        // HTTP 404 from GET Idempotency does NOT prove unexecuted!
        const status = queryErr?.response?.status;
        if (status === 404) {
          const notFoundMsg =
            'Endpoint tra cứu trả về HTTP 404 (Không tìm thấy bản ghi hoặc không có quyền truy cập). Đây KHÔNG phải là bằng chứng giao dịch chưa ghi. Trạng thái vẫn bất định và bị khóa.';
          if (isIdentityStillActive()) {
            setErrorMessage(notFoundMsg);
          }
          return {
            resolved: false,
            outcome: 'NOT_FOUND_AMBIGUOUS',
            message: notFoundMsg,
          };
        }

        const netMsg = 'Lỗi kết nối khi tra cứu trạng thái giao dịch. Trạng thái vẫn bất định.';
        if (isIdentityStillActive()) {
          setErrorMessage(netMsg);
        }
        return {
          resolved: false,
          outcome: 'NETWORK_ERROR',
          message: netMsg,
        };
      }
    },
    [idempotencyKey, snapshot, state, userId, endpoint]
  );

  /**
   * Retries an ambiguous transaction.
   * SAFETY HARDENING (Task 2):
   * Raw POST retry without verified commit status is strictly forbidden!
   * Directs user/caller to use checkAmbiguousStatus instead.
   */
  const retryAmbiguous = useCallback(
    async (
      _mutationFn?: (payload: TPayload, key: string) => Promise<TResult>
    ): Promise<TResult | null> => {
      setErrorMessage(
        'Cấm phát lại Stock POST khi trạng thái commit chưa rõ. Phải kiểm tra trạng thái Idempotency (GET) trước.'
      );
      return null;
    },
    []
  );

  /**
   * Request reconciliation if user wants to change payload while in AMBIGUOUS_OUTCOME
   */
  const requestReconciliation = useCallback(() => {
    if (state === 'AMBIGUOUS_OUTCOME') {
      setState('RECONCILIATION_REQUIRED');
      if (snapshot) {
        savePendingAmbiguousSession({
          endpoint,
          userId,
          idempotencyKey,
          state: 'RECONCILIATION_REQUIRED',
          snapshot,
          errorMessage,
          errorCategory,
          conflict,
          timestamp: Date.now(),
        });
      }
    }
  }, [state, snapshot, endpoint, userId, idempotencyKey, errorMessage, errorCategory, conflict]);

  /**
   * Resolves reconciliation:
   * TASK 1 (FINAL SECURITY BLOCKER REMEDIATION):
   * Client-supplied objects, auditTicketId, tokens, or evidence details CANNOT verify transaction outcome or release the lock.
   * Without a Backend authoritative reconciliation verification service contract,
   * manual reconciliation release from client is strictly locked.
   * Always fails closed, sets a security notification message, and keeps the FSM in its locked state.
   */
  const resolveReconciliation = useCallback(
    (_proof?: AuthoritativeReconciliationProof): boolean => {
      setErrorMessage(
        'Chức năng giải phóng đối soát thủ công từ giao diện người dùng đã bị vô hiệu hóa vì lý do an toàn. ' +
        'Dữ liệu nhập từ Client không được coi là bằng chứng có thẩm quyền. ' +
        'Cần dịch vụ xác minh có thẩm quyền từ máy chủ. Vui lòng sử dụng tính năng Tra cứu trạng thái máy chủ (GET Idempotency).'
      );
      return false;
    },
    []
  );

  /**
   * Resets form to fresh DRAFT with a new Idempotency-Key
   */
  const resetToDraft = useCallback(() => {
    // Cannot discard in-flight, ambiguous, or reconciliation state without proper reconciliation process
    if (
      state === 'SUBMITTING' ||
      state === 'AMBIGUOUS_OUTCOME' ||
      state === 'RECONCILIATION_REQUIRED'
    ) {
      return;
    }
    // Cannot reset if storage or memory has corrupted data or unresolved markers
    const scan = scanAllStorageMarkers(userId, endpoint);
    if (scan.hasCorrupted || scan.unresolvedEntries.length > 0) {
      return;
    }
    const pending = getPendingAmbiguousSession(userId, endpoint);
    if (pending && isMarkerUnresolved(pending.state)) {
      return;
    }
    activeOperationIdRef.current = null;
    isExecutingRef.current = false;
    requestGenerationRef.current += 1;
    const freshKey = generateUUID();
    clearPendingAmbiguousSession(userId, endpoint, idempotencyKey);
    setSnapshot(null);
    setIdempotencyKey(freshKey);
    currentKeyRef.current = freshKey;
    setError(null);
    setErrorMessage(null);
    setErrorCategory(null);
    setConflict(null);
    setResult(null);
    setState('DRAFT');
  }, [state, userId, endpoint, idempotencyKey]);

  return {
    state,
    idempotencyKey,
    snapshot,
    error,
    errorMessage,
    errorCategory,
    conflict,
    result,
    isSubmitting: state === 'SUBMITTING',
    isSuccess: state === 'CONFIRMED_SUCCESS',
    isAmbiguous: state === 'AMBIGUOUS_OUTCOME',
    isReconciliationRequired: state === 'RECONCILIATION_REQUIRED',
    submit,
    retryAmbiguous,
    checkAmbiguousStatus,
    requestReconciliation,
    resolveReconciliation,
    resetToDraft,
  };
}
