import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('Debug webhook test hit:', {
    method: req.method,
    headers: req.headers,
    body: req.body,
    query: req.query
  });
  
  return res.json({
    received: true,
    method: req.method,
    timestamp: new Date().toISOString()
  });
}