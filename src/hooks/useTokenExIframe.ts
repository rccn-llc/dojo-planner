'use client';

import type { TokenizationIframeConfig } from '@/libs/IQPro';

import { useCallback, useEffect, useRef, useState } from 'react';

// Shape of the TokenEx global injected by the iframe script
type TokenExGlobal = {
  Iframe: new (containerId: string, config: Record<string, unknown>) => TokenExIframeInstance;
};

type TokenExIframeInstance = {
  load: () => void;
  tokenize: () => void;
  remove: () => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
};

type UseTokenExIframeOptions = {
  containerId: string;
  config: TokenizationIframeConfig | null;
  theme?: 'light' | 'dark';
};

export type TokenizeResult = {
  token: string;
  firstSix?: string;
  lastFour?: string;
};

type UseTokenExIframeReturn = {
  isLoaded: boolean;
  isValid: boolean;
  error: string | null;
  tokenize: () => Promise<TokenizeResult>;
};

export function useTokenExIframe({ containerId, config, theme = 'light' }: UseTokenExIframeOptions): UseTokenExIframeReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<TokenExIframeInstance | null>(null);
  const tokenizeResolveRef = useRef<((result: TokenizeResult) => void) | null>(null);
  const tokenizeRejectRef = useRef<((error: Error) => void) | null>(null);

  useEffect(() => {
    // Skip initialization when no config is provided
    if (!config) {
      return;
    }

    let cancelled = false;
    let scriptEl: HTMLScriptElement | null = null;

    function getTokenEx(): TokenExGlobal | undefined {
      return (window as unknown as { TokenEx?: TokenExGlobal }).TokenEx;
    }

    async function init() {
      // Load the TokenEx script if not already present
      if (!getTokenEx()) {
        scriptEl = document.createElement('script');
        scriptEl.src = config!.iframeScriptUrl;
        scriptEl.async = true;

        await new Promise<void>((resolve, reject) => {
          scriptEl!.onload = () => resolve();
          scriptEl!.onerror = () => reject(new Error('Failed to load TokenEx script'));
          document.head.appendChild(scriptEl!);
        });
      }

      const tokenEx = getTokenEx();
      if (cancelled || !tokenEx) {
        return;
      }

      // Verify container element exists in the DOM before initializing
      if (!document.getElementById(containerId)) {
        return;
      }

      // Initialize the iframe
      const iframe = new tokenEx.Iframe(containerId, {
        origin: config!.origin || window.location.origin,
        authenticationKey: config!.authenticationKey,
        tokenExID: config!.tokenizationId,
        tokenScheme: config!.tokenScheme,
        timestamp: config!.timestamp,
        pci: true,
        enablePrettyFormat: true,
        enableValidateOnKeyUp: true,
        debug: process.env.NODE_ENV === 'development',
        inputType: 'text',
        cvvContainerID: '',
        cvv: false,
        styles: {
          base: [
            'font-family: ui-sans-serif, system-ui, sans-serif',
            'font-size: 14px',
            'line-height: 20px',
            'padding: 7px 12px',
            `color: ${theme === 'dark' ? '#fafafa' : '#000000'}`,
            `background-color: ${theme === 'dark' ? '#262626' : '#ffffff'}`,
            'border: none',
            'outline: none',
            'width: 100%',
            'box-sizing: border-box',
          ].join('; '),
          focus: 'outline: none; border: none',
          error: `color: ${theme === 'dark' ? 'hsl(0 72% 65%)' : 'hsl(0 84% 60%)'}`,
        },
      });

      iframeRef.current = iframe;

      iframe.on('load', () => {
        if (!cancelled) {
          setIsLoaded(true);
          setError(null);
        }
      });

      iframe.on('validate', (data: unknown) => {
        if (!cancelled) {
          const validationData = data as { isValid?: boolean };
          setIsValid(!!validationData.isValid);
        }
      });

      iframe.on('tokenize', (data: unknown) => {
        if (process.env.NODE_ENV === 'development') {
          console.info('[TokenEx] tokenize event received:', JSON.stringify(data));
        }
        const tokenData = data as Record<string, unknown>;
        const token = (tokenData.token ?? tokenData.Token) as string | undefined;
        const firstSix = (tokenData.firstSix ?? tokenData.FirstSix
          ?? tokenData.firstsix ?? tokenData.cardBin) as string | undefined;
        const lastFour = (tokenData.lastFour ?? tokenData.LastFour
          ?? tokenData.lastfour ?? tokenData.cardNumber) as string | undefined;
        if (token && tokenizeResolveRef.current) {
          tokenizeResolveRef.current({ token, firstSix: firstSix?.slice(0, 6), lastFour: lastFour?.slice(-4) });
          tokenizeResolveRef.current = null;
          tokenizeRejectRef.current = null;
        } else if (tokenizeResolveRef.current) {
          // Token field missing — reject with details for debugging
          tokenizeRejectRef.current?.(new Error(
            `Tokenize event received but no token field. Keys: ${Object.keys(tokenData).join(', ')}`,
          ));
          tokenizeResolveRef.current = null;
          tokenizeRejectRef.current = null;
        }
      });

      iframe.on('error', (data: unknown) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[TokenEx] error event received:', JSON.stringify(data));
        }
        if (!cancelled) {
          const errorData = data as { message?: string };
          const msg = errorData.message || 'TokenEx iframe error';
          setError(msg);
        }
        if (tokenizeRejectRef.current) {
          const errorData = data as { message?: string };
          tokenizeRejectRef.current(new Error(errorData.message || 'Tokenization failed'));
          tokenizeResolveRef.current = null;
          tokenizeRejectRef.current = null;
        }
      });

      iframe.load();
    }

    init().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to initialize payment field');
      }
    });

    return () => {
      cancelled = true;
      if (iframeRef.current) {
        iframeRef.current.remove();
        iframeRef.current = null;
      }
      if (scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }
    };
  }, [containerId, config, theme]);

  const tokenize = useCallback((): Promise<TokenizeResult> => {
    return new Promise((resolve, reject) => {
      if (!iframeRef.current) {
        reject(new Error('TokenEx iframe not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        if (tokenizeResolveRef.current) {
          tokenizeResolveRef.current = null;
          tokenizeRejectRef.current = null;
          reject(new Error('Tokenization timed out. Please try again.'));
        }
      }, 15_000);

      tokenizeResolveRef.current = (result: TokenizeResult) => {
        clearTimeout(timeout);
        resolve(result);
      };
      tokenizeRejectRef.current = (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      };

      iframeRef.current.tokenize();
    });
  }, []);

  return { isLoaded, isValid, error, tokenize };
}
