import { isConfirmToken, isSignupRequestId } from '@/validations/SignupTokens';

export type ConfirmLink = { id: string; token: string };

/** Where the link is kept once it is out of the address bar (this tab only). */
export const CONFIRM_LINK_STORAGE_KEY = 'dojoplanner.signupConfirm';

/** The `id` + `token` from a "Confirm your academy" link, or null unless both are shaped like ones we issue. */
export function readConfirmLink(search: string): ConfirmLink | null {
  const params = new URLSearchParams(search);
  const id = params.get('id');
  const token = params.get('token');
  return isSignupRequestId(id) && isConfirmToken(token) ? { id, token } : null;
}

/**
 * Read the link once and take the token out of the address bar, so it is not
 * left in browser history, a shared screenshot, or a session replay. It is
 * kept in sessionStorage (this tab only), so a refresh still works.
 */
export function takeConfirmLink(win: Window = window): ConfirmLink | null {
  const fromUrl = readConfirmLink(win.location.search);
  if (fromUrl) {
    try {
      win.sessionStorage.setItem(CONFIRM_LINK_STORAGE_KEY, JSON.stringify(fromUrl));
    } catch {
      // Storage blocked: the page still works until it is refreshed.
    }
    win.history.replaceState(win.history.state, '', win.location.pathname);
    return fromUrl;
  }
  try {
    const saved = JSON.parse(win.sessionStorage.getItem(CONFIRM_LINK_STORAGE_KEY) ?? 'null') as Partial<ConfirmLink> | null;
    return saved && isSignupRequestId(saved.id) && isConfirmToken(saved.token) ? { id: saved.id, token: saved.token } : null;
  } catch {
    return null;
  }
}
