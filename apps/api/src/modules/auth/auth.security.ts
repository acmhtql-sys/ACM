import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Domain-separated HMAC-SHA256 password tag for JWT session invalidation (SEC-01).
 * Binds userId and full passwordHash using the system's JWT_SECRET.
 * Never leaks password plaintext, password hash, or secrets into JWT tokens or logs.
 */
export function computePasswordTag(userId: string, passwordHash: string): string {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`ACM_JWT_PWD_TAG_V1:${userId}:${passwordHash}`)
    .digest('hex');
}

/**
 * Constant-time verification of JWT password tag against expected value.
 * Fails closed if claim is missing, not a string, or length differs from 64 hex characters (32 bytes).
 */
export function verifyPasswordTag(expectedTag: string, claimTag: unknown): boolean {
  if (typeof claimTag !== 'string') return false;
  const bufExpected = Buffer.from(expectedTag, 'hex');
  const bufClaim = Buffer.from(claimTag, 'hex');
  if (bufExpected.length !== 32 || bufClaim.length !== 32) {
    return false;
  }
  return crypto.timingSafeEqual(bufExpected, bufClaim);
}
