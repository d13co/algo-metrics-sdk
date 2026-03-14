import { describe, it, expect } from 'vitest';
import { mergeIntoCache, delay, MAX_BLOCK_RANGE, ERROR_RETRY_DELAY_MS } from '../utils.js';
import type { BlockRoundTimeAndTc } from 'abel-ghost-sdk';

function block(rnd: number, ts = rnd, tc = rnd * 10): BlockRoundTimeAndTc {
  return { rnd: BigInt(rnd), ts, tc: BigInt(tc) };
}

describe('constants', () => {
  it('MAX_BLOCK_RANGE is 1000', () => {
    expect(MAX_BLOCK_RANGE).toBe(1000);
  });

  it('ERROR_RETRY_DELAY_MS is 1000', () => {
    expect(ERROR_RETRY_DELAY_MS).toBe(1000);
  });
});

describe('delay', () => {
  it('resolves after given ms', async () => {
    const start = Date.now();
    await delay(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe('mergeIntoCache', () => {
  it('merges two non-overlapping arrays sorted by rnd', () => {
    const a = [block(3), block(5)];
    const b = [block(1), block(4)];
    const result = mergeIntoCache(a, b);
    expect(result.map((r) => Number(r.rnd))).toEqual([1, 3, 4, 5]);
  });

  it('deduplicates by rnd, new data wins', () => {
    const cache = [block(1, 100, 1000)];
    const newData = [block(1, 200, 2000)];
    const result = mergeIntoCache(cache, newData);
    expect(result).toHaveLength(1);
    expect(result[0]!.ts).toBe(200);
    expect(result[0]!.tc).toBe(2000n);
  });

  it('returns empty array when both inputs are empty', () => {
    expect(mergeIntoCache([], [])).toEqual([]);
  });

  it('returns sorted copy when one input is empty', () => {
    const data = [block(3), block(1)];
    expect(mergeIntoCache(data, []).map((r) => Number(r.rnd))).toEqual([1, 3]);
    expect(mergeIntoCache([], data).map((r) => Number(r.rnd))).toEqual([1, 3]);
  });
});
