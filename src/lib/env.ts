// Cloudflare کی سیٹنگز (vars اور secrets) یہیں سے پڑھی جاتی ہیں
// @ts-ignore: یہ ماڈیول چلتے وقت Cloudflare فراہم کرتا ہے
import { env } from 'cloudflare:workers';

export type Env = {
  SITE_URL?: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLIC_KEY: string;
  SUPABASE_SECRET_KEY: string;
  ADMIN_EMAILS?: string;
  TURNSTILE_SECRET?: string;
};

export const getEnv = () => env as unknown as Env;

export const siteUrl = () => (getEnv().SITE_URL || 'https://inshaenau.com').replace(/\/+$/, '');

export const adminEmails = () =>
  (getEnv().ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
