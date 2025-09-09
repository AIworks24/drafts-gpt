// apps/web/lib/supabase-server.ts
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_ROLE) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server');
}

export const supabaseServer = createClient(URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
