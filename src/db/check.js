'use strict';
/**
 * DB pre-flight check.
 * Detects whether the `vector` (pgvector) extension is installed in the
 * target Postgres database BEFORE we attempt migrations. If pgvector is
 * missing, prints OS-specific install instructions and exits non-zero,
 * so users get an actionable error instead of the cryptic
 * `extension "vector" is not available` from `CREATE EXTENSION`.
 *
 * Source: post-cycle follow-up to `be-ai-auto-reply-2026-07-03` —
 * U-reported that `pnpm db:migrate` fails confusingly when pgvector is
 * not installed.
 */
require('dotenv').config();
const os = require('os');
const { getPool } = require('./client');

const PLATFORM = process.platform; // 'win32' | 'darwin' | 'linux' | 'freebsd' | ...

/**
 * Build OS-specific install instructions.
 *
 * Windows is intentionally treated as a first-class citizen because the
 * pgvector project does not publish native Windows binaries — Docker /
 * WSL2 / Supabase local are the only practical paths. macOS / Linux get
 * the conventional one-liners.
 *
 * @param {object} [opts]
 * @param {string} [opts.platform]   override process.platform (used by tests)
 * @param {string} [opts.missing]    label of what's missing — included in the
 *                                   banner so the same builder serves both the
 *                                   "no DB" and "no pgvector" failure cases.
 * @returns {string[]}
 */
function buildInstallInstructions(opts = {}) {
  const platform = opts.platform || PLATFORM;
  const missing = opts.missing || 'pgvector';

  if (platform === 'win32') {
    return [
      `Windows: ${missing} is not available.`,
      '',
      'The fastest Windows-friendly path is Docker (recommended):',
      '  1. Install Docker Desktop:  https://www.docker.com/products/docker-desktop/',
      '  2. Start a Postgres + pgvector container:',
      '       docker run --name baileys-pg `',
      '         -e POSTGRES_PASSWORD=baileys `',
      '         -p 5432:5432 `',
      '         -d pgvector/pgvector:pg16',
      '  3. Point the BE at it (PowerShell):',
      '       setx DATABASE_URL "postgres://postgres:baileys@localhost:5432/postgres"',
      '     (open a new shell after `setx`)',
      '',
      'Alternatives that also work on Windows:',
      '  - WSL2 + Ubuntu (native pgvector via apt):',
      '      wsl --install -d Ubuntu        (one-time, then restart)',
      '      wsl',
      '      sudo apt update',
      '      sudo apt install -y postgresql-16 postgresql-16-pgvector',
      '      sudo service postgresql start',
      '      sudo -u postgres createuser -s baileys',
      '      sudo -u postgres createdb baileys -O baileys',
      '      # then set DATABASE_URL to point at the WSL Postgres from Windows',
      '  - Supabase local stack (Docker under the hood):',
      '      npm install -g supabase',
      '      supabase init && supabase start',
      '      # copy the printed "DB URL" into DATABASE_URL',
      '',
      'Native Windows Postgres does NOT ship pgvector and the project does not',
      'publish Windows binaries — compiling from source requires Visual Studio',
      'Build Tools and is not officially supported. See',
      'https://github.com/pgvector/pgvector#windows for the latest status.',
      '',
      'After installing pgvector, re-run:  pnpm db:check',
    ];
  }

  if (platform === 'darwin') {
    return [
      `macOS: ${missing} is not available.`,
      '',
      '  brew install pgvector',
      '  brew services restart postgresql@16   # pick the version you have',
      '',
      'Or use Postgres.app (16+ ships pgvector built-in):  https://postgresapp.com/',
      '',
      'After installing pgvector, re-run:  pnpm db:check',
    ];
  }

  // linux + everything else (freebsd, openbsd, sunos, aix, …).
  return [
    `Linux (${platform}): ${missing} is not available.`,
    '',
    '  Debian / Ubuntu:',
    '    sudo apt install postgresql-16-pgvector',
    '    # (match the `16` to your Postgres major version)',
    '  Fedora / RHEL / Rocky:',
    '    sudo dnf install pgvector_16',
    '  Alpine:',
    '    apk add postgresql-pgvector       # community package',
    '',
    'Then restart Postgres so the extension loads:',
    '    sudo systemctl restart postgresql',
    '',
    'After installing pgvector, re-run:  pnpm db:check',
  ];
}

/**
 * Returns true iff the `vector` (pgvector) extension is currently
 * registered in pg_extension on the connected database.
 */
async function isPgvectorInstalled(pool) {
  const r = await pool.query(
    "SELECT extname FROM pg_extension WHERE extname = 'vector'"
  );
  return r.rows.length > 0;
}

/**
 * Best-effort: try `CREATE EXTENSION IF NOT EXISTS vector`. Requires
 * the connected DB role to have CREATE privilege on the current
 * database (typically: the DB superuser or the `azure_pg_admin` role
 * on Azure Postgres). Returns { ok: true } on success or
 * { ok: false, error } on failure.
 */
async function tryInstallPgvector(pool) {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Build the DATABASE_URL hint string for error messages. Never
 * includes the password.
 */
function safeDbUrlHint() {
  const raw = process.env.DATABASE_URL
    || 'postgres://baileys:baileys@localhost:5432/baileys';
  return raw.replace(/:[^:@/]+@/, ':***@');
}

/**
 * Run pre-flight checks. Returns a structured result — never throws.
 *
 *   { ok: true,  version }
 *   { ok: false, code: 'no_db',       message, dbUrl }
 *   { ok: false, code: 'no_pgvector', message, version, platform }
 *
 * `pool` is injectable for tests; defaults to `getPool()` from
 * `./client`.
 */
async function check({ pool: poolArg, logger } = {}) {
  const pool = poolArg || getPool();
  const log = logger || console;

  // 1) connectivity
  let version;
  try {
    const r = await pool.query('SELECT version() AS v');
    version = r.rows[0] && r.rows[0].v;
  } catch (err) {
    return {
      ok: false,
      code: 'no_db',
      message: `Could not reach Postgres: ${err.message}`,
      dbUrl: safeDbUrlHint(),
      platform: PLATFORM,
      instructions: [
        `DATABASE_URL = ${safeDbUrlHint()}`,
        'Make sure Postgres is running and the URL is reachable from this machine.',
        '',
        ...buildInstallInstructions({
          platform: PLATFORM,
          missing: 'Postgres + pgvector',
        }),
      ],
      _log: log,
    };
  }

  // 2) pgvector extension
  let installed;
  try {
    installed = await isPgvectorInstalled(pool);
  } catch (err) {
    return {
      ok: false,
      code: 'pgvector_check_failed',
      message: `Postgres is reachable (${version}) but pg_extension lookup failed: ${err.message}`,
      version,
      platform: PLATFORM,
      instructions: buildInstallInstructions({ platform: PLATFORM }),
      _log: log,
    };
  }

  if (installed) return { ok: true, version, platform: PLATFORM };

  return {
    ok: false,
    code: 'no_pgvector',
    message:
      'Postgres is reachable but the `vector` (pgvector) extension is not installed in the target database.',
    version,
    platform: PLATFORM,
    instructions: buildInstallInstructions({ platform: PLATFORM }),
    _log: log,
  };
}

/**
 * Best-effort installer. Tries `CREATE EXTENSION IF NOT EXISTS vector`
 * and, on success, returns { ok: true }. On failure, prints OS-specific
 * install instructions to stderr and returns { ok: false, error }.
 *
 * Never throws.
 */
async function installPgvector(opts = {}) {
  const pool = opts.pool || getPool();
  const logger = opts.logger || console;
  const result = await tryInstallPgvector(pool);
  if (result.ok) {
    logger.log('[pgvector] CREATE EXTENSION succeeded.');
    return { ok: true };
  }
  logger.error('[pgvector] CREATE EXTENSION failed.');
  logger.error(`[pgvector] ${result.error && result.error.message}`);
  logger.error('');
  logger.error('Install pgvector manually for your platform:');
  for (const line of buildInstallInstructions({ platform: PLATFORM })) {
    logger.error(line);
  }
  return { ok: false, error: result.error };
}

/**
 * Pretty-print a check result to a logger (stderr on failure, stdout on
 * success) and return the exit code to use. Used by the CLI entry-point.
 */
function formatCheckResult(res) {
  const log = res._log || console;
  if (res.ok) {
    log.log(`[preflight] OK — Postgres reachable, pgvector installed.`);
    if (res.version) log.log(`[preflight] ${res.version}`);
    return 0;
  }
  log.error(`[preflight] FAIL (${res.code})`);
  log.error(`[preflight] ${res.message}`);
  if (res.dbUrl) log.error(`[preflight] ${res.dbUrl}`);
  log.error('');
  for (const line of res.instructions || []) {
    log.error(line);
  }
  return 1;
}

// --- CLI entry-points -------------------------------------------------------

async function _cliCheck() {
  const res = await check();
  const code = formatCheckResult(res);
  // Don't await closeDb() — let the process exit so we don't hang on
  // lingering pool sockets when no DB was reachable.
  process.exit(code);
}

async function _cliInstall() {
  // 1) First check — if pgvector is already installed, nothing to do.
  const pre = await check();
  if (pre.ok) {
    // eslint-disable-next-line no-console
    console.log('[pgvector] already installed; nothing to do.');
    process.exit(0);
  }
  // 2) Try CREATE EXTENSION.
  const res = await installPgvector();
  if (!res.ok) process.exit(1);
  // 3) Re-run the check to confirm.
  const post = await check();
  const code = formatCheckResult(post);
  process.exit(code);
}

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--install') {
    _cliInstall().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[pgvector] unexpected error:', err);
      process.exit(1);
    });
  } else {
    _cliCheck().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[preflight] unexpected error:', err);
      process.exit(1);
    });
  }
}

module.exports = {
  check,
  installPgvector,
  isPgvectorInstalled,
  tryInstallPgvector,
  buildInstallInstructions,
  formatCheckResult,
  safeDbUrlHint,
  PLATFORM,
};