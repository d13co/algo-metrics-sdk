import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AlgoMetricsSDK } from '@d13co/algo-metrics-sdk';
import type { BlockRoundTimeAndTc } from '@d13co/algo-metrics-sdk';
import type { AlgoMetricsContextValue, AlgoMetricsProviderProps } from './types.js';
import { isMainnetGenesisHash } from './compute.js';

const AlgoMetricsContext = createContext<AlgoMetricsContextValue | null>(null);

export function AlgoMetricsProvider({
  options,
  sdk: externalSdk,
  children,
}: AlgoMetricsProviderProps): React.JSX.Element {
  const sdk = useMemo(() => externalSdk ?? new AlgoMetricsSDK(options), [externalSdk, options]);

  const [data, setData] = useState<BlockRoundTimeAndTc[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMainnet, setIsMainnet] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async (): Promise<void> => {
      try {
        const params = await sdk.algorand.client.algod.getTransactionParams().do();
        if (!controller.signal.aborted) {
          setIsMainnet(isMainnetGenesisHash(params.genesisHash));
        }
      } catch {
        // detection failed — keep default (true)
      }
    })();

    return (): void => {
      controller.abort();
    };
  }, [sdk]);

  useEffect(() => {
    const callback = (blocks: BlockRoundTimeAndTc[]): void => {
      setData(blocks);
      setIsLoading(false);
    };

    void sdk.registerTsTcWatcher(callback, { numBlocks: 1000 });

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
