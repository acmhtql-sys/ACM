import {
  StockTransactionType,
  TransactionStatus,
  StockTransactionSortField,
  StockMovementSortField,
  SortOrder,
  PaginationMeta,
  LocationType,
  UserRole,
  ImportStockInput,
  ExportStockInput,
  TransferStockInput,
  AdjustStockInput,
  AdjustStockInputV2,
  AdjustStockItemInputV2,
  IdempotencyQueryResponse,
  IdempotencyQueryStatus,
  QueryIdempotencyParams,
} from '@acm/shared';

// Re-export inputs & query types for client consumers
export type {
  ImportStockInput,
  ExportStockInput,
  TransferStockInput,
  AdjustStockInput,
  AdjustStockInputV2,
  AdjustStockItemInputV2,
  IdempotencyQueryResponse,
  IdempotencyQueryStatus,
  QueryIdempotencyParams,
  StockMovementSortField,
};

export interface StockMovementItem {
  id: string;
  itemId: string;
  locationId: string;
  type: StockTransactionType;
  quantityDelta: number;
  onHandBefore: number;
  onHandAfter: number;
  referenceType: string;
  referenceId?: string | null;
  reason?: string | null;
  createdById?: string | null;
  creatorName?: string;
  createdBy?: {
    id: string;
    fullName: string;
    email?: string;
  } | null;
  item?: {
    id: string;
    code: string;
    name: string;
    unit: string;
    type?: string;
  };
  location?: {
    id: string;
    code: string;
    name: string;
    type?: LocationType;
  };
  createdAt: string;
}

export interface StockMovementListResponse {
  movements: StockMovementItem[];
  meta: PaginationMeta;
}

export interface QueryStockMovementsParams {
  search?: string;
  itemId?: string;
  locationId?: string;
  type?: StockTransactionType;
  referenceType?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: StockMovementSortField;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
}

export interface StockTransactionDetailItem {
  id: string;
  stockTransactionId: string;
  itemId: string;
  locationId: string;
  toLocationId?: string | null;
  quantity: number;
  unitCost?: number | null;
  notes?: string | null;
  createdAt?: string;
  item?: {
    id: string;
    code: string;
    name: string;
    unit: string;
  };
  location?: {
    id: string;
    code: string;
    name: string;
    type: LocationType;
  };
  toLocation?: {
    id: string;
    code: string;
    name: string;
    type: LocationType;
  } | null;
}

export interface StockTransactionSummary {
  id: string;
  transactionNumber: string;
  type: StockTransactionType;
  status: TransactionStatus;
  notes?: string | null;
  createdById: string;
  creatorName: string;
  createdBy?: {
    id: string;
    fullName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  totalQuantity: number;
  details?: StockTransactionDetailItem[];
}

export interface StockTransactionListResponse {
  transactions: StockTransactionSummary[];
  meta: PaginationMeta;
}

export interface QueryStockTransactionsParams {
  search?: string;
  type?: StockTransactionType;
  status?: TransactionStatus;
  startDate?: string;
  endDate?: string;
  sortBy?: StockTransactionSortField;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
}

/**
 * 6-State Formal Idempotency State Machine
 */
export type IdempotencyState =
  | 'DRAFT'
  | 'SUBMITTING'
  | 'CONFIRMED_SUCCESS'
  | 'CONFIRMED_FAILURE'
  | 'AMBIGUOUS_OUTCOME'
  | 'RECONCILIATION_REQUIRED';

export interface ImmutableRequestSnapshot<T = any> {
  endpoint: string;
  idempotencyKey: string;
  exactPayload: T;
  userId: string;
  submittedAt: string;
}

export type IdempotencyErrorCategory =
  | 'SNAPSHOT_CONFLICT'
  | 'PAYLOAD_MISMATCH'
  | 'IN_PROGRESS'
  | 'TENANT_MISMATCH'
  | 'INSUFFICIENT_STOCK'
  | 'VALIDATION_FAILED'
  | 'FORBIDDEN'
  | 'NETWORK_TIMEOUT'
  | 'UNKNOWN';

export interface AuthoritativeReconciliationProof {
  verifiedOutcome: 'TRANSACTION_ALREADY_SUCCEEDED' | 'TRANSACTION_CONFIRMED_UNEXECUTED';
  auditTicketId: string; // Formal audit reference, e.g. "AUDIT-20261014-XXXX"
  authorizedBy: string; // Authorizing supervisor/auditor ID
  authorizationSecretOrToken: string; // Cryptographic verification token or supervisor pass-token (min 16 chars)
  evidenceDetails: string; // Minimum 20 characters explaining ledger audit findings
  verifiedTransaction?: {
    id: string; // Must be valid UUID
    transactionNumber: string;
    status: 'COMPLETED';
    type?: string;
  };
}

export type ReconciliationEvidence = AuthoritativeReconciliationProof;

export interface IdempotencyStatusCheckResult {
  resolved: boolean;
  outcome: 'COMMITTED' | 'CONFIRMED_FAILED' | 'IN_PROGRESS' | 'NOT_FOUND_AMBIGUOUS' | 'NETWORK_ERROR' | 'UNKNOWN';
  message: string;
  transaction?: any;
}

// =========================================================================
// ERROR PARSER & CONCURRENCY CONFLICT TYPES (Step S2C-1)
// =========================================================================

export type StockErrorType =
  | 'SNAPSHOT_CONFLICT'          // HTTP 409 with details.errorCode === 'CONCURRENT_STOCK_MODIFICATION'
  | 'IDEMPOTENCY_IN_PROGRESS'     // HTTP 409: Key concurrently in-flight in another thread/connection
  | 'IDEMPOTENCY_PAYLOAD_MISMATCH'// HTTP 409: Key reused with different payload
  | 'NETWORK_TIMEOUT_AMBIGUOUS'  // Axios timeout or network drop (server commit status unknown)
  | 'SERVER_ERROR_AMBIGUOUS'     // HTTP 5xx (server commit status unknown)
  | 'INSUFFICIENT_STOCK'         // HTTP 400: available stock violation
  | 'VALIDATION_ERROR'           // HTTP 422: Zod request validation error
  | 'FORBIDDEN_RBAC'             // HTTP 403: Role lacks required permissions
  | 'UNAUTHENTICATED'            // HTTP 401: Token missing or expired
  | 'NOT_FOUND_AMBIGUOUS'        // HTTP 404: Idempotency key lookup returned 404 (non-owner or in-flight)
  | 'UNKNOWN';

export interface StockSnapshotValues {
  onHand: number;
  reserved: number;
  quarantined: number;
  kitAllocated: number;
}

export interface StockConflictItem {
  itemId: string;
  locationId: string;
  expectedSnapshot: StockSnapshotValues;
  currentSnapshot: StockSnapshotValues;
}

export interface StockParsedError {
  type: StockErrorType;
  statusCode?: number;
  errorCode?: string;
  message: string;
  isAmbiguous: boolean;
  canAutoRetry: boolean;
  conflict?: StockConflictItem;
  validationErrors?: Array<{ field: string; message: string }>;
  details?: any;
  originalError: any;
}
