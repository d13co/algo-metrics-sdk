import { useMemo } from 'react';
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
  return useMemo(() => (data ? getLatestRound(data) : null), [data]);
}

export function useAverageRoundTime(): number | null {
  const { data } = useAlgoMetricsContext();
  return useMemo(() => (data ? getAverageRoundTime(data) : null), [data]);
}

export function useTransactionsPerSecond(): number | null {
  const { data } = useAlgoMetricsContext();
  return useMemo(() => (data ? getTransactionsPerSecond(data) : null), [data]);
}

export function useTransactionCount(): bigint | null {
  const { data, isMainnet } = useAlgoMetricsContext();
  return useMemo(() => (data ? getTransactionCount(data, isMainnet) : null), [data, isMainnet]);
}

export function useBlockData(): BlockRoundTimeAndTc[] | null {
  const { data } = useAlgoMetricsContext();
  return data;
}
