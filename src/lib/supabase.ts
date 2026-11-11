import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, getSupabaseBrowserClient } from "./supabase-browser";

export { isSupabaseConfigured, getSupabaseBrowserClient };

let serverClient: SupabaseClient | null = null;

export function isSupabaseServiceRoleConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    url &&
    serviceKey &&
    url.trim() !== "" &&
    serviceKey.trim() !== "" &&
    !serviceKey.includes("your-service-role")
  );
}

export function getSupabaseServerClient(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("getSupabaseServerClient must only be called on the server.");
  }

  if (isSupabaseServiceRoleConfigured()) {
    if (!serverClient) {
      serverClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );
    }
    return serverClient;
  }

  return getSupabaseBrowserClient();
}
