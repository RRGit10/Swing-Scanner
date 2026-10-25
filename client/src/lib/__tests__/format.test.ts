import { describe, expect, it } from 'vitest';
import { contractName, etDateTime, etTime, money, patternLabel, pct, signedPct } from '../format';

describe('contractName', () => {
  it('formats an OCC symbol like "SPY 756P Oct 30"', () => {
    expect(contractName('SPY261030P00756000')).toBe('SPY 756P Oct 30');
    expect(contractName('NVDA261106C00212500')).toBe('NVDA 212.5C Nov 6');
    expect(contractName('BRK.B261120C00500000')).toBe('BRK.B 500C Nov 20');
  });

  it('returns the input when it is not an OCC symbol', () => {
    expect(contractName('SPY')).toBe('SPY');
  });
});

describe('numbers', () => {
  it('money, pct and signedPct', () => {
    expect(money(4.97)).toBe('4.97');
    expect(money(759.9712)).toBe('759.97');
    expect(money(null)).toBe('—');
    expect(pct(0.5833)).toBe('58%');
    expect(signedPct(45.2)).toBe('+45%');
    expect(signedPct(-12.6)).toBe('−13%');
    expect(signedPct(null)).toBe('—');
  });
});

describe('ET times', () => {
  const fri = Date.parse('2026-10-23T15:30:00-04:00') / 1000;
  it('etTime and etDateTime show New York time', () => {
    expect(etTime(fri)).toBe('15:30');
    expect(etDateTime(fri)).toBe('Fri Oct 23, 15:30');
    expect(etTime(null)).toBe('—');
  });
});

describe('patternLabel', () => {
  it('names patterns in plain words', () => {
    expect(patternLabel('inverse_head_and_shoulders')).toBe('Inverse head and shoulders');
    expect(patternLabel('bull_flag')).toBe('Bull flag');
  });
});
