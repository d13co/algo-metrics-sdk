import type {
  BlockRoundTimeAndTc,
  AlgoMetricsSDK,
  AlgoMetricsSDKOptions,
} from '@d13co/algo-metrics-sdk';

export interface AlgoMetricsContextValue {
  data: BlockRoundTimeAndTc[] | null;
  isLoading: boolean;
  sdk: AlgoMetricsSDK;
  isMainnet: boolean;
}

export interface AlgoMetricsProviderProps {
  options?: AlgoMetricsSDKOptions;
  sdk?: AlgoMetricsSDK;
  children: React.ReactNode;
}
