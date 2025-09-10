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

      console.log('\n=== DATABASE LOOKUP ===');
      console.log(`Looking for subscription ID: ${subscriptionId}`);

      // FIXED QUERY: The issue was in your original webhook code
      // It was doing complex joins when it should first find the subscription, then get the user
      const { data: subscription, error: subscriptionError } = await supabase
        .from('graph_subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .eq('active', true)
        .single();

      console.log('Subscription lookup result:', {
        found: !!subscription,
        error: subscriptionError?.message,
        subscriptionData: subscription ? {
          id: subscription.id,
          user_id: subscription.user_id,
          client_state: subscription.client_state,
          active: subscription.active
        } : null
      });

      if (subscriptionError || !subscription) {
        console.log('❌ No subscription found');
        continue;
      }

      console.log('✅ Subscription found');

      // Verify client state
      if (subscription.client_state !== clientState) {
        console.log('❌ Client state mismatch:', { 
          stored: subscription.client_state, 
          received: clientState 
        });
        continue;
      }

      console.log('✅ Client state verified');

      // Now get the user separately
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', subscription.user_id)
        .single();

      console.log('User lookup result:', {
        found: !!user,
        error: userError?.message,
        userData: user ? {
          id: user.id,
          upn: user.upn,
          client_id: user.client_id
        } : null
      });

      if (userError || !user) {
        console.log('❌ No user found for subscription');
        continue;
      }

      console.log('✅ User found:', user.upn);

      console.log('\n=== TOKEN ACQUISITION ===');

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
      const tokenResult = await msalApp.acquireTokenSilent({ 
        account, 
        scopes: MS_SCOPES 
      }).catch(error => {
        console.log('❌ Token acquisition failed:', error.message);
        return null;
      });

      if (!tokenResult?.accessToken) {
        console.log('❌ No access token acquired');
        continue;
      }

      console.log('✅ Access token acquired');

      console.log('\n=== MESSAGE PROCESSING ===');

      // Fetch the message
      let msg;
      try {
        msg = await gGet(tokenResult.accessToken, `/me/messages/${messageId}`);
        console.log('✅ Message fetched successfully');
      } catch (error: any) {
        console.log('❌ Failed to fetch message:', error.message);
        continue;
      }

      // Extract message content
      const subject = msg?.subject || '';
      const fromEmail = msg?.from?.emailAddress?.address || '';
      const fromName = msg?.from?.emailAddress?.name || '';

      console.log('Message details:', {
        subject,
        from: `${fromName} <${fromEmail}>`
      });

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

      console.log('\n=== CLIENT CONFIGURATION ===');

      // Get client - handle case where user might not have client_id set
      let client = null;
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
        console.log('No client associated with user, getting first available client...');
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

      console.log('✅ Client found:', {
        id: client.id,
        name: client.name,
        tone: client.tone?.voice || 'professional'
      });

      // Get templates
      const { data: templates } = await supabase
        .from('templates')
        .select('*')
        .eq('client_id', client.id)
        .eq('active', true)
        .order('created_at', { ascending: true });

      const template = templates?.[0]?.body_md || '';
      console.log('Template found:', !!template);

      console.log('\n=== AI PROCESSING ===');

      // Check for meeting request
      const looksLikeMeetingRequest = /\b(meeting|call|schedule|available|time|when|calendar)\b/i.test(subject + ' ' + bodyText);
      console.log('Meeting request detected:', looksLikeMeetingRequest);

      let meetingTimes: string[] = [];
      if (looksLikeMeetingRequest) {
        try {
          const now = new Date();
          const inWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          
          meetingTimes = await findMeetingTimes(tokenResult.accessToken, {
            attendee: fromEmail,
            tz: client.timezone || 'UTC',
            windowStartISO: now.toISOString(),
            windowEndISO: inWeek.toISOString(),
            durationISO: 'PT30M',
            maxCandidates: 3
          });
          
          console.log(`✅ Found ${meetingTimes.length} meeting times`);
        } catch (error: any) {
          console.log('⚠️ Meeting times lookup failed:', error.message);
        }
      }

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

      // Add meeting times
      if (meetingTimes.length > 0) {
        const timesList = meetingTimes
          .map(time => `<li>${time}</li>`)
          .join('');
        html += `<p>Here are some times that work for us:</p><ul>${timesList}</ul>`;
      }

      // Add signature
      if (client.signature) {
        html += `<br/><br/>${client.signature}`;
      }

      console.log('✅ AI response generated');

      console.log('\n=== DRAFT CREATION ===');

      // Create draft
      try {
        const draft = await createReplyDraft(tokenResult.accessToken, messageId, false);
        await updateDraftBody(tokenResult.accessToken, draft.id, html);
        
        console.log('✅ Draft created successfully:', draft.id);

        // Record usage
        const tokens = ai?.tokens || { prompt: 0, completion: 0, total: 0 };
        const estimatedCost = tokens.total * 0.000002;

        const { error: usageError } = await supabase.from('usage_events').insert({
          client_id: client.id,
          user_id: user.id,
          mailbox_upn: user.upn,
          event_type: 'webhook',
          message_id: messageId,
          draft_id: draft.id,
          subject,
          meta: {
            from: fromEmail,
            meetingTimesFound: meetingTimes.length,
            templateUsed: !!template
          },
          tokens_prompt: tokens.prompt,
          tokens_completion: tokens.completion,
          cost_usd: estimatedCost,
          status: 'completed'
        });

        if (usageError) {
          console.log('⚠️ Failed to record usage:', usageError.message);
        } else {
          console.log('✅ Usage recorded');
        }

      } catch (error: any) {
        console.log('❌ Draft creation failed:', error.message);
        
        // Record the error
        await supabase.from('usage_events').insert({
          client_id: client.id,
          user_id: user.id,
          mailbox_upn: user.upn,
          event_type: 'webhook',
          message_id: messageId,
          subject,
          meta: { error: error.message },
          status: 'error'
        });
      }

      console.log('=== NOTIFICATION COMPLETE ===\n');
    }

  } catch (error: any) {
    console.error('❌ WEBHOOK ERROR:', error);
  }
}