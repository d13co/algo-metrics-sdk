import { describe, it, expect } from 'vitest';
import type { BlockRoundTimeAndTc } from '@d13co/algo-metrics-sdk';
import {
  getLatestRound,
  getAverageRoundTime,
  getTransactionsPerSecond,
  getTransactionCount,
  MAINNET_TC_OFFSET,
} from '../compute.js';

function block(rnd: number, ts = rnd, tc = rnd * 10): BlockRoundTimeAndTc {
  return { rnd: BigInt(rnd), ts, tc: BigInt(tc) };
}

describe('getLatestRound', () => {
  it('returns null for empty data', () => {
    expect(getLatestRound([])).toBeNull();
  });

  it('returns the last round number', () => {
    expect(getLatestRound([block(1), block(2), block(3)])).toBe(3n);
  });
});

describe('getAverageRoundTime', () => {
  it('returns null for fewer than 2 blocks', () => {
    expect(getAverageRoundTime([])).toBeNull();
    expect(getAverageRoundTime([block(1)])).toBeNull();
  });

  it('computes (last.ts - first.ts) / (length - 1)', () => {
    const data = [block(1, 100), block(2, 103), block(3, 106)];
    expect(getAverageRoundTime(data)).toBe(3);
  });

  it('handles non-uniform timestamps', () => {
    const data = [block(1, 0), block(2, 2), block(3, 10)];
    expect(getAverageRoundTime(data)).toBe(5);
  });
});

describe('getTransactionsPerSecond', () => {
  it('returns null for fewer than 2 blocks', () => {
    expect(getTransactionsPerSecond([])).toBeNull();
    expect(getTransactionsPerSecond([block(1)])).toBeNull();
  });

  it('returns null when time diff is zero', () => {
    const data = [block(1, 100, 10), block(2, 100, 20)];
    expect(getTransactionsPerSecond(data)).toBeNull();
  });

  it('computes (last.tc - first.tc) / (last.ts - first.ts)', () => {
    const data = [block(1, 0, 0), block(2, 10, 100)];
    expect(getTransactionsPerSecond(data)).toBe(10);
  });
});

describe('getTransactionCount', () => {
  it('returns null for empty data', () => {
    expect(getTransactionCount([], true)).toBeNull();
  });

  it('returns last tc for non-mainnet', () => {
    expect(getTransactionCount([block(1, 1, 500)], false)).toBe(500n);
  });

  it('adds MAINNET_TC_OFFSET for mainnet', () => {
    expect(getTransactionCount([block(1, 1, 500)], true)).toBe(500n + MAINNET_TC_OFFSET);
  });
});

describe('MAINNET_TC_OFFSET', () => {
  it('equals 563_279n', () => {
    expect(MAINNET_TC_OFFSET).toBe(563_279n);
  });
});
