// apps/web/pages/api/graph/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer as supabase } from '@/lib/supabase-server';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Method:', req.method);
  
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

  console.log('DIAGNOSTIC: About to start processing...');

  try {
    console.log('DIAGNOSTIC: Parsing events...');
    const events: any[] = Array.isArray(req.body?.value) ? req.body.value : [];
    console.log(`DIAGNOSTIC: Found ${events.length} events`);

    for (let i = 0; i < events.length; i++) {
      const notification = events[i];
      console.log(`DIAGNOSTIC: Processing event ${i + 1}/${events.length}`);
      
      const subscriptionId = notification.subscriptionId;
      console.log(`DIAGNOSTIC: Subscription ID: ${subscriptionId}`);

      if (!subscriptionId) {
        console.log('DIAGNOSTIC: No subscription ID, skipping');
        continue;
      }

      console.log('DIAGNOSTIC: About to test database...');

      // Test 1: Simple query with timeout
      try {
        console.log('DIAGNOSTIC: Starting simple count query...');
        
        const startTime = Date.now();
        const { count, error } = await supabase
          .from('graph_subscriptions')
          .select('*', { count: 'exact', head: true });
        
        const endTime = Date.now();
        console.log(`DIAGNOSTIC: Count query completed in ${endTime - startTime}ms`);
        
        if (error) {
          console.log('DIAGNOSTIC: Count query error:', error);
          console.log('DIAGNOSTIC: Error details:', JSON.stringify(error, null, 2));
        } else {
          console.log(`DIAGNOSTIC: Count query success - found ${count} records`);
        }
      } catch (countError: any) {
        console.log('DIAGNOSTIC: Count query exception:', countError.message);
        console.log('DIAGNOSTIC: Exception stack:', countError.stack);
      }

      console.log('DIAGNOSTIC: About to query specific subscription...');

      // Test 2: Direct subscription lookup
      try {
        console.log(`DIAGNOSTIC: Looking for subscription ${subscriptionId}...`);
        
        const startTime = Date.now();
        const result = await supabase
          .from('graph_subscriptions')
          .select('id, user_id, active, created_at')
          .eq('id', subscriptionId)
          .maybeSingle();
        
        const endTime = Date.now();
        console.log(`DIAGNOSTIC: Subscription query completed in ${endTime - startTime}ms`);
        
        if (result.error) {
          console.log('DIAGNOSTIC: Subscription query error:', result.error);
          console.log('DIAGNOSTIC: Error details:', JSON.stringify(result.error, null, 2));
        } else if (result.data) {
          console.log('DIAGNOSTIC: Subscription found:', result.data);
        } else {
          console.log('DIAGNOSTIC: Subscription not found (null result)');
        }
      } catch (subError: any) {
        console.log('DIAGNOSTIC: Subscription query exception:', subError.message);
        console.log('DIAGNOSTIC: Exception stack:', subError.stack);
      }

      console.log('DIAGNOSTIC: About to check environment...');

      // Test 3: Environment check
      try {
        console.log('DIAGNOSTIC: Environment variables:');
        console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
        console.log('- SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');
        console.log('- NODE_ENV:', process.env.NODE_ENV);
      } catch (envError: any) {
        console.log('DIAGNOSTIC: Environment check failed:', envError.message);
      }

      console.log(`DIAGNOSTIC: Event ${i + 1} processing complete`);
    }

    console.log('DIAGNOSTIC: All events processed successfully');

  } catch (error: any) {
    console.error('DIAGNOSTIC: Top-level error:', error.message);
    console.error('DIAGNOSTIC: Error stack:', error.stack);
    console.error('DIAGNOSTIC: Error details:', JSON.stringify(error, null, 2));
  }

  console.log('DIAGNOSTIC: Handler execution complete');
}