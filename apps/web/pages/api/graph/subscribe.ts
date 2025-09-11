// apps/web/pages/api/graph/subscribe.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const sess = getSession(req);
    if (!sess?.userId) {
      return res.status(401).json({ error: 'Not signed in' });
    }

    console.log('=== SUBSCRIPTION REQUEST ===');
    console.log('User ID:', sess.userId);

    // Get user's MSAL token cache
    const { data: cacheRow, error: cacheError } = await supabase
      .from('msal_token_cache')
      .select('cache_json')
      .eq('user_id', sess.userId)
      .single();

    if (cacheError || !cacheRow) {
      console.log('❌ No token cache found:', cacheError?.message);
      return res.status(401).json({ error: 'No token cache for user. Please sign in again.' });
    }

    // Hydrate MSAL cache and get account
    const cache = msalApp.getTokenCache();
    cache.deserialize(JSON.stringify(cacheRow.cache_json));
    const accounts = await cache.getAllAccounts();
    const account = accounts[0];
    
    if (!account) {
      return res.status(401).json({ error: 'No account in cache. Please sign in again.' });
    }

    // Get access token
    const tokenResult = await msalApp.acquireTokenSilent({ 
      account, 
      scopes: MS_SCOPES 
    }).catch(error => {
      console.error('❌ Token acquisition failed:', error);
      return null;
    });

    if (!tokenResult?.accessToken) {
      return res.status(401).json({ error: 'Failed to acquire access token. Please sign in again.' });
    }

    console.log('✅ Access token acquired');

    // Clean up existing subscriptions
    const { data: existingSubs } = await supabase
      .from('graph_subscriptions')
      .select('id')
      .eq('user_id', sess.userId);

    if (existingSubs && existingSubs.length > 0) {
      console.log(`Deactivating ${existingSubs.length} existing subscriptions...`);
      
      await supabase
        .from('graph_subscriptions')
        .update({ active: false })
        .eq('user_id', sess.userId);

      // Try to delete old subscriptions from Microsoft Graph
      for (const oldSub of existingSubs) {
        try {
          await axios.delete(
            `https://graph.microsoft.com/v1.0/subscriptions/${oldSub.id}`,
            { headers: { 'Authorization': `Bearer ${tokenResult.accessToken}` } }
          );
          console.log(`✅ Deleted old subscription: ${oldSub.id}`);
        } catch (deleteError: any) {
          console.log(`⚠️ Failed to delete subscription ${oldSub.id}:`, deleteError.response?.status);
        }
      }
    }

    // Create new Graph subscription pointing to your Edge Function
    const webhookUrl = `${process.env.SUPABASE_URL}/functions/v1/worker-run`;
    const expirationTime = new Date(Date.now() + 4230 * 60 * 1000); // ~3 days
    const clientState = `dgpt-${sess.userId}-${Date.now()}`;

    console.log('Creating subscription with webhook URL:', webhookUrl);

    const subscriptionData = {
      changeType: 'created',
      notificationUrl: webhookUrl,
      resource: '/me/messages',
      expirationDateTime: expirationTime.toISOString(),
      clientState: clientState,
    };

    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/subscriptions',
      subscriptionData,
      { 
        headers: { 
          'Authorization': `Bearer ${tokenResult.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Graph subscription created:', response.data.id);

    // Save new subscription to database
    const { data: savedSubscription, error: insertError } = await supabase
      .from('graph_subscriptions')
      .insert({
        id: response.data.id,
        user_id: sess.userId,
        client_state: clientState,
        expires_at: response.data.expirationDateTime,
        active: true
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to save subscription:', insertError);
      
      // Clean up Graph subscription
      try {
        await axios.delete(
          `https://graph.microsoft.com/v1.0/subscriptions/${response.data.id}`,
          { headers: { 'Authorization': `Bearer ${tokenResult.accessToken}` } }
        );
      } catch (deleteError) {
        console.error('❌ Failed to cleanup subscription:', deleteError);
      }
      
      return res.status(500).json({ error: 'Failed to save subscription to database' });
    }

    console.log('✅ Subscription saved to database');

    return res.status(200).json({ 
      success: true, 
      message: 'Successfully subscribed to mailbox notifications using Edge Function',
      subscription: {
        id: response.data.id,
        expiresAt: response.data.expirationDateTime,
        webhookUrl: webhookUrl,
        clientState: clientState
      }
    });

  } catch (error: any) {
    console.error('❌ SUBSCRIPTION ERROR:', error.message);
    
    if (error.response?.status === 400) {
      return res.status(400).json({ 
        error: `Microsoft Graph rejected the subscription: ${error.response.data?.error?.message || 'Bad Request'}`,
        webhookUrl: `${process.env.SUPABASE_URL}/functions/v1/worker-run`
      });
    }
    
    return res.status(500).json({ 
      error: error.message || 'Failed to create webhook subscription'
    });
  }
}