// apps/web/pages/api/graph/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle validation
  const validationToken = req.query.validationToken || req.body?.validationToken;
  if (validationToken) {
    return res.status(200).send(validationToken);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Acknowledge immediately
  res.status(202).json({ ok: true });

  console.log('=== DIAGNOSTIC START ===');

  // Test 1: Environment variables
  console.log('ENV TEST:');
  console.log('- SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
  console.log('- SUPABASE_SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('- NODE_ENV:', process.env.NODE_ENV);

  // Test 2: Can we import Supabase?
  try {
    console.log('IMPORT TEST: Importing Supabase...');
    const { createClient } = require('@supabase/supabase-js');
    console.log('✅ Supabase import successful');

    // Test 3: Can we create client?
    console.log('CLIENT TEST: Creating Supabase client...');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    console.log('✅ Supabase client created');

    // Test 4: Can we query database?
    console.log('DATABASE TEST: Testing simple query...');
    const { data, error } = await Promise.race([
      supabase.from('graph_subscriptions').select('count').limit(1),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 5000))
    ]);

    if (error) {
      console.log('❌ Database query error:', error);
    } else {
      console.log('✅ Database query successful:', data);

      // Test 5: Look for specific subscription
      const events = Array.isArray(req.body?.value) ? req.body.value : [];
      if (events.length > 0) {
        const subscriptionId = events[0].subscriptionId;
        console.log(`SUBSCRIPTION TEST: Looking for ${subscriptionId}...`);

        const { data: sub, error: subError } = await supabase
          .from('graph_subscriptions')
          .select('*')
          .eq('id', subscriptionId);

        if (subError) {
          console.log('❌ Subscription query error:', subError);
        } else {
          console.log('✅ Subscription query result:', sub);
        }
      }
    }

  } catch (error: any) {
    console.log('❌ ERROR in diagnostic:', error.message);
    console.log('Error stack:', error.stack);
  }

  console.log('=== DIAGNOSTIC END ===');
}