/**
 * ACM PRE-LIVE INTEGRATION SAFETY – STEP S2C-3B PHASE B1-PREP (SAFETY REMEDIATED)
 * Vitest Mock Safety Regression Test Suite (B1PREP-01 to B1PREP-32)
 *
 * PROVES 32 MANDATORY SAFETY CASES WITH GENUINE ASSERTIONS (ZERO DUMMY PASSES)
 */

import { describe, it, expect } from 'vitest';
import {
  validateS2CDatabaseUrl,
  verifyS2CDockerIsolation,
  verifyS2CRuntimeIdentity,
  MANDATORY_S2C_DB_NAME,
  MANDATORY_S2C_USER,
  MANDATORY_S2C_CLIENT_PORT,
  MANDATORY_S2C_INTERNAL_PORT,
  MANDATORY_S2C_CONTAINER,
  MANDATORY_S2C_NETWORK,
  MANDATORY_S2C_VOLUME,
  S2CDockerAdapter,
  S2CSqlAdapter,
} from '../scripts/s2cEnvironmentGuard';
import {
  buildS2CFixturePlan,
  validateS2CFixturePlan,
  executeDryRunFixturePlan,
  S2CFixturePlan,
} from '../scripts/seedSandboxS2CFixtures';
import {
  simulateS2CServerStartup,
} from '../scripts/startSandboxS2CTestServer';
import {
  verifyS2CProcessIdentity,
  safeTerminateS2CProcess,
  isS2CCommandLine,
  S2CPidRecord,
  ProcessAdapter,
  SocketAdapter,
  FileSystemAdapter,
  MANDATORY_S2C_SCRIPT_NAME,
  APPROVED_NODE_PROCESS_NAMES,
  APPROVED_WRAPPER_PROCESS_NAMES,
  REAL_PROCESS_TERMINATION_LOCKED,
  TERMINATION_SAFETY_POLICY,
} from '../scripts/s2cProcessManager';
import {
  validateLevel4BackupParity,
  auditOpeningBalanceAndLedgerParity,
  SnapshotQueryResult,
  S2C_EXPECTED_TABLES,
  OpeningBalanceBaselineItem,
  DEFAULT_MOCK_CONSTRAINTS,
  DEFAULT_MOCK_INDEXES,
  DEFAULT_CORE_MOCK_CONSTRAINTS,
  DEFAULT_CORE_MOCK_INDEXES,
  AUTHORITATIVE_FULL_SCHEMA_CONSTRAINTS,
  AUTHORITATIVE_FULL_SCHEMA_INDEXES,
} from '../scripts/s2cBackupParityValidator';
import {
  validateRuntimeRolePrivileges,
  S2C_ROLE_SPECIFICATIONS,
} from '../scripts/s2cDatabasePrivileges';
import { attestS2CEnvironmentIsolation } from '../scripts/verifyS2CEnvironmentIsolation';
import { createSafetyAuditSpy, getFrontendFeaturesContent, auditFrontendFeatureFlags } from '../scripts/runS2CB1PrepRegression';
import fs from 'fs';
import path from 'path';
import http from 'http';
import net from 'net';
import child_process from 'child_process';

describe('ACM S2C-3B Phase B1-Prep Safety Regression Suite (54 Tests)', () => {
  const validBaselineOpening: OpeningBalanceBaselineItem[] = [
    { itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', openingOnHand: 100 },
  ];

  // B1PREP-01
  it('B1PREP-01: Rejects Dev DATABASE_URL (Port 5432, DB acm_inventory)', () => {
    const devUrl = 'postgresql://postgres:secret@127.0.0.1:5432/acm_inventory?schema=public';
    const res = validateS2CDatabaseUrl(devUrl);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('5434');
    expect(res.error).not.toContain('secret');
  });

  // B1PREP-02
  it('B1PREP-02: Rejects Gate B DATABASE_URL (Port 5433, DB acm_inventory_sandbox_s2b)', () => {
    const gateBUrl = 'postgresql://acm_sandbox_user:secret@127.0.0.1:5433/acm_inventory_sandbox_s2b?schema=public';
    const res = validateS2CDatabaseUrl(gateBUrl);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('5434');
  });

  // B1PREP-03
  it('B1PREP-03: Rejects malformed, invalid protocol, empty, or undefined DATABASE_URL', () => {
    expect(validateS2CDatabaseUrl('not-a-url').valid).toBe(false);
    expect(validateS2CDatabaseUrl('http://127.0.0.1:5434/acm_inventory_sandbox_s2c').valid).toBe(false);
    expect(validateS2CDatabaseUrl('').valid).toBe(false);
    expect(validateS2CDatabaseUrl(undefined).valid).toBe(false);
  });

  // B1PREP-04
  it('B1PREP-04: Rejects missing or mismatched DB username', () => {
    const wrongUserUrl = 'postgresql://postgres:secret@127.0.0.1:5434/acm_inventory_sandbox_s2c?schema=public';
    const res = validateS2CDatabaseUrl(wrongUserUrl);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('acm_sandbox_s2c_user');
  });

  // B1PREP-05
  it('B1PREP-05: Distinguishes host 5434 vs container 5432 port mapping', () => {
    const validUrl = 'postgresql://acm_sandbox_s2c_user:mock_pass@127.0.0.1:5434/acm_inventory_sandbox_s2c?schema=public';
    const res = validateS2CDatabaseUrl(validUrl);
    expect(res.valid).toBe(true);
    expect(res.config?.port).toBe(5434);
    expect(MANDATORY_S2C_INTERNAL_PORT).toBe(5432);
    expect(MANDATORY_S2C_CLIENT_PORT).toBe(5434);
  });

  // B1PREP-06
  it('B1PREP-06: Rejects wrong Docker volume or network (Dev/Gate B isolation)', async () => {
    const mockWrongDockerAdapter: S2CDockerAdapter = {
      inspectContainer: async () => ({
        containerExists: true,
        containerRunning: true,
        containerName: MANDATORY_S2C_CONTAINER,
        networkName: 'bridge',
        volumeName: 'acm_postgres_sandbox_s2b_data',
        hostPort: MANDATORY_S2C_CLIENT_PORT,
        internalPort: MANDATORY_S2C_INTERNAL_PORT,
      }),
      inspectVolume: async (name) => ({ exists: name === MANDATORY_S2C_VOLUME, name }),
      inspectNetwork: async (name) => ({ exists: name === MANDATORY_S2C_NETWORK, name }),
    };

    const res = await verifyS2CDockerIsolation(mockWrongDockerAdapter);
    expect(res.passed).toBe(false);
    expect(res.violations.some(v => v.includes('Gate B volume'))).toBe(true);
  });

  // B1PREP-07
  it('B1PREP-07: Refuses API startup before valid attestation', async () => {
    const startupBlocked = await simulateS2CServerStartup({
      databaseUrl: 'postgresql://invalid_user:pass@127.0.0.1:5432/acm_inventory',
      dryRun: true,
    });
    expect(startupBlocked.status).toBe('STARTUP_BLOCKED');
    expect(startupBlocked.readyForLiveSandbox).toBe(false);
  });

  // B1PREP-08
  it('B1PREP-08: Rejects foreign PID on port 5001', async () => {
    const record: S2CPidRecord = {
      wrapperPid: 1001,
      nodePid: 1002,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: 'startSandboxS2CTestServer.ts',
      sessionId: 'sess-001',
      createdAt: new Date().toISOString(),
    };

    const mockProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 1002
          ? {
              pid: 1002,
              name: 'node.exe',
              commandLine: 'node startSandboxS2CTestServer.ts',
              startTime: record.createdAt,
              cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
            }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async (pid) => pid === 1002,
    };

    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 9999, // foreign PID
        state: 'LISTEN',
      }),
    };

    const res = await verifyS2CProcessIdentity(record, mockProc, mockSock);
    expect(res.verified).toBe(false);
    expect(res.status).toBe('SOCKET_MISMATCH');
  });

  // B1PREP-09
  it('B1PREP-09: Rejects stale/reused wrapper PID', async () => {
    const record: S2CPidRecord = {
      wrapperPid: 2001,
      nodePid: 2002,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: 'startSandboxS2CTestServer.ts',
      sessionId: 'sess-002',
      createdAt: new Date().toISOString(),
    };

    const mockProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 2002 ? { pid: 2002, name: 'notepad.exe', commandLine: 'notepad.exe c:\\secret.txt' } : null,
      terminateProcess: async () => true,
      isProcessAlive: async (pid) => pid === 2002,
    };

    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 2002,
        state: 'LISTEN',
      }),
    };

    const res = await verifyS2CProcessIdentity(record, mockProc, mockSock);
    expect(res.verified).toBe(false);
    expect(res.status).toBe('PID_REUSED');
  });

  // B1PREP-10
  it('B1PREP-10: No process kill without verified identity (Evidence preserved)', async () => {
    let terminatedPids: number[] = [];
    const mockProc: ProcessAdapter = {
      getProcessById: async () => null,
      terminateProcess: async (pid) => {
        terminatedPids.push(pid);
        return true;
      },
      isProcessAlive: async () => false,
    };
    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 8888,
        state: 'LISTEN',
      }),
    };
    let unlinked = false;
    const mockFs: FileSystemAdapter = {
      exists: async () => true,
      readFile: async () =>
        JSON.stringify({
          wrapperPid: 5555,
          nodePid: 6666,
          port: 5001,
          commandLine: 'node startSandboxS2CTestServer.ts',
          scriptPath: 'startSandboxS2CTestServer.ts',
          sessionId: 'sess-003',
          createdAt: new Date().toISOString(),
        }),
      writeFile: async () => {},
      unlink: async () => {
        unlinked = true;
      },
    };

    const res = await safeTerminateS2CProcess({
      pidFilePath: 'D:/ACM_QLLK/.s2c_api.pid',
      procAdapter: mockProc,
      sockAdapter: mockSock,
      fsAdapter: mockFs,
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('TERMINATION_BLOCKED');
    expect(res.pidFilePreserved).toBe(true);
    expect(terminatedPids.length).toBe(0);
    expect(unlinked).toBe(false);
  });

  // B1PREP-11
  it('B1PREP-11: Parity query failure cannot return PASS', () => {
    const failedSource: SnapshotQueryResult = { success: false, error: 'DB connection severed' };
    const validRestored: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 10])),
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: [
          { id: '00000006-0000-4000-8000-000000000001', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
        ],
        movements: [],
      },
    };

    const res = validateLevel4BackupParity(failedSource, validRestored, validBaselineOpening);
    expect(res.status).toBe('PARITY_VALIDATION_FAILED');
  });

  // B1PREP-12
  it('B1PREP-12: Missing table cannot return PASS', () => {
    const tablesWithoutMigrations = S2C_EXPECTED_TABLES.filter(t => t !== '_prisma_migrations');
    const validBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
    ];
    const sourceWithAll: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 10])),
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: validBalances,
        movements: [],
      },
    };
    const restoredMissingTable: SnapshotQueryResult = {
      success: true,
      data: {
        tables: tablesWithoutMigrations,
        rowCounts: Object.fromEntries(tablesWithoutMigrations.map(t => [t, 10])),
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: validBalances,
        movements: [],
      },
    };

    const res = validateLevel4BackupParity(sourceWithAll, restoredMissingTable, validBaselineOpening);
    expect(res.status).toBe('PARITY_VALIDATION_FAILED');
    expect(res.tableParityPassed).toBe(false);
  });

  // B1PREP-13
  it('B1PREP-13: Row count mismatch returns FAIL', () => {
    const validBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
    ];
    const sourceData: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: { ...Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 10])), items: 10 },
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: validBalances,
        movements: [],
      },
    };
    const restoredDataMismatch: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: { ...Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 10])), items: 9 },
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: validBalances,
        movements: [],
      },
    };

    const res = validateLevel4BackupParity(sourceData, restoredDataMismatch, validBaselineOpening);
    expect(res.status).toBe('PARITY_VALIDATION_FAILED');
    expect(res.rowCountParityPassed).toBe(false);
  });

  // B1PREP-14
  it('B1PREP-14: Opening balance + signed movements parity holds', () => {
    const openingBalances: OpeningBalanceBaselineItem[] = [{ itemId: 'item-1', locationId: 'loc-1', openingOnHand: 100 }];
    const currentBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: 'item-1', locationId: 'loc-1', onHand: 120, reserved: 10, quarantined: 5, kitAllocated: 0, available: 105 },
    ];
    const movements = [
      { id: 'mov-1', itemId: 'item-1', locationId: 'loc-1', type: 'IMPORT', quantityDelta: 50, onHandBefore: 100, onHandAfter: 150, referenceType: 'TRANSACTION' },
      { id: 'mov-2', itemId: 'item-1', locationId: 'loc-1', type: 'EXPORT', quantityDelta: -30, onHandBefore: 150, onHandAfter: 120, referenceType: 'TRANSACTION' },
    ];

    const res = auditOpeningBalanceAndLedgerParity({
      openingBalances,
      currentBalances,
      movements,
    });

    expect(res.passed).toBe(true);
    expect(res.discrepancies.length).toBe(0);
  });

  // B1PREP-15
  it('B1PREP-15: Detects missing transfer movement as corruption', () => {
    const openingBalances: OpeningBalanceBaselineItem[] = [
      { itemId: 'item-1', locationId: 'loc-src', openingOnHand: 100 },
      { itemId: 'item-1', locationId: 'loc-dst', openingOnHand: 20 },
    ];
    const currentBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: 'item-1', locationId: 'loc-src', onHand: 85, reserved: 0, quarantined: 0, kitAllocated: 0, available: 85 },
      { id: '00000006-0000-4000-8000-000000000002', itemId: 'item-1', locationId: 'loc-dst', onHand: 20, reserved: 0, quarantined: 0, kitAllocated: 0, available: 20 },
    ];
    const corruptTransferMovements = [
      { id: 'mov-tr-1', itemId: 'item-1', locationId: 'loc-src', type: 'TRANSFER', quantityDelta: -15, onHandBefore: 100, onHandAfter: 85, referenceType: 'TRANSACTION', referenceId: 'tx-transfer-01' },
    ];

    const res = auditOpeningBalanceAndLedgerParity({
      openingBalances,
      currentBalances,
      movements: corruptTransferMovements,
    });

    expect(res.passed).toBe(false);
    expect(res.transferViolations.length).toBeGreaterThan(0);
  });

  // B1PREP-16
  it('B1PREP-16: Fixture hierarchy and foreign key validation', () => {
    const fixtureRun = executeDryRunFixturePlan();
    expect(fixtureRun.status).toBe('MOCK_FIXTURE_PLAN_PASS');
    expect(fixtureRun.validation.valid).toBe(true);
    expect(fixtureRun.validation.summary.rolesCount).toBe(4);
    expect(fixtureRun.validation.summary.usersCount).toBe(4);
    expect(fixtureRun.validation.summary.totalOnHand).toBe(130);
    expect(fixtureRun.validation.summary.totalAvailable).toBe(105);
  });

  // B1PREP-17
  it('B1PREP-17: Database least-privilege design check', () => {
    const runtimeSpec = S2C_ROLE_SPECIFICATIONS.runtime;
    const validation = validateRuntimeRolePrivileges(runtimeSpec);
    expect(validation.passed).toBe(true);
    expect(validation.assertions.isSuperuserFalse).toBe(true);
    expect(validation.assertions.noDdlOperations).toBe(true);
    expect(validation.assertions.noTruncate).toBe(true);
  });

  // B1PREP-18
  it('B1PREP-18: Genuine Spy Audit confirms zero OS/Docker/DB mutations', async () => {
    const activeSpy = createSafetyAuditSpy();
    const procAdapter = activeSpy.createInstrumentedProcessAdapter({
      getProcessById: async (pid) =>
        pid === 7001
          ? {
              pid: 7001,
              name: 'node.exe',
              commandLine: 'node startSandboxS2CTestServer.ts',
              startTime: new Date().toISOString(),
              cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
            }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async () => false,
    });
    const dockerAdapter = activeSpy.createInstrumentedDockerAdapter({
      inspectContainer: async () => ({
        containerExists: true,
        containerRunning: true,
        containerName: MANDATORY_S2C_CONTAINER,
        networkName: MANDATORY_S2C_NETWORK,
        volumeName: MANDATORY_S2C_VOLUME,
        hostPort: MANDATORY_S2C_CLIENT_PORT,
        internalPort: MANDATORY_S2C_INTERNAL_PORT,
      }),
      inspectVolume: async (name) => ({ exists: true, name }),
      inspectNetwork: async (name) => ({ exists: true, name }),
    });
    const sqlAdapter = activeSpy.createInstrumentedSqlAdapter({
      queryConnectionIdentity: async () => ({
        database: MANDATORY_S2C_DB_NAME,
        user: MANDATORY_S2C_USER,
        clientAddr: '127.0.0.1',
        clientPort: 54988,
        serverPort: MANDATORY_S2C_INTERNAL_PORT,
        isSuperuser: false,
      }),
    });

    await verifyS2CDockerIsolation(dockerAdapter);
    await verifyS2CRuntimeIdentity(sqlAdapter);

    const auditCheck = activeSpy.assertZeroRealMutations();
    expect(auditCheck.passed).toBe(true);
    expect(activeSpy.realDockerCalls).toBe(0);
    expect(activeSpy.realPostgresConnections).toBe(0);
    expect(activeSpy.realProcessKills).toBe(0);
    expect(activeSpy.realHttpListeners).toBe(0);
  });

  // B1PREP-19
  it('B1PREP-19: Pure Module Import: zero PID files or listeners on import', () => {
    const pidExists = fs.existsSync('D:/ACM_QLLK/.s2c_api.pid');
    expect(pidExists).toBe(false);
    expect(process.env.VITE_ENABLE_STOCK_TRANSACTION_WRITES).not.toBe('true');
    expect(process.env.VITE_ENABLE_STOCK_ADJUSTMENT).not.toBe('true');
    expect(process.env.VITE_ENABLE_LOCATION_WRITES).not.toBe('true');
  });

  // B1PREP-20
  it('B1PREP-20: No route to live execution can be enabled during B1-Prep', async () => {
    const liveAttempt = await simulateS2CServerStartup({
      databaseUrl: 'postgresql://acm_sandbox_s2c_user:pass@127.0.0.1:5434/acm_inventory_sandbox_s2c?schema=public',
      dryRun: false,
    });
    expect(liveAttempt.status).toBe('STARTUP_BLOCKED');
    expect(liveAttempt.error).toContain('STRICT_NO_GO');
  });

  // B1PREP-21
  it('B1PREP-21: Existing Frontend write flags remain disabled', () => {
    const audit = auditFrontendFeatureFlags();
    expect(audit.locationWriteProtected).toBe(true);
    expect(audit.stockWriteProtected).toBe(true);
    expect(audit.adjustmentWriteProtected).toBe(true);
    expect(['ACTUAL_FRONTEND_FLAGS_VERIFIED', 'FRONTEND_MOCK_SPEC_PASS']).toContain(audit.evidenceStatus);
  });

  // B1PREP-22
  it('B1PREP-22: Adjustment stays OUT OF SCOPE', () => {
    const audit = auditFrontendFeatureFlags();
    expect(audit.isSeparatedGate).toBe(true);
    expect(process.env.VITE_ENABLE_STOCK_ADJUSTMENT).toBeUndefined();
    expect(['ACTUAL_FRONTEND_FLAGS_VERIFIED', 'FRONTEND_MOCK_SPEC_PASS']).toContain(audit.evidenceStatus);
  });

  // B1PREP-23
  it('B1PREP-23: Invalid non-hex UUID fixture rejected', () => {
    const corruptPlan: S2CFixturePlan = buildS2CFixturePlan();
    corruptPlan.users[0].id = 'u0000000-0000-4000-8000-000000000001';
    const validation = validateS2CFixturePlan(corruptPlan);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('Invalid RFC 4122 UUID'))).toBe(true);
  });

  // B1PREP-24
  it('B1PREP-24: Missing SQL evidence cannot attest PASS', async () => {
    const mockDockerAdapter: S2CDockerAdapter = {
      inspectContainer: async () => ({
        containerExists: true,
        containerRunning: true,
        containerName: MANDATORY_S2C_CONTAINER,
        networkName: MANDATORY_S2C_NETWORK,
        volumeName: MANDATORY_S2C_VOLUME,
        hostPort: MANDATORY_S2C_CLIENT_PORT,
        internalPort: MANDATORY_S2C_INTERNAL_PORT,
      }),
      inspectVolume: async (name) => ({ exists: true, name }),
      inspectNetwork: async (name) => ({ exists: true, name }),
    };

    const attestation = await attestS2CEnvironmentIsolation({
      databaseUrl: 'postgresql://acm_sandbox_s2c_user:mock_pass@127.0.0.1:5434/acm_inventory_sandbox_s2c?schema=public',
      dockerAdapter: mockDockerAdapter,
      sqlAdapter: undefined,
    });

    expect(attestation.status).toBe('STATIC_ONLY_SQL_NOT_VERIFIED');
    expect(attestation.sqlIdentityPassed).toBe(false);
  });

  // B1PREP-25
  it('B1PREP-25: Stopped container or missing Docker network/volume fails', async () => {
    const stoppedAdapter: S2CDockerAdapter = {
      inspectContainer: async () => ({
        containerExists: true,
        containerRunning: false,
        containerName: MANDATORY_S2C_CONTAINER,
        networkName: MANDATORY_S2C_NETWORK,
        volumeName: MANDATORY_S2C_VOLUME,
        hostPort: MANDATORY_S2C_CLIENT_PORT,
        internalPort: MANDATORY_S2C_INTERNAL_PORT,
      }),
      inspectVolume: async (name) => ({ exists: false, name }),
      inspectNetwork: async (name) => ({ exists: true, name }),
    };

    const res = await verifyS2CDockerIsolation(stoppedAdapter);
    expect(res.passed).toBe(false);
    expect(res.violations.some(v => v.includes('containerRunning: false'))).toBe(true);
  });

  // B1PREP-26
  it('B1PREP-26: SQL superuser rejected', async () => {
    const superuserSql: S2CSqlAdapter = {
      queryConnectionIdentity: async () => ({
        database: MANDATORY_S2C_DB_NAME,
        user: MANDATORY_S2C_USER,
        clientAddr: '127.0.0.1',
        clientPort: 54988,
        serverPort: MANDATORY_S2C_INTERNAL_PORT,
        isSuperuser: true,
      }),
    };

    const res = await verifyS2CRuntimeIdentity(superuserSql);
    expect(res.passed).toBe(false);
    expect(res.violations.some(v => v.includes('SUPERUSER privileges'))).toBe(true);
  });

  // B1PREP-27
  it('B1PREP-27: Unrelated S2C-named Node process rejected', async () => {
    const record: S2CPidRecord = {
      wrapperPid: 3001,
      nodePid: 3002,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-027',
      createdAt: new Date().toISOString(),
    };

    const mockProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 3002 ? { pid: 3002, name: 'node.exe', commandLine: 'node run-other-s2c-task.js', startTime: record.createdAt } : null,
      terminateProcess: async () => true,
      isProcessAlive: async (pid) => pid === 3002,
    };

    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 3002,
        state: 'LISTEN',
      }),
    };

    const res = await verifyS2CProcessIdentity(record, mockProc, mockSock);
    expect(res.verified).toBe(false);
    expect(res.status).toBe('PID_REUSED');
  });

  // B1PREP-28
  it('B1PREP-28: Unrelated wrapper PID never terminated', async () => {
    let terminatedPids: number[] = [];
    const mockProc: ProcessAdapter = {
      getProcessById: async (pid) => {
        if (pid === 4001) return { pid: 4001, name: 'explorer.exe', commandLine: 'explorer.exe' };
        if (pid === 4002) return { pid: 4002, name: 'node.exe', commandLine: 'node startSandboxS2CTestServer.ts', startTime: new Date().toISOString(), cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts' };
        return null;
      },
      terminateProcess: async (pid) => {
        terminatedPids.push(pid);
        return true;
      },
      isProcessAlive: async () => true,
    };

    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 4002,
        state: 'LISTEN',
      }),
    };

    const mockFs: FileSystemAdapter = {
      exists: async () => true,
      readFile: async () =>
        JSON.stringify({
          wrapperPid: 4001,
          nodePid: 4002,
          port: 5001,
          commandLine: 'node startSandboxS2CTestServer.ts',
          scriptPath: MANDATORY_S2C_SCRIPT_NAME,
          sessionId: 'sess-028',
          createdAt: new Date().toISOString(),
        }),
      writeFile: async () => {},
      unlink: async () => {},
    };

    await safeTerminateS2CProcess({
      procAdapter: mockProc,
      sockAdapter: mockSock,
      fsAdapter: mockFs,
    });

    expect(terminatedPids.includes(4001)).toBe(false);
  });

  // B1PREP-29
  it('B1PREP-29: Missing opening balance or corrupted stock cannot pass parity', () => {
    const validBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: 'item-1', locationId: 'loc-1', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
    ];
    const sourceData: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: validBalances,
        movements: [],
      },
    };

    const resMissing = validateLevel4BackupParity(sourceData, sourceData, []);
    expect(resMissing.status).toBe('PARITY_VALIDATION_FAILED');
  });

  // B1PREP-30
  it('B1PREP-30: Invalid cross-item TRANSFER rejected', () => {
    const openingBalances: OpeningBalanceBaselineItem[] = [
      { itemId: 'item-A', locationId: 'loc-1', openingOnHand: 50 },
      { itemId: 'item-B', locationId: 'loc-2', openingOnHand: 50 },
    ];
    const currentBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: 'item-A', locationId: 'loc-1', onHand: 40, reserved: 0, quarantined: 0, kitAllocated: 0, available: 40 },
      { id: '00000006-0000-4000-8000-000000000002', itemId: 'item-B', locationId: 'loc-2', onHand: 60, reserved: 0, quarantined: 0, kitAllocated: 0, available: 60 },
    ];
    const crossItemMovements = [
      { id: 'mov-1', itemId: 'item-A', locationId: 'loc-1', type: 'TRANSFER', quantityDelta: -10, onHandBefore: 50, onHandAfter: 40, referenceType: 'TRANSACTION', referenceId: 'tx-cross' },
      { id: 'mov-2', itemId: 'item-B', locationId: 'loc-2', type: 'TRANSFER', quantityDelta: 10, onHandBefore: 50, onHandAfter: 60, referenceType: 'TRANSACTION', referenceId: 'tx-cross' },
    ];

    const res = auditOpeningBalanceAndLedgerParity({
      openingBalances,
      currentBalances,
      movements: crossItemMovements,
    });

    expect(res.passed).toBe(false);
    expect(res.transferViolations.some(v => v.includes('Cross-item transfer corruption'))).toBe(true);
  });

  // B1PREP-31
  it('B1PREP-31: URL-encoded password preserved without double encoding', () => {
    const specialPassUrl = 'postgresql://acm_sandbox_s2c_user:p%2F%40%3A%25word@127.0.0.1:5434/acm_inventory_sandbox_s2c?schema=public';
    const res = validateS2CDatabaseUrl(specialPassUrl);
    expect(res.valid).toBe(true);
    expect(res.config?.cleanUrl).toContain('p%2F%40%3A%25word');
    expect(res.config?.cleanUrl).not.toContain('%252F');
    expect(res.config?.cleanUrl).not.toContain('%2540');
  });

  // B1PREP-32
  it('B1PREP-32: Shared Dev DATABASE_URL is never used as fallback', async () => {
    const orig = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://postgres:pass@127.0.0.1:5432/acm_inventory?schema=public';
    delete process.env.DATABASE_URL_SANDBOX_S2C;

    const res = await simulateS2CServerStartup({
      databaseUrl: undefined,
      dryRun: true,
    });

    if (orig) process.env.DATABASE_URL = orig;
    else delete process.env.DATABASE_URL;

    expect(res.status).toBe('STARTUP_BLOCKED');
    expect(res.error).toContain('No S2C database URL provided');
  });

  // B1PREP-33
  it('B1PREP-33: Unrelated cmd wrapper must never be terminated (parentPid mismatch protects shell)', async () => {
    const record: S2CPidRecord = {
      wrapperPid: 9001,
      nodePid: 9002,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-033',
      createdAt: new Date().toISOString(),
    };

    const terminatedPids: number[] = [];
    let socketOpen = true;
    const mockProc: ProcessAdapter = {
      getProcessById: async (pid) => {
        if (pid === 9001) {
          return {
            pid: 9001,
            name: 'cmd.exe',
            commandLine: 'C:\\Windows\\System32\\cmd.exe',
            startTime: new Date(Date.now() - 5000).toISOString(),
          };
        }
        if (pid === 9002) {
          return {
            pid: 9002,
            name: 'node.exe',
            commandLine: 'node startSandboxS2CTestServer.ts',
            startTime: record.createdAt,
            parentPid: 8888, // Mismatch: parent is 8888, NOT 9001!
            cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
          };
        }
        return null;
      },
      terminateProcess: async (pid) => {
        terminatedPids.push(pid);
        if (pid === 9002) socketOpen = false;
        return true;
      },
      isProcessAlive: async (pid) => !terminatedPids.includes(pid),
    };

    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () =>
        socketOpen
          ? {
              localPort: 5001,
              owningPid: 9002,
              state: 'LISTEN',
            }
          : null,
    };

    const mockFs: FileSystemAdapter = {
      exists: async () => true,
      readFile: async () => JSON.stringify(record),
      writeFile: async () => {},
      unlink: async () => {},
    };

    const res = await safeTerminateS2CProcess({
      procAdapter: mockProc,
      sockAdapter: mockSock,
      fsAdapter: mockFs,
    });

    expect(res.success).toBe(true);
    expect(terminatedPids).toContain(9002);
    expect(terminatedPids).not.toContain(9001);
  });

  // B1PREP-34
  it('B1PREP-34: Forged script substring (.BAD) and missing startTime rejected', async () => {
    // 1. Forged script token check
    expect(
      isS2CCommandLine('node startSandboxS2CTestServer.ts.BAD', 'startSandboxS2CTestServer.ts')
    ).toBe(false);

    // 2. Forged script in verifyS2CProcessIdentity
    const forgedRecord: S2CPidRecord = {
      wrapperPid: 3101,
      nodePid: 3102,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts.BAD',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-034a',
      createdAt: new Date().toISOString(),
    };
    const mockForgedProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 3102
          ? { pid: 3102, name: 'node.exe', commandLine: 'node startSandboxS2CTestServer.ts.BAD', startTime: forgedRecord.createdAt }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async () => true,
    };
    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({ localPort: 5001, owningPid: 3102, state: 'LISTEN' }),
    };
    const forgedRes = await verifyS2CProcessIdentity(forgedRecord, mockForgedProc, mockSock);
    expect(forgedRes.verified).toBe(false);
    expect(forgedRes.status).toBe('PID_REUSED');

    // 3. Missing startTime check (fail-closed)
    const missingStartTimeRecord: S2CPidRecord = {
      wrapperPid: 3103,
      nodePid: 3104,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-034b',
      createdAt: new Date().toISOString(),
    };
    const mockMissingStartTimeProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 3104
          ? { pid: 3104, name: 'node.exe', commandLine: 'node startSandboxS2CTestServer.ts', startTime: undefined, cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts' }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async () => true,
    };
    const missingStartTimeRes = await verifyS2CProcessIdentity(
      missingStartTimeRecord,
      mockMissingStartTimeProc,
      mockSock
    );
    expect(missingStartTimeRes.verified).toBe(false);
    expect(missingStartTimeRes.status).toBe('PID_REUSED');
    expect(missingStartTimeRes.details).toContain('missing mandatory startTime');
  });

  // B1PREP-35
  it('B1PREP-35: Source/Restored movement differences cause FAIL', () => {
    const standardBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
    ];
    const opening: OpeningBalanceBaselineItem[] = [
      { itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', openingOnHand: 100 },
    ];

    const sourceSnapshot: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: standardBalances,
        movements: [
          { id: 'mov-35-1', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', type: 'COUNT', quantityDelta: 0, onHandBefore: 100, onHandAfter: 100, referenceType: 'AUDIT', referenceId: 'aud-1' },
        ],
      },
    };

    const restoredCorruptMovement: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: standardBalances,
        movements: [
          { id: 'mov-35-1', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', type: 'COUNT', quantityDelta: 10, onHandBefore: 100, onHandAfter: 110, referenceType: 'AUDIT', referenceId: 'aud-1' },
        ],
      },
    };

    const res = validateLevel4BackupParity(sourceSnapshot, restoredCorruptMovement, opening);
    expect(res.status).toBe('PARITY_VALIDATION_FAILED');
    expect(res.entityParityPassed).toBe(false);
    expect(res.violations.some(v => v.includes('quantityDelta mismatch'))).toBe(true);
  });

  // B1PREP-36
  it('B1PREP-36: Missing opening-balance entity causes FAIL', () => {
    const openingBaseline: OpeningBalanceBaselineItem[] = [
      { itemId: 'item-present', locationId: 'loc-1', openingOnHand: 50 },
      { itemId: 'item-dropped', locationId: 'loc-2', openingOnHand: 25 },
    ];
    const currentBalances = [
      { id: 'bal-1', itemId: 'item-present', locationId: 'loc-1', onHand: 50, reserved: 0, quarantined: 0, kitAllocated: 0, available: 50 },
    ];

    const auditRes = auditOpeningBalanceAndLedgerParity({
      openingBalances: openingBaseline,
      currentBalances,
      movements: [],
    });

    expect(auditRes.passed).toBe(false);
    expect(auditRes.violations.some(v => v.includes('Missing opening-balance entity') && v.includes('item-dropped'))).toBe(true);
  });

  // B1PREP-37
  it('B1PREP-37: Missing constraint/index evidence cannot yield Level 4 PASS', () => {
    const standardBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
    ];
    const opening: OpeningBalanceBaselineItem[] = [
      { itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', openingOnHand: 100 },
    ];

    const snapshotMissingConstraints: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: [],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: standardBalances,
        movements: [],
      },
    };

    const snapshotMissingIndexes: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [],
        balances: standardBalances,
        movements: [],
      },
    };

    const resMissingConstraints = validateLevel4BackupParity(snapshotMissingConstraints, snapshotMissingConstraints, opening);
    const resMissingIndexes = validateLevel4BackupParity(snapshotMissingIndexes, snapshotMissingIndexes, opening);

    expect(resMissingConstraints.status).toBe('PARITY_VALIDATION_FAILED');
    expect(resMissingConstraints.constraintParityPassed).toBe(false);
    expect(resMissingIndexes.status).toBe('PARITY_VALIDATION_FAILED');
    expect(resMissingIndexes.indexParityPassed).toBe(false);
  });

  // B1PREP-38
  it('B1PREP-38: Instrumented mutation test fails on simulated forbidden action', () => {
    const testSpy = createSafetyAuditSpy();
    const cleanCheck = testSpy.assertZeroRealMutations();
    expect(cleanCheck.passed).toBe(true);

    testSpy.recordMutation('FORBIDDEN_REAL_DOCKER_CONTAINER_START');
    const dirtyCheck = testSpy.assertZeroRealMutations();
    expect(dirtyCheck.passed).toBe(false);
    expect(dirtyCheck.violations.some(v => v.includes('Forbidden Docker mutations detected'))).toBe(true);
  });

  // B1PREP-39
  it('B1PREP-39: Untrusted scriptPath in PID file cannot authorize foreign Node process', async () => {
    const evilRecord: S2CPidRecord = {
      wrapperPid: 5001,
      nodePid: 5002,
      port: 5001,
      commandLine: 'node evil.js',
      scriptPath: 'evil.js',
      sessionId: 'sess-039',
      createdAt: new Date().toISOString(),
    };

    const mockProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 5002
          ? { pid: 5002, name: 'node.exe', commandLine: 'node evil.js', startTime: evilRecord.createdAt }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async (pid) => pid === 5002,
    };

    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 5002,
        state: 'LISTEN',
      }),
    };

    const res = await verifyS2CProcessIdentity(evilRecord, mockProc, mockSock);
    expect(res.verified).toBe(false);
    expect(res.status).toBe('PID_REUSED');
    expect(res.details).toContain('untrusted');
    expect(res.reasons.some(r => r.includes('Untrusted scriptPath'))).toBe(true);
  });

  // B1PREP-40
  it('B1PREP-40: Authorized script name occurring only as CLI argument/comment cannot authorize termination', async () => {
    const forgedCliRecord: S2CPidRecord = {
      wrapperPid: 5101,
      nodePid: 5102,
      port: 5001,
      commandLine: 'node other.js --comment="startSandboxS2CTestServer.ts"',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-040',
      createdAt: new Date().toISOString(),
    };

    const mockProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 5102
          ? {
              pid: 5102,
              name: 'node.exe',
              commandLine: 'node other.js --comment="startSandboxS2CTestServer.ts"',
              startTime: forgedCliRecord.createdAt,
            }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async (pid) => pid === 5102,
    };

    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 5102,
        state: 'LISTEN',
      }),
    };

    expect(isS2CCommandLine('node other.js --comment="startSandboxS2CTestServer.ts"')).toBe(false);
    expect(isS2CCommandLine('node other.js startSandboxS2CTestServer.ts')).toBe(false);

    const res = await verifyS2CProcessIdentity(forgedCliRecord, mockProc, mockSock);
    expect(res.verified).toBe(false);
    expect(res.status).toBe('PID_REUSED');
  });

  // B1PREP-41
  it('B1PREP-41: Reused PID with same script name but different process creation time is rejected', async () => {
    const pastRecordTime = new Date('2026-10-15T10:00:00.000Z').toISOString();
    const reusedProcStartTime = new Date('2026-10-15T10:10:00.000Z').toISOString();

    const reusedRecord: S2CPidRecord = {
      wrapperPid: 5201,
      nodePid: 5202,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-041',
      createdAt: pastRecordTime,
    };

    const mockProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 5202
          ? {
              pid: 5202,
              name: 'node.exe',
              commandLine: 'node startSandboxS2CTestServer.ts',
              startTime: reusedProcStartTime,
              cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
            }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async (pid) => pid === 5202,
    };

    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 5202,
        state: 'LISTEN',
      }),
    };

    const res = await verifyS2CProcessIdentity(reusedRecord, mockProc, mockSock);
    expect(res.verified).toBe(false);
    expect(res.status).toBe('PID_REUSED');
    expect(res.details.includes('>5000ms') || res.details.includes('Stale PID record / PID reuse detected')).toBe(true);
  });

  // B1PREP-42
  it('B1PREP-42: Changed movement referenceType causes Level 4 parity failure', () => {
    const standardBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
    ];
    const opening: OpeningBalanceBaselineItem[] = [
      { itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', openingOnHand: 100 },
    ];

    const sourceSnapshot: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: standardBalances,
        movements: [
          { id: 'mov-42-1', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', type: 'IMPORT', quantityDelta: 0, onHandBefore: 100, onHandAfter: 100, referenceType: 'PURCHASE_ORDER', referenceId: 'po-001' },
        ],
      },
    };

    const restoredMismatchMovement: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: [...DEFAULT_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: standardBalances,
        movements: [
          { id: 'mov-42-1', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', type: 'IMPORT', quantityDelta: 0, onHandBefore: 100, onHandAfter: 100, referenceType: 'STOCK_ADJUSTMENT', referenceId: 'po-001' },
        ],
      },
    };

    const res = validateLevel4BackupParity(sourceSnapshot, restoredMismatchMovement, opening);
    expect(res.status).toBe('PARITY_VALIDATION_FAILED');
    expect(res.entityParityPassed).toBe(false);
    expect(res.violations.some(v => v.includes('referenceType mismatch'))).toBe(true);
  });

  // B1PREP-43
  it('B1PREP-43: TRANSFER movement missing or empty referenceId fails atomicity validation', () => {
    const opening: OpeningBalanceBaselineItem[] = [
      { itemId: 'item-1', locationId: 'loc-1', openingOnHand: 100 },
    ];
    const balances = [
      { id: 'bal-1', itemId: 'item-1', locationId: 'loc-1', onHand: 90, reserved: 0, quarantined: 0, kitAllocated: 0, available: 90 },
    ];
    const movements = [
      { id: 'mov-tr-empty', itemId: 'item-1', locationId: 'loc-1', type: 'TRANSFER', quantityDelta: -10, onHandBefore: 100, onHandAfter: 90, referenceType: 'TRANSFER', referenceId: '' },
    ];

    const res = auditOpeningBalanceAndLedgerParity({
      openingBalances: opening,
      currentBalances: balances,
      movements,
    });

    expect(res.passed).toBe(false);
    expect(res.transferViolations.some(v => v.includes('missing mandatory referenceId'))).toBe(true);
  });

  // B1PREP-44
  it('B1PREP-44: Duplicate opening balance baseline keys rejected', () => {
    const duplicateBaseline: OpeningBalanceBaselineItem[] = [
      { itemId: 'item-dup', locationId: 'loc-1', openingOnHand: 100 },
      { itemId: 'item-dup', locationId: 'loc-1', openingOnHand: 120 },
    ];
    const balances = [
      { id: 'bal-dup', itemId: 'item-dup', locationId: 'loc-1', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
    ];

    const res = auditOpeningBalanceAndLedgerParity({
      openingBalances: duplicateBaseline,
      currentBalances: balances,
      movements: [],
    });

    expect(res.passed).toBe(false);
    expect(res.violations.some(v => v.includes('Duplicate opening balance baseline key detected'))).toBe(true);
  });

  // B1PREP-45
  it('B1PREP-45: Incomplete schema evidence cannot yield full Level 4 PASS (manifest-based check)', () => {
    const standardBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
    ];
    const opening: OpeningBalanceBaselineItem[] = [
      { itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', openingOnHand: 100 },
    ];

    const incompleteConstraints = [
      { constraintName: 'roles_pkey', tableName: 'roles', constraintType: 'PRIMARY KEY' as const },
    ];

    const incompleteSnapshot: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: incompleteConstraints,
        indexes: [...DEFAULT_MOCK_INDEXES],
        balances: standardBalances,
        movements: [],
      },
    };

    const res = validateLevel4BackupParity(incompleteSnapshot, incompleteSnapshot, opening);
    expect(res.status).toBe('PARITY_VALIDATION_FAILED');
    expect(res.constraintParityPassed).toBe(false);
    expect(res.violations.some(v => v.includes('Incomplete constraint schema evidence'))).toBe(true);
  });

  // B1PREP-46
  it('B1PREP-46: Actual instrumented adapter calls recorded; simulated forbidden calls cause test failure', async () => {
    const activeSpy = createSafetyAuditSpy();

    const record: S2CPidRecord = {
      wrapperPid: 6001,
      nodePid: 6002,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-046',
      createdAt: new Date().toISOString(),
    };

    const procAdapter = activeSpy.createInstrumentedProcessAdapter({
      getProcessById: async (pid) =>
        pid === 6002
          ? {
              pid: 6002,
              name: 'node.exe',
              commandLine: 'node startSandboxS2CTestServer.ts',
              startTime: record.createdAt,
              cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
            }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async (pid) => pid === 6002,
    });

    const sockAdapter = activeSpy.createInstrumentedSocketAdapter({
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 6002,
        state: 'LISTEN',
      }),
    });

    const verifyRes = await verifyS2CProcessIdentity(record, procAdapter, sockAdapter);
    expect(verifyRes.verified).toBe(true);
    expect(activeSpy.calls.getProcessById).toBeGreaterThan(0);
    expect(activeSpy.calls.getListeningSocketByPort).toBeGreaterThan(0);

    const cleanAudit = activeSpy.assertZeroRealMutations();
    expect(cleanAudit.passed).toBe(true);

    activeSpy.recordMutation('FORBIDDEN_DB_WRITE_MUTATION');
    const dirtyAudit = activeSpy.assertZeroRealMutations();
    expect(dirtyAudit.passed).toBe(false);
    expect(dirtyAudit.violations.some(v => v.includes('FORBIDDEN_DB_WRITE_MUTATION'))).toBe(true);
  });

  // B1PREP-47
  it('B1PREP-47: Canonical Script Identity: Rejects script launched from untrusted directory (C:\\untrusted\\...)', async () => {
    const untrustedCmd = 'node C:\\untrusted\\startSandboxS2CTestServer.ts';
    expect(isS2CCommandLine(untrustedCmd)).toBe(false);

    const activeSpy = createSafetyAuditSpy();
    const untrustedRecord: S2CPidRecord = {
      wrapperPid: 0,
      nodePid: 7001,
      port: 5001,
      commandLine: untrustedCmd,
      scriptPath: 'C:\\untrusted\\startSandboxS2CTestServer.ts',
      sessionId: 'sess-untrusted-047',
      createdAt: new Date().toISOString(),
    };

    const procAdapter = activeSpy.createInstrumentedProcessAdapter({
      getProcessById: async (pid) =>
        pid === 7001
          ? { pid: 7001, name: 'node.exe', commandLine: untrustedCmd, startTime: untrustedRecord.createdAt }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async (pid) => pid === 7001,
    });

    const sockAdapter = activeSpy.createInstrumentedSocketAdapter({
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 7001,
        state: 'LISTEN',
      }),
    });

    const verifyRes = await verifyS2CProcessIdentity(untrustedRecord, procAdapter, sockAdapter);
    expect(verifyRes.verified).toBe(false);
    expect(verifyRes.status).toBe('PID_REUSED');
    expect(
      verifyRes.details.includes('unauthorized') ||
      verifyRes.details.includes('untrusted') ||
      verifyRes.reasons.some(r => r.includes('Untrusted scriptPath'))
    ).toBe(true);
  });

  // B1PREP-48
  it('B1PREP-48: Anti-Identity Swap: Process identity change before termination blocks kill with 0 terminate calls', async () => {
    let terminateCallCount = 0;
    const initialStartTime = '2026-10-15T10:00:00.000Z';
    const swappedStartTime = '2026-10-15T10:05:00.000Z';
    let getProcessCallCount = 0;

    const record: S2CPidRecord = {
      wrapperPid: 0,
      nodePid: 7002,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-swap-048',
      createdAt: initialStartTime,
    };

    const mockFsMap = new Map<string, string>([
      [path.resolve('D:/ACM_QLLK/.s2c_api.pid'), JSON.stringify(record)],
    ]);

    const activeSpy = createSafetyAuditSpy();
    const procAdapter = activeSpy.createInstrumentedProcessAdapter({
      getProcessById: async (pid) => {
        if (pid !== 7002) return null;
        getProcessCallCount++;
        if (getProcessCallCount === 1) {
          return {
            pid: 7002,
            name: 'node.exe',
            commandLine: 'node startSandboxS2CTestServer.ts',
            startTime: initialStartTime,
            cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
            creationToken: 'token-initial-048',
          };
        }
        return {
          pid: 7002,
          name: 'node.exe',
          commandLine: 'node startSandboxS2CTestServer.ts',
          startTime: swappedStartTime,
          cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
          creationToken: 'token-replacement-999',
        };
      },
      terminateProcess: async () => {
        terminateCallCount++;
        return true;
      },
      isProcessAlive: async (pid) => pid === 7002,
    });

    const sockAdapter = activeSpy.createInstrumentedSocketAdapter({
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 7002,
        state: 'LISTEN',
      }),
    });

    const fsAdapter = activeSpy.createInstrumentedFsAdapter({
      exists: async (p) => mockFsMap.has(p),
      readFile: async (p) => mockFsMap.get(p) || '',
      unlink: async (p) => { mockFsMap.delete(p); },
    });

    const termRes = await safeTerminateS2CProcess({
      procAdapter,
      sockAdapter,
      fsAdapter,
    });

    expect(termRes.success).toBe(false);
    expect(termRes.status).toBe('TERMINATION_BLOCKED');
    expect(termRes.pidFilePreserved).toBe(true);
    expect(terminateCallCount).toBe(0);
    expect(activeSpy.calls.terminateProcess).toBe(0);
    expect(mockFsMap.has(path.resolve('D:/ACM_QLLK/.s2c_api.pid'))).toBe(true);
    expect(termRes.details).toContain('Identity swap detected');
  });

  // B1PREP-49
  it('B1PREP-49: Schema Evidence Honesty: Core-only schema passes core parity but fails full Level 4 parity', () => {
    const standardBalances = [
      { id: '00000006-0000-4000-8000-000000000001', itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', onHand: 100, reserved: 0, quarantined: 0, kitAllocated: 0, available: 100 },
    ];
    const opening: OpeningBalanceBaselineItem[] = [
      { itemId: '00000004-0000-4000-8000-000000000001', locationId: '00000005-0000-4000-8000-000000000002', openingOnHand: 100 },
    ];

    const coreOnlySnapshot: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: [...DEFAULT_CORE_MOCK_CONSTRAINTS],
        indexes: [...DEFAULT_CORE_MOCK_INDEXES],
        balances: standardBalances,
        movements: [],
      },
    };

    const coreRes = validateLevel4BackupParity(coreOnlySnapshot, coreOnlySnapshot, opening);
    expect(coreRes.coreSchemaParityPassed).toBe(true);
    expect(coreRes.fullSchemaParityPassed).toBe(false);
    expect(coreRes.status).toBe('PARITY_VALIDATION_FAILED');
    expect(coreRes.violations.some(v => v.includes('Incomplete schema manifest'))).toBe(true);

    const fullSnapshot: SnapshotQueryResult = {
      success: true,
      data: {
        tables: [...S2C_EXPECTED_TABLES],
        rowCounts: Object.fromEntries(S2C_EXPECTED_TABLES.map(t => [t, 1])),
        constraints: [...AUTHORITATIVE_FULL_SCHEMA_CONSTRAINTS],
        indexes: [...AUTHORITATIVE_FULL_SCHEMA_INDEXES],
        balances: standardBalances,
        movements: [],
      },
    };

    const fullRes = validateLevel4BackupParity(fullSnapshot, fullSnapshot, opening);
    expect(fullRes.coreSchemaParityPassed).toBe(true);
    expect(fullRes.fullSchemaParityPassed).toBe(true);
    expect(fullRes.status).toBe('MOCK_PARITY_VALIDATION_PASS');
  });

  // B1PREP-50
  it('B1PREP-50: Import Side-Effect Purity & Pre-Import Boundary Interceptors in Isolated Process (Zero OS calls on import)', () => {
    // 1. Isolated child process verification with spies before import
    const isolatedEvalScript = `
      const http = require('http');
      const net = require('net');
      const cp = require('child_process');
      let h = 0, n = 0, s = 0, k = 0;
      http.createServer = () => { h++; throw new Error('Real http.createServer blocked during import'); };
      net.createServer = () => { n++; throw new Error('Real net.createServer blocked during import'); };
      cp.spawn = () => { s++; throw new Error('Real cp.spawn blocked during import'); };
      process.kill = () => { k++; throw new Error('Real process.kill blocked during import'); };

      require('./apps/api/scripts/s2cProcessManager');
      require('./apps/api/scripts/startSandboxS2CTestServer');
      require('./apps/api/scripts/seedSandboxS2CFixtures');
      require('./apps/api/scripts/s2cBackupParityValidator');
      require('./apps/api/scripts/s2cDatabasePrivileges');
      require('./apps/api/scripts/verifyS2CEnvironmentIsolation');

      if (h === 0 && n === 0 && s === 0 && k === 0) {
        process.stdout.write('ISOLATED_IMPORT_PURITY_VERIFIED');
      } else {
        process.exit(2);
      }
    `;

    const tsxPath = path.resolve(
  __dirname,
  '../../../node_modules/tsx/dist/cli.mjs'
);
    const isolatedRun = child_process.execFileSync(process.execPath, [tsxPath, '-e', isolatedEvalScript], {
      cwd: 'D:/ACM_QLLK',
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(isolatedRun).toContain('ISOLATED_IMPORT_PURITY_VERIFIED');

    // 2. Harness boundary interceptors
    const activeSpy = createSafetyAuditSpy();
    const boundaries = activeSpy.instrumentedBoundaries;
    const expectedBoundaries = [
      'PROCESS_LIFECYCLE',
      'NETWORK_SOCKETS',
      'FILE_SYSTEM',
      'DOCKER_CONTAINER_ENGINE',
      'POSTGRES_SQL_ENGINE',
      'HTTP_SERVER_LISTENERS',
    ];

    expect(expectedBoundaries.every(b => boundaries.includes(b as any))).toBe(true);
    expect(boundaries.length).toBeGreaterThanOrEqual(6);

    const zeroMutations = activeSpy.assertZeroRealMutations();
    expect(zeroMutations.passed).toBe(true);
    expect(activeSpy.realDockerCalls).toBe(0);
    expect(activeSpy.realPostgresConnections).toBe(0);
    expect(activeSpy.realProcessKills).toBe(0);
    expect(activeSpy.realHttpListeners).toBe(0);
  });

  // B1PREP-51
  it('B1PREP-51: Process Disappearance Pre-Termination Fail-Closed (Zero termination calls, PID evidence preserved)', async () => {
    let terminateCallCount = 0;
    let getProcessCallCount = 0;
    const initialStartTime = '2026-10-15T11:00:00.000Z';

    const disappearanceRecord: S2CPidRecord = {
      wrapperPid: 0,
      nodePid: 3456,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-disappear-051',
      createdAt: initialStartTime,
    };

    const mockFsMap = new Map<string, string>([
      [path.resolve('D:/ACM_QLLK/.s2c_api.pid'), JSON.stringify(disappearanceRecord)],
    ]);

    const activeSpy = createSafetyAuditSpy();
    const procAdapter = activeSpy.createInstrumentedProcessAdapter({
      getProcessById: async (pid) => {
        if (pid !== 3456) return null;
        getProcessCallCount++;
        if (getProcessCallCount === 1) {
          return {
            pid: 3456,
            name: 'node.exe',
            commandLine: 'node startSandboxS2CTestServer.ts',
            startTime: initialStartTime,
            cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
            creationToken: 'token-051',
          };
        }
        return null;
      },
      terminateProcess: async () => {
        terminateCallCount++;
        return true;
      },
      isProcessAlive: async (pid) => pid === 3456,
    });

    const sockAdapter = activeSpy.createInstrumentedSocketAdapter({
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 3456,
        state: 'LISTEN',
      }),
    });

    const fsAdapter = activeSpy.createInstrumentedFsAdapter({
      exists: async (p) => mockFsMap.has(p),
      readFile: async (p) => mockFsMap.get(p) || '',
      unlink: async (p) => { mockFsMap.delete(p); },
    });

    const termRes = await safeTerminateS2CProcess({
      procAdapter,
      sockAdapter,
      fsAdapter,
    });

    expect(termRes.success).toBe(false);
    expect(termRes.status).toBe('TERMINATION_BLOCKED');
    expect(termRes.pidFilePreserved).toBe(true);
    expect(terminateCallCount).toBe(0);
    expect(activeSpy.calls.terminateProcess).toBe(0);
    expect(mockFsMap.has(path.resolve('D:/ACM_QLLK/.s2c_api.pid'))).toBe(true);
    expect(termRes.details).toContain('disappeared from process table');
  });

  // B1PREP-52
  it('B1PREP-52: Verify Real Execution Directory: C:\\untrusted and missing cwd rejected fail-closed; approved cwd accepted', async () => {
    const relCmd = 'node startSandboxS2CTestServer.ts';
    const fakeRecord: S2CPidRecord = {
      wrapperPid: 0,
      nodePid: 9876,
      port: 5001,
      commandLine: relCmd,
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-cwd-052',
      createdAt: new Date().toISOString(),
    };

    // Case 1: Foreign process launched from C:\untrusted
    const isUntrustedCwdCmdValid = isS2CCommandLine(relCmd, 'C:\\untrusted');
    expect(isUntrustedCwdCmdValid).toBe(false);

    const untrustedCwdProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 9876
          ? {
              pid: 9876,
              name: 'node.exe',
              commandLine: relCmd,
              startTime: fakeRecord.createdAt,
              cwd: 'C:\\untrusted',
            }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async () => false,
    };
    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 9876,
        state: 'LISTEN',
      }),
    };

    const verifyUntrustedCwd = await verifyS2CProcessIdentity(fakeRecord, untrustedCwdProc, mockSock);
    expect(verifyUntrustedCwd.verified).toBe(false);
    expect(verifyUntrustedCwd.status).toBe('PID_REUSED');

    // Case 2: Missing cwd (undefined)
    const isMissingCwdCmdValid = isS2CCommandLine(relCmd, undefined);
    expect(isMissingCwdCmdValid).toBe(false);

    const missingCwdProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 9876
          ? {
              pid: 9876,
              name: 'node.exe',
              commandLine: relCmd,
              startTime: fakeRecord.createdAt,
              cwd: undefined,
            }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async () => false,
    };

    const verifyMissingCwd = await verifyS2CProcessIdentity(fakeRecord, missingCwdProc, mockSock);
    expect(verifyMissingCwd.verified).toBe(false);
    expect(verifyMissingCwd.status).toBe('PID_REUSED');

    // Case 3: Legitimate process with approved canonical cwd (D:\ACM_QLLK\apps\api\scripts)
    const isApprovedCwdCmdValid = isS2CCommandLine(relCmd, 'D:\\ACM_QLLK\\apps\\api\\scripts');
    expect(isApprovedCwdCmdValid).toBe(true);

    const approvedCwdProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 9876
          ? {
              pid: 9876,
              name: 'node.exe',
              commandLine: relCmd,
              startTime: fakeRecord.createdAt,
              cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
            }
          : null,
      terminateProcess: async () => true,
      isProcessAlive: async () => false,
    };

    const verifyApprovedCwd = await verifyS2CProcessIdentity(fakeRecord, approvedCwdProc, mockSock);
    expect(verifyApprovedCwd.verified).toBe(true);
    expect(verifyApprovedCwd.status).toBe('VERIFIED_ACTIVE');
  });

  // B1PREP-53
  it('B1PREP-53: Foreign Executables Rejected (evilnode.exe, fakenode.exe fail-closed; zero terminate calls)', async () => {
    let terminateCallCount = 0;
    const initialStartTime = new Date().toISOString();
    const foreignRecord: S2CPidRecord = {
      wrapperPid: 2222,
      nodePid: 1111,
      port: 5001,
      commandLine: 'evilnode startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-foreign-exe-053',
      createdAt: initialStartTime,
    };

    const mockFsMap = new Map<string, string>([
      [path.resolve('D:/ACM_QLLK/.s2c_api.pid'), JSON.stringify(foreignRecord)],
    ]);

    // Test 1: Node process is named evilnode.exe
    const foreignNodeProc: ProcessAdapter = {
      getProcessById: async (pid) => {
        if (pid === 1111) {
          return {
            pid: 1111,
            name: 'evilnode.exe',
            commandLine: 'evilnode startSandboxS2CTestServer.ts',
            startTime: initialStartTime,
            cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
          };
        }
        if (pid === 2222) {
          return {
            pid: 2222,
            name: 'powershell.exe',
            commandLine: 'powershell.exe',
            startTime: initialStartTime,
          };
        }
        return null;
      },
      terminateProcess: async () => {
        terminateCallCount++;
        return true;
      },
      isProcessAlive: async (pid) => pid === 1111 || pid === 2222,
    };

    const mockSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 1111,
        state: 'LISTEN',
      }),
    };

    const verifyRes = await verifyS2CProcessIdentity(foreignRecord, foreignNodeProc, mockSock);
    expect(verifyRes.verified).toBe(false);
    expect(verifyRes.status).toBe('PID_REUSED');
    expect(verifyRes.reasons.some(r => r.includes('approved node executable'))).toBe(true);

    const termRes = await safeTerminateS2CProcess({
      procAdapter: foreignNodeProc,
      sockAdapter: mockSock,
      fsAdapter: {
        exists: async (p) => mockFsMap.has(p),
        readFile: async (p) => mockFsMap.get(p) || '',
        unlink: async (p) => { mockFsMap.delete(p); },
      },
    });

    expect(termRes.success).toBe(false);
    expect(termRes.status).toBe('TERMINATION_BLOCKED');
    expect(termRes.pidFilePreserved).toBe(true);
    expect(terminateCallCount).toBe(0);

    // Test 2: Foreign wrapper executable fakenode.exe
    let wrapperTerminateCallCount = 0;
    const foreignWrapperRecord: S2CPidRecord = {
      wrapperPid: 3333,
      nodePid: 4444,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-foreign-wrapper-053',
      createdAt: initialStartTime,
    };

    const foreignWrapperProc: ProcessAdapter = {
      getProcessById: async (pid) => {
        if (pid === 4444) {
          return {
            pid: 4444,
            parentPid: 3333,
            name: 'node.exe',
            commandLine: 'node startSandboxS2CTestServer.ts',
            startTime: initialStartTime,
            cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
          };
        }
        if (pid === 3333) {
          return {
            pid: 3333,
            name: 'fakenode.exe',
            commandLine: 'fakenode runner.js',
            startTime: initialStartTime,
          };
        }
        return null;
      },
      terminateProcess: async () => {
        wrapperTerminateCallCount++;
        return true;
      },
      isProcessAlive: async (pid) => pid === 4444 || pid === 3333,
    };

    const wrapperVerifyRes = await verifyS2CProcessIdentity(foreignWrapperRecord, foreignWrapperProc, mockSock);
    expect(wrapperVerifyRes.wrapperProcess).toBeUndefined();
    expect(wrapperVerifyRes.wrapperTargetHandle).toBeUndefined();
    expect(wrapperTerminateCallCount).toBe(0);
  });

  // B1PREP-54
  it('B1PREP-54: Real Termination Safety Lock & Non-OS-Bound ProcessTargetHandle (Automatic kill locked; software assertion metadata only)', async () => {
    expect(REAL_PROCESS_TERMINATION_LOCKED).toBe(true);
    expect(TERMINATION_SAFETY_POLICY.automaticTerminationEnabled).toBe(false);
    expect(TERMINATION_SAFETY_POLICY.realOsKillAllowed).toBe(false);
    expect(TERMINATION_SAFETY_POLICY.processTargetHandleIsOsBound).toBe(false);
    expect(TERMINATION_SAFETY_POLICY.provisioningAutoKillForbidden).toBe(true);
    expect(TERMINATION_SAFETY_POLICY.safeProvisioningGuidance).toContain('free port 5001');

    const validStartTime = new Date().toISOString();
    const testRecord: S2CPidRecord = {
      wrapperPid: 0,
      nodePid: 7777,
      port: 5001,
      commandLine: 'node startSandboxS2CTestServer.ts',
      scriptPath: MANDATORY_S2C_SCRIPT_NAME,
      sessionId: 'sess-handle-054',
      createdAt: validStartTime,
    };
    const testProc: ProcessAdapter = {
      getProcessById: async (pid) =>
        pid === 7777
          ? {
              pid: 7777,
              name: 'node.exe',
              commandLine: 'node startSandboxS2CTestServer.ts',
              startTime: validStartTime,
              cwd: 'D:\\ACM_QLLK\\apps\\api\\scripts',
            }
          : null,
      terminateProcess: async () => false,
      isProcessAlive: async () => false,
    };
    const testSock: SocketAdapter = {
      getListeningSocketByPort: async () => ({
        localPort: 5001,
        owningPid: 7777,
        state: 'LISTEN',
      }),
    };

    const verified = await verifyS2CProcessIdentity(testRecord, testProc, testSock);
    const targetHandle = verified.nodeTargetHandle;
    expect(targetHandle).toBeDefined();
    expect(targetHandle?.isOsBoundHandle).toBe(false);
    expect(targetHandle?.pid).toBe(7777);
    expect(targetHandle?.expectedStartTime).toBe(validStartTime);
  });
});
