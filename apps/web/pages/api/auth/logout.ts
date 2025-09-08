// apps/web/pages/api/auth/logout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { clearSession } from "@/lib/session";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  clearSession(res);
  res.redirect("/dashboard");
}
