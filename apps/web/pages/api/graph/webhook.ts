import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Method:', req.method);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('========================');

  // Handle validation for both GET and POST requests
  const validationToken = req.query.validationToken || req.body?.validationToken;
  
  if (validationToken) {
    console.log('Webhook validation - returning token:', validationToken);
    return res.status(200).send(validationToken);
  }

  if (req.method === 'GET') {
    return res.status(400).send('Missing validationToken');
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Acknowledge receipt immediately
  res.status(202).json({ ok: true });

  try {
    const events: any[] = Array.isArray(req.body?.value) ? req.body.value : [];
    console.log(`Processing ${events.length} events`);

    for (const notification of events) {
      const messageId = notification.resourceData?.id;
      if (messageId) {
        console.log(`Calling Edge Function for message: ${messageId}`);
        
        // Call your working Edge Function to do the actual processing
        try {
          const edgeResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/worker-run`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              'x-edge-secret': process.env.EDGE_FUNCTION_SECRET || '',
            },
            body: JSON.stringify({ messageId }),
          });

          const result = await edgeResponse.json();
          console.log('Edge Function result:', result);
        } catch (edgeError: any) {
          console.error('Edge Function call failed:', edgeError.message);
        }
      }
    }
  } catch (error: any) {
    console.error('Webhook processing error:', error.message);
  }
}