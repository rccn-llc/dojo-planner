import { describe, expect, it, vi } from 'vitest';
import { CONFIRM_LINK_STORAGE_KEY, readConfirmLink, takeConfirmLink } from './confirmLink';

const ID = '6f1c2a4e-1b2c-4d5e-8f90-0123456789ab';
const TOKEN = `sc_${'A'.repeat(43)}`;

describe('readConfirmLink', () => {
  it('reads id and token', () => {
    expect(readConfirmLink(`?id=${ID}&token=${TOKEN}`)).toEqual({ id: ID, token: TOKEN });
  });

  it.each([
    '',
    `?id=${ID}`,
    `?token=${TOKEN}`,
    `?id=&token=${TOKEN}`,
    `?id=req-1&token=${TOKEN}`,
    `?id=${ID}&token=sc_abc`,
    `?id=${ID}&token=st_${'A'.repeat(43)}`,
  ])('is null for %s', (search) => {
    expect(readConfirmLink(search)).toBeNull();
  });
});

function fakeWindow(search: string, stored: Record<string, string> = {}, storageThrows = false) {
  const store = new Map(Object.entries(stored));
  const replaceState = vi.fn();
  const storage = {
    getItem: (key: string) => {
      if (storageThrows) {
        throw new Error('blocked');
      }
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (storageThrows) {
        throw new Error('blocked');
      }
      store.set(key, value);
    },
  };
  const win = {
    location: { search, pathname: '/signup/confirm' },
    history: { state: null, replaceState },
    sessionStorage: storage,
  } as unknown as Window;
  return { win, store, replaceState };
}

describe('takeConfirmLink', () => {
  it('takes the token out of the address bar and keeps it for this tab', () => {
    const { win, store, replaceState } = fakeWindow(`?id=${ID}&token=${TOKEN}`);

    expect(takeConfirmLink(win)).toEqual({ id: ID, token: TOKEN });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/signup/confirm');
    expect(JSON.parse(store.get(CONFIRM_LINK_STORAGE_KEY)!)).toEqual({ id: ID, token: TOKEN });
  });

  it('reads the kept link after a refresh', () => {
    const { win } = fakeWindow('', { [CONFIRM_LINK_STORAGE_KEY]: JSON.stringify({ id: ID, token: TOKEN }) });

    expect(takeConfirmLink(win)).toEqual({ id: ID, token: TOKEN });
  });

  it('ignores a kept value that is not a link we issue', () => {
    expect(takeConfirmLink(fakeWindow('', { [CONFIRM_LINK_STORAGE_KEY]: JSON.stringify({ id: 'x', token: 'y' }) }).win)).toBeNull();
    expect(takeConfirmLink(fakeWindow('', { [CONFIRM_LINK_STORAGE_KEY]: '{bad json' }).win)).toBeNull();
    expect(takeConfirmLink(fakeWindow('').win)).toBeNull();
  });

  it('still works when storage is blocked', () => {
    const { win, replaceState } = fakeWindow(`?id=${ID}&token=${TOKEN}`, {}, true);

    expect(takeConfirmLink(win)).toEqual({ id: ID, token: TOKEN });
    expect(replaceState).toHaveBeenCalled();
    expect(takeConfirmLink(fakeWindow('', {}, true).win)).toBeNull();
  });
});
