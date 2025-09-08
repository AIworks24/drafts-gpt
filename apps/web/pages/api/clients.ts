import type { NextApiRequest, NextApiResponse } from "next";
import { getClientByUser, upsertClient } from "@/lib/config";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const c = await getClientByUser("self");
    if (!c) {
      const created = await upsertClient({ name: "My Client", tone: { voice: "neutral" }, policies: "" });
      return res.json(created);
    }
    return res.json(c);
  }
  if (req.method === "POST") {
    const saved = await upsertClient(req.body);
    return res.json(saved);
  }
  return res.status(405).end();
}
