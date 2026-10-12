import { createClient } from "@supabase/supabase-js";

/**
 * Client phía server dùng SECRET key (sb_secret_...), bỏ qua RLS.
 * CHỈ import ở route handler / script server. KHÔNG dùng trong component client,
 * KHÔNG đặt tiền tố NEXT_PUBLIC_ cho biến này.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Keep the new Supabase secret key as the canonical name, but accept the
  // legacy Render variable while environments are being migrated. This keeps
  // server-side reads/writes alive without ever falling back to a public key.
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase server key");
  return createClient(url, key, { auth: { persistSession: false } });
}
