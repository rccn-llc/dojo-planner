export const CONSENT_CATEGORIES = ['necessary', 'functional', 'analytics'] as const;

export type ConsentCategory = typeof CONSENT_CATEGORIES[number];

export type ConsentDecision = {
  /** Policy version the decision was made under. */
  version: number;
  /** Epoch ms the decision was recorded, used for expiry. */
  timestamp: number;
  /** Per-category grants. `necessary` is always true. */
  categories: Record<ConsentCategory, boolean>;
  /** How the decision was made — part of an auditable consent proof. */
  method: 'accept_all' | 'reject_all' | 'custom';
};

export type ConsentState = {
  /** `null` means no valid decision on record: the banner must be shown. */
  decision: ConsentDecision | null;
  /**
   * True when the decision could not be persisted (private mode, blocked
   * storage). The choice is still honoured for this page session, but the
   * banner will return on the next load because nothing could be written.
   */
  ephemeral: boolean;
};
