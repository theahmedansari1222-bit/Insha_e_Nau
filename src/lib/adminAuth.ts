// ایڈمن کا لاگ اِن: سپابیس کے Auth سے ای میل اور پاسورڈ۔ کنجیاں صرف httpOnly کوکی میں رہتی ہیں۔
import type { AstroCookies } from 'astro';
import { adminEmails, getEnv } from './env';

export const COOKIE_AT = 'adm_at';
export const COOKIE_RT = 'adm_rt';

export type Session = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { email?: string };
};

export function setSession(cookies: AstroCookies, s: Session, secure: boolean) {
  const base = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
  cookies.set(COOKIE_AT, s.access_token, { ...base, maxAge: Math.max(60, s.expires_in - 30) });
  cookies.set(COOKIE_RT, s.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE_AT, { path: '/' });
  cookies.delete(COOKIE_RT, { path: '/' });
}

function authFetch(path: string, init: RequestInit = {}) {
  const e = getEnv();
  return fetch(`${e.SUPABASE_URL}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: e.SUPABASE_PUBLIC_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

export async function passwordLogin(email: string, password: string): Promise<Session | null> {
  const r = await authFetch('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
  return r.ok ? ((await r.json()) as Session) : null;
}

export async function refreshSession(refreshToken: string): Promise<Session | null> {
  const r = await authFetch('token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return r.ok ? ((await r.json()) as Session) : null;
}

export async function userEmail(accessToken: string): Promise<string | null> {
  const r = await authFetch('user', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return null;
  const u = (await r.json()) as { email?: string };
  return (u.email || '').toLowerCase() || null;
}

export const isAdmin = (email: string | null) => !!email && adminEmails().includes(email);
