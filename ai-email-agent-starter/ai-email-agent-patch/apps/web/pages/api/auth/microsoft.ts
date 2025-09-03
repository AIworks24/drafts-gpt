import { msalApp } from "@/lib/auth";
import type { NextApiRequest, NextApiResponse } from "next";
import { ConfidentialClientApplication } from "@azure/msal-node";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const code = req.query.code as string;
  if (!code) return res.status(400).json({ error: "Missing code" });

  try {
    const token = await msalApp.acquireTokenByCode({
      code,
      scopes: ["Mail.Read", "Mail.ReadWrite", "Calendars.Read", "offline_access"],
      redirectUri: process.env.OAUTH_REDIRECT_URI!,
    });
    // TODO: save token to Supabase
    res.status(200).json(token);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}