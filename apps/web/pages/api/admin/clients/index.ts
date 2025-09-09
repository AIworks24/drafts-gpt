// apps/web/pages/api/admin/clients/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServer as supabase } from '@/lib/supabase-server';

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if (req.method === "GET") {
    const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  if (req.method === "POST") {
    const { name } = JSON.parse(req.body||"{}");
    if (!name) return res.status(400).json({ error: "name required" });
    const { data, error } = await supabase.from("clients").insert({ name }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  return res.status(405).end();
}
