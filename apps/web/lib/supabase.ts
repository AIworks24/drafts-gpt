// apps/web/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

if (!url) throw new Error('Missing SUPABASE_URL');
if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
