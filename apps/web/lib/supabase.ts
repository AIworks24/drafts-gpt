// apps/web/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

/**
 * We support both server (API routes) and browser (dashboard) use.
 * - Server prefers SERVICE_ROLE for writes.
 * - Browser must use ANON key.
 */
const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "";

const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const key = typeof window === "undefined" ? (SERVICE || ANON) : ANON;

if (!URL || !key) {
  // This will surface quickly in Vercel logs if something is missing
  console.error("Supabase env missing:", {
    hasURL: Boolean(URL),
    hasAnon: Boolean(ANON),
    hasService: Boolean(SERVICE),
    isServer: typeof window === "undefined",
  });
}

export const supabase = createClient(URL, key);
