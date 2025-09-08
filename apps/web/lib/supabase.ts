import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Admin client (server-side only)
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(url, key, { auth: { persistSession: false } });
