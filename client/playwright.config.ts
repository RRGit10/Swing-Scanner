import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/**
 * Reuse a Chromium that is already on this Mac (PW_CHROMIUM, or the newest one in Playwright's cache),
 * so no browser download is needed. Falls back to Playwright's own if none is found.
 */
function existingChromium(): string | undefined {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64', 'chrome-mac']) {
      const bin = join(cache, d, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (existsSync(bin)) return bin;
    }
  }
  return undefined;
}

const API_PORT = 3101;
const WEB_PORT = 5174;
const executablePath = existingChromium();
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } };
const phone = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, launchOptions: { executablePath } };

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-light', use: { ...desktop, colorScheme: 'light' } },
    { name: 'desktop-dark', use: { ...desktop, colorScheme: 'dark' } },
    { name: 'phone-light', use: { ...phone, colorScheme: 'light' } },
    { name: 'phone-dark', use: { ...phone, colorScheme: 'dark' } },
  ],
  // A read-only API on a copy of the database (no scans, no tracking), plus Vite pointed at it.
  webServer: [
    {
      command: `node e2e/prepare-db.mjs && cd ../server && SCANNER_DB="${join(HERE, 'e2e/.tmp/scanner-e2e.db')}" SCANNER_READONLY=1 PORT=${API_PORT} npm run start`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: `API_PORT=${API_PORT} npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
