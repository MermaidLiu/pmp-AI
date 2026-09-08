/** Guest device id + auth token persistence */

const GUEST_KEY = "pmp_guest_id";
const TOKEN_KEY = "pmp_auth_token";
const USER_KEY = "pmp_auth_user";

export type AuthUser = {
  id?: number;
  email?: string;
  display_name?: string;
  plan: string;
  is_pro: boolean;
  llm_limit: number | null;
  llm_used: number;
  llm_remaining: number | null;
  simple_qa_only: boolean;
  pro_expires_at?: string | null;
  pro_price_usd?: number;
  upgrade_required?: boolean;
};

export function getGuestId(): string {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function loadCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export const AUTH_CHANGED_EVENT = "pmp-auth-changed";

export function emitAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}
