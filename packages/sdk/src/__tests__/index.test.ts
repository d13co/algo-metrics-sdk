import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlockRoundTimeAndTc } from 'abel-ghost-sdk';
import { AlgoMetricsSDK } from '../index.js';

function block(rnd: number, ts = rnd, tc = rnd * 10): BlockRoundTimeAndTc {
  return { rnd: BigInt(rnd), ts, tc: BigInt(tc) };
}

function makeBlocks(first: number, last: number): BlockRoundTimeAndTc[] {
  const blocks: BlockRoundTimeAndTc[] = [];
  for (let i = first; i <= last; i++) {
    blocks.push(block(i));
  }
  return blocks;
}

function createMockAlgod(lastRound: bigint) {
  let currentRound = lastRound;
  const statusAfterBlockResolvers: Array<(v: { lastRound: bigint }) => void> = [];

  return {
    status: () => ({ do: vi.fn(async () => ({ lastRound: currentRound })) }),
    statusAfterBlock: (_round: number | bigint) => ({
      do: vi.fn(
        () =>
          new Promise<{ lastRound: bigint }>((resolve) => {
            statusAfterBlockResolvers.push(resolve);
          })
      ),
    }),
    block: (round: number | bigint) => ({
      headerOnly: (_v: boolean) => ({
        do: vi.fn(async () => ({
          block: {
            header: {
              round: BigInt(round),
              timestamp: BigInt(Number(round)),
              txnCounter: BigInt(Number(round) * 10),
            },
          },
        })),
      }),
    }),
    // Test helper: resolve the pending statusAfterBlock call
    _resolveNextBlock: () => {
      currentRound = currentRound + 1n;
      const resolver = statusAfterBlockResolvers.shift();
      resolver?.({ lastRound: currentRound });
    },
  };
}

function createMockSDK(lastRound: bigint) {
  const algod = createMockAlgod(lastRound);

  const mockAlgorand = {
    client: { algod },
  };

  const mockAbelGhostSDK = {
    algorand: mockAlgorand,
    getBlockTimesAndTc: vi.fn(async (first: number | bigint, last: number | bigint) => {
      return makeBlocks(Number(first), Number(last));
    }),
  };

  const sdk = new AlgoMetricsSDK({
    abelGhostSDK: mockAbelGhostSDK as never,
  });

  return { sdk, mockAbelGhostSDK, algod };
}

describe('AlgoMetricsSDK', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('accepts abelGhostSDK option and derives algorand', () => {
      const { sdk, mockAbelGhostSDK } = createMockSDK(1000n);
      expect(sdk.abelGhostSDK).toBe(mockAbelGhostSDK);
      expect(sdk.algorand).toBe(mockAbelGhostSDK.algorand);
    });
  });

  describe('getTsTc', () => {
    it('fetches block data for the given range', async () => {
      const { sdk, mockAbelGhostSDK } = createMockSDK(1000n);
      const result = await sdk.getTsTc(100);

      expect(mockAbelGhostSDK.getBlockTimesAndTc).toHaveBeenCalledWith(900n, 1000n);
      expect(result).toHaveLength(101);
      expect(result[0]!.rnd).toBe(900n);
      expect(result[result.length - 1]!.rnd).toBe(1000n);
    });

    it('uses default blockRange of 1000', async () => {
      const { sdk, mockAbelGhostSDK } = createMockSDK(2000n);
      await sdk.getTsTc();

      expect(mockAbelGhostSDK.getBlockTimesAndTc).toHaveBeenCalledWith(1000n, 2000n);
    });

    it('throws if blockRange > 1000', async () => {
      const { sdk } = createMockSDK(1000n);
      await expect(sdk.getTsTc(1001)).rejects.toThrow('blockRange must be <= 1000');
    });
  });

  describe('registerTsTcWatcher / unregisterTsTcWatcher', () => {
    it('throws if blockRange > 1000', async () => {
      const { sdk } = createMockSDK(1000n);
      await expect(sdk.registerTsTcWatcher(vi.fn(), 1001)).rejects.toThrow(
        'blockRange must be <= 1000'
      );
    });

    it('starts watcher loop and delivers initial data', async () => {
      const { sdk } = createMockSDK(100n);
      const received: BlockRoundTimeAndTc[][] = [];
      const callback = vi.fn((data: BlockRoundTimeAndTc[]) => {
        received.push(data);
      });

      await sdk.registerTsTcWatcher(callback, 10);

      // Allow the async watcherLoop init to complete
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      expect(received[0]!.length).toBe(10);
      expect(received[0]![0]!.rnd).toBe(91n);

      sdk.unregisterTsTcWatcher(callback);
    });

    it('delivers new block data on each block', async () => {
      const { sdk, algod } = createMockSDK(100n);
      const calls: BlockRoundTimeAndTc[][] = [];
      const callback = vi.fn((data: BlockRoundTimeAndTc[]) => {
        calls.push([...data]);
      });

      await sdk.registerTsTcWatcher(callback, 5);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      const initCallCount = callback.mock.calls.length;

      // Simulate next block
      algod._resolveNextBlock();

      await vi.waitFor(() => {
        expect(callback.mock.calls.length).toBeGreaterThan(initCallCount);
      });

      const lastCall = calls[calls.length - 1]!;
      expect(lastCall[lastCall.length - 1]!.rnd).toBe(101n);

      sdk.unregisterTsTcWatcher(callback);
    });

    it('defends against callback errors', async () => {
      const { sdk } = createMockSDK(100n);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badCallback = vi.fn(() => {
        throw new Error('callback boom');
      });

      await sdk.registerTsTcWatcher(badCallback, 5);

      await vi.waitFor(() => {
        expect(badCallback).toHaveBeenCalled();
      });

      expect(errorSpy).toHaveBeenCalledWith(
        'AlgoMetricsSDK watcher callback error:',
        expect.any(Error)
      );

      sdk.unregisterTsTcWatcher(badCallback);
      errorSpy.mockRestore();
    });

    it('re-register after unregister backfills cache properly', async () => {
      const { sdk, algod, mockAbelGhostSDK } = createMockSDK(100n);
      const callback = vi.fn();

      // Register with blockRange=5, wait for init
      await sdk.registerTsTcWatcher(callback, 5);
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      // Unregister — loop needs to exit
      sdk.unregisterTsTcWatcher(callback);

      // Resolve the pending statusAfterBlock so the loop can see watchers.size === 0 and exit
      algod._resolveNextBlock(); // currentRound → 101

      // Wait for loop to fully exit
      await new Promise((r) => setTimeout(r, 50));

      // Advance 2 more blocks while no watcher is active
      algod._resolveNextBlock(); // currentRound → 102
      algod._resolveNextBlock(); // currentRound → 103

      // Reset mock tracking
      callback.mockClear();
      mockAbelGhostSDK.getBlockTimesAndTc.mockClear();

      // Re-register with a larger blockRange — should backfill including missed blocks
      await sdk.registerTsTcWatcher(callback, 20);
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      // Verify backfill was called to cover the larger range
      expect(mockAbelGhostSDK.getBlockTimesAndTc).toHaveBeenCalled();

      // Callback should have received 20 blocks
      const received = callback.mock.calls[0]![0] as BlockRoundTimeAndTc[];
      expect(received).toHaveLength(20);

      // currentRound is now 103 (100 + 3 advances)
      const lastRnd = received[received.length - 1]!.rnd;
      expect(lastRnd).toBe(103n);

      const firstRnd = received[0]!.rnd;
      expect(firstRnd).toBe(84n);

      sdk.unregisterTsTcWatcher(callback);
    });

    it('re-register with same blockRange backfills missed blocks', async () => {
      const { sdk, algod, mockAbelGhostSDK } = createMockSDK(100n);
      const callback = vi.fn();

      // Register with blockRange=10, wait for init
      await sdk.registerTsTcWatcher(callback, 10);
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      // Capture initial data
      const initData = callback.mock.calls[0]![0] as BlockRoundTimeAndTc[];
      const initLastRnd = initData[initData.length - 1]!.rnd;
      expect(initLastRnd).toBe(100n);

      // Unregister and let the loop exit
      sdk.unregisterTsTcWatcher(callback);
      algod._resolveNextBlock(); // currentRound → 101, unblocks loop to exit
      await new Promise((r) => setTimeout(r, 50));

      // Advance 2 more blocks while no watcher is active
      algod._resolveNextBlock(); // currentRound → 102
      algod._resolveNextBlock(); // currentRound → 103

      callback.mockClear();
      mockAbelGhostSDK.getBlockTimesAndTc.mockClear();

      // Re-register with the same blockRange
      await sdk.registerTsTcWatcher(callback, 10);
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      // Backfill should have been called to cover the new range
      expect(mockAbelGhostSDK.getBlockTimesAndTc).toHaveBeenCalled();

      const received = callback.mock.calls[0]![0] as BlockRoundTimeAndTc[];
      expect(received).toHaveLength(10);

      // Window should have slid forward to include the missed blocks
      expect(received[received.length - 1]!.rnd).toBe(103n);
      expect(received[0]!.rnd).toBe(94n);

      sdk.unregisterTsTcWatcher(callback);
    });

    it('unregister removes callback', async () => {
      const { sdk } = createMockSDK(100n);
      const callback = vi.fn();

      await sdk.registerTsTcWatcher(callback, 5);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      sdk.unregisterTsTcWatcher(callback);
      const countAfterUnregister = callback.mock.calls.length;

      // Wait a tick to confirm no more calls
      await new Promise((r) => setTimeout(r, 50));
      expect(callback.mock.calls.length).toBe(countAfterUnregister);
    });
  });
});
