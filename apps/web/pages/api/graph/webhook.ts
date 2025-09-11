import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { msalApp, MS_SCOPES } from '@/lib/msal';
import { getMessage, createReplyDraft, updateDraftBody } from '@/lib/graph';
import { draftReply } from '@/lib/enhanced-openai';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Method:', req.method);

  // Handle validation
  const validationToken = req.query.validationToken || req.body?.validationToken;
  if (validationToken) {
    console.log('Webhook validation - returning token:', validationToken);
    return res.status(200).send(validationToken);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Acknowledge immediately
  res.status(202).json({ ok: true });

  try {
    const events = Array.isArray(req.body?.value) ? req.body.value : [];
    console.log(`Processing ${events.length} events`);

    for (const notification of events) {
      const subscriptionId = notification.subscriptionId;
      const messageId = notification.resourceData?.id;
      
      if (!subscriptionId || !messageId) {
        console.log('Missing subscription ID or message ID');
        continue;
      }

      console.log(`Processing subscription: ${subscriptionId}, message: ${messageId}`);

      // Find the subscription
      const { data: subscription } = await supabase
        .from('graph_subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .eq('active', true)
        .single();

      if (!subscription) {
        console.log('Subscription not found');
        continue;
      }

      // Get user
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', subscription.user_id)
        .single();

      if (!user) {
        console.log('User not found');
        continue;
      }

      console.log(`Found user: ${user.upn}`);

      // Get token cache - EXACT same pattern as your draft.ts
      const { data: cacheRow } = await supabase
        .from('msal_token_cache')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!cacheRow) {
        console.log('No token cache found');
        continue;
      }

      // Get access token - EXACT same pattern as your draft.ts
      const cache = msalApp.getTokenCache();
      cache.deserialize(JSON.stringify(cacheRow.cache_json));
      const [account] = await cache.getAllAccounts();
      
      if (!account) {
        console.log('No account in cache');
        continue;
      }

      const token = await msalApp.acquireTokenSilent({ account, scopes: MS_SCOPES }).catch(() => null);
      if (!token?.accessToken) {
        console.log('Failed to acquire token');
        continue;
      }

      console.log('✅ Got access token');

      // Get the message
      const msg = await getMessage(token.accessToken, messageId);
      const subject = msg?.subject ?? "";
      const fromAddr = msg?.from?.emailAddress?.address ?? "";

      let bodyText = "";
      const raw = String(msg?.body?.content ?? "");
      if ((msg?.body?.contentType || "").toLowerCase() === "html") {
        bodyText = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      } else {
        bodyText = raw || String(msg?.bodyPreview ?? "");
      }

      console.log(`Processing email from: ${fromAddr}, subject: ${subject}`);

      // Get client config - use first available client
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (!client) {
        console.log('No client found');
        continue;
      }

      // Generate AI response - EXACT same pattern as your draft.ts
      const ai = await draftReply({
        originalPlain: bodyText,
        subject,
        tone: client?.tone?.voice ?? "neutral",
        companyName: client?.name ?? "",
        template: "",
        instructions: client?.policies ?? "",
      });

      let html = ai.bodyHtml || "<p>Thanks for your email.</p>";

      // Add signature if available
      if (client.signature) {
        html += `<br/><br/>${client.signature}`;
      }

      console.log('✅ Generated AI response');

      // Create draft - EXACT same pattern as your draft.ts
      const draft = await createReplyDraft(token.accessToken, messageId, false);
      await updateDraftBody(token.accessToken, draft.id, html);

      console.log(`✅ Draft created: ${draft.id}`);

      // Record usage
      const tokens = ai.tokens ?? { prompt: 0, completion: 0, total: 0 };
      await supabase.from('usage_events').insert({
        client_id: client?.id,
        user_id: user.id,
        mailbox_upn: user.upn,
        event_type: 'webhook',
        message_id: messageId,
        draft_id: draft.id,
        subject,
        meta: { from: fromAddr },
        tokens_prompt: tokens.prompt,
        tokens_completion: tokens.completion,
        cost_usd: 0,
        status: 'completed'
      });

      console.log('✅ Usage recorded');
    }
  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
  }
}