import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

export function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/** Returns the value; the error names the variable only, never a value. */
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env var ${name}. Copy .env.example to .env and set it.`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  /** local only: the API has a settings write endpoint and no auth */
  host: '127.0.0.1',
  /** override the database file (browser tests use a copy) */
  dbPath: process.env.SCANNER_DB?.trim() || null,
  /** serve saved results without scanning or tracking */
  readOnly: process.env.SCANNER_READONLY === '1',
  /** Consolidated tape; the free plan serves it 15 minutes delayed. */
  stockFeed: 'sip' as 'sip' | 'iex',
  /** Free plan options feed: modeled prices, 15 minutes delayed. */
  optionsFeed: 'indicative' as 'indicative' | 'opra',
};
