#!/usr/bin/env node
/**
 * Cross-platform Vision Service Launcher for ACM Monorepo
 * Automatically detects the real Python executable (avoiding broken Windows Microsoft Store app execution aliases)
 * and starts apps/vision-service/server.py
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const serverScript = path.join(repoRoot, 'apps', 'vision-service', 'server.py');

function isExecutableValid(cmd) {
  try {
    const res = execSync(`"${cmd}" -c "import sys; sys.exit(0)"`, {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

function resolvePythonBinary() {
  // 1. Explicit environment override
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }

  const candidates = [];

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

    // Direct real Python installations on Windows
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Python', 'bin', 'python.exe'));
      candidates.push(path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'));
      candidates.push(path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'));
      candidates.push(path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe'));
    }
    if (userProfile) {
      candidates.push(path.join(userProfile, '.pyenv', 'pyenv-win', 'shims', 'python.exe'));
    }
    candidates.push(path.join(programFiles, 'Python312', 'python.exe'));
    candidates.push(path.join(programFiles, 'Python311', 'python.exe'));
    candidates.push(path.join(programFiles, 'Python310', 'python.exe'));
    candidates.push('C:\\Python312\\python.exe');
    candidates.push('C:\\Python311\\python.exe');
    candidates.push('C:\\Python310\\python.exe');

    // Standard CLI commands (tested afterwards to avoid Windows Store aliases)
    candidates.push('py');
    candidates.push('python');
    candidates.push('python3');
  } else {
    // Linux / macOS
    candidates.push('python3');
    candidates.push('python');
    candidates.push('/usr/bin/python3');
    candidates.push('/usr/local/bin/python3');
  }

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate) && isExecutableValid(candidate)) {
        return candidate;
      }
    } else {
      if (isExecutableValid(candidate)) {
        return candidate;
      }
    }
  }

  // Fallback to default
  return process.platform === 'win32' ? 'python' : 'python3';
}

const pythonBin = resolvePythonBinary();
console.log(`[ACM Vision Service Launcher] Using Python: ${pythonBin}`);
console.log(`[ACM Vision Service Launcher] Starting: ${serverScript}\n`);

const child = spawn(pythonBin, [serverScript], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
  },
});

child.on('error', (err) => {
  console.error('[ACM Vision Service Launcher] Failed to start Python process:', err);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
