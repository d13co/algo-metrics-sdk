import { AlgoMetricsSDK } from '@d13co/algo-metrics-sdk';

// Use defaults: MainNet, ghostAppId 3381542955n
const sdk = new AlgoMetricsSDK();

// Fetch the last 100 blocks of timestamps and transaction counters
const data = await sdk.getTsTc(100);

for (const block of data) {
  console.log(`Round ${block.rnd}: ts=${block.ts} tc=${block.tc}`);
}
