import { describe, expect, it } from 'vitest';
import { recurringFeePercents } from './PaymentProviderService';

describe('recurringFeePercents', () => {
  it('reads the service-fee and tax percentages', () => {
    expect(recurringFeePercents([
      { type: 'Tax', percentage: 8.375, flatAmount: null },
      { type: 'ServiceFee', percentage: 3.75, flatAmount: null },
    ])).toEqual({ serviceFeePct: 3.75, taxPct: 8.375 });
  });

  it('treats missing, flat-amount and non-positive adjustments as zero', () => {
    expect(recurringFeePercents(undefined)).toEqual({ serviceFeePct: 0, taxPct: 0 });
    expect(recurringFeePercents([
      { type: 'Tax', percentage: null, flatAmount: 4.2 },
      { type: 'ServiceFee', percentage: 0, flatAmount: null },
    ])).toEqual({ serviceFeePct: 0, taxPct: 0 });
  });
});
