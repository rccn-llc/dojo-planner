import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { CONFIRM_LINK_STORAGE_KEY } from './confirmLink';
import { SignupConfirm } from './SignupConfirm';

const ID = '6f1c2a4e-1b2c-4d5e-8f90-0123456789ab';
const TOKEN = `sc_${'A'.repeat(43)}`;

// Translations render as their keys, so assertions name the message shown.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

type Reply = { status: number; body?: unknown };

function json({ status, body }: Reply) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(statusReplies: Reply[], confirmReply?: Reply) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/signup/confirm')) {
      return json(confirmReply ?? { status: 200, body: { result: 'started', requestId: 'req-1' } });
    }
    const next = statusReplies.length > 1 ? statusReplies.shift()! : statusReplies[0]!;
    return json(next);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SignupConfirm', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CONFIRM_LINK_STORAGE_KEY);
    window.history.replaceState(null, '', `/signup/confirm?id=${ID}&token=${TOKEN}`);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.removeItem(CONFIRM_LINK_STORAGE_KEY);
    window.history.replaceState(null, '', '/');
  });

  it('shows the Confirm button for an unconfirmed link — loading the page confirms nothing', async () => {
    const fetchMock = mockFetch([{ status: 200, body: { state: 'awaiting_confirmation' } }]);
    render(<SignupConfirm />);

    await expect.element(page.getByRole('button', { name: 'confirm_button' })).toBeVisible();
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/confirm'))).toBe(true);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`/api/signup/status?id=${ID}&token=${TOKEN}`);
  });

  it('takes the token out of the address bar', async () => {
    mockFetch([{ status: 200, body: { state: 'awaiting_confirmation' } }]);
    render(<SignupConfirm />);

    await expect.element(page.getByRole('button', { name: 'confirm_button' })).toBeVisible();
    expect(window.location.search).toBe('');
  });

  it('confirms on click with the link token, then polls and shows the current step', async () => {
    const fetchMock = mockFetch(
      [{ status: 200, body: { state: 'awaiting_confirmation' } }, { status: 200, body: { state: 'provisioning', step: 'database' } }],
    );
    render(<SignupConfirm />);
    await userEvent.click(page.getByRole('button', { name: 'confirm_button' }));

    await expect.element(page.getByText('step_database')).toBeVisible();

    const confirmCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/signup/confirm')!;

    expect(JSON.parse(String((confirmCall[1] as RequestInit).body))).toEqual({ token: TOKEN });
  });

  it('shows the ready message with a same-origin sign-in link, ignoring any URL in the response', async () => {
    mockFetch([{ status: 200, body: { state: 'ready', signInUrl: 'javascript:alert(1)' } }]);
    render(<SignupConfirm />);

    await expect.element(page.getByText('state_ready')).toBeVisible();
    await expect.element(page.getByRole('link', { name: 'go_to_sign_in' })).toHaveAttribute('href', '/sign-in');
  });

  it.each([
    [{ state: 'failed' }, 'state_failed'],
    [{ state: 'expired' }, 'state_expired'],
    [{ state: 'provisioning', step: 'starter_data' }, 'step_starter_data'],
  ])('shows %o as %s', async (body, message) => {
    mockFetch([{ status: 200, body }]);
    render(<SignupConfirm />);

    await expect.element(page.getByText(message)).toBeVisible();
  });

  it('says the link is invalid when the server does not know it', async () => {
    mockFetch([{ status: 404, body: { error: 'not_found' } }]);
    render(<SignupConfirm />);

    await expect.element(page.getByText('invalid_link')).toBeVisible();
  });

  it('says the link is invalid when it has no token, without calling the server', async () => {
    window.history.replaceState(null, '', `/signup/confirm?id=${ID}`);
    const fetchMock = mockFetch([{ status: 200, body: { state: 'awaiting_confirmation' } }]);
    render(<SignupConfirm />);

    await expect.element(page.getByText('invalid_link')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 410 }, 'state_expired'],
    [{ status: 404 }, 'invalid_link'],
    [{ status: 503 }, 'unavailable'],
  ])('handles a confirm answered %o', async (confirmReply, message) => {
    mockFetch([{ status: 200, body: { state: 'awaiting_confirmation' } }], confirmReply);
    render(<SignupConfirm />);
    await userEvent.click(page.getByRole('button', { name: 'confirm_button' }));

    await expect.element(page.getByText(message)).toBeVisible();
  });
});
