import type { LocalizationResource } from '@clerk/types';
import type { LocalePrefixMode } from 'next-intl/routing';
import type { AppLocale } from '@/types/AppConfig';
import type { PricingPlan } from '@/types/Subscription';
import { enUS, frFR, jaJP } from '@clerk/localizations';
import { BILLING_INTERVAL } from '@/types/Subscription';
import { version as appVersion } from '../../package.json';

const localePrefix: LocalePrefixMode = 'as-needed';
const locales = [
  {
    id: 'en',
    name: 'English',
    stripeLocale: 'en',
  },
  {
    id: 'fr',
    name: 'Français',
    stripeLocale: 'fr',
  },
  {
    id: 'ja',
    name: '日本語',
    stripeLocale: 'ja',
  },
] satisfies AppLocale[];

// FIXME: Update this configuration file based on your project information
export const AppConfig = {
  name: 'Dojo Planner',
  version: appVersion,
  sidebarCookieName: 'sidebar:state',
  locales,
  defaultLocale: 'en',
  localePrefix,
};

const supportedLocales: Record<string, LocalizationResource> = {
  en: enUS,
  fr: frFR,
  ja: jaJP,
};

export const ClerkLocalizations = {
  defaultLocale: enUS,
  supportedLocales,
};

export const AllLocales = AppConfig.locales.map(locale => locale.id);

export const PLAN_ID = {
  FREE: 'free_user',
  FREE_TRIAL: 'free_trial',
  MONTHLY: 'monthly',
  ANNUAL: 'annual',
} as const;

export const PricingPlanList: Record<string, PricingPlan> = {
  [PLAN_ID.FREE]: {
    id: PLAN_ID.FREE,
    price: 0,
    interval: BILLING_INTERVAL.MONTH,
    testPriceId: '',
    devPriceId: '',
    prodPriceId: '',
    features: {
      teamMember: 2,
      website: 2,
      storage: 2,
      transfer: 2,
    },
  },
  [PLAN_ID.FREE_TRIAL]: {
    id: PLAN_ID.FREE_TRIAL,
    price: 0,
    interval: BILLING_INTERVAL.MONTH,
    testPriceId: '',
    devPriceId: '',
    prodPriceId: '',
    features: {
      teamMember: 5,
      website: 5,
      storage: 5,
      transfer: 5,
    },
  },
  [PLAN_ID.MONTHLY]: {
    id: PLAN_ID.MONTHLY,
    price: 79,
    interval: BILLING_INTERVAL.MONTH,
    testPriceId: 'price_monthly_test',
    devPriceId: 'price_1PNksvKOp3DEwzQlGOXO7YBK',
    prodPriceId: '',
    features: {
      teamMember: 5,
      website: 5,
      storage: 5,
      transfer: 5,
    },
  },
  [PLAN_ID.ANNUAL]: {
    id: PLAN_ID.ANNUAL,
    price: 790,
    interval: BILLING_INTERVAL.YEAR,
    testPriceId: 'price_annual_test',
    devPriceId: 'price_1PNksvKOp3DEwzQli9IvXzgb',
    prodPriceId: '',
    features: {
      teamMember: 5,
      website: 5,
      storage: 5,
      transfer: 5,
    },
  },
};
