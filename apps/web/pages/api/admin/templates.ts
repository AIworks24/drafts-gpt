// apps/web/pages/api/admin/templates.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase";

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if (req.method !== "POST") return res.status(405).end();
  const { client_id, title, category, body_md } = JSON.parse(req.body||"{}");
  if (!client_id || !title || !category || !body_md) return res.status(400).json({ error: "missing fields" });
  const { error } = await supabase.from("templates").insert({ client_id, title, category, body_md });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}
