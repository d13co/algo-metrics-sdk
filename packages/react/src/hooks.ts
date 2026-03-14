import type { BlockRoundTimeAndTc } from '@d13co/algo-metrics-sdk';
import { useAlgoMetricsContext } from './context.js';
import {
  getLatestRound,
  getAverageRoundTime,
  getTransactionsPerSecond,
  getTransactionCount,
} from './compute.js';

export function useLatestRound(): bigint | null {
  const { data } = useAlgoMetricsContext();
  return data ? getLatestRound(data) : null;
}

export function useAverageRoundTime(): number | null {
  const { data } = useAlgoMetricsContext();
  return data ? getAverageRoundTime(data) : null;
}

export function useTransactionsPerSecond(): number | null {
  const { data } = useAlgoMetricsContext();
  return data ? getTransactionsPerSecond(data) : null;
}

export function useTransactionCount(): bigint | null {
  const { data, isMainnet } = useAlgoMetricsContext();
  return data ? getTransactionCount(data, isMainnet) : null;
}

export function useBlockData(): BlockRoundTimeAndTc[] | null {
  const { data } = useAlgoMetricsContext();
  return data;
}
