// apps/web/pages/api/admin/usage.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer as supabase } from '@/lib/supabase-server';

export default async function handler(_:NextApiRequest,res:NextApiResponse){
  const { data, error } = await supabase
    .from("usage_events")
    .select("*, clients(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  // flatten client name for convenience
  const rows = (data||[]).map((r:any)=>({ ...r, client_name: r.clients?.name }));
  res.json(rows);
}
