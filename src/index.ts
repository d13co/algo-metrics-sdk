import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { AbelGhostSDK } from 'abel-ghost-sdk';
import type { BlockRoundTimeAndTc } from 'abel-ghost-sdk';
import { delay, mergeIntoCache, MAX_BLOCK_RANGE, ERROR_RETRY_DELAY_MS } from './utils.js';

export type { BlockRoundTimeAndTc } from 'abel-ghost-sdk';

export type TsTcWatcherCallback = (data: BlockRoundTimeAndTc[]) => void;

export type AlgoMetricsSDKOptions =
  | { abelGhostSDK: AbelGhostSDK }
  | { algorand?: AlgorandClient; ghostAppId?: bigint };

/**
 * Provides a sliding window of Algorand block timestamps and transaction counters.
 *
 * Supports one-shot fetches via {@link getTsTc} and live streaming via
 * {@link registerTsTcWatcher}/{@link unregisterTsTcWatcher}.
 */
export class AlgoMetricsSDK {
  /** The Algorand client used for network calls. */
  public algorand: AlgorandClient;
  /** The Abel Ghost SDK instance used to fetch block data in bulk. */
  public abelGhostSDK: AbelGhostSDK;

  private cache: BlockRoundTimeAndTc[] = [];
  private watchers: Map<TsTcWatcherCallback, number> = new Map();
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
   * @param callback - Receives an array of `BlockRoundTimeAndTc` for the most recent `blockRange` blocks.
   * @param blockRange - Size of the sliding window (max 1000).
   * @throws If `blockRange` exceeds 1000.
   */
  async registerTsTcWatcher(
    callback: TsTcWatcherCallback,
    blockRange = MAX_BLOCK_RANGE
  ): Promise<void> {
    if (blockRange > MAX_BLOCK_RANGE) {
      throw new Error(`blockRange must be <= ${MAX_BLOCK_RANGE}`);
    }
    this.watchers.set(callback, blockRange);

    // Cache freshness is guaranteed by two paths:
    // 1. Loop not running: startWatcherLoop → watcherLoop init backfills from algod
    // 2. Loop running: cache is kept current by the loop appending each new block
    if (!this.watcherLoopRunning) {
      this.startWatcherLoop();
      return;
    }

    // Loop already running — backfill if cache has fewer entries than requested
    if (blockRange > this.cache.length) {
      const { lastRound } = await this.algorand.client.algod.status().do();
      const firstRound = lastRound - BigInt(blockRange);
      const backfill = await this.abelGhostSDK.getBlockTimesAndTc(firstRound, lastRound);
      this.cache = mergeIntoCache(this.cache, backfill);
      if (this.cache.length > MAX_BLOCK_RANGE) {
        this.cache = this.cache.slice(-MAX_BLOCK_RANGE);
      }
    }

    if (this.cache.length > 0) {
      try {
        callback(this.cache.slice(-blockRange));
      } catch (err) {
        console.error('AlgoMetricsSDK watcher callback error:', err);
      }
    }
  }

  /**
   * Unregisters a previously registered watcher callback.
   * Stops the watcher loop when no callbacks remain.
   *
   * @param callback - The same function reference passed to {@link registerTsTcWatcher}.
   */
  unregisterTsTcWatcher(callback: TsTcWatcherCallback): void {
    this.watchers.delete(callback);
  }

  private startWatcherLoop(): void {
    this.watcherLoopRunning = true;
    void this.watcherLoop();
  }

  private async watcherLoop(): Promise<void> {
    try {
      // Init phase: backfill cache
      const maxRange = Math.max(...Array.from(this.watchers.values()));
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

          const blockResp = await this.algorand.client.algod.block(newRound).headerOnly(true).do();

          this.cache.push({
            rnd: blockResp.block.header.round,
            ts: Number(blockResp.block.header.timestamp),
            tc: blockResp.block.header.txnCounter,
          });

          if (this.cache.length > MAX_BLOCK_RANGE) {
            this.cache = this.cache.slice(-MAX_BLOCK_RANGE);
          }

          this.deliverToWatchers();
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

  private deliverToWatchers(): void {
    for (const [callback, blockRange] of this.watchers) {
      try {
        callback(this.cache.slice(-blockRange));
      } catch (err) {
        console.error('AlgoMetricsSDK watcher callback error:', err);
      }
    }
  }
}
