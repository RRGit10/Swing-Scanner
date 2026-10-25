# Swing Scanner — Project Rules

This app automates Chris Sain's "sniper mode" swing-trade method. Follow these rules exactly in every session.
Do NOT substitute generic indicators (RSI, MACD, Bollinger, etc.) or invent strategy rules. If a rule is ambiguous to code, stop and ask.

## Stack (locked)
- Frontend: React + TypeScript + Vite + Tailwind, charts with lightweight-charts
- Backend: Node + TypeScript + Express — API keys stay server-side only
- Storage: SQLite (better-sqlite3)
- Data: Alpaca, paper account keys (stock bars from data.alpaca.markets /v2/stocks/bars on the SIP feed, 15-min delayed on the free plan; option snapshots from /v1beta1/options/snapshots on the free indicative feed for quotes, greeks, IV and dailyBar = contract day low/high; open interest from /v2/options/contracts on paper-api.alpaca.markets, read-only); Finnhub (real-time quotes, earnings calendar)
- Never call the live trading server (api.alpaca.markets) or any order endpoint.
- While on the free feed, label option prices in the UI "indicative (modeled), 15-min delayed".
- Each data source sits behind an interface: CandleProvider, OptionsProvider, QuoteProvider, EarningsProvider
- Keys from env vars FINNHUB_API_KEY, ALPACA_API_KEY_ID and ALPACA_SECRET_KEY. NEVER hardcode, commit, or log keys.
- Tests: Vitest

## Part 1 — Read the chart
- Time frames: 15 min, 30 min, 1 hour. Tag each signal with the time frame its pattern was found on.
- EMAs: 13, 48, 55, 200 on every time frame.
  - 55 EMA = reversal line: price pulls back to it (default tolerance 0.2%) and the next candle closes back in the trend direction.
    - Trend direction = the pattern's direction. Bullish: candle low ≤ 55 EMA × (1 + tolerance), any depth of pierce, and the next candle closes above the 55 EMA. Bearish mirrors with the high.
    - The touch candle must reach the line: high ≥ 55 EMA × (1 − tolerance) and low ≤ 55 EMA × (1 + tolerance). A candle fully on the other side followed by a cross is NOT a reversal.
  - 13, 48, 200 = support/resistance. Report nearest EMA above (resistance) and below (support).
  - Show EMA levels on 15m, 30m, 1h AND daily; flag a daily EMA acting as resistance in the trade's path.
- Patterns (detect via swing pivots, N bars each side, default 3):
  - Cup and handle (bullish): neckline = highest wick at cup's left rim; handle = higher low above cup bottom; trigger = boom boom candle off neckline/handle.
  - Inverse head and shoulders (bullish): three dips, middle lowest; target = top of the pattern.
  - Bull flag (bullish): run-up then short shallow pullback; trigger = break above flag high.
  - Double top (bearish): two peaks about equal; trigger = break below the dip between them.
  - Bear flag (bearish): mirror of bull flag.
  - Not in v1: gap and go, gap fill.
  - Pattern rules (decided). ATR = ATR(14) on the pattern's time frame, used ONLY as a tolerance ruler, never as a signal. All multipliers are settings. "Break" = candle CLOSE beyond the level.
    - Double top: peaks within 0.5 × ATR; dip between them ≥ 1.5 × ATR below the lower peak. Trigger = close below the dip. Target = dip − (avg peak − dip). Invalid on close above the higher peak.
    - Bull flag: pole rises ≥ 3 × ATR within ≤ 10 candles; flag = 2–8 candles, highs ≤ pole top, retraces ≤ 50% of the pole. Trigger = close above the flag high. Target = flag high + pole height. Bear flag mirrors.
    - Cup and handle: right rim within 0.5 × ATR of the neckline; cup depth ≥ 2 × ATR; cup ≥ 10 candles wide; handle low above the cup bottom AND in the upper half of the cup; handle ≤ 1/3 of cup width. Trigger = boom boom after the handle low that closes above the neckline OR launches from the handle (low inside the handle range, below the neckline). Target = neckline if the trigger closed below the neckline, neckline + cup depth if it closed above. Never show a target price has already reached.
    - Inverse head and shoulders: shoulders within 1 × ATR of each other; head ≥ 0.5 × ATR below the lower shoulder. Trigger = a bullish-labeled candle off the right shoulder (closes above the right-shoulder low, below the neckline). Target = top of the pattern = the higher of the two peaks between the dips.
    - Lifetime: search the last 150 candles; report a pattern while armed (complete, not triggered, not invalidated) or triggered within the last 3 candles. Drop it once price reaches the target.
    - Span: first to last key point must cover ≤ 5 trading days (setting) on every time frame. Patterns spanning overnight are allowed. The last 1h candle (15:30–16:00) is a normal candle.
    - Flag targets: first target = the nearest 13/48/200 EMA from the multi-time-frame table (15m, 30m, 1h, daily) that sits between the trigger level and the measured-move target; second target = the measured move. If no such EMA, the measured move is the only target. Never show a target between current price and the trigger, or one price has already passed.
    - Duplicates: one signal per ticker + pattern + direction. List every time frame it appears on; the smallest time frame is the trading chart for trigger and status.
- Candles (classify last 3 on the pattern's time frame):
  - Bullish: hammer, inverted hammer, boom boom (big green body, wicks < 10% of range, body > 1.5x 20-candle avg body), three green soldiers
  - Neutral: doji (body < 10% of range), spinning top → status WAIT
  - Bearish: red boom boom, hanging man (top of run-up), shooting star (top of run-up)
  - Candle bias must match pattern direction for READY; otherwise WATCH.
  - Decided definitions (L = run lookback, default 10, a setting):
    - Boom boom wicks: EACH wick < 10% of range. The 20-candle average body uses the 20 candles before it.
    - Top of run-up (hanging man, shooting star): candle's high is the highest high of the last L candles AND its close > the close L candles earlier.
    - Bottom of drop (hammer, inverted hammer): candle's low is the lowest low of the last L candles AND its close < the close L candles earlier.
    - A hammer/inverted-hammer shape anywhere else gets no label, no bias, and no effect on status (it does not cause WAIT). WAIT comes only from doji and spinning top.
    - Combining the last 3: newest candle doji/spinning top → neutral (WAIT). Otherwise bias = newest bullish/bearish label among the 3 (three green soldiers counts when the 3 qualify). No label → none (WATCH).
- Every signal MUST have a stock price target from its pattern. No target = no signal. Never project beyond the target.

## Part 2 — Pick the contract
- Long calls (bullish) and long puts (bearish) only. Spreads are an optional toggle, off by default, labeled "not part of the core method".
- Expiration: 3 to 30 days out. Default = nearest weekly Friday at least 3 days out (class example used that week's Friday; the gain-at-target theta check guards against fast decay). Flag earnings before expiration.
- Strike by budget: ask × 100 ≤ per-trade budget (default $500). NEVER recommend contracts priced under $0.50. Prefer ITM / near-the-money; no far OTM strikes.
- Delta grades:
  - ≥ 0.57 → A (preferred)
  - 0.30–0.56 → B (when A strikes exceed budget)
  - 0.28–0.29 → C, only with strong candle bias, high OI (default ≥ 1000), and price already moving the right way. Previous-day open interest is acceptable for OI checks.
  - < 0.28 → rejected, never shown
  - Contracts without greeks/IV are skipped: no delta grade, not shown.
  - Pick the highest-delta contract that fits the budget.
- Entry: contract ask in the bottom 25% of its day low–high range → AT ENTRY. Only when the contract's dayBarDate is the current session; otherwise status "no current range".
- Exit plan on every card: stock target, break-even (strike ± premium, info only — not a filter), profit markers +60% / +80% / +100%, estimated contract value at target (delta + gamma − 1 day theta, labeled "estimate"), and estimated gain % at T1.
- Contract rules (decided). All numbers are settings.
  - Spreads: deferred, not in v1.
  - Expiration: start with the nearest Friday ≥ 3 calendar days out (ET). If no contract passes all checks there, try each later Friday up to 30 days and use the first expiration where one passes. Show which expiration was used and why earlier ones were skipped. If a Friday is a market holiday, use that week's Thursday. The earnings flag applies to the expiration actually picked (any earnings date from today through expiration day).
  - Skip: missing delta, gamma, theta or IV; missing/zero ask; ask < $0.50; ask × 100 > budget; open interest < 100 (liquidity floor, all grades).
  - Grades use |delta| (puts too), contiguous bands: A ≥ 0.57; B 0.30 to < 0.57; C 0.28 to < 0.30; rejected < 0.28 (this is the "far OTM" rule).
  - Grade C only when ALL hold: newest candle is a power candle (boom boom or three green soldiers for calls; red boom boom for puts), the pattern has already triggered ("price moving the right way"), and OI ≥ 1000.
  - Gain-at-target check: the estimated contract value at T1 (delta-gamma estimate minus 1 day of theta) must be greater than the ask. Reason: the method sells at the target, usually the same day, and never holds to expiration. Break-even at expiration is shown on the card as info only.
  - Pick the highest |delta| that passes everything; ties → lower ask, then higher OI. If nothing passes on any allowed expiration, show "no contract fits" — never fall back to a worse contract.
  - Entry zone = day low to day low + 25% of (day high − day low). AT ENTRY when ask ≤ zone top and dayBarDate is the current session.
  - Estimate at target = ask + Δ·ΔS + ½Γ·ΔS² + 1 day of theta (theta is negative), floored at the option's intrinsic value at the target. ΔS = target − the delayed underlying price at option-quote time (latest delayed SIP 15m close), so it matches the 15-min-delayed ask/delta/gamma.
  - Every other "where is price now" check (T1 search, target reached, display) uses the Finnhub real-time quote. "No current range" uses no underlying price.

## Timing
- Liquid windows: 9:30–11:30 AM and 3:00–4:00 PM ET. Scan every 2 min inside them, every 10 min otherwise during market hours.
- Signals outside liquid windows get a "lower quality" badge. Market closed = read-only last results.
- Scanner rules (decided). All numbers are settings.
  - Market open/closed, holidays and half days come from Alpaca /v2/clock and /v2/calendar (read-only GET on the paper server; the only paper paths besides /v2/options/contracts — orders, positions and account stay blocked).
  - Half days: liquid windows = 9:30–11:30 plus the final hour before the early close. A 10-minute wait never skips past the start of a liquid window.
  - Status: WAIT = newest candle doji/spinning top. WATCH = pattern armed, or triggered but candle bias doesn't match. READY = triggered + bias matches. AT ENTRY = READY + contract ask in the entry zone (current session). No contract → status stands, card says "no contract fits".
  - "Lower quality" badge is decided by the trigger candle's close time; armed signals get no badge.
  - Market closed: read-only last results with a "market closed — last session" banner. If nothing is saved yet, run one scan of the last session at startup.
  - Grouping: one entry per ticker with its patterns under it; a contract shared by several patterns is shown once.
  - Rate limits: request queue per provider (Alpaca ≤ 180/min, Finnhub ≤ 55/min); candles cached (15m incremental, daily/expirations/earnings/open interest once per day).
  - History: log every signal from first seen, with every status change. Contract, entry ask and T1 are frozen when the trigger fires. Outcome = whichever comes first after the trigger: T1 hit = win, invalidation = loss; neither before expiration = expired. Never-triggered signals are logged as "never triggered" and left out of the hit rate.
  - Every triggered signal gets a stock outcome (win = T1 touched first, loss = invalidation close first, expired), even with no contract. With no contract, the deadline is the nearest Friday ≥ 3 days out at trigger time (the expiration the method would have tried first). Option gain % only when a contract was frozen.
  - History summary shows two hit rates: "pattern hit rate" (all triggered signals, stock outcome) and "tradeable hit rate" (signals with a frozen contract, plus their indicative option gain).
  - Scans while the market is closed are display-only: they never create, trigger, freeze or update history records. (Outcome tracking of already-triggered trades from market-hours bars still runs, e.g. the post-close pass and restart backfill.)
  - T1 hit = touch (1-min high ≥ T1 for calls, low ≤ T1 for puts). Invalidation = a close beyond the level on the trading chart. This slightly favors wins, because the method exits at the target.
  - Also record the lowest ask seen in the entry zone after the trigger. Exit quote = the first option snapshot whose quote time is at/after the hit; record bid and ask. Gain/loss % = (exit bid − entry ask) / entry ask, labeled indicative.
  - Missed time (server stopped / Mac slept): on restart, backfill outcomes for open triggered signals from 1-min bars between the last tracked time and now, in time order. If the exit snapshot moment was missed, record the outcome but mark the exit "exit quote missed" and leave gain % empty — never estimate it. Log each backfill in signal_events.
  - Database: server/data/scanner.db (git-ignored).

## UI and settings (decided)
- Pages: Signals (dashboard, grouped by ticker, AT ENTRY/READY first), ticker detail (chart + EMA table + contract card), History, Settings. Disclaimer on every page; market-closed banner when read-only.
- Theme follows the system (light/dark). One typeface (Archivo); ticker symbols in its expanded heavy cut.
- Dashboard layout follows design-mock.png (layout and style only; numbers always from real data): one rounded card per ticker; left column = company logo, ticker, price, "Open chart →"; middle = each pattern (▲/▼ name, time frame, status pill, one-line state, path strip with two-line labels, T1/T2); right panel per contract group = the full contract card, or "No contract fits" with the most common reasons and an "Every reason" dropdown. Patterns sharing a contract share one panel. Status dot: green open, gray closed. Ticker symbols bold, regular width.
- Company logos: Finnhub /stock/profile2 → image cached once per ET day in server/data/logos/ (git-ignored), served from /api/logo/:ticker (watchlist tickers only, https *.finnhub.io, image/*, ≤ 512 KB), through the Finnhub rate-limit queue. ETFs / no logo → rounded letter badge. The browser only talks to our server.
- Every signal shows a to-scale price path (invalidation, now, trigger, T1/T2) and every contract a day-range strip with the bottom-25% entry zone.
- Settings are saved server-side as numbered versions (each save lists what changed; "Reset to defaults" restores the CLAUDE.md defaults as a new version, after confirmation). The scanner reads them at the start of each scan, so changes apply from the next scan. Scanner timing and rate limits are not editable.
- Each signal is stamped with the settings version in force when first seen; History shows both hit rates for the current version and all time.
- A ticker removed from the watchlist: its armed signals end ("removed from watchlist"); triggered ones keep tracking their outcome.
- Charts: lightweight-charts v5, following .agents/skills/lightweight-charts. TradingView attribution stays on (`layout.attributionLogo: true`, required by its license). Data keeps real UTC timestamps; New York time is shown through `tickMarkFormatter` / `timeFormatter`, never by shifting timestamps.
- The API listens on 127.0.0.1 only (it has a settings write endpoint and no auth). Browser tests: `npm run test:e2e` (Playwright, a read-only API on a copy of the database; never touches server/data/scanner.db).

## Hard rules
- NEVER place, simulate, or route real orders.
- No auth, notifications, or AI-generated trade picks.
- Stop and ask before: adding a dependency not listed above, deleting files, or changing any rule in Part 1 / Part 2 / Timing.
- If an API returns different fields than assumed, or an endpoint is premium-only, stop and tell me.
- Build in phases and stop after each one for my OK. After each step output: ✅ [what was completed] + how to run/test it.
- UI must always show: "Educational screener based on a class method, not financial advice. Verify every quote in your broker before trading."
