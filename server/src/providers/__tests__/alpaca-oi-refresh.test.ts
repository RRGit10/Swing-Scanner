import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlpacaOptionsProvider } from '../alpaca/options.js';
import type { AlpacaClient } from '../alpaca/client.js';

const contract = (oiDate: string) => ({ symbol: 'NVDA261030C00215000', expiration_date: '2026-10-30', open_interest: '5429', open_interest_date: oiDate });

function setup() {
  let oiDate = '2026-10-22';
  const calls: string[] = [];
  const logs: string[] = [];
  const client = {
    getAllPages: async (_api: string, path: string) => {
      calls.push(path);
      return path === '/v2/options/contracts' ? [{ option_contracts: [contract(oiDate)], next_page_token: null }] : [{ snapshots: {}, next_page_token: null }];
    },
  } as unknown as AlpacaClient;
  const provider = new AlpacaOptionsProvider(client, (m) => logs.push(m));
  const oiCalls = () => calls.filter((c) => c === '/v2/options/contracts').length;
  return { provider, oiCalls, logs, publish: (d: string) => (oiDate = d) };
}

afterEach(() => vi.useRealTimers());

describe('open interest refresh while stale', () => {
  it('re-checks about hourly while the newest OI date is older than the previous session, then stops', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-26T14:00:00Z') }); // 10:00 ET Monday
    const { provider, oiCalls, logs, publish } = setup();
    const fresh = { oiFreshAsOf: '2026-10-23' };
    await provider.getChain('NVDA', '2026-10-30', fresh);
    await provider.getChain('NVDA', '2026-10-30', fresh);
    expect(oiCalls()).toBe(1); // within the hour: cached

    vi.setSystemTime(new Date('2026-10-26T15:01:00Z'));
    await provider.getChain('NVDA', '2026-10-30', fresh);
    expect(oiCalls()).toBe(2); // an hour later and still stale: re-checked

    publish('2026-10-23');
    vi.setSystemTime(new Date('2026-10-26T16:02:00Z'));
    await provider.getChain('NVDA', '2026-10-30', fresh);
    expect(oiCalls()).toBe(3);
    expect(logs).toEqual(['open interest NVDA 2026-10-30: date 2026-10-22 → 2026-10-23 (seen 12:02 ET)']);

    vi.setSystemTime(new Date('2026-10-26T19:00:00Z'));
    await provider.getChain('NVDA', '2026-10-30', fresh);
    expect(oiCalls()).toBe(3); // current now: once per day again
  });

  it('without a freshness date it keeps the once-per-day behavior', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-26T14:00:00Z') });
    const { provider, oiCalls } = setup();
    await provider.getChain('NVDA', '2026-10-30');
    vi.setSystemTime(new Date('2026-10-26T18:00:00Z'));
    await provider.getChain('NVDA', '2026-10-30');
    expect(oiCalls()).toBe(1);
  });
});
