import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const client_id = String(req.query.client_id || "");
      if (!client_id) return res.status(400).json({ error: "client_id required" });
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("client_id", client_id)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    if (req.method === "POST") {
      const input = req.body || {};
      if (!input.client_id) return res.status(400).json({ error: "client_id required" });
      const { data, error } = await supabase.from("templates").upsert(input).select("*").maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e: any) {
    console.error("templates api error", e);
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}
