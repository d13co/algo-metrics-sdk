import { AlgoMetricsSDK, type BlockRoundTimeAndTc } from '@d13co/algo-metrics-sdk';

const numBlocks = Number(process.argv[2]) || 200;

const sdk = new AlgoMetricsSDK();

// Called immediately with current data, then on every new block
function onBlockData(blocks: BlockRoundTimeAndTc[]): void {
  if (blocks.length < 2) return;

  const first = blocks[0]!;
  const last = blocks[blocks.length - 1]!;

  const totalTime = last.ts - first.ts;
  const totalTxns = Number(last.tc - first.tc);
  const avgTps = (totalTxns / totalTime).toFixed(2);
  const avgRoundTime = (totalTime / (blocks.length - 1)).toFixed(2);

  console.log(`[${blocks.length} blocks] round ${last.rnd} | avg TPS: ${avgTps} | avg round time: ${avgRoundTime}s`);
}

// Watch a sliding window of numBlocks blocks
await sdk.registerTsTcWatcher(onBlockData, { numBlocks });

// Unregister after 30 seconds
setTimeout(() => {
  sdk.unregisterTsTcWatcher(onBlockData);
  console.log('Watcher stopped');
}, 30_000);
