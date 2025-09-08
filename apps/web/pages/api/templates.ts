import type { NextApiRequest, NextApiResponse } from "next";
import { listTemplates, upsertTemplate } from "@/lib/config";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const client_id = String(req.query.client_id || "");
    if (!client_id) return res.status(400).json({ error: "client_id required" });
    const list = await listTemplates(client_id);
    return res.json(list);
  }
  if (req.method === "POST") {
    const saved = await upsertTemplate(req.body);
    return res.json(saved);
  }
  return res.status(405).end();
}
