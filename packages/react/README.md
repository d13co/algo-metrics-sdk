# @d13co/algo-metrics-react

[![npm version](https://img.shields.io/npm/v/@d13co/algo-metrics-react)](https://www.npmjs.com/package/@d13co/algo-metrics-react)

React hooks for [@d13co/algo-metrics-sdk](https://www.npmjs.com/package/@d13co/algo-metrics-sdk). Wraps the SDK with a single shared watcher callback so multiple components can consume live Algorand block metrics without duplicate network calls.

## Installation

```bash
pnpm add @d13co/algo-metrics-react @d13co/algo-metrics-sdk
```

React 18 or 19 is required as a peer dependency.

## Quick Start

Wrap your app with `AlgoMetricsProvider`, then use hooks anywhere inside:

```tsx
import { AlgoMetricsProvider, useLatestRound, useTransactionsPerSecond } from '@d13co/algo-metrics-react';

function App() {
  return (
    <AlgoMetricsProvider>
      <Dashboard />
    </AlgoMetricsProvider>
  );
}

function Dashboard() {
  const round = useLatestRound();
  const tps = useTransactionsPerSecond();

  return (
    <div>
      <p>Latest round: {round?.toString() ?? '–'}</p>
      <p>TPS: {tps?.toFixed(1) ?? '–'}</p>
    </div>
  );
}
```

## Provider

### `<AlgoMetricsProvider>`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `options` | `AlgoMetricsSDKOptions` | `{}` | Options forwarded to `new AlgoMetricsSDK(options)` |
| `sdk` | `AlgoMetricsSDK` | — | Use an existing SDK instance instead of creating one |
| `isMainnet` | `boolean` | `true` | Whether to apply the mainnet transaction count offset |
| `children` | `ReactNode` | — | — |

The provider registers a single watcher callback on mount and unregisters on unmount. All hooks derive their values from the shared block data via context.

## Hooks

### `useLatestRound(): bigint | null`

Returns the most recent block round number, or `null` while loading.

### `useAverageRoundTime(): number | null`

Returns the average time between blocks in seconds, computed as `(last.ts - first.ts) / (blockCount - 1)`.

### `useTransactionsPerSecond(): number | null`

Returns the current transactions per second, computed as `(last.tc - first.tc) / (last.ts - first.ts)`.

### `useTransactionCount(): bigint | null`

Returns the cumulative transaction count. Adds `563,279` on mainnet to account for the genesis offset.

### `useBlockData(): BlockRoundTimeAndTc[] | null`

Returns the raw block data array from the provider.

### `useAlgoMetricsContext(): AlgoMetricsContextValue`

Returns the full context value: `{ data, isLoading, sdk, isMainnet }`.

## Pure Functions

The compute functions are also exported for use outside of React:

```ts
import { getLatestRound, getAverageRoundTime, getTransactionsPerSecond, getTransactionCount, MAINNET_TC_OFFSET } from '@d13co/algo-metrics-react';
```

## Custom Algorand Client

```tsx
import { AlgorandClient } from '@algorandfoundation/algokit-utils';

<AlgoMetricsProvider options={{ algorand: AlgorandClient.testNet() }} isMainnet={false}>
  {children}
</AlgoMetricsProvider>
```

## License

MIT
