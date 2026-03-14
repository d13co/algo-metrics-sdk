import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { AbelGhostSDK } from 'abel-ghost-sdk';
import type { BlockRoundTimeAndTc } from 'abel-ghost-sdk';
import type { modelsv2 } from 'algosdk';
import { delay, mergeIntoCache, MAX_BLOCK_RANGE, ERROR_RETRY_DELAY_MS } from './utils.js';

export type { BlockRoundTimeAndTc } from 'abel-ghost-sdk';

export type TsTcWatcherSimpleCallback = (data: BlockRoundTimeAndTc[]) => void;
export type TsTcWatcherBlockCallback = (
  data: BlockRoundTimeAndTc[],
  lastBlock: modelsv2.BlockResponse
) => void;
export type TsTcWatcherCallback = TsTcWatcherSimpleCallback | TsTcWatcherBlockCallback;

export type RegisterWatcherOptions =
  | { numBlocks?: number; includeBlock?: false }
  | { numBlocks?: number; includeBlock: true };

export type AlgoMetricsSDKOptions =
  | { abelGhostSDK: AbelGhostSDK }
  | { algorand?: AlgorandClient; ghostAppId?: bigint };

interface WatcherEntry {
  numBlocks: number;
  includeBlock: boolean;
}

/**
 * Provides a sliding window of Algorand block timestamps and transaction counters.
 *
 * Supports one-shot fetches via {@link getTsTc} and live streaming via
 * {@link register}/{@link unregister}.
 */
export class AlgoMetricsSDK {
  /** The Algorand client used for network calls. */
  public algorand: AlgorandClient;
  /** The Abel Ghost SDK instance used to fetch block data in bulk. */
  public abelGhostSDK: AbelGhostSDK;

  private cache: BlockRoundTimeAndTc[] = [];
  private watchers: Map<TsTcWatcherCallback, WatcherEntry> = new Map();
  private watcherLoopRunning = false;

  /**
   * @param options - Either an existing `abelGhostSDK` instance, or
   *   `algorand` (defaults to MainNet) and `ghostAppId` (defaults to `3381542955n`)
   *   to construct one internally.
   */
  constructor(options: AlgoMetricsSDKOptions = {}) {
    if ('abelGhostSDK' in options) {
      this.abelGhostSDK = options.abelGhostSDK;
      this.algorand = options.abelGhostSDK.algorand;
    } else {
      this.algorand = options.algorand ?? AlgorandClient.mainNet();
      this.abelGhostSDK = new AbelGhostSDK({
        algorand: this.algorand,
        ghostAppId: options.ghostAppId ?? 3381542955n,
      });
    }
  }

  /**
   * Fetches block timestamps and transaction counters for the most recent `blockRange` blocks.
   * Does not update the internal cache.
   *
   * @param blockRange - Number of blocks to fetch (max 1000).
   * @returns Array of block round, timestamp, and transaction counter data.
   * @throws If `blockRange` exceeds 1000.
   */
  async getTsTc(blockRange = MAX_BLOCK_RANGE): Promise<BlockRoundTimeAndTc[]> {
    if (blockRange > MAX_BLOCK_RANGE) {
      throw new Error(`blockRange must be <= ${MAX_BLOCK_RANGE}`);
    }
    const { lastRound } = await this.algorand.client.algod.status().do();
    return this.abelGhostSDK.getBlockTimesAndTc(lastRound - BigInt(blockRange), lastRound);
  }

  /**
   * Registers a callback that receives a sliding window of block data on every new block.
   * The callback is invoked immediately with current data, then again each time a new block arrives.
   * Starts the internal watcher loop if not already running.
   *
   * @param callback - Receives block data. With `includeBlock: true`, also receives the full block response.
   * @param options - Configuration for the watcher.
   * @param options.numBlocks - Size of the sliding window (max 1000, default 1000).
   * @param options.includeBlock - When true, the callback receives the full `BlockResponse` as a second argument on each new block.
   * @throws If `numBlocks` exceeds 1000.
   */
  async register(
    callback: TsTcWatcherSimpleCallback,
    options?: { numBlocks?: number; includeBlock?: false }
  ): Promise<void>;
  async register(
    callback: TsTcWatcherBlockCallback,
    options: { numBlocks?: number; includeBlock: true }
  ): Promise<void>;
  async register(
    callback: TsTcWatcherCallback,
    options: RegisterWatcherOptions = {}
  ): Promise<void> {
    const { numBlocks = MAX_BLOCK_RANGE, includeBlock = false } = options;
    if (numBlocks > MAX_BLOCK_RANGE) {
      throw new Error(`numBlocks must be <= ${MAX_BLOCK_RANGE}`);
    }
    this.watchers.set(callback, { numBlocks, includeBlock });

    // Cache freshness is guaranteed by two paths:
    // 1. Loop not running: startWatcherLoop → watcherLoop init backfills from algod
    // 2. Loop running: cache is kept current by the loop appending each new block
    if (!this.watcherLoopRunning) {
      this.startWatcherLoop();
      return;
    }

    // Loop already running — backfill if cache has fewer entries than requested
    if (numBlocks > this.cache.length) {
      const { lastRound } = await this.algorand.client.algod.status().do();
      const firstRound = lastRound - BigInt(numBlocks);
      const backfill = await this.abelGhostSDK.getBlockTimesAndTc(firstRound, lastRound);
      this.cache = mergeIntoCache(this.cache, backfill);
      if (this.cache.length > MAX_BLOCK_RANGE) {
        this.cache = this.cache.slice(-MAX_BLOCK_RANGE);
      }
    }

    if (this.cache.length > 0) {
      try {
        (callback as TsTcWatcherSimpleCallback)(this.cache.slice(-numBlocks));
      } catch (err) {
        console.error('AlgoMetricsSDK watcher callback error:', err);
      }
    }
  }

  /**
   * Unregisters a previously registered watcher callback.
   * Stops the watcher loop when no callbacks remain.
   *
   * @param callback - The same function reference passed to {@link register}.
   */
  unregister(callback: TsTcWatcherCallback): void {
    this.watchers.delete(callback);
  }

  private startWatcherLoop(): void {
    this.watcherLoopRunning = true;
    void this.watcherLoop();
  }

  private async watcherLoop(): Promise<void> {
    try {
      // Init phase: backfill cache
      const maxRange = Math.max(...Array.from(this.watchers.values()).map((w) => w.numBlocks));
      const { lastRound } = await this.algorand.client.algod.status().do();
      const firstRound = lastRound - BigInt(maxRange);

      if (this.cache.length === 0) {
        this.cache = await this.abelGhostSDK.getBlockTimesAndTc(firstRound, lastRound);
      } else {
        const cacheFirstRnd = this.cache[0]!.rnd;

        const cacheLastRnd = this.cache[this.cache.length - 1]!.rnd;

        if (firstRound < cacheFirstRnd || lastRound > cacheLastRnd) {
          const fetchFirst = firstRound < cacheFirstRnd ? firstRound : cacheLastRnd + 1n;
          const fetchLast = lastRound > cacheLastRnd ? lastRound : cacheFirstRnd - 1n;
          if (fetchFirst <= fetchLast) {
            const backfill = await this.abelGhostSDK.getBlockTimesAndTc(fetchFirst, fetchLast);
            this.cache = mergeIntoCache(this.cache, backfill);
          }
        }
      }

      if (this.cache.length > MAX_BLOCK_RANGE) {
        this.cache = this.cache.slice(-MAX_BLOCK_RANGE);
      }

      this.deliverToWatchers();

      let latestRound = lastRound;

      // Main loop
      while (this.watchers.size > 0) {
        try {
          const status = await this.algorand.client.algod.statusAfterBlock(latestRound).do();
          const newRound = status.lastRound;

          if (this.watchers.size === 0) break;

          const needsBlock = [...this.watchers.values()].some((w) => w.includeBlock);
          const blockResp = await this.algorand.client.algod
            .block(newRound)
            .headerOnly(!needsBlock)
            .do();

          this.cache.push({
            rnd: blockResp.block.header.round,
            ts: Number(blockResp.block.header.timestamp),
            tc: blockResp.block.header.txnCounter,
          });

          if (this.cache.length > MAX_BLOCK_RANGE) {
            this.cache = this.cache.slice(-MAX_BLOCK_RANGE);
          }

          this.deliverToWatchers(blockResp);
          latestRound = newRound;
        } catch (err) {
          console.error('AlgoMetricsSDK watcherLoop error:', err);
          if (this.watchers.size === 0) break;
          await delay(ERROR_RETRY_DELAY_MS);
        }
      }
    } catch (err) {
      console.error('AlgoMetricsSDK watcherLoop init error:', err);
    }

    this.watcherLoopRunning = false;
  }

  private deliverToWatchers(lastBlock?: modelsv2.BlockResponse): void {
    for (const [callback, entry] of this.watchers) {
      try {
        const slice = this.cache.slice(-entry.numBlocks);
        if (entry.includeBlock && lastBlock) {
          (callback as TsTcWatcherBlockCallback)(slice, lastBlock);
        } else {
          (callback as TsTcWatcherSimpleCallback)(slice);
        }
      } catch (err) {
        console.error('AlgoMetricsSDK watcher callback error:', err);
      }
    }
  }
}
