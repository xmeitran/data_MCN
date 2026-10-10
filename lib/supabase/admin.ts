import { createClient } from "@supabase/supabase-js";

/**
 * Client phía server dùng SECRET key (sb_secret_...), bỏ qua RLS.
 * CHỈ import ở route handler / script server. KHÔNG dùng trong component client,
 * KHÔNG đặt tiền tố NEXT_PUBLIC_ cho biến này.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}
