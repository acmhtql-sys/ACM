// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useIdempotentTransaction,
  clearPendingAmbiguousSession,
  clearAllPendingAmbiguousSessions,
  getSessionStorageKey,
  getPerKeyStorageKey,
  clearMemoryRegistryOnly,
  scanAllStorageMarkers,
  recordPreDispatchMarker,
  savePendingAmbiguousSession,
  getPendingAmbiguousSession,
} from './useIdempotentTransaction';

describe('S2C-3A useIdempotentTransaction Safety-Hardened Hook Test Suite', () => {
  const defaultOptions = {
    endpoint: '/api/v1/stock-transactions/adjustment',
    userId: 'user-admin-uuid-001',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingAmbiguousSession(defaultOptions.userId, defaultOptions.endpoint);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  });

  it('HOOK-01: initial state is DRAFT with a valid UUID v4 Idempotency-Key', () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));

    expect(result.current.state).toBe('DRAFT');
    expect(result.current.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isAmbiguous).toBe(false);
  });

  it('HOOK-02: freezes exact snapshot and retains SAME key during submission', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));
    const initialKey = result.current.idempotencyKey;
    const payload = { itemId: '11111111-1111-4111-8111-111111111111', actualOnHand: 50 };

    const mockMutation = vi.fn().mockResolvedValue({ id: 'tx-1', status: 'COMPLETED' });

    await act(async () => {
      await result.current.submit(payload, mockMutation);
    });

    expect(mockMutation).toHaveBeenCalledWith(payload, initialKey);
    expect(result.current.state).toBe('CONFIRMED_SUCCESS');
    expect(result.current.idempotencyKey).toBe(initialKey);
    expect(result.current.snapshot?.exactPayload).toEqual(payload);
  });

  it('HOOK-03: transitions to RECONCILIATION_REQUIRED on SNAPSHOT_CONFLICT without auto-retry', async () => {
    const onConflict = vi.fn();
    const { result } = renderHook(() =>
      useIdempotentTransaction({
        ...defaultOptions,
        onConflict,
      })
    );

    const initialKey = result.current.idempotencyKey;
    const mock409ConflictError = {
      name: 'AxiosError',
      response: {
        status: 409,
        data: {
          success: false,
          message: 'Số dư tồn kho đã bị thay đổi bởi giao dịch đồng thời khác',
          details: {
            errorCode: 'CONCURRENT_STOCK_MODIFICATION',
            conflict: {
              itemId: '11111111-1111-4111-8111-111111111111',
              locationId: '22222222-2222-4222-8222-222222222222',
              expectedSnapshot: { onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0 },
              currentSnapshot: { onHand: 90, reserved: 0, quarantined: 0, kitAllocated: 0 },
            },
          },
        },
      },
    };

    const mockMutation = vi.fn().mockRejectedValue(mock409ConflictError);

    await act(async () => {
      await result.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111', actualOnHand: 95 },
        mockMutation
      );
    });

    expect(result.current.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.current.errorCategory).toBe('SNAPSHOT_CONFLICT');
    expect(result.current.conflict?.expectedSnapshot.onHand).toBe(100);
    expect(result.current.conflict?.currentSnapshot.onHand).toBe(90);
    expect(onConflict).toHaveBeenCalled();
    expect(result.current.idempotencyKey).toBe(initialKey);
  });

  it('HOOK-04: transitions to AMBIGUOUS_OUTCOME on Network Timeout and keeps key', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));
    const initialKey = result.current.idempotencyKey;

    const mockTimeoutError = {
      code: 'ECONNABORTED',
      message: 'timeout of 10000ms exceeded',
      request: {},
    };

    const mockMutation = vi.fn().mockRejectedValue(mockTimeoutError);

    await act(async () => {
      await result.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111', actualOnHand: 80 },
        mockMutation
      );
    });

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.isAmbiguous).toBe(true);
    expect(result.current.errorCategory).toBe('NETWORK_TIMEOUT');
    expect(result.current.idempotencyKey).toBe(initialKey);
  });

  it('HOOK-05: transitions to AMBIGUOUS_OUTCOME on Idempotency IN_PROGRESS', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));
    const initialKey = result.current.idempotencyKey;

    const mockInProgressError = {
      name: 'AxiosError',
      response: {
        status: 409,
        data: {
          success: false,
          message: 'Yêu cầu với Idempotency-Key này đang được xử lý đồng thời, vui lòng thử lại sau',
        },
      },
    };

    const mockMutation = vi.fn().mockRejectedValue(mockInProgressError);

    await act(async () => {
      await result.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111', actualOnHand: 75 },
        mockMutation
      );
    });

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.errorCategory).toBe('IN_PROGRESS');
    expect(result.current.idempotencyKey).toBe(initialKey);
  });

  // TASK 1 & TASK 7 TEST 1 & 2: RECONCILIATION BYPASS PREVENTION
  it('HOOK-06: resolveReconciliation REFUSES exit with evidenceNote = "abcde" or unverified 404', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));

    // Force hook into RECONCILIATION_REQUIRED via timeout then request
    await act(async () => {
      await result.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111' },
        vi.fn().mockRejectedValue({ code: 'ECONNABORTED' })
      );
    });
    act(() => {
      result.current.requestReconciliation();
    });
    expect(result.current.state).toBe('RECONCILIATION_REQUIRED');

    // Attempt 1: evidenceNote = "abcde" (client bypass attempt)
    let resolved = false;
    act(() => {
      resolved = result.current.resolveReconciliation({
        verifiedOutcome: 'TRANSACTION_CONFIRMED_UNEXECUTED',
        auditTicketId: '',
        authorizedBy: '',
        authorizationSecretOrToken: '',
        evidenceDetails: 'abcde',
      } as any);
    });
    expect(resolved).toBe(false);
    expect(result.current.state).toBe('RECONCILIATION_REQUIRED');

    // Attempt 2: relying solely on HTTP 404 without authoritative ledger audit
    act(() => {
      resolved = result.current.resolveReconciliation({
        verifiedOutcome: 'TRANSACTION_CONFIRMED_UNEXECUTED',
        auditTicketId: 'AUDIT-20261014-0001',
        authorizedBy: 'user-supervisor-01',
        authorizationSecretOrToken: 'secret-token-123456789',
        evidenceDetails: 'Endpoint trả về HTTP 404 không thấy key trong DB',
      });
    });
    expect(resolved).toBe(false);
    expect(result.current.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.current.errorMessage).toContain(
      'Chức năng giải phóng đối soát thủ công từ giao diện người dùng đã bị vô hiệu hóa vì lý do an toàn'
    );

    // Attempt 3 (Task 5.1 & 5.2): Proof with fake token >= 16 chars & valid auditTicket format CANNOT unlock
    const keyBeforeAttempt = result.current.idempotencyKey;
    act(() => {
      resolved = result.current.resolveReconciliation({
        verifiedOutcome: 'TRANSACTION_CONFIRMED_UNEXECUTED',
        auditTicketId: 'AUDIT-20261014-9999',
        authorizedBy: 'user-supervisor-audit',
        authorizationSecretOrToken: 'AUTH_TOKEN_SECRET_AUDIT_2026',
        evidenceDetails: 'Đã đối soát trực tiếp sổ cái ledger và xác minh 0 dòng movement nào được tạo',
      });
    });
    // TASK 1 & TASK 5: Client-supplied inputs CANNOT unlock
    expect(resolved).toBe(false);
    expect(result.current.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.current.errorMessage).toContain(
      'Chức năng giải phóng đối soát thủ công từ giao diện người dùng đã bị vô hiệu hóa vì lý do an toàn'
    );
    // TASK 5.3: Key is NOT rotated while ambiguous
    expect(result.current.idempotencyKey).toBe(keyBeforeAttempt);
  });

  // TASK 2 & TASK 7 TEST 3 & 4: NO POST RETRY IN AMBIGUOUS
  it('HOOK-07: retryAmbiguous() REFUSES raw POST and checkAmbiguousStatus() probes GET status', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));

    // Force into AMBIGUOUS_OUTCOME
    await act(async () => {
      await result.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111' },
        vi.fn().mockRejectedValue({ code: 'ECONNABORTED' })
      );
    });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');

    // Calling retryAmbiguous refuses to send POST
    const mockPostMutation = vi.fn();
    let retryResult: any;
    await act(async () => {
      retryResult = await result.current.retryAmbiguous(mockPostMutation);
    });
    expect(retryResult).toBeNull();
    expect(mockPostMutation).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toContain('Cấm phát lại Stock POST khi trạng thái commit chưa rõ');

    // Calling checkAmbiguousStatus when backend reports COMMITTED -> transitions to CONFIRMED_SUCCESS without POST
    const mockQueryStatus = vi.fn().mockResolvedValue({
      status: 'COMMITTED',
      transaction: {
        id: '99999999-9999-4999-8999-999999999999',
        transactionNumber: 'IMP-20261014-9999',
        status: 'COMPLETED',
      },
    });

    let statusCheckResult: any;
    await act(async () => {
      statusCheckResult = await result.current.checkAmbiguousStatus(mockQueryStatus);
    });

    expect(statusCheckResult.resolved).toBe(true);
    expect(statusCheckResult.outcome).toBe('COMMITTED');
    expect(result.current.state).toBe('CONFIRMED_SUCCESS');
    expect(result.current.result).toEqual({
      id: '99999999-9999-4999-8999-999999999999',
      transactionNumber: 'IMP-20261014-9999',
      status: 'COMPLETED',
    });
  });

  it('HOOK-08: checkAmbiguousStatus() with HTTP 404 leaves state locked in AMBIGUOUS_OUTCOME', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));

    await act(async () => {
      await result.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111' },
        vi.fn().mockRejectedValue({ code: 'ECONNABORTED' })
      );
    });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');

    const mock404Query = vi.fn().mockRejectedValue({
      response: { status: 404, data: { message: 'Not found' } },
    });

    let checkResult: any;
    await act(async () => {
      checkResult = await result.current.checkAmbiguousStatus(mock404Query);
    });

    expect(checkResult.resolved).toBe(false);
    expect(checkResult.outcome).toBe('NOT_FOUND_AMBIGUOUS');
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME'); // STILL LOCKED!
    expect(result.current.errorMessage).toContain('Endpoint tra cứu trả về HTTP 404');
  });

  // TASK 3 & TASK 7 TEST 5 & 6: STRICT SUBMIT TRANSITION GUARD
  it('HOOK-09: submit() is strictly rejected when in AMBIGUOUS_OUTCOME or RECONCILIATION_REQUIRED', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));

    // Force into AMBIGUOUS_OUTCOME
    await act(async () => {
      await result.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111' },
        vi.fn().mockRejectedValue({ code: 'ECONNABORTED' })
      );
    });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');

    // Attempting submit while in AMBIGUOUS_OUTCOME
    const mockMutation = vi.fn();
    let submitRes: any;
    await act(async () => {
      submitRes = await result.current.submit({ itemId: '22222222-2222-4222-8222-222222222222' }, mockMutation);
    });
    expect(submitRes).toBeNull();
    expect(mockMutation).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toContain('Chỉ được phép gửi giao dịch mới khi ở trạng thái DRAFT');

    // Move to RECONCILIATION_REQUIRED
    act(() => {
      result.current.requestReconciliation();
    });
    expect(result.current.state).toBe('RECONCILIATION_REQUIRED');

    // Attempting submit while in RECONCILIATION_REQUIRED
    await act(async () => {
      submitRes = await result.current.submit({ itemId: '33333333-3333-4333-8333-333333333333' }, mockMutation);
    });
    expect(submitRes).toBeNull();
    expect(mockMutation).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toContain('Chỉ được phép gửi giao dịch mới khi ở trạng thái DRAFT');
  });

  // TASK 7 TEST 10: REMOUNT LOCK PERSISTENCE
  it('HOOK-10: remounting hook preserves pending ambiguous lock from session registry', async () => {
    const { result: firstRender, unmount } = renderHook(() =>
      useIdempotentTransaction(defaultOptions)
    );

    const initialKey = firstRender.current.idempotencyKey;
    await act(async () => {
      await firstRender.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111', quantity: 10 },
        vi.fn().mockRejectedValue({ code: 'ECONNABORTED' })
      );
    });
    expect(firstRender.current.state).toBe('AMBIGUOUS_OUTCOME');

    // Unmount modal/hook (simulating modal close)
    unmount();

    // Re-mount hook (simulating reopening modal)
    const { result: secondRender } = renderHook(() =>
      useIdempotentTransaction(defaultOptions)
    );

    // Lock must be preserved!
    expect(secondRender.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(secondRender.current.idempotencyKey).toBe(initialKey);
  });

  // TASK 5 TEST 4: CORRUPTED/TAMPERED SESSION FAILS CLOSED
  it('HOOK-11: corrupted, tampered, or invalid sessionStorage payload fails closed into RECONCILIATION_REQUIRED', () => {
    clearAllPendingAmbiguousSessions();

    const storageKey = getSessionStorageKey(defaultOptions.userId, defaultOptions.endpoint);

    // Case 1: Corrupted JSON in sessionStorage
    window.sessionStorage.setItem(storageKey, 'INVALID_JSON_{corrupt');

    const { result: corruptResult } = renderHook(() =>
      useIdempotentTransaction(defaultOptions)
    );

    expect(corruptResult.current.state).toBe('RECONCILIATION_REQUIRED');
    expect(corruptResult.current.errorMessage).toContain('Dữ liệu phiên đối soát bị lỗi hoặc bị can thiệp');

    // Case 2: Tampered object containing unauthorized token or invalid state
    clearAllPendingAmbiguousSessions();
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId: defaultOptions.userId,
        idempotencyKey: 'invalid-non-uuid-key',
        state: 'CONFIRMED_SUCCESS', // Attacker trying to fake success
        authorizationSecretOrToken: 'stolen_token',
        timestamp: Date.now(),
      })
    );

    const { result: tamperedResult } = renderHook(() =>
      useIdempotentTransaction(defaultOptions)
    );

    // Must FAIL CLOSED into RECONCILIATION_REQUIRED!
    expect(tamperedResult.current.state).toBe('RECONCILIATION_REQUIRED');
    expect(tamperedResult.current.errorMessage).toContain('Dữ liệu phiên đối soát bị lỗi hoặc bị can thiệp');
  });

  // TASK 5 TEST 3: NO NEW KEY GENERATION WHILE AMBIGUOUS
  it('HOOK-12: resetToDraft() is strictly rejected while ambiguous, freezing Idempotency-Key', async () => {
    clearAllPendingAmbiguousSessions();
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));

    const initialKey = result.current.idempotencyKey;
    await act(async () => {
      await result.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111' },
        vi.fn().mockRejectedValue({ code: 'ECONNABORTED' })
      );
    });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');

    // Attempting resetToDraft() while in AMBIGUOUS_OUTCOME
    act(() => {
      result.current.resetToDraft();
    });

    // Key must NOT change and state remains AMBIGUOUS_OUTCOME!
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(initialKey);
  });

  // TASK 1 & TASK 5 TEST 1 & 3: RELOAD BETWEEN POST DISPATCH AND RESPONSE
  it('HOOK-13: reload occurs between POST dispatch and response, restoring AMBIGUOUS_OUTCOME with exact Idempotency-Key', async () => {
    clearAllPendingAmbiguousSessions();
    const { result: inFlightHook, unmount } = renderHook(() =>
      useIdempotentTransaction(defaultOptions)
    );
    const initialKey = inFlightHook.current.idempotencyKey;

    let resolveMutation: any;
    const slowMutation = new Promise((resolve) => {
      resolveMutation = resolve;
    });

    // Start submit (in-flight dispatch)
    act(() => {
      inFlightHook.current.submit(
        { itemId: '11111111-1111-4111-8111-111111111111', quantity: 5 },
        () => slowMutation as any
      );
    });

    // Check pre-dispatch marker is stored in sessionStorage while SUBMITTING
    expect(inFlightHook.current.state).toBe('SUBMITTING');
    const storageKey = getSessionStorageKey(defaultOptions.userId, defaultOptions.endpoint);
    const storedMarker = JSON.parse(window.sessionStorage.getItem(storageKey)!);
    expect(storedMarker.idempotencyKey).toBe(initialKey);
    expect(storedMarker.state).toBe('SUBMITTING');
    expect(storedMarker.isPreDispatchPending).toBe(true);

    // Simulate page reload: unmount previous hook before server responds
    unmount();

    // Re-mount hook (simulating page reload after crash/refresh)
    const { result: restoredHook } = renderHook(() =>
      useIdempotentTransaction(defaultOptions)
    );

    // Must be in AMBIGUOUS_OUTCOME with the exact same Idempotency-Key and snapshot === null
    expect(restoredHook.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(restoredHook.current.idempotencyKey).toBe(initialKey);
    expect(restoredHook.current.snapshot).toBeNull();
    expect(restoredHook.current.errorMessage).toContain('Giao dịch đã được phát đi nhưng phiên làm việc bị gián đoạn');

    // Clean up unresolved promise
    resolveMutation?.({ status: 'COMPLETED' });
  });

  // TASK 1 & TASK 5 TEST 2: METADATA PENDING EXISTS BEFORE MUTATIONFN & STORAGE FAIL-CLOSED
  it('HOOK-14: metadata pending exists in storage BEFORE mutationFn, and storage error fails closed', async () => {
    clearAllPendingAmbiguousSessions();
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));
    const storageKey = getSessionStorageKey(defaultOptions.userId, defaultOptions.endpoint);

    let markerExistedDuringMutation = false;
    let markerKeyDuringMutation = '';

    const inspectingMutation = vi.fn().mockImplementation(async (_payload, key) => {
      // Synchronously check storage inside mutationFn body BEFORE response
      const item = window.sessionStorage.getItem(storageKey);
      if (item) {
        const parsed = JSON.parse(item);
        markerExistedDuringMutation = parsed.isPreDispatchPending === true;
        markerKeyDuringMutation = parsed.idempotencyKey;
      }
      return { id: 'tx-inspect-ok', status: 'COMPLETED' };
    });

    await act(async () => {
      await result.current.submit({ test: true }, inspectingMutation);
    });

    expect(inspectingMutation).toHaveBeenCalled();
    expect(markerExistedDuringMutation).toBe(true);
    expect(markerKeyDuringMutation).toBe(result.current.idempotencyKey);

    // Test storage failure fail-closed: if sessionStorage throws QuotaExceededError, mutationFn is NOT called
    const { result: failClosedHook } = renderHook(() => useIdempotentTransaction(defaultOptions));
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const blockedMutation = vi.fn();
    let res: any;
    await act(async () => {
      res = await failClosedHook.current.submit({ test: 'fail-closed' }, blockedMutation);
    });

    expect(res).toBeNull();
    expect(blockedMutation).not.toHaveBeenCalled();
    expect(failClosedHook.current.state).toBe('DRAFT');
    expect(failClosedHook.current.errorMessage).toContain('Không thể ghi nhận marker an toàn trước khi phát yêu cầu');

    setItemSpy.mockRestore();
  });

  // TASK 2 & TASK 5 TEST 4: GET COMMITTED AFTER RELOAD (ZERO POST)
  it('HOOK-15: GET COMMITTED after reload confirms success with zero POST', async () => {
    clearAllPendingAmbiguousSessions();
    const testKey = '55555555-5555-4555-8555-555555555555';
    const storageKey = getSessionStorageKey(defaultOptions.userId, defaultOptions.endpoint);

    // Pre-populate sessionStorage as if restored from reload with minimal metadata (no payload)
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId: defaultOptions.userId,
        idempotencyKey: testKey,
        state: 'SUBMITTING',
        isPreDispatchPending: true,
        errorMessage: 'Giao dịch đã được phát đi nhưng phiên làm việc bị gián đoạn',
        errorCategory: 'NETWORK_TIMEOUT',
        timestamp: Date.now(),
      })
    );

    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(testKey);
    expect(result.current.snapshot).toBeNull(); // No payload required

    // Query backend GET idempotency
    const mockQuery = vi.fn().mockResolvedValue({
      status: 'COMMITTED',
      transaction: {
        id: 'tx-committed-001',
        transactionNumber: 'IMP-20261014-8888',
        status: 'COMPLETED',
      },
    });

    let queryRes: any;
    await act(async () => {
      queryRes = await result.current.checkAmbiguousStatus(mockQuery);
    });

    expect(mockQuery).toHaveBeenCalledWith(testKey);
    expect(queryRes.resolved).toBe(true);
    expect(queryRes.outcome).toBe('COMMITTED');
    expect(result.current.state).toBe('CONFIRMED_SUCCESS');
    expect(result.current.result).toEqual({
      id: 'tx-committed-001',
      transactionNumber: 'IMP-20261014-8888',
      status: 'COMPLETED',
    });
    // Session is cleared after definitive COMMITTED
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  // TASK 2 & TASK 5 TEST 5: GET 404 AFTER RELOAD REMAINS LOCKED
  it('HOOK-16: GET 404 after reload leaves state locked and session intact with zero POST', async () => {
    clearAllPendingAmbiguousSessions();
    const testKey = '66666666-6666-4666-8666-666666666666';
    const storageKey = getSessionStorageKey(defaultOptions.userId, defaultOptions.endpoint);

    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId: defaultOptions.userId,
        idempotencyKey: testKey,
        state: 'AMBIGUOUS_OUTCOME',
        errorMessage: 'Timeout',
        errorCategory: 'NETWORK_TIMEOUT',
        timestamp: Date.now(),
      })
    );

    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');

    const mock404Query = vi.fn().mockRejectedValue({
      response: { status: 404, data: { message: 'Not found' } },
    });

    let queryRes: any;
    await act(async () => {
      queryRes = await result.current.checkAmbiguousStatus(mock404Query);
    });

    expect(mock404Query).toHaveBeenCalledWith(testKey);
    expect(queryRes.resolved).toBe(false);
    expect(queryRes.outcome).toBe('NOT_FOUND_AMBIGUOUS');
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME'); // STILL LOCKED!
    expect(result.current.errorMessage).toContain('Endpoint tra cứu trả về HTTP 404');
    // Session remains locked in storage
    expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();
  });

  // TASK 3 & TASK 5 TEST 6: ACCOUNT SWITCH DOES NOT LOSE PENDING SESSION
  it('HOOK-17: account switch does not lose pending sessions of both accounts (A -> B -> A)', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-account-A';
    const userB = 'user-account-B';

    const { result, rerender } = renderHook(
      ({ userId }) => useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId }),
      { initialProps: { userId: userA } }
    );

    const keyA = result.current.idempotencyKey;

    // User A submits and times out -> enters AMBIGUOUS_OUTCOME
    await act(async () => {
      await result.current.submit(
        { item: 'A' },
        vi.fn().mockRejectedValue({ code: 'ECONNABORTED' })
      );
    });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(keyA);

    // Switch account to User B
    rerender({ userId: userB });

    // User B has no pending session -> starts in DRAFT with a fresh independent key
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.idempotencyKey).not.toBe(keyA);
    expect(result.current.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // Switch back to User A
    rerender({ userId: userA });

    // User A's pending session is fully restored!
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(keyA);
  });

  // TASK 3 & TASK 5 TEST 7: ACCOUNT SWITCH WITH BOTH PENDING DOES NOT RESET TO DRAFT
  it('HOOK-18: account switch when both accounts have pending sessions restores matching state and never resets to DRAFT', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-account-A';
    const userB = 'user-account-B';
    const keyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const keyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    // Store pending sessions for both A and B
    window.sessionStorage.setItem(
      getSessionStorageKey(userA, defaultOptions.endpoint),
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId: userA,
        idempotencyKey: keyA,
        state: 'AMBIGUOUS_OUTCOME',
        errorMessage: 'User A ambiguous',
        errorCategory: 'NETWORK_TIMEOUT',
        timestamp: Date.now(),
      })
    );

    window.sessionStorage.setItem(
      getSessionStorageKey(userB, defaultOptions.endpoint),
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId: userB,
        idempotencyKey: keyB,
        state: 'RECONCILIATION_REQUIRED',
        errorMessage: 'User B reconciliation required',
        errorCategory: 'SNAPSHOT_CONFLICT',
        timestamp: Date.now(),
      })
    );

    const { result, rerender } = renderHook(
      ({ userId }) => useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId }),
      { initialProps: { userId: userA } }
    );

    // User A has AMBIGUOUS_OUTCOME
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(keyA);

    // Switch to User B: must NOT reset to DRAFT!
    rerender({ userId: userB });
    expect(result.current.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.current.idempotencyKey).toBe(keyB);

    // Switch back to User A: must NOT reset to DRAFT!
    rerender({ userId: userA });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(keyA);
  });

  // =========================================================================
  // TASK 1: UNKNOWN ERROR MUST REMAIN AMBIGUOUS & ISOLATED ON-SUCCESS
  // =========================================================================

  it('HOOK-19: Generic Error after dispatch transitions to AMBIGUOUS_OUTCOME, preserving key and marker', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));
    const initialKey = result.current.idempotencyKey;

    const genericErrorMutation = vi.fn().mockRejectedValue(new Error('Generic runtime or unclassified failure'));

    await act(async () => {
      await result.current.submit({ item: 'X', count: 1 }, genericErrorMutation);
    });

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(initialKey);

    // Verify pending marker was preserved in sessionStorage
    const storageKey = getSessionStorageKey(defaultOptions.userId, defaultOptions.endpoint);
    const stored = window.sessionStorage.getItem(storageKey);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.idempotencyKey).toBe(initialKey);
    expect(parsed.state).toBe('AMBIGUOUS_OUTCOME');
  });

  it('HOOK-20: Unclassified HTTP 500 error transitions to AMBIGUOUS_OUTCOME and preserves marker', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));
    const initialKey = result.current.idempotencyKey;

    const http500Error = {
      name: 'AxiosError',
      response: {
        status: 500,
        data: {
          success: false,
          message: 'Internal server error occurred unexpectedly',
        },
      },
    };

    await act(async () => {
      await result.current.submit({ item: 'Y' }, vi.fn().mockRejectedValue(http500Error));
    });

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(initialKey);

    const storageKey = getSessionStorageKey(defaultOptions.userId, defaultOptions.endpoint);
    const stored = window.sessionStorage.getItem(storageKey);
    expect(stored).not.toBeNull();
  });

  it('HOOK-21: Response body parsing/processing exception transitions to AMBIGUOUS_OUTCOME', async () => {
    const { result } = renderHook(() => useIdempotentTransaction(defaultOptions));
    const initialKey = result.current.idempotencyKey;

    const malformedResponseMutation = vi.fn().mockImplementation(async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    });

    await act(async () => {
      await result.current.submit({ item: 'Malformed' }, malformedResponseMutation);
    });

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(initialKey);

    const storageKey = getSessionStorageKey(defaultOptions.userId, defaultOptions.endpoint);
    const stored = window.sessionStorage.getItem(storageKey);
    expect(stored).not.toBeNull();
  });

  it('HOOK-22: onSuccess exception does not flip transaction to failure, state remains CONFIRMED_SUCCESS', async () => {
    const onSuccess = vi.fn().mockImplementation(() => {
      throw new Error('Crash inside consumer onSuccess handler');
    });

    const { result } = renderHook(() =>
      useIdempotentTransaction({
        ...defaultOptions,
        onSuccess,
      })
    );

    const mockMutation = vi.fn().mockResolvedValue({ id: 'tx-success-01', status: 'COMPLETED' });

    await act(async () => {
      await result.current.submit({ item: 'Z' }, mockMutation);
    });

    // State MUST remain CONFIRMED_SUCCESS, NOT flipped to CONFIRMED_FAILURE or AMBIGUOUS
    expect(result.current.state).toBe('CONFIRMED_SUCCESS');
    expect(result.current.result).toEqual({ id: 'tx-success-01', status: 'COMPLETED' });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('HOOK-22b: resetToDraft() called synchronously inside onSuccess handler successfully transitions to DRAFT with new key', async () => {
    let hookResult: any;
    const onSuccess = vi.fn().mockImplementation(() => {
      hookResult.current.resetToDraft();
    });

    const { result } = renderHook(() =>
      useIdempotentTransaction({
        ...defaultOptions,
        onSuccess,
      })
    );
    hookResult = result;

    const initialKey = result.current.idempotencyKey;
    const mockMutation = vi.fn().mockResolvedValue({ id: 'tx-success-02', status: 'COMPLETED' });

    await act(async () => {
      await result.current.submit({ item: 'Batch 1' }, mockMutation);
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.idempotencyKey).not.toBe(initialKey);
  });

  it('HOOK-23: pending marker is only cleared for deterministic rejections (400/403/422) or COMMITTED, not for UNKNOWN', async () => {
    // 23a: Deterministic 422 clears marker
    const { result: res422 } = renderHook(() => useIdempotentTransaction(defaultOptions));
    const http422Error = {
      name: 'AxiosError',
      response: {
        status: 422,
        data: {
          success: false,
          message: 'Dữ liệu đầu vào không hợp lệ',
          details: [{ field: 'items', message: 'items must contain at least 1 item' }],
        },
      },
    };

    await act(async () => {
      await res422.current.submit({ items: [] }, vi.fn().mockRejectedValue(http422Error));
    });

    expect(res422.current.state).toBe('CONFIRMED_FAILURE');
    const storageKey = getSessionStorageKey(defaultOptions.userId, defaultOptions.endpoint);
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();

    // 23b: UNKNOWN does NOT clear marker
    const { result: resUnknown } = renderHook(() => useIdempotentTransaction(defaultOptions));
    await act(async () => {
      await resUnknown.current.submit({ items: [1] }, vi.fn().mockRejectedValue('Unknown string rejection'));
    });

    expect(resUnknown.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();
  });

  // =========================================================================
  // TASK 2: ACCOUNT-SCOPED ASYNC RESULT ISOLATION
  // =========================================================================

  it('HOOK-24: User A submits K1, switches to User B, A succeeds -> User B UI unaffected, A session cleared', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-isolated-A';
    const userB = 'user-isolated-B';

    let resolveMutationA: (val: any) => void;
    const pendingPromiseA = new Promise((res) => {
      resolveMutationA = res;
    });

    const { result, rerender } = renderHook(
      ({ userId }) => useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId }),
      { initialProps: { userId: userA } }
    );

    const keyA = result.current.idempotencyKey;

    // User A dispatches request (promise remains pending)
    let submitPromiseA: Promise<any>;
    act(() => {
      submitPromiseA = result.current.submit({ payload: 'A' }, () => pendingPromiseA);
    });

    expect(result.current.state).toBe('SUBMITTING');

    // Switch account to User B while A is in flight
    rerender({ userId: userB });

    expect(result.current.state).toBe('DRAFT');
    const keyB = result.current.idempotencyKey;
    expect(keyB).not.toBe(keyA);

    // Now User A's promise resolves with success
    await act(async () => {
      resolveMutationA!({ id: 'tx-A', status: 'COMPLETED' });
      await submitPromiseA;
    });

    // User B's UI state MUST remain DRAFT and unaffected!
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.idempotencyKey).toBe(keyB);
    expect(result.current.result).toBeNull();

    // User A's session in storage must have been cleared cleanly upon A's success
    const storageKeyA = getSessionStorageKey(userA, defaultOptions.endpoint);
    expect(window.sessionStorage.getItem(storageKeyA)).toBeNull();
  });

  it('HOOK-25: User A submits, switches to User B, A times out -> User B UI unaffected, A storage holds ambiguous marker', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-isolated-A';
    const userB = 'user-isolated-B';

    let rejectMutationA: (err: any) => void;
    const pendingPromiseA = new Promise((_, rej) => {
      rejectMutationA = rej;
    });

    const { result, rerender } = renderHook(
      ({ userId }) => useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId }),
      { initialProps: { userId: userA } }
    );

    const keyA = result.current.idempotencyKey;

    let submitPromiseA: Promise<any>;
    act(() => {
      submitPromiseA = result.current.submit({ payload: 'A' }, () => pendingPromiseA);
    });

    expect(result.current.state).toBe('SUBMITTING');

    // Switch to User B
    rerender({ userId: userB });
    expect(result.current.state).toBe('DRAFT');

    // User A's request rejects with Network Timeout
    await act(async () => {
      rejectMutationA!({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' });
      await submitPromiseA;
    });

    // User B's state MUST remain DRAFT
    expect(result.current.state).toBe('DRAFT');

    // User A's storage holds ambiguous marker
    const storageKeyA = getSessionStorageKey(userA, defaultOptions.endpoint);
    const storedA = window.sessionStorage.getItem(storageKeyA);
    expect(storedA).not.toBeNull();
    const parsedA = JSON.parse(storedA!);
    expect(parsedA.idempotencyKey).toBe(keyA);
    expect(parsedA.state).toBe('AMBIGUOUS_OUTCOME');

    // When switching back to User A, User A's ambiguous session is restored
    rerender({ userId: userA });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(keyA);
  });

  it('HOOK-26: User A and B concurrent pending requests resolve out of order, isolating both sessions', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-conc-A';
    const userB = 'user-conc-B';

    let resolveA: (v: any) => void;
    let resolveB: (v: any) => void;
    const promiseA = new Promise((res) => { resolveA = res; });
    const promiseB = new Promise((res) => { resolveB = res; });

    // Render hook instance for A
    const { result: hookA } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId: userA })
    );

    // Render hook instance for B
    const { result: hookB } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId: userB })
    );

    const keyA = hookA.current.idempotencyKey;
    const keyB = hookB.current.idempotencyKey;

    let submitA: Promise<any>;
    let submitB: Promise<any>;

    act(() => {
      submitA = hookA.current.submit({ item: 'A' }, () => promiseA);
      submitB = hookB.current.submit({ item: 'B' }, () => promiseB);
    });

    expect(hookA.current.state).toBe('SUBMITTING');
    expect(hookB.current.state).toBe('SUBMITTING');

    // Response B resolves FIRST (out of order)
    await act(async () => {
      resolveB!({ id: 'tx-B', status: 'COMPLETED' });
      await submitB;
    });

    expect(hookB.current.state).toBe('CONFIRMED_SUCCESS');
    expect(hookA.current.state).toBe('SUBMITTING'); // A is still submitting

    // Response A resolves SECOND
    await act(async () => {
      resolveA!({ id: 'tx-A', status: 'COMPLETED' });
      await submitA;
    });

    expect(hookA.current.state).toBe('CONFIRMED_SUCCESS');
    expect(hookA.current.idempotencyKey).toBe(keyA);
    expect(hookB.current.idempotencyKey).toBe(keyB);
  });

  it('HOOK-27: GET idempotency status of User A completes after switching to User B -> does not overwrite User B UI', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-get-A';
    const userB = 'user-get-B';
    const keyA = '11111111-2222-4333-8444-555555555555';

    // Store ambiguous session for A
    window.sessionStorage.setItem(
      getSessionStorageKey(userA, defaultOptions.endpoint),
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId: userA,
        idempotencyKey: keyA,
        state: 'AMBIGUOUS_OUTCOME',
        errorMessage: 'A ambiguous',
        errorCategory: 'NETWORK_TIMEOUT',
        timestamp: Date.now(),
      })
    );

    let resolveQueryA: (data: any) => void;
    const queryPromiseA = new Promise((res) => { resolveQueryA = res; });

    const { result, rerender } = renderHook(
      ({ userId }) => useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId }),
      { initialProps: { userId: userA } }
    );

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(keyA);

    // Start checking ambiguous status for A
    let checkPromiseA: Promise<any>;
    act(() => {
      checkPromiseA = result.current.checkAmbiguousStatus(() => queryPromiseA);
    });

    // Switch account to User B while GET query is in flight
    rerender({ userId: userB });
    expect(result.current.state).toBe('DRAFT');

    // Query resolves confirming A was COMMITTED
    await act(async () => {
      resolveQueryA!({
        status: 'COMMITTED',
        transaction: { id: 'tx-A-committed', status: 'COMPLETED' },
      });
      await checkPromiseA;
    });

    // User B's UI state MUST remain DRAFT, NOT overwritten by A's COMMITTED!
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.result).toBeNull();

    // User A's session was cleared upon COMMITTED confirmation
    const storageKeyA = getSessionStorageKey(userA, defaultOptions.endpoint);
    expect(window.sessionStorage.getItem(storageKeyA)).toBeNull();
  });

  it('HOOK-28: User B does not receive User A onSuccess callback', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-cb-A';
    const userB = 'user-cb-B';

    const onSuccessA = vi.fn();
    const onSuccessB = vi.fn();

    let resolveMutationA: (val: any) => void;
    const pendingPromiseA = new Promise((res) => {
      resolveMutationA = res;
    });

    const { result, rerender } = renderHook(
      ({ userId, onSuccess }) =>
        useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId, onSuccess }),
      { initialProps: { userId: userA, onSuccess: onSuccessA } }
    );

    // User A submits
    let submitPromiseA: Promise<any>;
    act(() => {
      submitPromiseA = result.current.submit({ item: 'A' }, () => pendingPromiseA);
    });

    // Switch to User B with onSuccessB
    rerender({ userId: userB, onSuccess: onSuccessB });

    // A completes
    await act(async () => {
      resolveMutationA!({ id: 'tx-A', status: 'COMPLETED' });
      await submitPromiseA;
    });

    // onSuccessB must NEVER have been called with A's data!
    expect(onSuccessB).not.toHaveBeenCalled();
  });

  it('HOOK-29: clearPendingAmbiguousSession with expectedKey conditionally clears only matching key', () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-key-check';
    const key1 = '11111111-1111-4111-8111-111111111111';
    const key2 = '22222222-2222-4222-8222-222222222222';

    window.sessionStorage.setItem(
      getSessionStorageKey(userId, defaultOptions.endpoint),
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId,
        idempotencyKey: key1,
        state: 'AMBIGUOUS_OUTCOME',
        timestamp: Date.now(),
      })
    );

    // Attempt to clear with key2 (mismatch)
    clearPendingAmbiguousSession(userId, defaultOptions.endpoint, key2);

    // Should NOT be cleared!
    const storageKey = getSessionStorageKey(userId, defaultOptions.endpoint);
    expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();

    // Clear with key1 (match)
    clearPendingAmbiguousSession(userId, defaultOptions.endpoint, key1);

    // Now it IS cleared!
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  // =========================================================================
  // S2C-3B ABA RACE CONDITION SAFETY HARDENING (HOOK-30 to HOOK-37)
  // =========================================================================

  it('HOOK-30: ABA Stale Success - User A sends K1, switches to B, returns to A with K2, K1 completes late -> K2 not overwritten', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-aba-A';
    const userB = 'user-aba-B';
    const onSuccessA1 = vi.fn();
    const onSuccessA2 = vi.fn();

    let resolveMutationK1: (val: any) => void;
    const pendingPromiseK1 = new Promise((res) => {
      resolveMutationK1 = res;
    });

    const { result, rerender } = renderHook(
      (props: { userId: string; onSuccess?: any }) =>
        useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId: props.userId, onSuccess: props.onSuccess }),
      { initialProps: { userId: userA, onSuccess: onSuccessA1 } }
    );

    const keyA1 = result.current.idempotencyKey;

    // User A submits K1
    let submitPromiseK1: Promise<any>;
    act(() => {
      submitPromiseK1 = result.current.submit({ item: 'K1' }, () => pendingPromiseK1);
    });
    expect(result.current.state).toBe('SUBMITTING');

    // Switch to User B
    rerender({ userId: userB, onSuccess: vi.fn() });
    expect(result.current.state).toBe('DRAFT');

    // Clear K1 from storage so User A can start new intent K2 upon return
    clearPendingAmbiguousSession(userA, defaultOptions.endpoint, keyA1);

    // Switch back to User A with a new intent K2
    rerender({ userId: userA, onSuccess: onSuccessA2 });
    expect(result.current.state).toBe('DRAFT');
    const keyA2 = result.current.idempotencyKey;
    expect(keyA2).not.toBe(keyA1);

    // Record K2's active marker in storage to verify K1 cannot delete it
    window.sessionStorage.setItem(
      getSessionStorageKey(userA, defaultOptions.endpoint),
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId: userA,
        idempotencyKey: keyA2,
        state: 'SUBMITTING',
        timestamp: Date.now(),
      })
    );

    // K1 completes late in the background
    await act(async () => {
      resolveMutationK1!({ id: 'tx-K1', status: 'COMPLETED' });
      await submitPromiseK1;
    });

    // K2 UI state MUST remain DRAFT, NOT overwritten by K1's CONFIRMED_SUCCESS!
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.idempotencyKey).toBe(keyA2);
    expect(result.current.result).toBeNull();

    // onSuccess for K2 must NEVER have been called with K1's data!
    expect(onSuccessA2).not.toHaveBeenCalled();

    // K2 marker must NOT have been deleted by K1!
    const storedK2 = window.sessionStorage.getItem(getSessionStorageKey(userA, defaultOptions.endpoint));
    expect(storedK2).not.toBeNull();
    expect(JSON.parse(storedK2!).idempotencyKey).toBe(keyA2);
  });

  it('HOOK-31: ABA Stale Timeout - User A sends K1, switches B, returns to A with K2, K1 times out -> K2 not overwritten', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-timeout-A';
    const userB = 'user-timeout-B';
    const onErrorA2 = vi.fn();

    let rejectMutationK1: (err: any) => void;
    const pendingPromiseK1 = new Promise((_, rej) => {
      rejectMutationK1 = rej;
    });

    const { result, rerender } = renderHook(
      (props: { userId: string; onError?: any }) =>
        useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId: props.userId, onError: props.onError }),
      { initialProps: { userId: userA, onError: vi.fn() } }
    );

    const keyA1 = result.current.idempotencyKey;

    // User A submits K1
    let submitPromiseK1: Promise<any>;
    act(() => {
      submitPromiseK1 = result.current.submit({ item: 'K1' }, () => pendingPromiseK1);
    });

    // Switch to B
    rerender({ userId: userB, onError: vi.fn() });

    // Clear K1 so User A can start new intent K2
    clearPendingAmbiguousSession(userA, defaultOptions.endpoint, keyA1);

    // Switch back to A (new key K2)
    rerender({ userId: userA, onError: onErrorA2 });
    const keyA2 = result.current.idempotencyKey;
    expect(keyA2).not.toBe(keyA1);

    // K1 times out late
    await act(async () => {
      rejectMutationK1!({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' });
      await submitPromiseK1;
    });

    // K2 must NOT be flipped to AMBIGUOUS_OUTCOME!
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.idempotencyKey).toBe(keyA2);
    expect(onErrorA2).not.toHaveBeenCalled();
  });

  it('HOOK-32: Stale GET Idempotency - GET status of A/K1 resolves after returning to A/K2 -> K2 not overwritten', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-stale-get-A';
    const userB = 'user-stale-get-B';
    const keyA1 = '11111111-3333-4444-8888-111111111111';

    // Store ambiguous session for K1
    window.sessionStorage.setItem(
      getSessionStorageKey(userA, defaultOptions.endpoint),
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId: userA,
        idempotencyKey: keyA1,
        state: 'AMBIGUOUS_OUTCOME',
        timestamp: 1000,
      })
    );

    let resolveQueryK1: (data: any) => void;
    const queryPromiseK1 = new Promise((res) => {
      resolveQueryK1 = res;
    });

    const onSuccessA2 = vi.fn();
    const { result, rerender } = renderHook(
      (props: { userId: string; onSuccess?: any }) =>
        useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId: props.userId, onSuccess: props.onSuccess }),
      { initialProps: { userId: userA, onSuccess: vi.fn() } }
    );

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(keyA1);

    // Start checking ambiguous status
    let checkPromiseK1: Promise<any>;
    act(() => {
      checkPromiseK1 = result.current.checkAmbiguousStatus(() => queryPromiseK1);
    });

    // Switch to User B
    rerender({ userId: userB, onSuccess: vi.fn() });

    // Clear K1 from storage to simulate user A starting new intent K2
    clearPendingAmbiguousSession(userA, defaultOptions.endpoint, keyA1);

    // Switch back to User A (new DRAFT with K2)
    rerender({ userId: userA, onSuccess: onSuccessA2 });
    expect(result.current.state).toBe('DRAFT');
    const keyA2 = result.current.idempotencyKey;
    expect(keyA2).not.toBe(keyA1);

    // Query resolves K1 COMMITTED
    await act(async () => {
      resolveQueryK1!({
        status: 'COMMITTED',
        transaction: { id: 'tx-K1-committed', status: 'COMPLETED' },
      });
      await checkPromiseK1;
    });

    // K2 must NOT be overwritten!
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.result).toBeNull();
    expect(onSuccessA2).not.toHaveBeenCalled();
  });

  it('HOOK-33: Stale Request Cannot Release Execution Lock of newer request', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-lock-A';
    const userB = 'user-lock-B';

    let resolveMutationA: (val: any) => void;
    const pendingPromiseA = new Promise((res) => {
      resolveMutationA = res;
    });

    let resolveMutationB: (val: any) => void;
    const pendingPromiseB = new Promise((res) => {
      resolveMutationB = res;
    });

    const { result, rerender } = renderHook(
      ({ userId }) => useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId }),
      { initialProps: { userId: userA } }
    );

    // User A submits K1
    let submitPromiseA: Promise<any>;
    act(() => {
      submitPromiseA = result.current.submit({ item: 'A' }, () => pendingPromiseA);
    });

    // Switch to User B
    rerender({ userId: userB });
    expect(result.current.state).toBe('DRAFT');

    // User B submits K2
    let submitPromiseB: Promise<any>;
    act(() => {
      submitPromiseB = result.current.submit({ item: 'B' }, () => pendingPromiseB);
    });
    expect(result.current.state).toBe('SUBMITTING');

    // While User B is submitting, response A finishes late!
    await act(async () => {
      resolveMutationA!({ id: 'tx-A', status: 'COMPLETED' });
      await submitPromiseA;
    });

    // Response A must NOT have cleared User B's execution lock!
    // Double-click submit on User B MUST STILL be rejected!
    let secondSubmitResultB: any;
    await act(async () => {
      secondSubmitResultB = await result.current.submit({ item: 'B2' }, vi.fn());
    });
    expect(secondSubmitResultB).toBeNull();
    expect(result.current.errorMessage).toContain('Chỉ được phép gửi giao dịch mới khi ở trạng thái DRAFT');

    // Now B finishes
    await act(async () => {
      resolveMutationB!({ id: 'tx-B', status: 'COMPLETED' });
      await submitPromiseB;
    });
    expect(result.current.state).toBe('CONFIRMED_SUCCESS');
  });

  it('HOOK-34: Same User, Different Intent - response of old intent with different key does not update new intent', async () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-same-diff-intent';
    const onSuccessK2 = vi.fn();

    let resolveK1: (v: any) => void;
    const promiseK1 = new Promise((res) => {
      resolveK1 = res;
    });

    const { result, rerender } = renderHook(
      (props: { endpoint: string; onSuccess?: any }) =>
        useIdempotentTransaction({ endpoint: props.endpoint, userId, onSuccess: props.onSuccess }),
      { initialProps: { endpoint: '/api/v1/stock-transactions/import', onSuccess: vi.fn() } }
    );

    const keyK1 = result.current.idempotencyKey;

    let submitK1: Promise<any>;
    act(() => {
      submitK1 = result.current.submit({ item: 'K1' }, () => promiseK1);
    });
    expect(result.current.state).toBe('SUBMITTING');

    // User switches intent endpoint
    rerender({ endpoint: '/api/v1/stock-transactions/export', onSuccess: vi.fn() });

    // Clear K1 so when switching back to import, user is on a new draft K2
    clearPendingAmbiguousSession(userId, '/api/v1/stock-transactions/import', keyK1);

    // User switches back to import (new intent K2)
    rerender({ endpoint: '/api/v1/stock-transactions/import', onSuccess: onSuccessK2 });

    expect(result.current.state).toBe('DRAFT');
    const keyK2 = result.current.idempotencyKey;
    expect(keyK2).not.toBe(keyK1);

    // K1 resolves late
    await act(async () => {
      resolveK1!({ id: 'tx-K1-done', status: 'COMPLETED' });
      await submitK1;
    });

    // K2 MUST NOT be updated
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.result).toBeNull();
    expect(onSuccessK2).not.toHaveBeenCalled();
  });

  it('HOOK-35: Generation Protection - response of old generation does not drive new generation UI', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-gen-A';
    const userB = 'user-gen-B';
    const onSuccessA2 = vi.fn();

    let resolveMutationA1: (val: any) => void;
    const pendingPromiseA1 = new Promise((res) => {
      resolveMutationA1 = res;
    });

    const { result, rerender } = renderHook(
      (props: { userId: string; onSuccess?: any }) =>
        useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId: props.userId, onSuccess: props.onSuccess }),
      { initialProps: { userId: userA, onSuccess: vi.fn() } }
    );

    // Submit under Generation 1
    let submitPromiseA1: Promise<any>;
    act(() => {
      submitPromiseA1 = result.current.submit({ item: 'gen1' }, () => pendingPromiseA1);
    });

    // Switch to B (Generation advances)
    rerender({ userId: userB, onSuccess: vi.fn() });

    // Clear A's old session to allow starting new Generation 3 intent
    clearPendingAmbiguousSession(userA, defaultOptions.endpoint);

    // Switch back to A (Generation advances again to 3)
    rerender({ userId: userA, onSuccess: onSuccessA2 });

    // Resolve A1 from Generation 1
    await act(async () => {
      resolveMutationA1!({ id: 'tx-gen1', status: 'COMPLETED' });
      await submitPromiseA1;
    });

    // Generation 3 UI MUST NOT be driven by Generation 1 response
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.result).toBeNull();
    expect(onSuccessA2).not.toHaveBeenCalled();
  });

  it('HOOK-36: Existing Recovery Still Works - restored ambiguous session GET COMMITTED confirms success without stale lockup', async () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-recovery';
    const key1 = '550e8400-e29b-41d4-a716-446655440099';
    const onSuccess = vi.fn();

    // Store ambiguous session as if left by previous page reload
    window.sessionStorage.setItem(
      getSessionStorageKey(userId, defaultOptions.endpoint),
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId,
        idempotencyKey: key1,
        state: 'AMBIGUOUS_OUTCOME',
        timestamp: Date.now(),
      })
    );

    // Mount hook
    const { result } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId, onSuccess })
    );

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(key1);

    // User calls checkAmbiguousStatus
    const mockQueryStatus = vi.fn().mockResolvedValue({
      status: 'COMMITTED',
      transaction: { id: 'tx-recovered-99', status: 'COMPLETED' },
    });

    let checkResult: any;
    await act(async () => {
      checkResult = await result.current.checkAmbiguousStatus(mockQueryStatus);
    });

    expect(checkResult.resolved).toBe(true);
    expect(checkResult.outcome).toBe('COMMITTED');
    expect(result.current.state).toBe('CONFIRMED_SUCCESS');
    expect(result.current.result).toEqual({ id: 'tx-recovered-99', status: 'COMPLETED' });
    expect(onSuccess).toHaveBeenCalledWith(
      { id: 'tx-recovered-99', status: 'COMPLETED' },
      null
    );
    // Session storage cleared
    expect(window.sessionStorage.getItem(getSessionStorageKey(userId, defaultOptions.endpoint))).toBeNull();
  });

  it('HOOK-37: Regression Safety - UNKNOWN keeps marker, GET 404 keeps lock, retryAmbiguous fails, resolveReconciliation fails-closed', async () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-reg-safety';
    const { result } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId })
    );

    // 1. UNKNOWN keeps marker and transitions to AMBIGUOUS_OUTCOME
    await act(async () => {
      await result.current.submit({ test: 1 }, () => Promise.reject(new Error('Unknown generic error')));
    });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    const key1 = result.current.idempotencyKey;
    const storedMeta = window.sessionStorage.getItem(getSessionStorageKey(userId, defaultOptions.endpoint));
    expect(storedMeta).not.toBeNull();
    expect(JSON.parse(storedMeta!).idempotencyKey).toBe(key1);

    // 2. Cannot resetToDraft while ambiguous
    act(() => {
      result.current.resetToDraft();
    });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(key1);

    // 3. retryAmbiguous refuses to issue raw POST
    const mockMutationFn = vi.fn();
    let retryRes: any;
    await act(async () => {
      retryRes = await result.current.retryAmbiguous(mockMutationFn);
    });
    expect(retryRes).toBeNull();
    expect(mockMutationFn).not.toHaveBeenCalled();

    // 4. resolveReconciliation fails closed
    const resolved = result.current.resolveReconciliation();
    expect(resolved).toBe(false);
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');

    // 5. GET 404 does not release lock, returns NOT_FOUND_AMBIGUOUS
    const mock404Query = vi.fn().mockRejectedValue({
      response: { status: 404, data: { message: 'Not found' } },
    });
    let statusCheckRes: any;
    await act(async () => {
      statusCheckRes = await result.current.checkAmbiguousStatus(mock404Query);
    });
    expect(statusCheckRes.resolved).toBe(false);
    expect(statusCheckRes.outcome).toBe('NOT_FOUND_AMBIGUOUS');
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    // Storage marker is STILL present
    expect(window.sessionStorage.getItem(getSessionStorageKey(userId, defaultOptions.endpoint))).not.toBeNull();
  });

  // =========================================================================
  // S2C-3B ABA PATCH FINAL MARKER CONSISTENCY FIX (MARKER-01 to MARKER-06)
  // =========================================================================

  it('MARKER-01: K2 marker exists, K1 times out late with larger timestamp; K2 is NOT overwritten', async () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-01';
    const key1 = '11111111-0001-4000-8000-111111111111';
    const key2 = '22222222-0002-4000-8000-222222222222';

    // 1. K2 marker is recorded with earlier timestamp (t = 1000)
    savePendingAmbiguousSession({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key2,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'K2 active marker',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: 1000,
    });

    // Verify K2 is active
    const storageKey = getSessionStorageKey(userId, defaultOptions.endpoint);
    const storedBefore = JSON.parse(window.sessionStorage.getItem(storageKey)!);
    expect(storedBefore.idempotencyKey).toBe(key2);

    // 2. K1 (older request) times out late with a LARGER timestamp (t = 9000)
    savePendingAmbiguousSession({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key1,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'K1 stale timeout arrives late',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: 9000,
    });

    // 3. K2 in primary storage MUST NOT be overwritten by K1!
    const storedAfter = JSON.parse(window.sessionStorage.getItem(storageKey)!);
    expect(storedAfter.idempotencyKey).toBe(key2);
    expect(storedAfter.errorMessage).toBe('K2 active marker');

    // 4. In-memory primary registry for (userId, endpoint) MUST NOT be overwritten!
    const memEntry = getPendingAmbiguousSession(userId, defaultOptions.endpoint);
    expect(memEntry?.idempotencyKey).toBe(key2);

    // 5. K1 is preserved in per-key storage and not lost
    const k1PerKey = getPendingAmbiguousSession(userId, defaultOptions.endpoint, key1);
    expect(k1PerKey?.idempotencyKey).toBe(key1);
  });

  it('MARKER-02: K1 and K2 different keys for same user/endpoint; second pre-dispatch cannot silently delete first marker', () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-02';
    const key1 = '11111111-0002-4000-8000-111111111111';
    const key2 = '22222222-0002-4000-8000-222222222222';

    // 1. Pre-dispatch marker for K1 is recorded
    const recorded1 = recordPreDispatchMarker({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key1,
    });
    expect(recorded1).toBe(true);

    const storageKey = getSessionStorageKey(userId, defaultOptions.endpoint);
    const stored1 = JSON.parse(window.sessionStorage.getItem(storageKey)!);
    expect(stored1.idempotencyKey).toBe(key1);
    expect(stored1.state).toBe('SUBMITTING');

    // 2. Attempt pre-dispatch for K2 (different key, same user & endpoint)
    // while K1 is unresolved
    const recorded2 = recordPreDispatchMarker({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key2,
    });

    // MUST fail-closed to prevent silent overwrite of unresolved K1!
    expect(recorded2).toBe(false);

    // 3. Storage and memory STILL hold K1 intact!
    const storedAfter = JSON.parse(window.sessionStorage.getItem(storageKey)!);
    expect(storedAfter.idempotencyKey).toBe(key1);

    const memAfter = getPendingAmbiguousSession(userId, defaultOptions.endpoint);
    expect(memAfter?.idempotencyKey).toBe(key1);
  });

  it('MARKER-03: memory registry and sessionStorage remain strictly consistent when marker conflict or storage error is detected', () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-03';
    const key1 = '11111111-0003-4000-8000-111111111111';
    const key2 = '22222222-0003-4000-8000-222222222222';

    // 1. Establish K1 in both storage and memory
    recordPreDispatchMarker({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key1,
    });

    const storageKey = getSessionStorageKey(userId, defaultOptions.endpoint);
    const storageItem1 = window.sessionStorage.getItem(storageKey);
    const memoryItem1 = getPendingAmbiguousSession(userId, defaultOptions.endpoint);
    expect(JSON.parse(storageItem1!).idempotencyKey).toBe(key1);
    expect(memoryItem1?.idempotencyKey).toBe(key1);

    // 2. Conflicting pre-dispatch attempt
    const conflictResult = recordPreDispatchMarker({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key2,
    });
    expect(conflictResult).toBe(false);

    // Verify memory and storage remain identical (neither was changed)
    const storageItemAfter = window.sessionStorage.getItem(storageKey);
    const memoryItemAfter = getPendingAmbiguousSession(userId, defaultOptions.endpoint);
    expect(JSON.parse(storageItemAfter!).idempotencyKey).toBe(key1);
    expect(memoryItemAfter?.idempotencyKey).toBe(key1);

    // 3. Simulate sessionStorage failure during savePendingAmbiguousSession:
    // Memory registry must NOT be updated ahead of storage
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const key3 = '33333333-0003-4000-8000-333333333333';
    savePendingAmbiguousSession({
      endpoint: '/api/v1/stock-transactions/export',
      userId: 'user-marker-03-storage-fail',
      idempotencyKey: key3,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'test fail',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: Date.now(),
    });

    // Memory registry must NOT have the failed entry
    const failedMem = getPendingAmbiguousSession('user-marker-03-storage-fail', '/api/v1/stock-transactions/export');
    expect(failedMem).toBeNull();

    setItemSpy.mockRestore();
  });

  it('MARKER-04: ABA stale timeout does not overwrite marker K2 even while UI is in DRAFT', async () => {
    clearAllPendingAmbiguousSessions();
    const userA = 'user-marker-04-A';
    const userB = 'user-marker-04-B';

    let rejectMutationK1: (err: any) => void;
    const pendingPromiseK1 = new Promise((_, rej) => {
      rejectMutationK1 = rej;
    });

    const { result, rerender } = renderHook(
      (props: { userId: string }) =>
        useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId: props.userId }),
      { initialProps: { userId: userA } }
    );

    const keyA1 = result.current.idempotencyKey;

    // User A submits K1
    let submitPromiseK1: Promise<any>;
    act(() => {
      submitPromiseK1 = result.current.submit({ item: 'K1' }, () => pendingPromiseK1);
    });
    expect(result.current.state).toBe('SUBMITTING');

    // Switch to User B
    rerender({ userId: userB });
    expect(result.current.state).toBe('DRAFT');

    // Clear K1 from User A's session to allow clean transition to K2
    clearPendingAmbiguousSession(userA, defaultOptions.endpoint, keyA1);

    // Switch back to User A (gets keyA2 in DRAFT)
    rerender({ userId: userA });
    expect(result.current.state).toBe('DRAFT');
    const keyA2 = result.current.idempotencyKey;
    expect(keyA2).not.toBe(keyA1);

    // Record K2 marker in storage (e.g. user began working on K2 or pre-dispatch)
    savePendingAmbiguousSession({
      endpoint: defaultOptions.endpoint,
      userId: userA,
      idempotencyKey: keyA2,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'K2 active intent',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: Date.now(),
    });

    const storageKey = getSessionStorageKey(userA, defaultOptions.endpoint);
    expect(JSON.parse(window.sessionStorage.getItem(storageKey)!).idempotencyKey).toBe(keyA2);

    // K1 times out late in background with higher timestamp
    await act(async () => {
      rejectMutationK1!({ code: 'ECONNABORTED', message: 'timeout of 15000ms' });
      await submitPromiseK1;
    });

    // K2 marker in storage MUST NOT be overwritten with K1!
    const storedAfter = JSON.parse(window.sessionStorage.getItem(storageKey)!);
    expect(storedAfter.idempotencyKey).toBe(keyA2);
    expect(storedAfter.errorMessage).toBe('K2 active intent');

    // In-memory active session for User A must STILL be K2!
    const activeMem = getPendingAmbiguousSession(userA, defaultOptions.endpoint);
    expect(activeMem?.idempotencyKey).toBe(keyA2);
  });

  it('MARKER-05: Cannot create/dispatch K2 while K1 is unresolved without valid verification', async () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-05';
    const key1 = '11111111-0005-4000-8000-111111111111';

    // 1. K1 exists in unresolved state (AMBIGUOUS_OUTCOME)
    savePendingAmbiguousSession({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key1,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'K1 unresolved',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: Date.now(),
    });

    // 2. Mount hook for this user & endpoint
    const { result } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId })
    );

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(key1);

    // 3. User attempts to submit K2: MUST be blocked because state is not DRAFT!
    const mockMutation = vi.fn();
    let submitRes: any;
    await act(async () => {
      submitRes = await result.current.submit({ item: 'K2' }, mockMutation);
    });
    expect(submitRes).toBeNull();
    expect(mockMutation).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toContain('Chỉ được phép gửi giao dịch mới khi ở trạng thái DRAFT');

    // 4. User attempts resetToDraft(): MUST be rejected while unresolved!
    act(() => {
      result.current.resetToDraft();
    });
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(key1);

    // 5. Direct recordPreDispatchMarker for K2: MUST fail-closed!
    const key2 = '22222222-0005-4000-8000-222222222222';
    const recorded2 = recordPreDispatchMarker({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key2,
    });
    expect(recorded2).toBe(false);

    // 6. Execute valid verification: GET Idempotency confirms COMMITTED
    const mockQueryStatus = vi.fn().mockResolvedValue({
      status: 'COMMITTED',
      transaction: { id: 'tx-k1-resolved', status: 'COMPLETED' },
    });

    await act(async () => {
      const checkRes = await result.current.checkAmbiguousStatus(mockQueryStatus);
      expect(checkRes.resolved).toBe(true);
      expect(checkRes.outcome).toBe('COMMITTED');
    });

    expect(result.current.state).toBe('CONFIRMED_SUCCESS');

    // 7. Now that K1 is resolved, user CAN reset to DRAFT and create K2!
    act(() => {
      result.current.resetToDraft();
    });
    expect(result.current.state).toBe('DRAFT');
    const freshKey = result.current.idempotencyKey;
    expect(freshKey).not.toBe(key1);

    // Dispatching new transaction with fresh key now succeeds
    const mockMutation2 = vi.fn().mockResolvedValue({ id: 'tx-k2-success' });
    let submitRes2: any;
    await act(async () => {
      submitRes2 = await result.current.submit({ item: 'K2' }, mockMutation2);
    });
    expect(submitRes2).toEqual({ id: 'tx-k2-success' });
    expect(result.current.state).toBe('CONFIRMED_SUCCESS');
  });

  it('MARKER-06: K1 confirmed COMMITTED does not delete K2 marker', () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-06';
    const key1 = '11111111-0006-4000-8000-111111111111';
    const key2 = '22222222-0006-4000-8000-222222222222';

    // 1. K2 marker is the active marker in storage and memory
    savePendingAmbiguousSession({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key2,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'K2 active',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: Date.now(),
    });

    const storageKey = getSessionStorageKey(userId, defaultOptions.endpoint);
    expect(JSON.parse(window.sessionStorage.getItem(storageKey)!).idempotencyKey).toBe(key2);

    // 2. K1 is confirmed COMMITTED and clearPendingAmbiguousSession is called with expectedKey = key1
    clearPendingAmbiguousSession(userId, defaultOptions.endpoint, key1);

    // 3. K2 in primary storage MUST NOT be deleted!
    const storedAfter = window.sessionStorage.getItem(storageKey);
    expect(storedAfter).not.toBeNull();
    expect(JSON.parse(storedAfter!).idempotencyKey).toBe(key2);

    // 4. In-memory registry MUST STILL have K2!
    const memAfter = getPendingAmbiguousSession(userId, defaultOptions.endpoint);
    expect(memAfter?.idempotencyKey).toBe(key2);
  });

  it('MARKER-07: unresolved per-key marker K1 blocks K3 dispatch even after K2 COMMITTED', async () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-07';
    const key1 = '11111111-0007-4000-8000-111111111111';
    const key2 = '22222222-0007-4000-8000-222222222222';
    const key3 = '33333333-0007-4000-8000-333333333333';

    // Set up K1 in per-key slot only
    const perKey1 = getPerKeyStorageKey(userId, defaultOptions.endpoint, key1);
    window.sessionStorage.setItem(
      perKey1,
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId,
        idempotencyKey: key1,
        state: 'AMBIGUOUS_OUTCOME',
        errorMessage: 'K1 ambiguous in per-key slot',
        errorCategory: 'NETWORK_TIMEOUT',
        timestamp: Date.now() - 5000,
      })
    );

    // Set up K2 in primary slot and per-key slot
    savePendingAmbiguousSession({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key2,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'K2 active in primary slot',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: Date.now(),
    });

    // Mount hook for this user & endpoint -> initializes with active K2
    const { result } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId })
    );

    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(key2);

    // K2 status check confirms COMMITTED
    const mockQueryStatus = vi.fn().mockResolvedValue({
      status: 'COMMITTED',
      transaction: { id: 'tx-k2-resolved', status: 'COMPLETED' },
    });

    await act(async () => {
      const checkRes = await result.current.checkAmbiguousStatus(mockQueryStatus);
      expect(checkRes.resolved).toBe(true);
      expect(checkRes.outcome).toBe('COMMITTED');
    });

    expect(result.current.state).toBe('CONFIRMED_SUCCESS');

    // Attempting to record K3 pre-dispatch marker MUST fail closed because K1 is still unresolved!
    const recordedK3 = recordPreDispatchMarker({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key3,
    });
    expect(recordedK3).toBe(false);

    // Attempting resetToDraft MUST be rejected because K1 is still unresolved
    act(() => {
      result.current.resetToDraft();
    });
    // K1 should have been promoted to primary, so resetToDraft returns early and does not allow fresh draft
    const scan = scanAllStorageMarkers(userId, defaultOptions.endpoint);
    expect(scan.unresolvedEntries.some((e) => e.idempotencyKey === key1)).toBe(true);
    expect(result.current.state).not.toBe('DRAFT');
  });

  it('MARKER-08: page reload/remount discovers unresolved K1 when only per-key slot exists and primary is empty', () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-08';
    const key1 = '11111111-0008-4000-8000-111111111111';

    // Simulate situation where primary slot is empty, but per-key slot has an unresolved marker
    const perKeyStorageKey = getPerKeyStorageKey(userId, defaultOptions.endpoint, key1);
    const meta = {
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key1,
      state: 'AMBIGUOUS_OUTCOME',
      errorMessage: 'K1 persisted in per-key slot across reload',
      errorCategory: 'NETWORK_TIMEOUT',
      timestamp: Date.now(),
    };
    window.sessionStorage.setItem(perKeyStorageKey, JSON.stringify(meta));

    // Clear in-memory registry to simulate completely fresh page reload
    clearMemoryRegistryOnly();

    // Verify primary slot in sessionStorage is currently empty
    const primaryStorageKey = getSessionStorageKey(userId, defaultOptions.endpoint);
    expect(window.sessionStorage.getItem(primaryStorageKey)).toBeNull();

    // Mount hook for this user & endpoint
    const { result } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId })
    );

    // Unresolved K1 must be discovered and promoted
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(result.current.idempotencyKey).toBe(key1);
    expect(result.current.errorMessage).toBe('K1 persisted in per-key slot across reload');

    // Primary slot in sessionStorage must now be populated with promoted K1
    const primaryStored = window.sessionStorage.getItem(primaryStorageKey);
    expect(primaryStored).not.toBeNull();
    expect(JSON.parse(primaryStored!).idempotencyKey).toBe(key1);
  });

  it('MARKER-09: rollback on partial storage failure ensures persistence is never left half-updated', async () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-09';
    const key1 = '11111111-0009-4000-8000-111111111111';
    const primaryStorageKey = getSessionStorageKey(userId, defaultOptions.endpoint);
    const perKeyStorageKey = getPerKeyStorageKey(userId, defaultOptions.endpoint, key1);

    // Mock sessionStorage.setItem to succeed for primary, but throw QuotaExceededError for perKey
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => {
      if (typeof key === 'string' && key.includes('__key_')) {
        throw new Error('QuotaExceededError: sessionStorage quota exceeded');
      }
      return originalSetItem.call(window.sessionStorage, key, val);
    });

    const recorded = recordPreDispatchMarker({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key1,
    });

    // 1. recordPreDispatchMarker must fail closed (return false)
    expect(recorded).toBe(false);

    // 2. Primary slot must have been rolled back (null)
    expect(window.sessionStorage.getItem(primaryStorageKey)).toBeNull();
    // 3. Per-key slot must be null
    expect(window.sessionStorage.getItem(perKeyStorageKey)).toBeNull();

    // 4. Memory registry must NOT have been updated with key1
    const memoryCheck = getPendingAmbiguousSession(userId, defaultOptions.endpoint, key1);
    expect(memoryCheck).toBeNull();

    // 5. Test within hook submit(): Mutation must NOT be dispatched
    const { result } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId })
    );

    const mockMutation = vi.fn();
    let submitRes: any;
    await act(async () => {
      submitRes = await result.current.submit({ item: 'test' }, mockMutation);
    });

    expect(submitRes).toBeNull();
    expect(mockMutation).not.toHaveBeenCalled();
    expect(result.current.state).toBe('DRAFT');
    expect(result.current.errorMessage).toContain('Không thể ghi nhận marker an toàn');

    setItemSpy.mockRestore();
  });

  it('MARKER-10: corrupted storage (malformed JSON) fails closed: no silent overwrite, no fresh DRAFT, blocks dispatch', async () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-10';
    const primaryStorageKey = getSessionStorageKey(userId, defaultOptions.endpoint);
    const keyCorrupt = '11111111-0010-4000-8000-111111111111';

    // 1. Inject malformed JSON into primary slot
    window.sessionStorage.setItem(primaryStorageKey, '{malformed json! not valid');

    // 2. recordPreDispatchMarker must fail closed
    const recordRes = recordPreDispatchMarker({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: keyCorrupt,
    });
    expect(recordRes).toBe(false);

    // 3. savePendingAmbiguousSession must NOT silently overwrite corrupted storage
    savePendingAmbiguousSession({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: keyCorrupt,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'trying to overwrite',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: Date.now(),
    });
    // The storage value must NOT have been overwritten with valid JSON
    expect(window.sessionStorage.getItem(primaryStorageKey)).toBe('{malformed json! not valid');

    // 4. Mount hook with corrupted storage: MUST fail-closed to RECONCILIATION_REQUIRED
    const { result } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId })
    );

    expect(result.current.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.current.idempotencyKey).toBe('00000000-0000-0000-0000-000000000000');
    expect(result.current.errorMessage).toContain('Dữ liệu phiên đối soát bị lỗi');

    // 5. Submit must be blocked
    const mockMutation = vi.fn();
    let submitRes: any;
    await act(async () => {
      submitRes = await result.current.submit({ test: 1 }, mockMutation);
    });
    expect(submitRes).toBeNull();
    expect(mockMutation).not.toHaveBeenCalled();

    // 6. resetToDraft must be blocked
    act(() => {
      result.current.resetToDraft();
    });
    expect(result.current.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.current.idempotencyKey).toBe('00000000-0000-0000-0000-000000000000');

    // 7. Inject corrupted JSON into a per-key slot while primary is empty
    window.sessionStorage.removeItem(primaryStorageKey);
    clearMemoryRegistryOnly();
    const perKeyStorageKey = getPerKeyStorageKey(userId, defaultOptions.endpoint, keyCorrupt);
    window.sessionStorage.setItem(perKeyStorageKey, 'invalid-per-key-json');

    const scan = scanAllStorageMarkers(userId, defaultOptions.endpoint);
    expect(scan.hasCorrupted).toBe(true);

    const recordRes2 = recordPreDispatchMarker({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: '22222222-0010-4000-8000-222222222222',
    });
    expect(recordRes2).toBe(false);
  });

  it('MARKER-11: full multi-key recovery: all pending keys verified by backend before fresh DRAFT is allowed', async () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-11';
    const key1 = '11111111-0011-4000-8000-111111111111';
    const key2 = '22222222-0011-4000-8000-222222222222';

    // Store K1 in per-key slot
    const perKey1 = getPerKeyStorageKey(userId, defaultOptions.endpoint, key1);
    window.sessionStorage.setItem(
      perKey1,
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId,
        idempotencyKey: key1,
        state: 'AMBIGUOUS_OUTCOME',
        errorMessage: 'K1 ambiguous',
        errorCategory: 'NETWORK_TIMEOUT',
        timestamp: Date.now() - 10000,
      })
    );

    // Store K2 in primary slot and per-key slot
    savePendingAmbiguousSession({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key2,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'K2 ambiguous',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: Date.now(),
    });

    // 1. Mount hook -> K2 is active in primary slot
    const { result, unmount } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId })
    );
    expect(result.current.idempotencyKey).toBe(key2);
    expect(result.current.state).toBe('AMBIGUOUS_OUTCOME');

    // 2. Verify K2 via GET Idempotency -> Backend confirms COMMITTED
    const mockQueryK2 = vi.fn().mockResolvedValue({
      status: 'COMMITTED',
      transaction: { id: 'tx-k2-ok', status: 'COMPLETED' },
    });
    await act(async () => {
      const checkRes = await result.current.checkAmbiguousStatus(mockQueryK2);
      expect(checkRes.resolved).toBe(true);
      expect(checkRes.outcome).toBe('COMMITTED');
    });
    expect(result.current.state).toBe('CONFIRMED_SUCCESS');

    // Unmount and remount (or simulate page refresh) -> K1 should now be promoted!
    unmount();
    const { result: remountResult } = renderHook(() =>
      useIdempotentTransaction({ endpoint: defaultOptions.endpoint, userId })
    );

    expect(remountResult.current.idempotencyKey).toBe(key1);
    expect(remountResult.current.state).toBe('AMBIGUOUS_OUTCOME');

    // 3. User attempts resetToDraft() while K1 is unresolved -> MUST be rejected
    act(() => {
      remountResult.current.resetToDraft();
    });
    expect(remountResult.current.state).toBe('AMBIGUOUS_OUTCOME');
    expect(remountResult.current.idempotencyKey).toBe(key1);

    // 4. Verify K1 via GET Idempotency -> Backend confirms CONFIRMED_FAILED
    const mockQueryK1 = vi.fn().mockResolvedValue({
      status: 'CONFIRMED_FAILED',
      error: { message: 'Transaction K1 failed due to balance exhaustion' },
    });
    await act(async () => {
      const checkRes = await remountResult.current.checkAmbiguousStatus(mockQueryK1);
      expect(checkRes.resolved).toBe(true);
      expect(checkRes.outcome).toBe('CONFIRMED_FAILED');
    });
    expect(remountResult.current.state).toBe('CONFIRMED_FAILURE');

    // 5. Now that BOTH K2 and K1 have been verified, resetToDraft() MUST SUCCEED!
    act(() => {
      remountResult.current.resetToDraft();
    });
    expect(remountResult.current.state).toBe('DRAFT');
    const freshKey = remountResult.current.idempotencyKey;
    expect(freshKey).not.toBe(key1);
    expect(freshKey).not.toBe(key2);

    // 6. A new transaction can now be dispatched safely
    const mockMutationNew = vi.fn().mockResolvedValue({ id: 'tx-k3-success' });
    let finalSubmit: any;
    await act(async () => {
      finalSubmit = await remountResult.current.submit({ item: 'fresh' }, mockMutationNew);
    });
    expect(finalSubmit).toEqual({ id: 'tx-k3-success' });
    expect(remountResult.current.state).toBe('CONFIRMED_SUCCESS');
  });

  it('MARKER-12: stale async response for K1 cannot delete or corrupt K2 or K3 marker even across multiple transitions', () => {
    clearAllPendingAmbiguousSessions();
    const userId = 'user-marker-12';
    const key1 = '11111111-0012-4000-8000-111111111111';
    const key2 = '22222222-0012-4000-8000-222222222222';
    const key3 = '33333333-0012-4000-8000-333333333333';

    // 1. Record K2 as active in primary and per-key slots
    savePendingAmbiguousSession({
      endpoint: defaultOptions.endpoint,
      userId,
      idempotencyKey: key2,
      state: 'AMBIGUOUS_OUTCOME',
      snapshot: null,
      errorMessage: 'K2 active',
      errorCategory: 'NETWORK_TIMEOUT',
      conflict: null,
      timestamp: Date.now() - 2000,
    });

    // 2. Also record K3 in its per-key slot
    const perKey3 = getPerKeyStorageKey(userId, defaultOptions.endpoint, key3);
    window.sessionStorage.setItem(
      perKey3,
      JSON.stringify({
        endpoint: defaultOptions.endpoint,
        userId,
        idempotencyKey: key3,
        state: 'RECONCILIATION_REQUIRED',
        errorMessage: 'K3 pending reconciliation',
        errorCategory: 'PAYLOAD_MISMATCH',
        timestamp: Date.now(),
      })
    );

    // 3. Delayed async callback for K1 triggers clearPendingAmbiguousSession for key1
    clearPendingAmbiguousSession(userId, defaultOptions.endpoint, key1);

    // 4. Primary slot MUST STILL BE K2!
    const primaryStorageKey = getSessionStorageKey(userId, defaultOptions.endpoint);
    const primaryStored = window.sessionStorage.getItem(primaryStorageKey);
    expect(primaryStored).not.toBeNull();
    expect(JSON.parse(primaryStored!).idempotencyKey).toBe(key2);

    // 5. Per-key slot for K3 MUST STILL BE K3!
    const k3Stored = window.sessionStorage.getItem(perKey3);
    expect(k3Stored).not.toBeNull();
    expect(JSON.parse(k3Stored!).idempotencyKey).toBe(key3);

    // 6. Memory registry for K2 and primary must be intact
    const pending = getPendingAmbiguousSession(userId, defaultOptions.endpoint);
    expect(pending?.idempotencyKey).toBe(key2);

    // 7. Storage scan must report both K2 and K3 as unresolved
    const scan = scanAllStorageMarkers(userId, defaultOptions.endpoint);
    expect(scan.unresolvedEntries.length).toBe(2);
    expect(scan.unresolvedEntries.some((e) => e.idempotencyKey === key2)).toBe(true);
    expect(scan.unresolvedEntries.some((e) => e.idempotencyKey === key3)).toBe(true);
  });
});
