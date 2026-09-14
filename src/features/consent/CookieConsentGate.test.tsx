import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { resetConsent } from '@/libs/consent/ConsentStore';
import { CONSENT_EVENT, CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/libs/consent/constants';
import { CookieConsentGate } from './CookieConsentGate';

const translationKeys: Record<string, string> = {
  banner_aria_label: 'Cookie consent',
  banner_title: 'We value your privacy',
  accept_all: 'Accept all',
  reject_all: 'Reject all',
  customise: 'Customise',
  dialog_title: 'Cookie preferences',
  analytics_label: 'Error and performance monitoring',
  functional_label: 'Preferences',
  necessary_label: 'Strictly necessary',
  save_preferences: 'Save preferences',
};

// Mock next/link — the real one pulls in Next's router internals, which expect
// `process` to exist in the browser test environment.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => translationKeys[key] ?? key;
    t.rich = (key: string) => translationKeys[key] ?? key;
    return t;
  },
}));

function storedDecision() {
  const raw = localStorage.getItem(CONSENT_STORAGE_KEY);

  return raw === null ? null : JSON.parse(raw);
}

function seedDecision(analytics: boolean) {
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
    version: CONSENT_VERSION,
    timestamp: Date.now(),
    method: 'custom',
    categories: { necessary: true, functional: false, analytics },
  }));

  // Nudge the store to re-read what we just wrote.
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

beforeEach(() => {
  localStorage.clear();
  // The store caches state in module scope and the module is shared across
  // tests in one browser session, so clearing storage alone is not enough.
  resetConsent();
});

describe('CookieConsentGate', () => {
  it('shows the banner when no decision is on record', async () => {
    await render(<CookieConsentGate />);

    await expect.element(page.getByRole('region', { name: 'Cookie consent' })).toBeInTheDocument();
  });

  it('does not show the banner once a decision exists', async () => {
    seedDecision(true);

    await render(<CookieConsentGate />);

    expect(page.getByRole('region', { name: 'Cookie consent' }).elements()).toHaveLength(0);
  });

  it('records a full grant when accepting', async () => {
    await render(<CookieConsentGate />);

    await userEvent.click(page.getByRole('button', { name: 'Accept all' }));

    expect(storedDecision()).toMatchObject({
      method: 'accept_all',
      version: CONSENT_VERSION,
      categories: { necessary: true, functional: true, analytics: true },
    });
  });

  // The behaviour that matters most: rejecting is one click and is remembered,
  // so the visitor is never asked again.
  it('records a refusal when rejecting, and stops showing the banner', async () => {
    await render(<CookieConsentGate />);

    await userEvent.click(page.getByRole('button', { name: 'Reject all' }));

    expect(storedDecision()).toMatchObject({
      method: 'reject_all',
      categories: { necessary: true, functional: false, analytics: false },
    });
    expect(page.getByRole('region', { name: 'Cookie consent' }).elements()).toHaveLength(0);
  });

  /*
   * Equal prominence is a legal requirement (EDPB/CNIL), not a style choice.
   * This asserts the two consent buttons stay visually identical so a future
   * redesign cannot quietly demote "Reject all" to a less prominent variant.
   */
  it('gives Accept and Reject identical prominence', async () => {
    await render(<CookieConsentGate />);

    const accept = page.getByRole('button', { name: 'Accept all' }).element();
    const reject = page.getByRole('button', { name: 'Reject all' }).element();

    expect(reject.className).toBe(accept.className);
  });

  /*
   * The banner is fixed to the bottom of the viewport, so without reserved
   * space it covers whatever sits at the end of the page — controls the user
   * can see but cannot click. This regressed the E2E suite before it was
   * caught, and it would hit real users on short viewports.
   */
  it('reserves page space so it cannot cover content', async () => {
    await render(<CookieConsentGate />);

    await vi.waitFor(() => {
      expect(document.body.style.paddingBottom).not.toBe('');
    });

    expect(Number.parseInt(document.body.style.paddingBottom, 10)).toBeGreaterThan(0);
  });

  it('releases the reserved space once a choice is made', async () => {
    await render(<CookieConsentGate />);

    await vi.waitFor(() => {
      expect(document.body.style.paddingBottom).not.toBe('');
    });

    await userEvent.click(page.getByRole('button', { name: 'Reject all' }));

    await vi.waitFor(() => {
      expect(document.body.style.paddingBottom).toBe('');
    });
  });

  it('opens the preferences dialog from the banner', async () => {
    await render(<CookieConsentGate />);

    await userEvent.click(page.getByRole('button', { name: 'Customise' }));

    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
  });
});
