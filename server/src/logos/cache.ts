import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CompanyProvider } from '../providers/types.js';

export interface LogoImage {
  contentType: string;
  bytes: Buffer;
}

export type Download = (url: string) => Promise<LogoImage>;

interface Meta {
  date: string;
  contentType: string | null;
}

const TICKER = /^[A-Z][A-Z.]{0,9}$/;
const MAX_BYTES = 512 * 1024;

/** Only Finnhub's own static hosts, over https. */
function allowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'finnhub.io' || u.hostname.endsWith('.finnhub.io'));
  } catch {
    return false;
  }
}

/**
 * Company logos cached on disk, refreshed at most once per ET day. A ticker with no logo (ETFs) is
 * remembered as "none" for the day. A failed fetch is not cached; an older image is served instead.
 */
export class LogoCache {
  private readonly inflight = new Map<string, Promise<LogoImage | null>>();

  constructor(
    private readonly dir: string,
    private readonly company: CompanyProvider,
    private readonly download: Download,
    private readonly today: () => string,
  ) {}

  get(ticker: string): Promise<LogoImage | null> {
    if (!TICKER.test(ticker)) return Promise.reject(new Error(`Not a ticker: ${ticker}`));
    const meta = this.readMeta(ticker);
    if (meta?.date === this.today()) return Promise.resolve(this.readImage(ticker, meta));

    const pending = this.inflight.get(ticker);
    if (pending) return pending;
    const p = this.refresh(ticker, meta).finally(() => this.inflight.delete(ticker));
    this.inflight.set(ticker, p);
    return p;
  }

  private async refresh(ticker: string, previous: Meta | null): Promise<LogoImage | null> {
    let image: LogoImage | null;
    try {
      const url = await this.company.getLogoUrl(ticker);
      image = url && allowedUrl(url) ? await this.download(url) : null;
    } catch (err) {
      const stale = previous ? this.readImage(ticker, previous) : null;
      if (stale) return stale;
      throw err;
    }
    if (image && (!image.contentType.startsWith('image/') || image.bytes.length > MAX_BYTES)) image = null;

    mkdirSync(this.dir, { recursive: true });
    if (image) writeFileSync(join(this.dir, `${ticker}.img`), image.bytes);
    const meta: Meta = { date: this.today(), contentType: image?.contentType ?? null };
    writeFileSync(join(this.dir, `${ticker}.json`), JSON.stringify(meta));
    return image;
  }

  private readMeta(ticker: string): Meta | null {
    const file = join(this.dir, `${ticker}.json`);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as Meta;
    } catch {
      return null;
    }
  }

  private readImage(ticker: string, meta: Meta): LogoImage | null {
    const file = join(this.dir, `${ticker}.img`);
    return meta.contentType && existsSync(file) ? { contentType: meta.contentType, bytes: readFileSync(file) } : null;
  }
}
