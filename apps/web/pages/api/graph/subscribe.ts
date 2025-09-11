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

    console.log('Processing subscription request for user:', sess.userId);

    // Get user's MSAL token cache
    const { data: cacheRow, error: cacheError } = await supabase
      .from('msal_token_cache')
      .select('cache_json')
      .eq('user_id', sess.userId)
      .single();

    if (cacheError || !cacheRow) {
      console.log('No token cache found for user');
      return res.status(401).json({ error: 'No token cache for user. Please sign in again.' });
    }

    console.log('Found token cache, acquiring access token...');

    // Hydrate MSAL cache and get account
    const cache = msalApp.getTokenCache();
    cache.deserialize(JSON.stringify(cacheRow.cache_json));
    const accounts = await cache.getAllAccounts();
    const account = accounts[0];
    
    if (!account) {
      console.log('No account found in token cache');
      return res.status(401).json({ error: 'No account in cache. Please sign in again.' });
    }

    console.log('Getting access token for account:', account.username);

    // Get access token
    const tokenResult = await msalApp.acquireTokenSilent({ 
      account, 
      scopes: MS_SCOPES 
    }).catch(error => {
      console.error('Token acquisition failed:', error);
      return null;
    });

    if (!tokenResult?.accessToken) {
      console.log('Failed to acquire access token');
      return res.status(401).json({ error: 'Failed to acquire access token. Please sign in again.' });
    }

    console.log('Got access token, processing message...');

    console.log('Cleaning up existing subscriptions...');

    // Get all existing subscriptions for this user
    const { data: existingSubs, error: existingError } = await supabase
      .from('graph_subscriptions')
      .select('id, expires_at, active')
      .eq('user_id', sess.userId);

    // Deactivate all existing subscriptions in our database
    if (existingSubs && existingSubs.length > 0) {
      console.log(`Found ${existingSubs.length} existing subscriptions, deactivating...`);
      
      const { error: deactivateError } = await supabase
        .from('graph_subscriptions')
        .update({ active: false })
        .eq('user_id', sess.userId);
      
      if (deactivateError) {
        console.error('Failed to deactivate existing subscriptions:', deactivateError);
      }

      // Try to delete the old subscriptions from Microsoft Graph
      for (const oldSub of existingSubs) {
        try {
          await axios.delete(
            `https://graph.microsoft.com/v1.0/subscriptions/${oldSub.id}`,
            { 
              headers: { 'Authorization': `Bearer ${tokenResult.accessToken}` },
              timeout: 5000
            }
          );
          console.log(`Deleted old Graph subscription: ${oldSub.id}`);
        } catch (deleteError: any) {
          console.log(`Failed to delete old Graph subscription ${oldSub.id}:`, deleteError.response?.status);
        }
      }
    }

    // Create new Graph subscription
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/graph/webhook`;
    const expirationTime = new Date(Date.now() + 4230 * 60 * 1000); // ~3 days (max allowed)
    const clientState = `dgpt-${sess.userId}-${Date.now()}`;

    console.log('Creating new Graph subscription with data:', {
      webhookUrl,
      expirationTime: expirationTime.toISOString(),
      clientState,
      resource: '/me/messages'
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
        timeout: 15000
      }
    );

    console.log('Graph subscription created successfully:', response.data.id);

    if (!response.data?.id) {
      throw new Error('Invalid response from Microsoft Graph API - no subscription ID');
    }

    // Save new subscription to database
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
      console.error('Failed to save subscription to database:', insertError);
      
      // Try to delete the subscription from Graph since we couldn't save it
      try {
        await axios.delete(
          `https://graph.microsoft.com/v1.0/subscriptions/${response.data.id}`,
          { headers: { 'Authorization': `Bearer ${tokenResult.accessToken}` } }
        );
        console.log('Cleaned up Graph subscription after database error');
      } catch (deleteError) {
        console.error('Failed to cleanup Graph subscription:', deleteError);
      }
      
      return res.status(500).json({ error: 'Failed to save subscription to database' });
    }

    console.log('Subscription saved to database successfully');

    return res.status(200).json({ 
      success: true, 
      message: 'Successfully subscribed to mailbox notifications',
      subscription: {
        id: response.data.id,
        expiresAt: response.data.expirationDateTime,
        resource: response.data.resource,
        notificationUrl: response.data.notificationUrl,
        clientState: clientState
      },
      cleanedUp: existingSubs?.length || 0
    });

  } catch (error: any) {
    console.error('Webhook subscription error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method
      }
    });
    
    // Provide specific error messages based on response
    if (error.response?.status === 400) {
      const errorDetails = error.response.data?.error;
      return res.status(400).json({ 
        error: `Microsoft Graph rejected the subscription: ${errorDetails?.message || 'Bad Request'}`,
        details: errorDetails,
        webhookUrl: `${process.env.WEBHOOK_BASE_URL}/api/graph/webhook`
      });
    }
    
    if (error.response?.status === 403) {
      return res.status(403).json({ 
        error: 'Insufficient permissions. Your app needs Mail.Read permissions in Azure.' 
      });
    }
    
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        error: 'Authentication failed. Please sign out and sign in again.' 
      });
    }

    return res.status(500).json({ 
      error: error.response?.data?.error?.message || error.message || 'Failed to create webhook subscription',
      webhookUrl: `${process.env.WEBHOOK_BASE_URL}/api/graph/webhook`
    });
  }
}