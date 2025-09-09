// apps/web/lib/config.ts
import { supabaseBrowser as supabase } from '@/lib/supabase-browser';

export async function getClientByUser(user_id?: string) {
  // naive: first client for now; wire user->client mapping later if needed
  const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data || null;
}

export async function getClientTemplates(client_id?: string | null) {
  if (!client_id) return [];
  const { data } = await supabase.from("templates").select("*").eq("client_id", client_id).order("created_at", { ascending: true });
  return data || [];
}

export async function upsertClient(input: { id?: string; name: string; tone?: any; policies?: string }) {
  const { data, error } = await supabase.from("clients").upsert(input).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertTemplate(input: { id?: string; client_id: string; name: string; body: string }) {
  const { data, error } = await supabase.from("templates").upsert(input).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function listTemplates(client_id: string) {
  const { data, error } = await supabase.from("templates").select("*").eq("client_id", client_id).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function recordUsage(evt: {
  client_id?: string | null;
  mailbox_upn?: string | null;
  event_type: string;
  meta?: any;
  tokens_prompt?: number;
  tokens_completion?: number;
  cost_usd?: number;
}) {
  await supabase.from("usage_events").insert(evt);
}
