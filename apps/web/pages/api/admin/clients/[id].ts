// apps/web/pages/api/admin/clients/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer as supabase } from '@/lib/supabase-server';

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  const { id } = req.query as { id: string };

  if (req.method === "GET") {
    const { data: client, error } = await supabase.from("clients").select("*").eq("id", id).single();
    if (error) return res.status(500).json({ error: error.message });

    const { data: templates, error: e2 } = await supabase.from("templates").select("*").eq("client_id", id).order("created_at", { ascending: false });
    if (e2) return res.status(500).json({ error: e2.message });

    return res.json({ client, templates });
  }

  if (req.method === "PUT") {
    const body = JSON.parse(req.body||"{}");
    const { error } = await supabase.from("clients").update({
      timezone: body.timezone,
      tone: body.tone,
      business_hours: body.business_hours
    }).eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}
