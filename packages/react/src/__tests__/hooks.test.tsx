import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type {
  BlockRoundTimeAndTc,
  TsTcWatcherSimpleCallback,
  AlgoMetricsSDK,
} from '@d13co/algo-metrics-sdk';
import { AlgoMetricsProvider } from '../context.js';
import {
  useLatestRound,
  useAverageRoundTime,
  useTransactionsPerSecond,
  useTransactionCount,
  useBlockData,
  useAlgoMetricsContext,
} from '../index.js';
import { MAINNET_TC_OFFSET, MAINNET_GENESIS_HASH } from '../compute.js';

const TESTNET_GENESIS_HASH = 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=';

function b64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function block(rnd: number, ts = rnd, tc = rnd * 10): BlockRoundTimeAndTc {
  return { rnd: BigInt(rnd), ts, tc: BigInt(tc) };
}

const testBlocks = [block(1, 100, 1000), block(2, 103, 1050), block(3, 106, 1100)];

interface MockSDK {
  register: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
  algorand: {
    client: {
      algod: {
        getTransactionParams: ReturnType<typeof vi.fn>;
      };
    };
  };
}

function createMockSDK(genesisHashB64 = MAINNET_GENESIS_HASH) {
  let capturedCallback: TsTcWatcherSimpleCallback | null = null;

  const mock: MockSDK = {
    register: vi.fn(async (cb: TsTcWatcherSimpleCallback) => {
      capturedCallback = cb;
    }),
    unregister: vi.fn(),
    algorand: {
      client: {
        algod: {
          getTransactionParams: vi.fn(() => ({
            do: vi.fn(async () => ({
              genesisHash: b64ToUint8Array(genesisHashB64),
            })),
          })),
        },
      },
    },
  };

  return {
    sdk: mock as unknown as AlgoMetricsSDK,
    mock,
    emitBlocks: (blocks: BlockRoundTimeAndTc[]) => {
      act(() => {
        capturedCallback?.(blocks);
      });
    },
  };
}

function createWrapper(sdk: AlgoMetricsSDK) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <AlgoMetricsProvider sdk={sdk}>{children}</AlgoMetricsProvider>;
  };
}

describe('AlgoMetricsProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers watcher on mount and unregisters on unmount', () => {
    const { sdk, mock } = createMockSDK();
    const { unmount } = renderHook(() => useAlgoMetricsContext(), {
      wrapper: createWrapper(sdk),
    });

    expect(mock.register).toHaveBeenCalledOnce();
    unmount();
    expect(mock.unregister).toHaveBeenCalledOnce();
  });

  it('starts in loading state with null data', () => {
    const { sdk } = createMockSDK();
    const { result } = renderHook(() => useAlgoMetricsContext(), {
      wrapper: createWrapper(sdk),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('updates data when callback fires', () => {
    const { sdk, emitBlocks } = createMockSDK();
    const { result } = renderHook(() => useAlgoMetricsContext(), {
      wrapper: createWrapper(sdk),
    });

    emitBlocks(testBlocks);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual(testBlocks);
  });

  it('auto-detects mainnet from genesis hash', async () => {
    const { sdk, emitBlocks } = createMockSDK(MAINNET_GENESIS_HASH);
    const { result } = renderHook(() => useAlgoMetricsContext(), {
      wrapper: createWrapper(sdk),
    });

    emitBlocks(testBlocks);

    await vi.waitFor(() => {
      expect(result.current.isMainnet).toBe(true);
    });
  });

  it('auto-detects non-mainnet from genesis hash', async () => {
    const { sdk, emitBlocks } = createMockSDK(TESTNET_GENESIS_HASH);
    const { result } = renderHook(() => useAlgoMetricsContext(), {
      wrapper: createWrapper(sdk),
    });

    emitBlocks(testBlocks);

    await vi.waitFor(() => {
      expect(result.current.isMainnet).toBe(false);
    });
  });
});

describe('useLatestRound', () => {
  it('returns null before data arrives', () => {
    const { sdk } = createMockSDK();
    const { result } = renderHook(() => useLatestRound(), {
      wrapper: createWrapper(sdk),
    });
    expect(result.current).toBeNull();
  });

  it('returns the latest round', () => {
    const { sdk, emitBlocks } = createMockSDK();
    const { result } = renderHook(() => useLatestRound(), {
      wrapper: createWrapper(sdk),
    });
    emitBlocks(testBlocks);
    expect(result.current).toBe(3n);
  });
});

describe('useAverageRoundTime', () => {
  it('returns null before data arrives', () => {
    const { sdk } = createMockSDK();
    const { result } = renderHook(() => useAverageRoundTime(), {
      wrapper: createWrapper(sdk),
    });
    expect(result.current).toBeNull();
  });

  it('computes average round time', () => {
    const { sdk, emitBlocks } = createMockSDK();
    const { result } = renderHook(() => useAverageRoundTime(), {
      wrapper: createWrapper(sdk),
    });
    emitBlocks(testBlocks);
    expect(result.current).toBe(3);
  });
});

describe('useTransactionsPerSecond', () => {
  it('returns null before data arrives', () => {
    const { sdk } = createMockSDK();
    const { result } = renderHook(() => useTransactionsPerSecond(), {
      wrapper: createWrapper(sdk),
    });
    expect(result.current).toBeNull();
  });

  it('computes TPS', () => {
    const { sdk, emitBlocks } = createMockSDK();
    const { result } = renderHook(() => useTransactionsPerSecond(), {
      wrapper: createWrapper(sdk),
    });
    // tc diff = 1100 - 1000 = 100, ts diff = 106 - 100 = 6
    emitBlocks(testBlocks);
    expect(result.current).toBeCloseTo(100 / 6);
  });
});

describe('useTransactionCount', () => {
  it('returns null before data arrives', () => {
    const { sdk } = createMockSDK();
    const { result } = renderHook(() => useTransactionCount(), {
      wrapper: createWrapper(sdk),
    });
    expect(result.current).toBeNull();
  });

  it('applies mainnet offset when connected to mainnet', async () => {
    const { sdk, emitBlocks } = createMockSDK(MAINNET_GENESIS_HASH);
    const { result } = renderHook(() => useTransactionCount(), {
      wrapper: createWrapper(sdk),
    });
    emitBlocks(testBlocks);

    await vi.waitFor(() => {
      expect(result.current).toBe(1100n + MAINNET_TC_OFFSET);
    });
  });

  it('does not apply offset when connected to testnet', async () => {
    const { sdk, emitBlocks } = createMockSDK(TESTNET_GENESIS_HASH);
    const { result } = renderHook(() => useTransactionCount(), {
      wrapper: createWrapper(sdk),
    });
    emitBlocks(testBlocks);

    await vi.waitFor(() => {
      expect(result.current).toBe(1100n);
    });
  });
});

describe('useBlockData', () => {
  it('returns null before data arrives', () => {
    const { sdk } = createMockSDK();
    const { result } = renderHook(() => useBlockData(), {
      wrapper: createWrapper(sdk),
    });
    expect(result.current).toBeNull();
  });

  it('returns raw block data', () => {
    const { sdk, emitBlocks } = createMockSDK();
    const { result } = renderHook(() => useBlockData(), {
      wrapper: createWrapper(sdk),
    });
    emitBlocks(testBlocks);
    expect(result.current).toEqual(testBlocks);
  });
});

describe('useAlgoMetricsContext', () => {
  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useAlgoMetricsContext());
    }).toThrow('useAlgoMetricsContext must be used within an AlgoMetricsProvider');
  });
});
