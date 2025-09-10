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

      console.log('\n=== DATABASE LOOKUP DEBUG ===');
      console.log(`Looking for subscription ID: ${subscriptionId}`);

      // First, let's see ALL subscriptions to debug
      const { data: allSubs, error: allSubsError } = await supabase
        .from('graph_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('ALL SUBSCRIPTIONS IN DATABASE:', {
        count: allSubs?.length || 0,
        error: allSubsError?.message,
        subscriptions: allSubs?.map(s => ({
          id: s.id,
          user_id: s.user_id,
          active: s.active,
          client_state: s.client_state,
          created_at: s.created_at
        })) || []
      });

      // Now look for active subscriptions
      const { data: activeSubs, error: activeSubsError } = await supabase
        .from('graph_subscriptions')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      console.log('ACTIVE SUBSCRIPTIONS:', {
        count: activeSubs?.length || 0,
        error: activeSubsError?.message,
        subscriptions: activeSubs?.map(s => ({
          id: s.id,
          user_id: s.user_id,
          client_state: s.client_state,
          created_at: s.created_at
        })) || []
      });

      // Check if the specific subscription exists (without active filter first)
      const { data: subscriptionAny, error: subscriptionAnyError } = await supabase
        .from('graph_subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single();

      console.log('SUBSCRIPTION EXISTS CHECK (no active filter):', {
        found: !!subscriptionAny,
        error: subscriptionAnyError?.message,
        subscription: subscriptionAny ? {
          id: subscriptionAny.id,
          user_id: subscriptionAny.user_id,
          active: subscriptionAny.active,
          client_state: subscriptionAny.client_state
        } : null
      });

      // Now check with active filter
      const { data: subscription, error: subscriptionError } = await supabase
        .from('graph_subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .eq('active', true)
        .single();

      console.log('SUBSCRIPTION LOOKUP (with active=true):', {
        found: !!subscription,
        error: subscriptionError?.message,
        subscription: subscription ? {
          id: subscription.id,
          user_id: subscription.user_id,
          active: subscription.active,
          client_state: subscription.client_state
        } : null
      });

      if (subscriptionError || !subscription) {
        console.log('❌ SUBSCRIPTION NOT FOUND OR ERROR');
        console.log('Error details:', subscriptionError);
        
        // If subscription exists but not active, log that
        if (subscriptionAny && !subscriptionAny.active) {
          console.log('⚠️ SUBSCRIPTION EXISTS BUT IS INACTIVE');
        }
        
        continue;
      }

      console.log('✅ Subscription found and active');

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
      
      // Get the user
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

      console.log('Token cache lookup:', {
        found: !!cacheRow,
        error: cacheError?.message
      });

      if (cacheError || !cacheRow) {
        console.log('❌ No token cache found');
        continue;
      }

      console.log('✅ Token cache found');

      // Hydrate MSAL cache
      try {
        const cache = msalApp.getTokenCache();
        cache.deserialize(JSON.stringify(cacheRow.cache_json));
        const accounts = await cache.getAllAccounts();
        
        console.log('MSAL cache accounts:', {
          count: accounts?.length || 0,
          accounts: accounts?.map(a => ({ username: a.username, tenantId: a.tenantId })) || []
        });
        
        if (!accounts || accounts.length === 0) {
          console.log('❌ No accounts in token cache');
          continue;
        }

        const account = accounts[0];
        console.log('Using account:', account.username);

        const tokenResult = await msalApp.acquireTokenSilent({ 
          account, 
          scopes: MS_SCOPES 
        });

        if (!tokenResult?.accessToken) {
          console.log('❌ No access token acquired');
          continue;
        }

        console.log('✅ Access token acquired successfully');

        console.log('\n=== MESSAGE PROCESSING ===');

        // Fetch the message
        let msg;
        try {
          console.log(`Fetching message with ID: ${messageId}`);
          msg = await gGet(tokenResult.accessToken, `/me/messages/${messageId}`);
          console.log('✅ Message fetched successfully');
          console.log('Message preview:', {
            subject: msg?.subject,
            from: msg?.from?.emailAddress?.address,
            bodyPreview: msg?.bodyPreview?.substring(0, 100)
          });
        } catch (error: any) {
          console.log('❌ Failed to fetch message:', error.message);
          console.log('Error details:', error.response?.data || error);
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

        console.log('Extracted content:', {
          subject,
          from: `${fromName} <${fromEmail}>`,
          bodyLength: bodyText.length
        });

        console.log('\n=== CLIENT CONFIGURATION ===');

        // Get client
        let client = null;
        if (user.client_id) {
          const { data: clientData, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', user.client_id)
            .single();
          
          console.log('User client lookup:', {
            found: !!clientData,
            error: clientError?.message
          });
          
          client = clientData;
        }

        // If no client associated with user, get the first available client
        if (!client) {
          console.log('No client associated with user, getting first available client...');
          const { data: firstClient, error: firstClientError } = await supabase
            .from('clients')
            .select('*')
            .eq('active', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .single();
          
          console.log('First client lookup:', {
            found: !!firstClient,
            error: firstClientError?.message
          });
          
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
        const { data: templates, error: templatesError } = await supabase
          .from('templates')
          .select('*')
          .eq('client_id', client.id)
          .eq('active', true)
          .order('created_at', { ascending: true });

        console.log('Templates lookup:', {
          found: templates?.length || 0,
          error: templatesError?.message
        });

        const template = templates?.[0]?.body_md || '';

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

        console.log('AI response generated:', {
          hasBodyHtml: !!ai?.bodyHtml,
          tokens: ai?.tokens
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

        console.log('\n=== DRAFT CREATION ===');

        // Create draft
        try {
          console.log('Creating reply draft...');
          const draft = await createReplyDraft(tokenResult.accessToken, messageId, false);
          console.log('Draft created, updating body...');
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
          console.log('Error details:', error.response?.data || error);
          
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

      } catch (tokenError: any) {
        console.log('❌ Token acquisition failed:', tokenError.message);
        console.log('Token error details:', tokenError);
        continue;
      }

      console.log('=== NOTIFICATION COMPLETE ===\n');
    }

  } catch (error: any) {
    console.error('❌ WEBHOOK ERROR:', error);
  }
}