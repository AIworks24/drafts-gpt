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

    // Get user's MSAL token cache
    const { data: cacheRow } = await supabase
      .from('msal_token_cache')
      .select('cache_json')
      .eq('user_id', sess.userId)
      .single();

    if (!cacheRow) {
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
      console.error('Token acquisition failed:', error);
      return null;
    });

    if (!tokenResult?.accessToken) {
      return res.status(401).json({ error: 'Failed to acquire access token. Please sign in again.' });
    }

    // Check for existing active subscription
    const { data: existingSubs } = await supabase
      .from('graph_subscriptions')
      .select('id, expires_at')
      .eq('user_id', sess.userId)
      .eq('active', true);

    // Clean up expired subscriptions
    if (existingSubs && existingSubs.length > 0) {
      const now = new Date();
      const expiredSubs = existingSubs.filter(sub => new Date(sub.expires_at) < now);
      
      if (expiredSubs.length > 0) {
        await supabase
          .from('graph_subscriptions')
          .update({ active: false })
          .in('id', expiredSubs.map(s => s.id));
      }

      // Check if we have any active subscriptions left
      const activeSubs = existingSubs.filter(sub => new Date(sub.expires_at) >= now);
      if (activeSubs.length > 0) {
        return res.status(200).json({ 
          success: true, 
          message: 'Already subscribed',
          subscription: activeSubs[0] 
        });
      }
    }

    // Create new Graph subscription
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/graph/webhook`;
    const expirationTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const clientState = `dgpt-${sess.userId}-${Date.now()}`;

    console.log('Creating Graph subscription:', {
      webhookUrl,
      expirationTime: expirationTime.toISOString(),
      clientState
    });

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
        },
        timeout: 10000 // 10 second timeout
      }
    );

    if (!response.data?.id) {
      throw new Error('Invalid response from Microsoft Graph API');
    }

    // Save subscription to database
    const { error: insertError } = await supabase
      .from('graph_subscriptions')
      .insert({
        id: response.data.id,
        user_id: sess.userId,
        client_state: clientState,
        expires_at: response.data.expirationDateTime,
        active: true
      });

    if (insertError) {
      console.error('Failed to save subscription:', insertError);
      // Try to delete the subscription from Graph since we couldn't save it
      try {
        await axios.delete(
          `https://graph.microsoft.com/v1.0/subscriptions/${response.data.id}`,
          { headers: { 'Authorization': `Bearer ${tokenResult.accessToken}` } }
        );
      } catch (deleteError) {
        console.error('Failed to cleanup Graph subscription:', deleteError);
      }
      throw new Error('Failed to save subscription to database');
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Successfully subscribed to mailbox notifications',
      subscription: {
        id: response.data.id,
        expiresAt: response.data.expirationDateTime,
        resource: response.data.resource
      }
    });

  } catch (error: any) {
    console.error('Webhook subscription error:', error);
    
    // Provide more specific error messages
    if (error.response?.status === 403) {
      return res.status(403).json({ 
        error: 'Insufficient permissions. Please ensure your app has Mail.Read permissions.' 
      });
    }
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Authentication failed. Please sign out and sign in again.' 
      });
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(500).json({ 
        error: 'Network error. Please check your internet connection and try again.' 
      });
    }

    return res.status(500).json({ 
      error: error.message || 'Failed to create webhook subscription' 
    });
  }
}