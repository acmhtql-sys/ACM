import { RequestHandler } from 'express';
import { env } from '../config/env';
import {
  SecurityPolicyConfig,
  evaluateReadOnlyPolicy,
  isAmbiguousOrTraversedPath,
  extractEffectiveHttpMethod,
  extractNormalizedPath,
  createPureReadOnlyGuard,
} from '../config/securityPolicy';

export {
  SecurityPolicyConfig,
  isAmbiguousOrTraversedPath,
  extractEffectiveHttpMethod,
  extractNormalizedPath,
  createPureReadOnlyGuard,
};

export interface StagingReadOnlyPolicyContext {
  profile?: string;
  readOnly?: string;
  allowAuthLogin?: string;
}

export interface StagingReadOnlyOptions {
  active?: boolean;
  allowAuthLogin?: boolean;
  apiPrefix?: string;
  policy?: StagingReadOnlyPolicyContext;
}

/**
 * Resolves effective security configuration with strict precedence:
 * - Real validated runtime environment (process.env / env) ALWAYS has authoritative precedence.
 * - If runtime environment is 'cloud_staging', FAIL-CLOSED:
 *   NO injected options (active: false, policy.profile: 'local_dev', policy.readOnly: 'false',
 *   policy.allowAuthLogin: 'true') can EVER disable or weaken Cloud Staging Read-Only protection!
 * - In non-staging environments (e.g. local_dev testing), options can be used for harness control.
 */
export function getEffectiveSecurityConfig(options?: StagingReadOnlyOptions): SecurityPolicyConfig {
  const realProfile = process.env.ACM_DEPLOYMENT_PROFILE ?? env?.ACM_DEPLOYMENT_PROFILE;
  const realReadOnly = process.env.STAGING_READ_ONLY ?? env?.STAGING_READ_ONLY;
  const realAllowLogin = process.env.ALLOW_STAGING_AUTH_LOGIN ?? env?.ALLOW_STAGING_AUTH_LOGIN;

  // RULE 1: If real environment is cloud_staging, FAIL-CLOSED:
  // Injected options or policy CANNOT override or weaken cloud_staging protection!
  if (realProfile === 'cloud_staging') {
    return {
      profile: 'cloud_staging',
      readOnly: 'true',
      // If environment does not explicitly allow login, no option can enable it
      allowAuthLogin: realAllowLogin === 'true' && options?.allowAuthLogin !== false ? 'true' : 'false',
      apiPrefix: options?.apiPrefix ?? env?.API_PREFIX ?? '/api/v1',
    };
  }

  // RULE 2: In other environments (e.g. testing), options provide configuration
  const effectiveProfile = options?.policy?.profile ?? realProfile ?? 'local_dev';
  const effectiveReadOnly = options?.policy?.readOnly ?? realReadOnly ?? (options?.active ? 'true' : 'false');
  const effectiveAllowLogin =
    options?.policy?.allowAuthLogin ?? realAllowLogin ?? (options?.allowAuthLogin ? 'true' : 'false');

  return {
    profile: effectiveProfile,
    readOnly: effectiveReadOnly,
    allowAuthLogin: effectiveAllowLogin,
    apiPrefix: options?.apiPrefix ?? env?.API_PREFIX ?? '/api/v1',
  };
}

/**
 * Asserts the fail-closed cloud staging policy.
 * Throws an error if ACM_DEPLOYMENT_PROFILE is 'cloud_staging' but STAGING_READ_ONLY is not set to 'true'.
 */
export function assertCloudStagingPolicy(envObj?: {
  ACM_DEPLOYMENT_PROFILE?: string;
  STAGING_READ_ONLY?: string;
  RENDER?: string;
}): void {
  const profile = envObj?.ACM_DEPLOYMENT_PROFILE ?? process.env.ACM_DEPLOYMENT_PROFILE ?? env?.ACM_DEPLOYMENT_PROFILE;
  const readOnly = envObj?.STAGING_READ_ONLY ?? process.env.STAGING_READ_ONLY ?? env?.STAGING_READ_ONLY;

  if (profile === 'cloud_staging') {
    if (readOnly !== 'true') {
      throw new Error(
        'FAIL-CLOSED: ACM_DEPLOYMENT_PROFILE is "cloud_staging" but STAGING_READ_ONLY is not set to "true". ' +
        'Cloud Staging requires strict read-only protection.'
      );
    }
  }
}

/**
 * Checks whether Staging Read-Only mode is currently active.
 * Enforces strict environment precedence:
 * - If profile is 'cloud_staging' and STAGING_READ_ONLY is 'true', read-only is ALWAYS active.
 * - Injected options (e.g. active: false) MUST NEVER weaken or disable Cloud Staging protection.
 */
export function isStagingReadOnlyActive(options?: StagingReadOnlyOptions): boolean {
  const config = getEffectiveSecurityConfig(options);
  return evaluateReadOnlyPolicy(config);
}

/**
 * Express middleware that enforces strict Read-Only operation on Cloud Staging.
 * Blocks all POST, PUT, PATCH, DELETE mutations fail-closed, returning HTTP 403 Forbidden.
 */
export function cloudStagingReadOnlyMiddleware(options?: StagingReadOnlyOptions): RequestHandler {
  return createPureReadOnlyGuard(() => getEffectiveSecurityConfig(options));
}
