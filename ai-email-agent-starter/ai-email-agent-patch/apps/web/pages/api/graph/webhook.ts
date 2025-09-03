import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const validationToken = req.query.validationToken as string;
    if (validationToken) return res.status(200).send(validationToken);
  }

  if (req.method === "POST") {
    res.status(202).end();
    const notifications = req.body.value as any[];
    for (const n of notifications) {
      if (n.resource?.includes("/messages/")) {
        console.log("New mail event", n);
        // TODO: enqueue sync job
      }
    }
  }
}