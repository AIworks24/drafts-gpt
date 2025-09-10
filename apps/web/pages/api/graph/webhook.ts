// apps/web/pages/api/graph/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { gGet, createReplyDraft, updateDraftBody, findMeetingTimes } from '@/lib/graph';
import { draftReply } from '@/lib/enhanced-openai';

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
      try {
        console.log('\n=== PROCESSING NOTIFICATION ===');
        console.log('Notification:', {
          subscriptionId: notification.subscriptionId,
          messageId: notification.resourceData?.id,
          clientState: notification.clientState,
          lifecycleEvent: notification.lifecycleEvent
        });

        if (notification.lifecycleEvent === 'reauthorizationRequired') {
          console.log('Skipping reauthorization event');
          continue;
        }

        const subscriptionId = notification.subscriptionId;
        const messageId = notification.resourceData?.id;
        const clientState = notification.clientState;

        if (!subscriptionId || !messageId) {
          console.log('❌ Missing required fields, skipping');
          continue;
        }

        console.log('\n=== DATABASE LOOKUP DEBUG ===');
        console.log(`Looking for subscription ID: ${subscriptionId}`);

        // Test basic database connectivity first
        try {
          console.log('Testing database connectivity...');
          const { data: testQuery, error: testError } = await supabase
            .from('graph_subscriptions')
            .select('count(*)')
            .limit(1);
          
          if (testError) {
            console.log('❌ Database connectivity test failed:', testError);
            continue;
          }
          
          console.log('✅ Database connectivity OK');
        } catch (dbError: any) {
          console.log('❌ Database connection error:', dbError.message);
          continue;
        }

        // Query 1: Check all subscriptions
        try {
          console.log('Querying all subscriptions...');
          const { data: allSubs, error: allSubsError } = await supabase
            .from('graph_subscriptions')
            .select('id, user_id, active, client_state, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

          if (allSubsError) {
            console.log('❌ Error querying all subscriptions:', allSubsError);
          } else {
            console.log('✅ ALL SUBSCRIPTIONS (last 10):', {
              count: allSubs?.length || 0,
              subscriptions: allSubs?.map(s => ({
                id: s.id,
                user_id: s.user_id,
                active: s.active,
                client_state: s.client_state?.substring(0, 50) + '...',
                created_at: s.created_at
              })) || []
            });
          }
        } catch (queryError: any) {
          console.log('❌ Exception querying all subscriptions:', queryError.message);
        }

        // Query 2: Look for specific subscription (without active filter)
        try {
          console.log(`Querying specific subscription: ${subscriptionId}`);
          const { data: specificSub, error: specificError } = await supabase
            .from('graph_subscriptions')
            .select('*')
            .eq('id', subscriptionId)
            .maybeSingle();

          if (specificError) {
            console.log('❌ Error querying specific subscription:', specificError);
          } else if (specificSub) {
            console.log('✅ FOUND SPECIFIC SUBSCRIPTION:', {
              id: specificSub.id,
              user_id: specificSub.user_id,
              active: specificSub.active,
              client_state: specificSub.client_state,
              created_at: specificSub.created_at
            });
          } else {
            console.log('❌ SPECIFIC SUBSCRIPTION NOT FOUND');
          }
        } catch (queryError: any) {
          console.log('❌ Exception querying specific subscription:', queryError.message);
        }

        // Query 3: Look for subscription with active=true filter
        let subscription = null;
        try {
          console.log(`Querying subscription with active=true filter...`);
          const { data: activeSub, error: activeError } = await supabase
            .from('graph_subscriptions')
            .select('*')
            .eq('id', subscriptionId)
            .eq('active', true)
            .maybeSingle();

          if (activeError) {
            console.log('❌ Error querying active subscription:', activeError);
            continue;
          } else if (activeSub) {
            console.log('✅ FOUND ACTIVE SUBSCRIPTION');
            subscription = activeSub;
          } else {
            console.log('❌ ACTIVE SUBSCRIPTION NOT FOUND');
            continue;
          }
        } catch (queryError: any) {
          console.log('❌ Exception querying active subscription:', queryError.message);
          continue;
        }

        // Verify client state
        if (subscription.client_state !== clientState) {
          console.log('❌ Client state mismatch:', { 
            stored: subscription.client_state, 
            received: clientState 
          });
          continue;
        }

        console.log('✅ Client state verified');

        console.log('\n=== USER LOOKUP ===');
        
        let user = null;
        try {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', subscription.user_id)
            .single();

          if (userError) {
            console.log('❌ User lookup error:', userError);
            continue;
          }

          user = userData;
          console.log('✅ User found:', {
            id: user.id,
            upn: user.upn,
            client_id: user.client_id
          });
        } catch (userQueryError: any) {
          console.log('❌ Exception during user lookup:', userQueryError.message);
          continue;
        }

        console.log('\n=== TOKEN ACQUISITION ===');

        let tokenResult = null;
        try {
          // Get token cache
          const { data: cacheRow, error: cacheError } = await supabase
            .from('msal_token_cache')
            .select('cache_json')
            .eq('user_id', user.id)
            .single();

          if (cacheError || !cacheRow) {
            console.log('❌ No token cache found:', cacheError?.message);
            continue;
          }

          console.log('✅ Token cache found');

          // Hydrate MSAL cache
          const cache = msalApp.getTokenCache();
          cache.deserialize(JSON.stringify(cacheRow.cache_json));
          const accounts = await cache.getAllAccounts();
          
          if (!accounts || accounts.length === 0) {
            console.log('❌ No accounts in token cache');
            continue;
          }

          const account = accounts[0];
          console.log('✅ Account found:', account.username);

          tokenResult = await msalApp.acquireTokenSilent({ 
            account, 
            scopes: MS_SCOPES 
          });

          if (!tokenResult?.accessToken) {
            console.log('❌ No access token acquired');
            continue;
          }

          console.log('✅ Access token acquired');
        } catch (tokenError: any) {
          console.log('❌ Token acquisition failed:', tokenError.message);
          continue;
        }

        console.log('\n=== MESSAGE PROCESSING ===');

        let msg = null;
        try {
          console.log(`Fetching message: ${messageId}`);
          msg = await gGet(tokenResult.accessToken, `/me/messages/${messageId}`);
          console.log('✅ Message fetched successfully');
        } catch (messageError: any) {
          console.log('❌ Failed to fetch message:', messageError.message);
          continue;
        }

        // Extract message content
        const subject = msg?.subject || '';
        const fromEmail = msg?.from?.emailAddress?.address || '';
        const fromName = msg?.from?.emailAddress?.name || '';

        let bodyText = '';
        if (msg?.body?.content) {
          const raw = String(msg.body.content);
          if (msg.body.contentType?.toLowerCase() === 'html') {
            bodyText = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          } else {
            bodyText = raw;
          }
        }
        if (!bodyText) {
          bodyText = String(msg?.bodyPreview || '');
        }

        console.log('Message extracted:', {
          subject,
          from: `${fromName} <${fromEmail}>`,
          bodyLength: bodyText.length
        });

        console.log('\n=== CLIENT CONFIGURATION ===');

        let client = null;
        try {
          // Get client
          if (user.client_id) {
            const { data: clientData } = await supabase
              .from('clients')
              .select('*')
              .eq('id', user.client_id)
              .single();
            client = clientData;
          }

          // If no client associated with user, get the first available client
          if (!client) {
            const { data: firstClient } = await supabase
              .from('clients')
              .select('*')
              .eq('active', true)
              .order('created_at', { ascending: true })
              .limit(1)
              .single();
            client = firstClient;
          }

          if (!client) {
            console.log('❌ No client found');
            continue;
          }

          console.log('✅ Client found:', client.name);
        } catch (clientError: any) {
          console.log('❌ Client lookup failed:', clientError.message);
          continue;
        }

        console.log('\n=== AI PROCESSING ===');

        try {
          // Get templates
          const { data: templates } = await supabase
            .from('templates')
            .select('*')
            .eq('client_id', client.id)
            .eq('active', true)
            .order('created_at', { ascending: true });

          const template = templates?.[0]?.body_md || '';

          // Generate AI response
          console.log('Generating AI response...');
          const ai = await draftReply({
            originalPlain: bodyText,
            subject,
            tone: client.tone?.voice || 'professional',
            companyName: client.name,
            template: template,
            instructions: client.policies || undefined,
          });

          let html = ai?.bodyHtml || '<p>Thanks for your email.</p>';

          // Add signature
          if (client.signature) {
            html += `<br/><br/>${client.signature}`;
          }

          console.log('✅ AI response generated');

          console.log('\n=== DRAFT CREATION ===');

          // Create draft
          const draft = await createReplyDraft(tokenResult.accessToken, messageId, false);
          await updateDraftBody(tokenResult.accessToken, draft.id, html);
          
          console.log('✅ Draft created successfully:', draft.id);

          // Record usage
          const tokens = ai?.tokens || { prompt: 0, completion: 0, total: 0 };
          await supabase.from('usage_events').insert({
            client_id: client.id,
            user_id: user.id,
            mailbox_upn: user.upn,
            event_type: 'webhook',
            message_id: messageId,
            draft_id: draft.id,
            subject,
            status: 'completed'
          });

          console.log('✅ Usage recorded');

        } catch (processingError: any) {
          console.log('❌ Processing failed:', processingError.message);
          console.log('Error stack:', processingError.stack);
        }

        console.log('=== NOTIFICATION COMPLETE ===\n');

      } catch (notificationError: any) {
        console.log('❌ NOTIFICATION ERROR:', notificationError.message);
        console.log('Error stack:', notificationError.stack);
      }
    }

  } catch (error: any) {
    console.error('❌ WEBHOOK ERROR:', error.message);
    console.error('Error stack:', error.stack);
  }
}