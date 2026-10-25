import { fetchJson } from '../http.js';

/**
 * Hard-coded on purpose: never configurable, so nothing can point this at the live
 * trading server (api.alpaca.markets).
 */
const BASE_URLS = {
  data: 'https://data.alpaca.markets',
  paper: 'https://paper-api.alpaca.markets',
} as const;

export type AlpacaApi = keyof typeof BASE_URLS;

/** Read-only allowlist. Anything else (orders, positions, account, …) is refused before a request is made. */
const ALLOWED_PATHS: Record<AlpacaApi, RegExp[]> = {
  data: [/^\/v2\/stocks\/bars$/, /^\/v1beta1\/options\/snapshots\/[A-Z.]{1,10}$/],
  paper: [/^\/v2\/options\/contracts$/],
};

const DEFAULT_MAX_PAGES = 20;

export class AlpacaClient {
  constructor(
    private readonly keyId: string,
    private readonly secretKey: string,
  ) {}

  async get(api: AlpacaApi, path: string, params: Record<string, string>): Promise<unknown> {
    if (!ALLOWED_PATHS[api].some((re) => re.test(path))) {
      throw new Error(`Alpaca ${api} path not allowed: ${path}`);
    }
    const url = new URL(BASE_URLS[api] + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return fetchJson('Alpaca', url, {
      'APCA-API-KEY-ID': this.keyId,
      'APCA-API-SECRET-KEY': this.secretKey,
      Accept: 'application/json',
    });
  }

  /** Follows next_page_token and returns every page body. Throws rather than truncate at the cap. */
  async getAllPages(
    api: AlpacaApi,
    path: string,
    params: Record<string, string>,
    maxPages = DEFAULT_MAX_PAGES,
  ): Promise<unknown[]> {
    const pages: unknown[] = [];
    let token: string | null = null;
    do {
      const body = (await this.get(api, path, token ? { ...params, page_token: token } : params)) as {
        next_page_token?: string | null;
      };
      pages.push(body);
      token = body.next_page_token ?? null;
      if (token && pages.length >= maxPages) {
        throw new Error(`Alpaca ${path} returned more than ${maxPages} pages; narrow the request`);
      }
    } while (token);
    return pages;
  }
}
