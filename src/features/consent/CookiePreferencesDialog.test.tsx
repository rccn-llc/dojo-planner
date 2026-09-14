import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { resetConsent } from '@/libs/consent/ConsentStore';
import { CONSENT_EVENT, CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/libs/consent/constants';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';

const translationKeys: Record<string, string> = {
  dialog_title: 'Cookie preferences',
  dialog_description: 'Choose which categories of storage you allow.',
  necessary_label: 'Strictly necessary',
  necessary_description: 'Required to sign you in.',
  necessary_always_on: 'Always on',
  functional_label: 'Preferences',
  functional_description: 'Remembers your language and theme.',
  analytics_label: 'Error and performance monitoring',
  analytics_description: 'Lets us record errors through Sentry.',
  vendors_title: 'Who receives this data',
  vendors_body: 'Processed by Sentry and Clerk.',
  accept_all: 'Accept all',
  reject_all: 'Reject all',
  save_preferences: 'Save preferences',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translationKeys[key] ?? key,
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
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

beforeEach(() => {
  localStorage.clear();
  resetConsent();
});

describe('CookiePreferencesDialog', () => {
  it('renders one switch per category', async () => {
    await render(<CookiePreferencesDialog open onOpenChangeAction={() => {}} />);

    expect(page.getByRole('switch').elements()).toHaveLength(3);
  });

  // Radix renders a bare <button role="switch"> with no text, so without
  // aria-labelledby every switch would be anonymous to a screen reader.
  it('gives every switch an accessible name', async () => {
    await render(<CookiePreferencesDialog open onOpenChangeAction={() => {}} />);

    await expect.element(page.getByRole('switch', { name: 'Strictly necessary' })).toBeInTheDocument();
    await expect.element(page.getByRole('switch', { name: 'Preferences' })).toBeInTheDocument();
    await expect.element(page.getByRole('switch', { name: 'Error and performance monitoring' })).toBeInTheDocument();
  });

  it('shows the necessary category as on and non-toggleable', async () => {
    await render(<CookiePreferencesDialog open onOpenChangeAction={() => {}} />);

    const necessary = page.getByRole('switch', { name: 'Strictly necessary' }).element();

    expect(necessary.getAttribute('aria-checked')).toBe('true');
    expect(necessary.hasAttribute('disabled')).toBe(true);
  });

  it('describes the dialog for assistive technology', async () => {
    await render(<CookiePreferencesDialog open onOpenChangeAction={() => {}} />);

    const dialog = page.getByRole('dialog').element();
    const describedBy = dialog.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();
    expect(dialog.querySelector(`#${CSS.escape(describedBy!)}`)?.textContent)
      .toContain('Choose which categories');
  });

  it('saves only the categories the visitor turned on', async () => {
    await render(<CookiePreferencesDialog open onOpenChangeAction={() => {}} />);

    await userEvent.click(page.getByRole('switch', { name: 'Error and performance monitoring' }));
    await userEvent.click(page.getByRole('button', { name: 'Save preferences' }));

    expect(storedDecision()).toMatchObject({
      method: 'custom',
      categories: { necessary: true, functional: false, analytics: true },
    });
  });

  it('reflects the persisted decision when re-opened', async () => {
    seedDecision(true);

    await render(<CookiePreferencesDialog open onOpenChangeAction={() => {}} />);

    const analytics = page.getByRole('switch', { name: 'Error and performance monitoring' }).element();

    expect(analytics.getAttribute('aria-checked')).toBe('true');
  });

  // Dismissing is not consent: closing without saving must record nothing.
  it('records nothing when closed without saving', async () => {
    await render(<CookiePreferencesDialog open onOpenChangeAction={() => {}} />);

    await userEvent.click(page.getByRole('switch', { name: 'Error and performance monitoring' }));
    await userEvent.keyboard('{Escape}');

    expect(storedDecision()).toBeNull();
  });

  it('keeps Accept and Reject at identical prominence', async () => {
    await render(<CookiePreferencesDialog open onOpenChangeAction={() => {}} />);

    const accept = page.getByRole('button', { name: 'Accept all' }).element();
    const reject = page.getByRole('button', { name: 'Reject all' }).element();

    expect(reject.className).toBe(accept.className);
  });
});
