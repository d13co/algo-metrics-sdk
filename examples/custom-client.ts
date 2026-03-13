import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { AlgoMetricsSDK } from '@d13co/algo-metrics-sdk';

// Use a custom AlgorandClient (e.g. TestNet)
const algorand = AlgorandClient.testNet();
const sdk = new AlgoMetricsSDK({ algorand });

const data = await sdk.getTsTc(50);
console.log(`Fetched ${data.length} blocks from TestNet`);
