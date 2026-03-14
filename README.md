# algo-metrics-sdk

Monorepo for Algorand block metrics — a TypeScript SDK and React hooks for fetching block timestamps and transaction counters, powered by [Abel Ghost SDK](https://www.npmjs.com/package/abel-ghost-sdk).

## Packages

| Package | Version | Description |
| --- | --- | --- |
| [`@d13co/algo-metrics-sdk`](./packages/sdk) | [![npm](https://img.shields.io/npm/v/@d13co/algo-metrics-sdk)](https://www.npmjs.com/package/@d13co/algo-metrics-sdk) | Core SDK — one-shot queries and live sliding-window watchers |
| [`@d13co/algo-metrics-react`](./packages/react) | [![npm](https://img.shields.io/npm/v/@d13co/algo-metrics-react)](https://www.npmjs.com/package/@d13co/algo-metrics-react) | React hooks wrapping the SDK with a single shared watcher |

## Quick Start

### SDK

```bash
pnpm add @d13co/algo-metrics-sdk
```

```ts
import { AlgoMetricsSDK } from '@d13co/algo-metrics-sdk';

const sdk = new AlgoMetricsSDK();

// One-shot fetch of the last 100 blocks
const data = await sdk.getTsTc(100);

for (const block of data) {
  console.log(`Round ${block.rnd}: ts=${block.ts} tc=${block.tc}`);
}
```

### React

```bash
pnpm add @d13co/algo-metrics-react @d13co/algo-metrics-sdk
```

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

See each package's README for full API docs.

## Development

This is a pnpm workspace monorepo.

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
```

## License

MIT
