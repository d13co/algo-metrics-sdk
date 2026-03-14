# @d13co/algo-metrics-sdk

[![npm version](https://img.shields.io/npm/v/@d13co/algo-metrics-sdk)](https://www.npmjs.com/package/@d13co/algo-metrics-sdk)

TypeScript SDK for fetching Algorand block timestamps and transaction counters. Provides one-shot queries and live sliding-window watchers powered by [Abel Ghost SDK](https://www.npmjs.com/package/abel-ghost-sdk).

## Installation

```bash
pnpm add @d13co/algo-metrics-sdk
```

## Quick Start

### One-shot fetch

```ts
import { AlgoMetricsSDK } from '@d13co/algo-metrics-sdk';

const sdk = new AlgoMetricsSDK();

// Fetch the last 100 blocks
const data = await sdk.getTsTc(100);

for (const block of data) {
  console.log(`Round ${block.rnd}: ts=${block.ts} tc=${block.tc}`);
}
```

### Live watcher

```ts
import { AlgoMetricsSDK, type BlockRoundTimeAndTc } from '@d13co/algo-metrics-sdk';

const sdk = new AlgoMetricsSDK();

function onBlockData(blocks: BlockRoundTimeAndTc[]): void {
  const last = blocks[blocks.length - 1]!;
  console.log(`Latest round: ${last.rnd}`);
}

// Stream a sliding window of the last 200 blocks
await sdk.registerTsTcWatcher(onBlockData, { numBlocks: 200 });

// Stop watching when done
sdk.unregisterTsTcWatcher(onBlockData);
```

### Custom Algorand client

```ts
import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { AlgoMetricsSDK } from '@d13co/algo-metrics-sdk';

const algorand = AlgorandClient.testNet();
const sdk = new AlgoMetricsSDK({ algorand });
```

## API

### `new AlgoMetricsSDK(options?)`

| Option | Type | Description |
| --- | --- | --- |
| `abelGhostSDK` | `AbelGhostSDK` | Use an existing Abel Ghost SDK instance |
| `algorand` | `AlgorandClient` | Algorand client (defaults to MainNet) |
| `ghostAppId` | `bigint` | Ghost app ID (defaults to `3381542955n` for Mainnet). Optional but recommended for performance. |

Pass either `{ abelGhostSDK }`, `{ algorand?, ghostAppId? }`, or nothing to use MainNet defaults.

### `sdk.getTsTc(blockRange?: number): Promise<BlockRoundTimeAndTc[]>`

Fetches block timestamps and transaction counters for the most recent `blockRange` blocks (default and max: 1000).

### `sdk.registerTsTcWatcher(callback, options?): Promise<void>`

Registers a callback that receives a sliding window of block data on every new block. The callback fires immediately with current data, then again as each new block arrives.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `numBlocks` | `number` | `1000` | Size of the sliding window (max 1000) |
| `includeBlock` | `boolean` | `false` | When `true`, the callback receives the full `BlockResponse` as a second argument on each new block |

When `includeBlock` is `true`, the callback type must be `(data, lastBlock) => void`. The initial delivery on registration does not include a block.

### `sdk.unregisterTsTcWatcher(callback): void`

Removes a previously registered watcher. The internal loop stops when no watchers remain.

### `BlockRoundTimeAndTc`

```ts
{
  rnd: bigint;  // block round
  ts: number;   // block timestamp (seconds)
  tc: bigint;   // cumulative transaction counter
}
```

## License

MIT
