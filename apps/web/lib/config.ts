// apps/web/lib/config.ts
import { supabase } from "./supabase";

export async function getClientByUser(upn: string) {
  const { data, error } = await supabase
    .from("m365_users")
    .select("client_id")
    .eq("upn", upn)
    .single();
  if (error) throw error;
  if (!data?.client_id) return null;

  const { data: client, error: e2 } = await supabase
    .from("clients")
    .select("*")
    .eq("id", data.client_id)
    .single();
  if (e2) throw e2;
  return client;
}

export async function getClientTemplates(client_id: string) {
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("client_id", client_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function recordUsage(payload: {
  client_id?: string | null;
  mailbox_upn?: string;
  event_type: string;
  meta?: any;
  tokens_prompt?: number;
  tokens_completion?: number;
  cost_usd?: number;
}) {
  await supabase.from("usage_events").insert({
    client_id: payload.client_id ?? null,
    mailbox_upn: payload.mailbox_upn ?? null,
    event_type: payload.event_type,
    meta: payload.meta ?? {},
    tokens_prompt: payload.tokens_prompt ?? 0,
    tokens_completion: payload.tokens_completion ?? 0,
    cost_usd: payload.cost_usd ?? 0,
  });
}
