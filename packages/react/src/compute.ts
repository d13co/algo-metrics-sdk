import type { BlockRoundTimeAndTc } from '@d13co/algo-metrics-sdk';

export const MAINNET_TC_OFFSET = 563_279n;

export function getLatestRound(data: BlockRoundTimeAndTc[]): bigint | null {
  if (data.length === 0) return null;
  return data[data.length - 1]!.rnd;
}

export function getAverageRoundTime(data: BlockRoundTimeAndTc[]): number | null {
  if (data.length < 2) return null;
  const first = data[0]!;
  const last = data[data.length - 1]!;
  return (last.ts - first.ts) / (data.length - 1);
}

export function getTransactionsPerSecond(data: BlockRoundTimeAndTc[]): number | null {
  if (data.length < 2) return null;
  const first = data[0]!;
  const last = data[data.length - 1]!;
  const timeDiff = last.ts - first.ts;
  if (timeDiff === 0) return null;
  return Number(last.tc - first.tc) / timeDiff;
}

export function getTransactionCount(
  data: BlockRoundTimeAndTc[],
  isMainnet: boolean
): bigint | null {
  if (data.length === 0) return null;
  const lastTc = data[data.length - 1]!.tc;
  return isMainnet ? lastTc + MAINNET_TC_OFFSET : lastTc;
}
