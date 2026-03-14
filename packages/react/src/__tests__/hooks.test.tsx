import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { BlockRoundTimeAndTc, TsTcWatcherCallback, AlgoMetricsSDK } from '@d13co/algo-metrics-sdk';
import { AlgoMetricsProvider } from '../context.js';
import {
  useLatestRound,
  useAverageRoundTime,
  useTransactionsPerSecond,
  useTransactionCount,
  useBlockData,
  useAlgoMetricsContext,
} from '../index.js';
import { MAINNET_TC_OFFSET } from '../compute.js';

function block(rnd: number, ts = rnd, tc = rnd * 10): BlockRoundTimeAndTc {
  return { rnd: BigInt(rnd), ts, tc: BigInt(tc) };
}

const testBlocks = [block(1, 100, 1000), block(2, 103, 1050), block(3, 106, 1100)];

interface MockSDK {
  registerTsTcWatcher: ReturnType<typeof vi.fn>;
  unregisterTsTcWatcher: ReturnType<typeof vi.fn>;
}

function createMockSDK() {
  let capturedCallback: TsTcWatcherCallback | null = null;

  const mock: MockSDK = {
    registerTsTcWatcher: vi.fn(async (cb: TsTcWatcherCallback) => {
      capturedCallback = cb;
    }),
    unregisterTsTcWatcher: vi.fn(),
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

function createWrapper(sdk: AlgoMetricsSDK, isMainnet = true) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AlgoMetricsProvider sdk={sdk} isMainnet={isMainnet}>
        {children}
      </AlgoMetricsProvider>
    );
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

    expect(mock.registerTsTcWatcher).toHaveBeenCalledOnce();
    unmount();
    expect(mock.unregisterTsTcWatcher).toHaveBeenCalledOnce();
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

  it('applies mainnet offset when isMainnet is true', () => {
    const { sdk, emitBlocks } = createMockSDK();
    const { result } = renderHook(() => useTransactionCount(), {
      wrapper: createWrapper(sdk, true),
    });
    emitBlocks(testBlocks);
    expect(result.current).toBe(1100n + MAINNET_TC_OFFSET);
  });

  it('does not apply offset when isMainnet is false', () => {
    const { sdk, emitBlocks } = createMockSDK();
    const { result } = renderHook(() => useTransactionCount(), {
      wrapper: createWrapper(sdk, false),
    });
    emitBlocks(testBlocks);
    expect(result.current).toBe(1100n);
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
