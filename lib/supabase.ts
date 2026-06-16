import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getSupabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
}

/** Browser / client components — uses the public anon key. */
export function createSupabaseBrowserClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables"
    );
  }

  return createClient(url, anonKey);
}

let serverClient: SupabaseClient | null = null;

/** Server-side client for API routes — uses the secret key. */
export function createSupabaseServerClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !secretKey) {
    console.warn("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
    return null;
  }

  if (!serverClient) {
    serverClient = createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverClient;
}
