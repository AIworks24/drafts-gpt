// apps/web/lib/supabase-browser.ts
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!URL || !ANON) {
  // Don’t throw in browser; just log to help diagnose locally
  // In production these should be set in Vercel Project → Environment Variables
  console.warn('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabaseBrowser = createClient(URL, ANON);
