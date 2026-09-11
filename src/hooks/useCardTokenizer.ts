'use client';

import type { TokenizeResult } from './useTokenExIframe';
import type { PaymentProvider } from '@/types/PaymentProvider';
import type { ClientTokenizationConfig } from '@/types/Tokenization';

import { PAYMENT_PROVIDER } from '@/types/PaymentProvider';
import { useSquareCard } from './useSquareCard';
import { useTokenExIframe } from './useTokenExIframe';

/**
 * One card-collection interface over both providers.
 *
 * Components keep the shape they already used with `useTokenExIframe`, plus
 * `layout` and `provider`. That is deliberate: the three member payment
 * components change only where the two providers genuinely differ.
 *
 * ⚠️ BOTH hooks are called on every render — rules of hooks forbid choosing
 * one. The non-selected hook receives `config: null`, which each treats as "not
 * my provider, do nothing": no script injected, no widget mounted. There is a
 * test pinning exactly this.
 *
 * Note `SubscriptionDialog` does NOT use this facade. Platform SaaS billing is
 * always the platform's own IQPro account, never an org's Square merchant, so
 * it calls `useTokenExIframe` directly and is unaffected by any of this.
 */

/**
 * How the provider wants its card fields laid out.
 *
 * `split`   — IQPro: separate PAN and CVV iframes, plus our own expiry input.
 * `unified` — Square: one widget owning number, expiry and CVV together.
 *
 * Components branch on THIS rather than on the provider name, so a future
 * unified provider needs no component changes.
 */
export type CardFormLayout = 'split' | 'unified';

type UseCardTokenizerOptions = {
  /** PAN container for IQPro; the whole widget's container for Square. */
  containerId: string;
  /** Ignored when the provider is Square, which has no separate CVV field. */
  cvvContainerId?: string;
  config: ClientTokenizationConfig | null;
  theme?: 'light' | 'dark';
};

type UseCardTokenizerReturn = {
  isLoaded: boolean;
  isValid: boolean;
  isCvvValid: boolean;
  error: string | null;
  tokenize: () => Promise<TokenizeResult>;
  layout: CardFormLayout;
  provider: PaymentProvider | null;
  /**
   * Square only: the background to paint onto its injected
   * `.sq-card-iframe-container`. Null for IQPro, whose container is styled
   * entirely in the component.
   */
  backgroundColor: string | null;
};

export function useCardTokenizer({
  containerId,
  cvvContainerId,
  config,
  theme = 'light',
}: UseCardTokenizerOptions): UseCardTokenizerReturn {
  const isSquare = config?.provider === PAYMENT_PROVIDER.SQUARE;

  const tokenEx = useTokenExIframe({
    containerId,
    cvvContainerId,
    config: config?.provider === PAYMENT_PROVIDER.IQPRO ? config.iqpro : null,
    theme,
  });

  const square = useSquareCard({
    containerId,
    config: isSquare ? config.square : null,
    theme,
  });

  if (isSquare) {
    return {
      isLoaded: square.isLoaded,
      isValid: square.isValid,
      // Mirrors isValid rather than being hardcoded true: Square's single
      // widget does not report valid until its CVV is complete, so callers
      // asking "is the CVV good?" still get a truthful answer, and the
      // existing `useIframe ? iframeCvvValid : data.cardCvc` checks keep
      // working untouched.
      isCvvValid: square.isValid,
      error: square.error,
      tokenize: square.tokenize,
      layout: 'unified',
      provider: PAYMENT_PROVIDER.SQUARE,
      backgroundColor: square.backgroundColor,
    };
  }

  return {
    ...tokenEx,
    layout: 'split',
    provider: config ? PAYMENT_PROVIDER.IQPRO : null,
    backgroundColor: null,
  };
}
