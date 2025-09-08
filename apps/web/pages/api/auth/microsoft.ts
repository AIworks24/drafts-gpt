import type { NextApiRequest, NextApiResponse } from "next";
import { msalApp, MS_SCOPES } from "@/lib/msal";
import { supabase } from "@/lib/supabase";

// /api/auth/microsoft?action=login  => starts auth
// /api/auth/microsoft?code=...      => handles callback
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const scopes = ["offline_access", "openid", "profile", "Mail.Read", "Mail.ReadWrite", "Calendars.Read"];

  // Start login
  if (req.query.action === "login") {
    const url = await msalApp.getAuthCodeUrl({
      scopes,
      redirectUri: AZURE_REDIRECT_URI,
      prompt: "select_account"
    });
    return res.redirect(url);
  }

  // Callback
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).json({ error: "Missing code" });

  try {
    const token = await msalApp.acquireTokenByCode({
      code,
      scopes,
      redirectUri: AZURE_REDIRECT_URI
    });

    const upn = token.account?.username || "";
    const tenant = (token as any).tenantId || "";
    const access = token.accessToken || "";
    const refresh = (token as any).refreshToken || "";

    if (!upn) throw new Error("No UPN on token");

    // persist or upsert the connected mailbox
    const { error } = await supabase
      .from("m365_users")
      .upsert(
        {
          upn,
          account_tenant: tenant,
          access_token_encrypted: access,
          refresh_token_encrypted: refresh
        },
        { onConflict: "upn" }
      );

    if (error) throw error;

    // land them on your dashboard
    return res.redirect("/dashboard");
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Auth error" });
  }
}
