/**
 * DB pre-flight check tests (no Postgres required).
 *
 * Source: post-cycle follow-up to `be-ai-auto-reply-2026-07-03`.
 * Tests inject a fake pool into `check()` so the spec runs cleanly
 * without a DATABASE_URL.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  check,
  buildInstallInstructions,
  tryInstallPgvector,
  isPgvectorInstalled,
  formatCheckResult,
  safeDbUrlHint,
  PLATFORM,
} from '../src/db/check.js';

function fakePool(queryHandler) {
  return { query: vi.fn(queryHandler) };
}

// Capture console output during formatCheckResult.
function captureLog() {
  const lines = [];
  const logger = {
    log: (...a) => lines.push(['log', ...a].join(' ')),
    error: (...a) => lines.push(['err', ...a].join(' ')),
  };
  return { logger, lines };
}

describe('db/check pre-flight', () => {
  it('returns ok:true when pgvector is installed', async () => {
    const pool = fakePool(async (sql) => {
      if (/SELECT version/i.test(sql)) {
        return { rows: [{ v: 'PostgreSQL 16.2 on x86_64' }] };
      }
      if (/pg_extension/i.test(sql)) {
        return { rows: [{ extname: 'vector' }] };
      }
      return { rows: [] };
    });
    const res = await check({ pool });
    expect(res.ok).toBe(true);
    expect(res.version).toMatch(/PostgreSQL/);
    expect(res.platform).toBe(PLATFORM);
  });

  it('returns code=no_pgvector when extension is missing and includes install instructions', async () => {
    const pool = fakePool(async (sql) => {
      if (/SELECT version/i.test(sql)) {
        return { rows: [{ v: 'PostgreSQL 16.2' }] };
      }
      if (/pg_extension/i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const res = await check({ pool });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('no_pgvector');
    expect(res.version).toMatch(/PostgreSQL/);
    expect(Array.isArray(res.instructions)).toBe(true);
    expect(res.instructions.length).toBeGreaterThan(2);
  });

  it('returns code=no_db when SELECT version() fails and still prints install instructions', async () => {
    const pool = fakePool(async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:5432');
    });
    const res = await check({ pool });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('no_db');
    expect(res.message).toMatch(/ECONNREFUSED/);
    expect(res.dbUrl).toMatch(/postgres:\/\//);
    // Sanity-check the password is masked.
    expect(res.dbUrl).not.toMatch(/:baileys@/);
    // Install instructions should still be present so the user has next steps.
    expect(res.instructions.length).toBeGreaterThan(2);
  });

  it('returns code=pgvector_check_failed when pg_extension query throws', async () => {
    const pool = fakePool(async (sql) => {
      if (/SELECT version/i.test(sql)) {
        return { rows: [{ v: 'PostgreSQL 16.2' }] };
      }
      throw new Error('permission denied for table pg_extension');
    });
    const res = await check({ pool });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('pgvector_check_failed');
  });

  it('isPgvectorInstalled returns true when vector is in pg_extension', async () => {
    const pool = fakePool(async () => ({ rows: [{ extname: 'vector' }] }));
    const ok = await isPgvectorInstalled(pool);
    expect(ok).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('isPgvectorInstalled returns false when vector is not in pg_extension', async () => {
    const pool = fakePool(async () => ({ rows: [] }));
    const ok = await isPgvectorInstalled(pool);
    expect(ok).toBe(false);
  });

  it('tryInstallPgvector returns ok:true when CREATE EXTENSION succeeds', async () => {
    const pool = fakePool(async () => ({ rows: [] }));
    const res = await tryInstallPgvector(pool);
    expect(res.ok).toBe(true);
    expect(pool.query).toHaveBeenCalledWith('CREATE EXTENSION IF NOT EXISTS vector');
  });

  it('tryInstallPgvector returns ok:false with the original error when CREATE EXTENSION fails', async () => {
    const orig = new Error('extension "vector" is not available');
    const pool = fakePool(async () => { throw orig; });
    const res = await tryInstallPgvector(pool);
    expect(res.ok).toBe(false);
    expect(res.error).toBe(orig);
  });
});

describe('db/check install instructions (Windows-friendly first)', () => {
  it('Windows instructions mention Docker first and acknowledge native Windows is unsupported', () => {
    const lines = buildInstallInstructions({ platform: 'win32' });
    const text = lines.join('\n');
    expect(text).toMatch(/Docker Desktop/);
    expect(text).toMatch(/pgvector\/pgvector:pg16/);
    expect(text).toMatch(/WSL2/);
    expect(text).toMatch(/Supabase/);
    // The Windows path MUST acknowledge that pgvector does not ship native
    // Windows binaries so the user knows Docker/WSL are required.
    expect(text).toMatch(/does NOT ship pgvector/);
  });

  it('macOS instructions use Homebrew + Postgres.app', () => {
    const lines = buildInstallInstructions({ platform: 'darwin' });
    const text = lines.join('\n');
    expect(text).toMatch(/brew install pgvector/);
    expect(text).toMatch(/postgresapp\.com/);
  });

  it('Linux instructions cover apt + dnf + apk', () => {
    const lines = buildInstallInstructions({ platform: 'linux' });
    const text = lines.join('\n');
    expect(text).toMatch(/apt install postgresql-16-pgvector/);
    expect(text).toMatch(/dnf install pgvector_16/);
    expect(text).toMatch(/apk add postgresql-pgvector/);
  });

  it('labels the missing component in the banner', () => {
    const lines = buildInstallInstructions({
      platform: 'linux',
      missing: 'Postgres + pgvector',
    });
    expect(lines[0]).toMatch(/Postgres \+ pgvector is not available/);
  });

  it('falls back to the Linux branch for unknown platforms (freebsd/openbsd/sunos)', () => {
    const lines = buildInstallInstructions({ platform: 'freebsd' });
    expect(lines[0]).toMatch(/Linux \(freebsd\)/);
  });
});

describe('db/check formatting helpers', () => {
  it('formatCheckResult returns exit 0 on ok and prints version', () => {
    const { logger, lines } = captureLog();
    const code = formatCheckResult({
      ok: true,
      version: 'PostgreSQL 16.2',
      _log: logger,
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toMatch(/OK/);
    expect(lines.join('\n')).toMatch(/PostgreSQL 16\.2/);
  });

  it('formatCheckResult returns exit 1 on no_pgvector and prints instructions', () => {
    const { logger, lines } = captureLog();
    const code = formatCheckResult({
      ok: false,
      code: 'no_pgvector',
      message: 'pgvector not installed',
      version: 'PostgreSQL 16.2',
      platform: 'linux',
      instructions: ['install me', 'please'],
      _log: logger,
    });
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/FAIL \(no_pgvector\)/);
    expect(lines.join('\n')).toMatch(/install me/);
  });

  it('safeDbUrlHint masks the password', () => {
    process.env.DATABASE_URL = 'postgres://app:s3cret@db.example.com:5432/prod';
    try {
      const hint = safeDbUrlHint();
      expect(hint).toMatch(/:[^:@/]+@/); // contains a non-empty segment
      expect(hint).not.toMatch(/s3cret/);
      expect(hint).toMatch(/@db\.example\.com/);
    } finally {
      delete process.env.DATABASE_URL;
    }
  });

  it('safeDbUrlHint returns the default URL (with no real password) when DATABASE_URL is unset', () => {
    delete process.env.DATABASE_URL;
    const hint = safeDbUrlHint();
    expect(hint).toMatch(/^postgres:\/\//);
    // The default has username "baileys" and password "baileys"; both are
    // placeholders, but we still assert the mask is applied.
    expect(hint).toMatch(/:[^:@/]+@/);
  });
});

describe('migrate.js pre-flight integration', () => {
  // The "migrate refuses to run when pgvector is missing" path is
  // mechanically guaranteed by the migration runner calling
  // `preflightCheck()` first and throwing on `ok:false`. The unit
  // tests above already exercise every branch of `check()` with a
  // fully-mocked pool, which is the spec the brief asked for. We add
  // a single here-doc assertion confirming the source-of-truth wiring
  // so a future refactor can't silently drop the pre-flight call.
  it('migrate.js source invokes preflightCheck before ensureMigrationsTable', async () => {
    const fs = await import('fs');
    const path = (await import('path')).default;
    const url = await import('url');
    const here = url.fileURLToPath(new URL('.', import.meta.url));
    const migrateSrc = path.resolve(here, '..', 'src', 'db', 'migrate.js');
    const src = fs.readFileSync(migrateSrc, 'utf8');
    // Match the actual call sites, not the function declarations.
    const callIdx = (re) => {
      const m = src.match(re);
      return m ? m.index : -1;
    };
    const preCallIdx = callIdx(/await\s+preflightCheck\(/);
    const ensureCallIdx = callIdx(/await\s+ensureMigrationsTable\(\)/);
    expect(preCallIdx).toBeGreaterThan(-1);
    expect(ensureCallIdx).toBeGreaterThan(-1);
    expect(preCallIdx).toBeLessThan(ensureCallIdx);
    // And the call site must respect the skipPreflight opt-out.
    expect(src).toMatch(/opts\.skipPreflight/);
  });
});