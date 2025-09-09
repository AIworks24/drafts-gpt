import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Simple auth check - you can make this more secure
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Find subscriptions expiring in the next 12 hours
    const renewalThreshold = new Date(Date.now() + 12 * 60 * 60 * 1000);
    
    const { data: expiringSubs } = await supabase
      .from('graph_subscriptions')
      .select(`
        *,
        users (
          id,
          upn
        ),
        msal_token_cache (
          cache_json
        )
      `)
      .eq('active', true)
      .lt('expires_at', renewalThreshold.toISOString());

    let renewed = 0;
    let failed = 0;

    for (const sub of expiringSubs || []) {
      try {
        // Get fresh token
        const cache = msalApp.getTokenCache();
        cache.deserialize(JSON.stringify(sub.msal_token_cache.cache_json));
        const [account] = await cache.getAllAccounts();
        
        if (!account) {
          failed++;
          continue;
        }

        const tokenResult = await msalApp.acquireTokenSilent({ 
          account, 
          scopes: MS_SCOPES 
        });

        if (!tokenResult?.accessToken) {
          failed++;
          continue;
        }

        // Renew subscription with new expiration time
        const newExpirationTime = new Date(Date.now() + 4230 * 60 * 1000);
        
        await axios.patch(
          `https://graph.microsoft.com/v1.0/subscriptions/${sub.id}`,
          {
            expirationDateTime: newExpirationTime.toISOString()
          },
          {
            headers: {
              'Authorization': `Bearer ${tokenResult.accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // Update database
        await supabase
          .from('graph_subscriptions')
          .update({ expires_at: newExpirationTime.toISOString() })
          .eq('id', sub.id);

        renewed++;
        console.log(`Renewed subscription ${sub.id} for user ${sub.users.upn}`);

      } catch (error) {
        console.error(`Failed to renew subscription ${sub.id}:`, error);
        failed++;
      }
    }

    return res.json({
      success: true,
      renewed,
      failed,
      total: expiringSubs?.length || 0
    });

  } catch (error) {
    console.error('Subscription renewal error:', error);
    return res.status(500).json({ error: 'Renewal failed' });
  }
}