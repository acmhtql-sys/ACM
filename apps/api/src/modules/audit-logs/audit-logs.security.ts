/**
 * Audit Logs Deep Redaction & Security Helper
 * Sanitizes sensitive fields before persisting or outputting audit logs.
 */

const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /jwt/i,
  /apikey/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /hash/i,
  /salt/i,
  /credential/i,
  /session/i,
];

/**
 * Checks whether an object key corresponds to sensitive data.
 */
export function isSensitiveKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Recursively redacts sensitive values from objects, arrays, and JSON strings.
 * Replaces sensitive values with '[REDACTED]' or '[REDACTED_TOKEN]'.
 */
export function deepRedactSensitiveData(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Detect JWT token string (e.g. eyJhbGciOi...)
    if (
      trimmed.startsWith('eyJ') &&
      /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(trimmed)
    ) {
      return '[REDACTED_TOKEN]';
    }

    // Try parsing stringified JSON
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          const redacted = deepRedactSensitiveData(parsed, seen);
          return JSON.stringify(redacted);
        }
      } catch {
        // Not valid JSON, keep as is
      }
    }
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return '[CIRCULAR]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => deepRedactSensitiveData(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = deepRedactSensitiveData(val, seen);
    }
  }

  return result;
}
