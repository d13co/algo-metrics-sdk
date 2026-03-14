import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AlgoMetricsSDK } from '@d13co/algo-metrics-sdk';
import type { BlockRoundTimeAndTc } from '@d13co/algo-metrics-sdk';
import type { AlgoMetricsContextValue, AlgoMetricsProviderProps } from './types.js';

const AlgoMetricsContext = createContext<AlgoMetricsContextValue | null>(null);

export function AlgoMetricsProvider({
  options,
  sdk: externalSdk,
  isMainnet = true,
  children,
}: AlgoMetricsProviderProps): React.JSX.Element {
  const sdk = useMemo(
    () => externalSdk ?? new AlgoMetricsSDK(options),
    [externalSdk, options]
  );

  const [data, setData] = useState<BlockRoundTimeAndTc[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const callback = (blocks: BlockRoundTimeAndTc[]): void => {
      setData(blocks);
      setIsLoading(false);
    };

    void sdk.registerTsTcWatcher(callback, 1000);

    return (): void => {
      sdk.unregisterTsTcWatcher(callback);
    };
  }, [sdk]);

  const value = useMemo(
    (): AlgoMetricsContextValue => ({ data, isLoading, sdk, isMainnet }),
    [data, isLoading, sdk, isMainnet]
  );

  return <AlgoMetricsContext value={value}>{children}</AlgoMetricsContext>;
}

export function useAlgoMetricsContext(): AlgoMetricsContextValue {
  const context = useContext(AlgoMetricsContext);
  if (context === null) {
    throw new Error('useAlgoMetricsContext must be used within an AlgoMetricsProvider');
  }
  return context;
}
