import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';

const tokenExSpy = vi.fn();
const squareSpy = vi.fn();

const tokenExReturn = {
  isLoaded: true,
  isValid: true,
  isCvvValid: false,
  error: null as string | null,
  tokenize: vi.fn(),
};
const squareReturn = {
  isLoaded: true,
  isValid: true,
  error: null as string | null,
  tokenize: vi.fn(),
};

vi.mock('@/hooks/useTokenExIframe', () => ({
  useTokenExIframe: (opts: unknown) => {
    tokenExSpy(opts);
    return tokenExReturn;
  },
}));
vi.mock('@/hooks/useSquareCard', () => ({
  useSquareCard: (opts: unknown) => {
    squareSpy(opts);
    return squareReturn;
  },
}));

const { useCardTokenizer } = await import('./useCardTokenizer');

const iqproConfig = {
  provider: 'iqpro',
  iqpro: {
    origin: 'https://example.com',
    tokenizationId: 'tid',
    tokenScheme: 'scheme',
    authenticationKey: 'key',
    timestamp: 'ts',
    iframeScriptUrl: 'https://sandbox.api.basyspro.com/iframe.js',
  },
} as const;

const squareConfig = {
  provider: 'square',
  square: { applicationId: 'sq-app', locationId: 'L1', environment: 'sandbox' },
} as const;

describe('useCardTokenizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes an IQPro config to the TokenEx hook and reports the split layout', async () => {
    const { result } = await renderHook(() =>
      useCardTokenizer({ containerId: 'pan', cvvContainerId: 'cvv', config: iqproConfig }));

    expect(result.current.layout).toBe('split');
    expect(result.current.provider).toBe('iqpro');
    // Passthrough: isCvvValid is TokenEx's own, not derived.
    expect(result.current.isCvvValid).toBe(false);
  });

  it('routes a Square config to the Square hook and reports the unified layout', async () => {
    const { result } = await renderHook(() =>
      useCardTokenizer({ containerId: 'card', config: squareConfig }));

    expect(result.current.layout).toBe('unified');
    expect(result.current.provider).toBe('square');
  });

  it('mirrors isCvvValid onto isValid for Square, whose one widget owns the CVV', async () => {
    squareReturn.isValid = true;
    const { result: ok } = await renderHook(() =>
      useCardTokenizer({ containerId: 'card', config: squareConfig }));

    expect(ok.current.isCvvValid).toBe(true);

    // Mirroring (not a hardcoded true) is what keeps the existing
    // `useIframe ? iframeCvvValid : ...` checks truthful.
    squareReturn.isValid = false;
    const { result: bad } = await renderHook(() =>
      useCardTokenizer({ containerId: 'card', config: squareConfig }));

    expect(bad.current.isCvvValid).toBe(false);

    squareReturn.isValid = true;
  });

  it('passes config: null to the hook that is NOT selected', async () => {
    // The rules-of-hooks safety property: both hooks run every render, so the
    // idle one must be inert or it would inject a second SDK and mount a
    // second widget.
    await renderHook(() => useCardTokenizer({ containerId: 'card', config: squareConfig }));

    expect(squareSpy).toHaveBeenCalledWith(expect.objectContaining({ config: squareConfig.square }));
    expect(tokenExSpy).toHaveBeenCalledWith(expect.objectContaining({ config: null }));

    vi.clearAllMocks();
    await renderHook(() => useCardTokenizer({ containerId: 'pan', config: iqproConfig }));

    expect(tokenExSpy).toHaveBeenCalledWith(expect.objectContaining({ config: iqproConfig.iqpro }));
    expect(squareSpy).toHaveBeenCalledWith(expect.objectContaining({ config: null }));
  });

  it('no-ops both hooks and reports no provider when there is no config', async () => {
    const { result } = await renderHook(() => useCardTokenizer({ containerId: 'pan', config: null }));

    expect(result.current.provider).toBeNull();
    expect(result.current.layout).toBe('split');
    expect(tokenExSpy).toHaveBeenCalledWith(expect.objectContaining({ config: null }));
    expect(squareSpy).toHaveBeenCalledWith(expect.objectContaining({ config: null }));
  });
});
