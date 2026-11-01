import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env';

const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

// عوامی کنجی: صرف عوامی views پڑھ سکتی ہے (002_security.sql دیکھیں)
export function db() {
  const e = getEnv();
  return createClient(e.SUPABASE_URL, e.SUPABASE_PUBLIC_KEY, options);
}

// خفیہ کنجی: سب کچھ پڑھ لکھ سکتی ہے۔ صرف سرور کے کوڈ میں، کبھی براؤزر کو نہیں جاتی
export function dbAdmin() {
  const e = getEnv();
  return createClient(e.SUPABASE_URL, e.SUPABASE_SECRET_KEY, options);
}

// تصویر کا عوامی پتا
export function mediaUrl(path: string) {
  return `${getEnv().SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}
