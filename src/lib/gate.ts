import { sha256Hex } from './sha256.ts';

/**
 * Temporary access page for the published site.
 *
 * Only the SHA-256 "fingerprint" of the password is stored here, never the password itself.
 * To change the password:   npm run gate-hash -- "NewPassword"   and paste the result below.
 * To remove the page:       set ACCESS_HASH to ''.
 *
 * Note: this is a courtesy curtain for a site that is not public yet, not real security.
 * The pages are static files, so anyone who knows where to look can still read them.
 */
export const ACCESS_HASH = 'fd0d838597d1713401f3cbea4452dc82e47186686255e62b2f66b1cc1941c4cd';

/** Salt, so the fingerprint is not simply the hash of a bare word. */
const SALT = 'lares-access:';

/** Active only in production builds (the dev server stays open). */
export const GATE_ACTIVE = Boolean(ACCESS_HASH) && Boolean(import.meta.env?.PROD);

export const fingerprint = (password: string): string => sha256Hex(`${SALT}${password.trim()}`);

export const passwordOk = (password: string): boolean => fingerprint(password) === ACCESS_HASH;

const KEY = 'lares_access';
export const isUnlocked = (): boolean => {
  try {
    return sessionStorage.getItem(KEY) === ACCESS_HASH;
  } catch {
    return false;
  }
};
export const unlock = () => {
  try {
    sessionStorage.setItem(KEY, ACCESS_HASH);
  } catch {
    /* private mode: the page will ask again after a reload */
  }
};
