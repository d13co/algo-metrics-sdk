import type { BlockRoundTimeAndTc } from 'abel-ghost-sdk';

export const MAX_BLOCK_RANGE = 1000;
export const ERROR_RETRY_DELAY_MS = 1000;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mergeIntoCache(
  cache: BlockRoundTimeAndTc[],
  newData: BlockRoundTimeAndTc[]
): BlockRoundTimeAndTc[] {
  const byRound = new Map<bigint, BlockRoundTimeAndTc>();
  for (const entry of cache) {
    byRound.set(entry.rnd, entry);
  }
  for (const entry of newData) {
    byRound.set(entry.rnd, entry);
  }
  return Array.from(byRound.values()).sort((a, b) => (a.rnd < b.rnd ? -1 : a.rnd > b.rnd ? 1 : 0));
}
