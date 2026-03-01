import type { TokenizationIframeConfig } from '@/libs/IQPro';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';
import { useTokenExIframe } from './useTokenExIframe';

// Mock iframe instance
const mockIframeInstance = {
  load: vi.fn(),
  tokenize: vi.fn(),
  remove: vi.fn(),
  on: vi.fn(),
};

// Mock TokenEx global — use mockImplementation for constructor (new) calls
const mockTokenExGlobal = {
  Iframe: vi.fn().mockImplementation(() => mockIframeInstance),
};

const mockConfig: TokenizationIframeConfig = {
  origin: 'https://example.com',
  tokenizationId: 'test-tokenization-id',
  tokenScheme: 'test-scheme',
  authenticationKey: 'test-auth-key',
  timestamp: '2024-01-01T00:00:00Z',
  iframeScriptUrl: 'https://sandbox.api.basyspro.com/Iframe/iframe/iframe-v3.js',
};

describe('useTokenExIframe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish mock implementation after clearAllMocks
    mockTokenExGlobal.Iframe.mockImplementation(() => mockIframeInstance);
    // Set up TokenEx global
    (window as unknown as { TokenEx?: typeof mockTokenExGlobal }).TokenEx = mockTokenExGlobal;
  });

  afterEach(() => {
    delete (window as unknown as { TokenEx?: typeof mockTokenExGlobal }).TokenEx;
  });

  it('returns default state when config is null', async () => {
    const { result } = await renderHook(() =>
      useTokenExIframe({ containerId: 'test-container', config: null }),
    );

    expect(result.current.isLoaded).toBe(false);
    expect(result.current.isValid).toBe(false);
    expect(result.current.isCvvValid).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not initialize iframe when config is null', async () => {
    await renderHook(() =>
      useTokenExIframe({ containerId: 'test-container', config: null }),
    );

    expect(mockTokenExGlobal.Iframe).not.toHaveBeenCalled();
  });

  it('initializes iframe without CVV when cvvContainerId is not provided', async () => {
    const container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    await renderHook(() =>
      useTokenExIframe({ containerId: 'test-container', config: mockConfig }),
    );

    expect(mockTokenExGlobal.Iframe).toHaveBeenCalledWith(
      'test-container',
      expect.objectContaining({
        cvv: false,
        cvvContainerID: '',
        pci: true,
      }),
    );

    document.body.removeChild(container);
  });

  it('initializes iframe with CVV when cvvContainerId is provided', async () => {
    const container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    await renderHook(() =>
      useTokenExIframe({
        containerId: 'test-container',
        cvvContainerId: 'cvv-container',
        config: mockConfig,
      }),
    );

    expect(mockTokenExGlobal.Iframe).toHaveBeenCalledWith(
      'test-container',
      expect.objectContaining({
        cvv: true,
        cvvContainerID: 'cvv-container',
        cvvInputType: 'text',
        cvvPlaceholder: '123',
        enableValidateOnCvvKeyUp: true,
        pci: true,
      }),
    );

    document.body.removeChild(container);
  });

  it('includes CVV styles when cvvContainerId is provided', async () => {
    const container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    await renderHook(() =>
      useTokenExIframe({
        containerId: 'test-container',
        cvvContainerId: 'cvv-container',
        config: mockConfig,
      }),
    );

    const configArg = mockTokenExGlobal.Iframe.mock.calls[0]![1] as Record<string, unknown>;
    const styles = configArg.styles as { cvv?: { base: string } };

    expect(styles.cvv).toBeDefined();
    expect(styles.cvv!.base).toContain('font-family');

    document.body.removeChild(container);
  });

  it('does not initialize when container element is missing', async () => {
    await renderHook(() =>
      useTokenExIframe({ containerId: 'nonexistent-container', config: mockConfig }),
    );

    expect(mockTokenExGlobal.Iframe).not.toHaveBeenCalled();
  });

  it('applies dark theme colors', async () => {
    const container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    await renderHook(() =>
      useTokenExIframe({
        containerId: 'test-container',
        config: mockConfig,
        theme: 'dark',
      }),
    );

    const configArg = mockTokenExGlobal.Iframe.mock.calls[0]![1] as Record<string, unknown>;
    const styles = configArg.styles as { base: string };

    expect(styles.base).toContain('#fafafa');
    expect(styles.base).toContain('#262626');

    document.body.removeChild(container);
  });

  it('applies light theme colors by default', async () => {
    const container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    await renderHook(() =>
      useTokenExIframe({
        containerId: 'test-container',
        config: mockConfig,
      }),
    );

    const configArg = mockTokenExGlobal.Iframe.mock.calls[0]![1] as Record<string, unknown>;
    const styles = configArg.styles as { base: string };

    expect(styles.base).toContain('#000000');
    expect(styles.base).toContain('#ffffff');

    document.body.removeChild(container);
  });

  it('rejects tokenize when iframe is not initialized', async () => {
    const { result } = await renderHook(() =>
      useTokenExIframe({ containerId: 'test-container', config: null }),
    );

    await expect(result.current.tokenize()).rejects.toThrow('TokenEx iframe not initialized');
  });

  it('applies dark theme colors to CVV styles when cvvContainerId is provided', async () => {
    const container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    await renderHook(() =>
      useTokenExIframe({
        containerId: 'test-container',
        cvvContainerId: 'cvv-container',
        config: mockConfig,
        theme: 'dark',
      }),
    );

    const configArg = mockTokenExGlobal.Iframe.mock.calls[0]![1] as Record<string, unknown>;
    const styles = configArg.styles as { cvv?: { base: string } };

    expect(styles.cvv!.base).toContain('#fafafa');
    expect(styles.cvv!.base).toContain('#262626');

    document.body.removeChild(container);
  });
});
