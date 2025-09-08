import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      // Get first client; create a default one if none exists
      const { data: one, error: selErr } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (selErr) return res.status(500).json({ error: selErr.message });

      if (!one) {
        const { data: created, error: insErr } = await supabase
          .from("clients")
          .insert({ name: "My Client", tone: { voice: "neutral" }, policies: "" })
          .select("*")
          .maybeSingle();
        if (insErr) return res.status(500).json({ error: insErr.message });
        return res.json(created);
      }

      return res.json(one);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const { data, error } = await supabase.from("clients").upsert(body).select("*").maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (e: any) {
    console.error("clients api error", e);
    return res.status(500).json({ error: e?.message || "Unexpected error" });
  }
}
