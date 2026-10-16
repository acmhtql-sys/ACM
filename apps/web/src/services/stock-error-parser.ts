import {
  StockParsedError,
  StockErrorType,
  StockConflictItem,
} from '../types/stock-transactions';

export interface StockErrorContext {
  isIdempotencyLookup?: boolean;
  endpoint?: string;
}

/**
 * Parses any backend error into a normalized, strongly-typed StockParsedError.
 * Implements strict differentiation between:
 * 1. HTTP 409 CONCURRENT_STOCK_MODIFICATION at details.errorCode
 * 2. HTTP 409 Idempotency In-Progress (Concurrent duplicate request)
 * 3. Network Error / Timeout / 5xx with unknown commit status
 * 4. HTTP 404 on Idempotency lookup (anti-probing non-owner defense / in-flight delay)
 */
export function parseStockError(
  err: unknown,
  context?: StockErrorContext
): StockParsedError {
  if (!err) {
    return {
      type: 'UNKNOWN',
      message: 'Lỗi không xác định',
      isAmbiguous: false,
      canAutoRetry: false,
      originalError: err,
    };
  }

  const errorObj = err as any;

  // 1. Check for Network Timeout or Disconnect (Axios / Fetch)
  const isNetworkDrop =
    errorObj.code === 'ECONNABORTED' ||
    errorObj.code === 'ERR_NETWORK' ||
    errorObj.message?.toLowerCase().includes('timeout') ||
    errorObj.message?.toLowerCase().includes('network error') ||
    Boolean(!errorObj.response && errorObj.request);

  if (isNetworkDrop) {
    return {
      type: 'NETWORK_TIMEOUT_AMBIGUOUS',
      statusCode: 0,
      message:
        'Kết nối mạng bị gián đoạn hoặc quá thời gian chờ (10s). Trạng thái ghi nhận chứng từ chưa được xác nhận trên máy chủ. Tuyệt đối không tự ý gửi lại giao dịch mới.',
      isAmbiguous: true,
      canAutoRetry: false,
      originalError: err,
    };
  }

  const response = errorObj.response;
  const status: number | undefined = response?.status;
  const data = response?.data;
  const serverMessage: string =
    data?.message || errorObj.message || 'Đã xảy ra lỗi khi xử lý giao dịch kho';
  const details = data?.details;
  const errorCode: string | undefined = details?.errorCode;

  // 2. HTTP 409 Conflict Subtypes
  if (status === 409) {
    // 2.1 Snapshot Conflict: Looked up exactly at response.details.errorCode
    if (errorCode === 'CONCURRENT_STOCK_MODIFICATION') {
      const conflict: StockConflictItem | undefined = details?.conflict;
      return {
        type: 'SNAPSHOT_CONFLICT',
        statusCode: 409,
        errorCode,
        message: serverMessage,
        isAmbiguous: false,
        canAutoRetry: false, // Strict: Never auto-retry stale snapshot!
        conflict,
        details,
        originalError: err,
      };
    }

    const lowerMessage = serverMessage.toLowerCase();

    // 2.2 Idempotency In-Progress: Concurrent duplicate request with identical key
    const isInProgress =
      lowerMessage.includes('đang được xử lý') ||
      lowerMessage.includes('đang xử lý') ||
      lowerMessage.includes('in-progress') ||
      lowerMessage.includes('in_progress') ||
      lowerMessage.includes('vui lòng thử lại sau') ||
      lowerMessage.includes('idempotency_records_key_key') ||
      (lowerMessage.includes('unique constraint') && lowerMessage.includes('idempotency')) ||
      errorCode === 'IDEMPOTENCY_IN_PROGRESS';

    if (isInProgress) {
      return {
        type: 'IDEMPOTENCY_IN_PROGRESS',
        statusCode: 409,
        errorCode: errorCode || 'IDEMPOTENCY_IN_PROGRESS',
        message:
          'Yêu cầu với Idempotency-Key này đang được xử lý trên máy chủ. Vui lòng đợi trong giây lát, không tạo giao dịch mới.',
        isAmbiguous: true,
        canAutoRetry: false,
        details,
        originalError: err,
      };
    }

    // 2.3 Idempotency Payload Mismatch: Reusing key with different body
    const isPayloadMismatch =
      lowerMessage.includes('xung đột idempotency') ||
      lowerMessage.includes('payload') ||
      lowerMessage.includes('nội dung yêu cầu') ||
      lowerMessage.includes('thay đổi') ||
      errorCode === 'IDEMPOTENCY_PAYLOAD_MISMATCH';

    if (isPayloadMismatch) {
      return {
        type: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        statusCode: 409,
        errorCode: errorCode || 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        message:
          'Khóa Idempotency-Key này đã được sử dụng trước đó với nội dung payload khác. Không được tái sử dụng khóa cho ý định nghiệp vụ mới.',
        isAmbiguous: false,
        canAutoRetry: false,
        details,
        originalError: err,
      };
    }

    return {
      type: 'UNKNOWN',
      statusCode: 409,
      errorCode,
      message: serverMessage,
      isAmbiguous: true,
      canAutoRetry: false,
      details,
      originalError: err,
    };
  }

  // 3. HTTP 403 Forbidden (RBAC violation)
  if (status === 403) {
    return {
      type: 'FORBIDDEN_RBAC',
      statusCode: 403,
      errorCode: errorCode || 'FORBIDDEN',
      message:
        serverMessage ||
        'Bạn không có quyền thực hiện hành động này theo chính sách phân quyền hệ thống.',
      isAmbiguous: false,
      canAutoRetry: false,
      details,
      originalError: err,
    };
  }

  // 4. HTTP 401 Unauthenticated
  if (status === 401) {
    return {
      type: 'UNAUTHENTICATED',
      statusCode: 401,
      errorCode: errorCode || 'UNAUTHENTICATED',
      message: 'Phiên đăng nhập đã hết hạn hoặc token không hợp lệ.',
      isAmbiguous: false,
      canAutoRetry: false,
      details,
      originalError: err,
    };
  }

  // 5. HTTP 404 Not Found
  if (status === 404) {
    const reqUrl: string =
      errorObj.config?.url ||
      errorObj.response?.config?.url ||
      context?.endpoint ||
      '';

    const isIdempotencyUrl =
      typeof reqUrl === 'string' &&
      (reqUrl.includes('/idempotency') || reqUrl.includes('idempotency'));

    const lowerMsg = (serverMessage || '').toLowerCase();
    const isIdempotencyMsg =
      lowerMsg.includes('idempotency') ||
      lowerMsg.includes('khóa') ||
      errorCode === 'IDEMPOTENCY_KEY_NOT_FOUND' ||
      details?.status === 'UNKNOWN';

    // If context indicates idempotency lookup, or request URL targets idempotency, or message/code specifies it:
    const isIdempotencyLookup =
      context?.isIdempotencyLookup === true ||
      isIdempotencyUrl ||
      isIdempotencyMsg;

    if (isIdempotencyLookup) {
      return {
        type: 'NOT_FOUND_AMBIGUOUS',
        statusCode: 404,
        errorCode: errorCode || 'IDEMPOTENCY_KEY_NOT_FOUND',
        message:
          'Không tìm thấy bản ghi giao dịch tương ứng với Idempotency-Key hoặc tài khoản hiện tại không có quyền xem khóa này. Trạng thái cam kết chưa thể khẳng định là chưa ghi.',
        isAmbiguous: true,
        canAutoRetry: false, // Strict: Never auto-retry POST on 404!
        details,
        originalError: err,
      };
    }

    // Standard resource 404 (e.g. GET /items/:id not found) is deterministic
    return {
      type: 'UNKNOWN',
      statusCode: 404,
      errorCode: errorCode || 'NOT_FOUND',
      message: serverMessage || 'Tài nguyên yêu cầu không tồn tại trên hệ thống.',
      isAmbiguous: false,
      canAutoRetry: false,
      details,
      originalError: err,
    };
  }

  // 6. HTTP 422 Unprocessable Entity (Zod Validation)
  if (status === 422) {
    const validationErrors = Array.isArray(details)
      ? details.map((d: any) => ({
          field: d.field || (Array.isArray(d.path) ? d.path.join('.') : 'root'),
          message: d.message || 'Lỗi dữ liệu đầu vào',
        }))
      : undefined;

    return {
      type: 'VALIDATION_ERROR',
      statusCode: 422,
      errorCode: errorCode || 'VALIDATION_ERROR',
      message: serverMessage || 'Dữ liệu đầu vào không hợp lệ',
      isAmbiguous: false,
      canAutoRetry: false,
      validationErrors,
      details,
      originalError: err,
    };
  }

  // 7. HTTP 400 Bad Request
  if (status === 400) {
    const isInsufficient =
      serverMessage.toLowerCase().includes('không đủ tồn kho') ||
      serverMessage.toLowerCase().includes('khả dụng') ||
      serverMessage.toLowerCase().includes('insufficient');

    return {
      type: isInsufficient ? 'INSUFFICIENT_STOCK' : 'VALIDATION_ERROR',
      statusCode: 400,
      errorCode: errorCode || (isInsufficient ? 'INSUFFICIENT_STOCK' : 'BAD_REQUEST'),
      message: serverMessage,
      isAmbiguous: false,
      canAutoRetry: false,
      details,
      originalError: err,
    };
  }

  // 8. HTTP 5xx Server Errors (Ambiguous state: could have executed before crashing)
  if (status && status >= 500) {
    return {
      type: 'SERVER_ERROR_AMBIGUOUS',
      statusCode: status,
      errorCode: errorCode || 'INTERNAL_SERVER_ERROR',
      message:
        serverMessage ||
        'Máy chủ gặp sự cố nội bộ (5xx). Trạng thái ghi nhận chứng từ chưa thể xác nhận.',
      isAmbiguous: true,
      canAutoRetry: false,
      details,
      originalError: err,
    };
  }

  return {
    type: 'UNKNOWN',
    statusCode: status,
    errorCode,
    message: serverMessage,
    isAmbiguous: false,
    canAutoRetry: false,
    details,
    originalError: err,
  };
}
