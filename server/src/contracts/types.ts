import type { OptionContract } from '../providers/types.js';
import type { Liquidity } from './liquidity.js';

export interface ContractSettings {
  /** per-trade budget in dollars: ask × 100 must not exceed it */
  budget: number;
  /** never recommend a contract priced under this */
  minPremium: number;
  minDte: number;
  maxDte: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  /** liquidity floor for every grade */
  minOpenInterest: number;
  gradeCMinOpenInterest: number;
  /** AT ENTRY when ask is in the bottom this-fraction of the day range */
  entryZoneFraction: number;
  /** profit markers as fractions of the entry premium */
  profitMarkers: number[];
  /** days of theta subtracted in the estimate at target (the method sells at the target, usually same day) */
  thetaDays: number;
}

export const DEFAULT_CONTRACT_SETTINGS: ContractSettings = {
  budget: 500,
  minPremium: 0.5,
  minDte: 3,
  maxDte: 30,
  gradeA: 0.57,
  gradeB: 0.3,
  gradeC: 0.28,
  minOpenInterest: 100,
  gradeCMinOpenInterest: 1000,
  entryZoneFraction: 0.25,
  profitMarkers: [0.6, 0.8, 1.0],
  thetaDays: 1,
};

export type Grade = 'A' | 'B' | 'C';

export type EntryStatusName = 'AT ENTRY' | 'ABOVE ENTRY ZONE' | 'NO CURRENT RANGE';

export interface EntryStatus {
  zone: { low: number; high: number } | null;
  status: EntryStatusName;
}

export interface ExitTarget {
  label: string;
  stockPrice: number;
  /** delta + gamma − theta estimate of the contract at the stock target — always shown as "estimate" */
  estimate: number;
  estimateChangePct: number;
}

export interface ExitPlan {
  /** at expiration — info only, not a filter */
  breakEven: number;
  markers: { pct: number; price: number }[];
  targets: ExitTarget[];
}

export interface SkippedExpiration {
  expiration: string;
  reason: string;
}

export interface ContractPick {
  kind: 'pick';
  contract: OptionContract;
  grade: Grade;
  /** what the OI floor and grade C checks used (OI, or previous-session volume when OI is stale) */
  liquidity: Liquidity;
  expiration: string;
  dte: number;
  entry: EntryStatus;
  exitPlan: ExitPlan;
  /** earnings date between today and the picked expiration, if any */
  earningsDate: string | null;
  skippedExpirations: SkippedExpiration[];
}

export interface NoContract {
  kind: 'none';
  reason: string;
  skippedExpirations: SkippedExpiration[];
}

export type ContractResult = ContractPick | NoContract;
