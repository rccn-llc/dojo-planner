export const SAAS_PLAN_ID = {
  BASIC: 'basic',
  GROWTH: 'growth',
} as const;

export type SaasPlanId = (typeof SAAS_PLAN_ID)[keyof typeof SAAS_PLAN_ID];

export type SaasPlanFeature = {
  name: string;
  included: boolean;
};

export type SaasPlan = {
  id: SaasPlanId;
  name: string;
  monthlyPrice: number;
  annualPricePerMonth: number;
  annualTotal: number;
  description: string;
  features: SaasPlanFeature[];
  isContactUs: boolean;
};

export const SaasPlanList: Record<string, SaasPlan> = {
  [SAAS_PLAN_ID.BASIC]: {
    id: SAAS_PLAN_ID.BASIC,
    name: 'Basic',
    monthlyPrice: 49,
    annualPricePerMonth: 29,
    annualTotal: 348,
    description: 'Full access to Dojo Planner CRM',
    features: [
      { name: 'Unlimited students & classes', included: true },
      { name: 'Digital attendance & student profiles', included: true },
      { name: 'Belt promotion & curriculum tracking', included: true },
      { name: 'Class calendar with RSVP', included: true },
      { name: 'Payment processing integration', included: true },
      { name: 'Team accounts (instructors, admins, etc)', included: true },
    ],
    isContactUs: false,
  },
  [SAAS_PLAN_ID.GROWTH]: {
    id: SAAS_PLAN_ID.GROWTH,
    name: 'Growth',
    monthlyPrice: 125,
    annualPricePerMonth: 99,
    annualTotal: 1188,
    description: 'Everything in Basic plus additional web presence',
    features: [
      { name: 'Everything in Basic', included: true },
      { name: 'Custom branded website', included: true },
      { name: 'SEO-optimized landing pages', included: true },
      { name: 'Priority support (chat + email)', included: true },
    ],
    isContactUs: false,
  },
};

export function getSaasPlan(planId: string): SaasPlan | undefined {
  return SaasPlanList[planId];
}

export function getPlanPrice(planId: string, billingCycle: string): number {
  const plan = getSaasPlan(planId);
  if (!plan) {
    return 0;
  }
  return billingCycle === 'annual' ? plan.annualPricePerMonth : plan.monthlyPrice;
}

export function getPlanTotalPrice(planId: string, billingCycle: string): number {
  const plan = getSaasPlan(planId);
  if (!plan) {
    return 0;
  }
  return billingCycle === 'annual' ? plan.annualTotal : plan.monthlyPrice;
}
