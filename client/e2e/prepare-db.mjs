// Copies the scanner database for the browser tests, so they never touch the real one.
// Source: E2E_SOURCE_DB, or server/data/scanner.db. Uses SQLite's backup API (safe while the dev server runs).
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, '../../server/package.json'));
const Database = require('better-sqlite3');

const source = process.env.E2E_SOURCE_DB ?? resolve(here, '../../server/data/scanner.db');
const target = resolve(here, '.tmp/scanner-e2e.db');

if (!existsSync(source)) {
  console.error(`No scanner database at ${source}. Run \`npm run dev\` once so the scanner saves a scan, then re-run the browser tests.`);
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
for (const f of [target, `${target}-wal`, `${target}-shm`]) rmSync(f, { force: true });

const db = new Database(source, { readonly: true });
const scans = db.prepare('SELECT COUNT(*) n FROM scans').get().n;
if (!scans) {
  console.error('The scanner database has no saved scan yet. Run `npm run dev` until the first scan finishes, then re-run.');
  process.exit(1);
}
await db.backup(target);
db.close();
console.log(`e2e database ready: ${target} (${scans} scans)`);
