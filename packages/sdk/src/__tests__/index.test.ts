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
  const headerOnlyCalls: boolean[] = [];

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
      headerOnly: (v: boolean) => {
        headerOnlyCalls.push(v);
        return {
          do: vi.fn(async () => ({
            block: {
              header: {
                round: BigInt(round),
                timestamp: BigInt(Number(round)),
                txnCounter: BigInt(Number(round) * 10),
              },
              payset: [],
            },
          })),
        };
      },
    }),
    // Test helpers
    _resolveNextBlock: () => {
      currentRound = currentRound + 1n;
      const resolver = statusAfterBlockResolvers.shift();
      resolver?.({ lastRound: currentRound });
    },
    _headerOnlyCalls: headerOnlyCalls,
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

  describe('register / unregister', () => {
    it('throws if numBlocks > 1000', async () => {
      const { sdk } = createMockSDK(1000n);
      await expect(sdk.register(vi.fn(), { numBlocks: 1001 })).rejects.toThrow(
        'numBlocks must be <= 1000'
      );
    });

    it('starts watcher loop and delivers initial data', async () => {
      const { sdk } = createMockSDK(100n);
      const received: BlockRoundTimeAndTc[][] = [];
      const callback = vi.fn((data: BlockRoundTimeAndTc[]) => {
        received.push(data);
      });

      await sdk.register(callback, { numBlocks: 10 });

      // Allow the async watcherLoop init to complete
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      expect(received[0]!.length).toBe(10);
      expect(received[0]![0]!.rnd).toBe(91n);

      sdk.unregister(callback);
    });

    it('delivers new block data on each block', async () => {
      const { sdk, algod } = createMockSDK(100n);
      const calls: BlockRoundTimeAndTc[][] = [];
      const callback = vi.fn((data: BlockRoundTimeAndTc[]) => {
        calls.push([...data]);
      });

      await sdk.register(callback, { numBlocks: 5 });

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

      sdk.unregister(callback);
    });

    it('defends against callback errors', async () => {
      const { sdk } = createMockSDK(100n);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badCallback = vi.fn(() => {
        throw new Error('callback boom');
      });

      await sdk.register(badCallback, { numBlocks: 5 });

      await vi.waitFor(() => {
        expect(badCallback).toHaveBeenCalled();
      });

      expect(errorSpy).toHaveBeenCalledWith(
        'AlgoMetricsSDK watcher callback error:',
        expect.any(Error)
      );

      sdk.unregister(badCallback);
      errorSpy.mockRestore();
    });

    it('re-register after unregister backfills cache properly', async () => {
      const { sdk, algod, mockAbelGhostSDK } = createMockSDK(100n);
      const callback = vi.fn();

      // Register with numBlocks=5, wait for init
      await sdk.register(callback, { numBlocks: 5 });
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      // Unregister — loop needs to exit
      sdk.unregister(callback);

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

      // Re-register with a larger numBlocks — should backfill including missed blocks
      await sdk.register(callback, { numBlocks: 20 });
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

      sdk.unregister(callback);
    });

    it('re-register with same numBlocks backfills missed blocks', async () => {
      const { sdk, algod, mockAbelGhostSDK } = createMockSDK(100n);
      const callback = vi.fn();

      // Register with numBlocks=10, wait for init
      await sdk.register(callback, { numBlocks: 10 });
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      // Capture initial data
      const initData = callback.mock.calls[0]![0] as BlockRoundTimeAndTc[];
      const initLastRnd = initData[initData.length - 1]!.rnd;
      expect(initLastRnd).toBe(100n);

      // Unregister and let the loop exit
      sdk.unregister(callback);
      algod._resolveNextBlock(); // currentRound → 101, unblocks loop to exit
      await new Promise((r) => setTimeout(r, 50));

      // Advance 2 more blocks while no watcher is active
      algod._resolveNextBlock(); // currentRound → 102
      algod._resolveNextBlock(); // currentRound → 103

      callback.mockClear();
      mockAbelGhostSDK.getBlockTimesAndTc.mockClear();

      // Re-register with the same numBlocks
      await sdk.register(callback, { numBlocks: 10 });
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

      sdk.unregister(callback);
    });

    it('unregister removes callback', async () => {
      const { sdk } = createMockSDK(100n);
      const callback = vi.fn();

      await sdk.register(callback, { numBlocks: 5 });

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      sdk.unregister(callback);
      const countAfterUnregister = callback.mock.calls.length;

      // Wait a tick to confirm no more calls
      await new Promise((r) => setTimeout(r, 50));
      expect(callback.mock.calls.length).toBe(countAfterUnregister);
    });
  });

  describe('includeBlock option', () => {
    it('fetches with headerOnly(true) when no watcher needs blocks', async () => {
      const { sdk, algod } = createMockSDK(100n);
      const callback = vi.fn();

      await sdk.register(callback, { numBlocks: 5 });
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      algod._resolveNextBlock();
      await vi.waitFor(() => {
        expect(callback.mock.calls.length).toBeGreaterThan(1);
      });

      expect(algod._headerOnlyCalls[0]).toBe(true);

      sdk.unregister(callback);
    });

    it('fetches with headerOnly(false) when a watcher needs blocks', async () => {
      const { sdk, algod } = createMockSDK(100n);
      const callback = vi.fn();

      await sdk.register(callback, { numBlocks: 5, includeBlock: true });
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      algod._resolveNextBlock();
      await vi.waitFor(() => {
        expect(callback.mock.calls.length).toBeGreaterThan(1);
      });

      expect(algod._headerOnlyCalls[0]).toBe(false);

      sdk.unregister(callback);
    });

    it('delivers block response to includeBlock watchers on new blocks', async () => {
      const { sdk, algod } = createMockSDK(100n);
      const callback = vi.fn();

      await sdk.register(callback, { numBlocks: 5, includeBlock: true });
      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalled();
      });

      // Initial delivery should NOT include a block
      expect(callback.mock.calls[0]).toHaveLength(1);

      algod._resolveNextBlock();
      await vi.waitFor(() => {
        expect(callback.mock.calls.length).toBeGreaterThan(1);
      });

      // Loop delivery SHOULD include the block response
      const loopCall = callback.mock.calls[callback.mock.calls.length - 1]!;
      expect(loopCall).toHaveLength(2);
      const blockResp = loopCall[1] as { block: { header: { round: bigint } } };
      expect(blockResp.block.header.round).toBe(101n);

      sdk.unregister(callback);
    });

    it('does not deliver block to simple watchers even when block is fetched', async () => {
      const { sdk, algod } = createMockSDK(100n);
      const simpleCallback = vi.fn();
      const blockCallback = vi.fn();

      await sdk.register(simpleCallback, { numBlocks: 5 });
      await sdk.register(blockCallback, { numBlocks: 5, includeBlock: true });

      await vi.waitFor(() => {
        expect(simpleCallback).toHaveBeenCalled();
        expect(blockCallback).toHaveBeenCalled();
      });

      algod._resolveNextBlock();
      await vi.waitFor(() => {
        expect(simpleCallback.mock.calls.length).toBeGreaterThan(1);
      });

      // Simple watcher: only gets data
      const simpleCall = simpleCallback.mock.calls[simpleCallback.mock.calls.length - 1]!;
      expect(simpleCall).toHaveLength(1);

      // Block watcher: gets data + block
      const blockCall = blockCallback.mock.calls[blockCallback.mock.calls.length - 1]!;
      expect(blockCall).toHaveLength(2);

      // Both fetched with headerOnly(false) since block watcher is present
      expect(algod._headerOnlyCalls[0]).toBe(false);

      sdk.unregister(simpleCallback);
      sdk.unregister(blockCallback);
    });
  });
});
