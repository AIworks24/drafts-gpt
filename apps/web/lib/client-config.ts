// apps/web/lib/client-config.ts
import { supabaseBrowser } from '@/lib/supabase-browser';
import { supabaseServer } from '@/lib/supabase-server';

export interface Client {
  id: string;
  name: string;
  timezone: string;
  tone: {
    persona: string;
    formality: string;
    warmth: number;
    conciseness: string;
  };
  business_hours: Record<string, string>;
  policies: string;
  signature: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Template {
  id?: string;
  client_id: string;
  title: string;
  category: string;
  body_md: string;
  active: boolean;
}

export interface UsageEvent {
  id: string;
  client_id: string;
  user_id: string;
  mailbox_upn: string;
  event_type: 'draft' | 'webhook' | 'manual';
  message_id?: string;
  draft_id?: string;
  subject?: string;
  meta: Record<string, any>;
  tokens_prompt: number;
  tokens_completion: number;
  cost_usd: number;
  status: 'pending' | 'completed' | 'error';
  error_message?: string;
  created_at: string;
}

// Client-side functions
export async function getClientByUserId(userId?: string): Promise<Client | null> {
  if (!userId) return null;
  
  // Get the user's client_id first
  const { data: user, error: userError } = await supabaseBrowser
    .from('users')
    .select('client_id')
    .eq('id', userId)
    .single();

  if (userError || !user?.client_id) return null;

  // Then get the client data
  const { data: client, error: clientError } = await supabaseBrowser
    .from('clients')
    .select('*')
    .eq('id', user.client_id)
    .single();

  if (clientError || !client) return null;
  return client as Client;
}

export async function getClientTemplates(clientId: string): Promise<Template[]> {
  const { data, error } = await supabaseBrowser
    .from('templates')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('created_at', { ascending: true });

  return data || [];
}

export async function upsertTemplate(template: Partial<Template>): Promise<Template | null> {
  const { data, error } = await supabaseBrowser
    .from('templates')
    .upsert({
      ...template,
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const { error } = await supabaseBrowser
    .from('templates')
    .update({ active: false })
    .eq('id', templateId);

  if (error) throw error;
}

export async function upsertClient(client: Partial<Client>): Promise<Client | null> {
  const { data, error } = await supabaseBrowser
    .from('clients')
    .upsert({
      ...client,
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// Server-side functions (for API routes)
export async function getServerClient(clientId: string): Promise<Client | null> {
  const { data, error } = await supabaseServer
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('active', true)
    .single();

  if (error) return null;
  return data;
}

export async function recordUsageEvent(event: Omit<UsageEvent, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabaseServer
    .from('usage_events')
    .insert({
      ...event,
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('Failed to record usage event:', error);
  }
}

export async function getUsageStats(clientId?: string, days = 30): Promise<{
  totalEvents: number;
  totalTokens: number;
  totalCost: number;
  eventsByType: Record<string, number>;
  dailyStats: Array<{ date: string; events: number; tokens: number; cost: number }>;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let query = supabaseServer
    .from('usage_events')
    .select('event_type, tokens_prompt, tokens_completion, cost_usd, created_at')
    .gte('created_at', startDate.toISOString());

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;

  if (error || !data) {
    return {
      totalEvents: 0,
      totalTokens: 0,
      totalCost: 0,
      eventsByType: {},
      dailyStats: []
    };
  }

  const totalEvents = data.length;
  const totalTokens = data.reduce((sum, event) => sum + (event.tokens_prompt || 0) + (event.tokens_completion || 0), 0);
  const totalCost = data.reduce((sum, event) => sum + parseFloat(event.cost_usd?.toString() || '0'), 0);

  const eventsByType = data.reduce((acc, event) => {
    acc[event.event_type] = (acc[event.event_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group by day for daily stats
  const dailyGroups = data.reduce((acc, event) => {
    const date = new Date(event.created_at).toISOString().split('T')[0];
    if (!acc[date]) {
      acc[date] = { events: 0, tokens: 0, cost: 0 };
    }
    acc[date].events += 1;
    acc[date].tokens += (event.tokens_prompt || 0) + (event.tokens_completion || 0);
    acc[date].cost += parseFloat(event.cost_usd?.toString() || '0');
    return acc;
  }, {} as Record<string, { events: number; tokens: number; cost: number }>);

  const dailyStats = Object.entries(dailyGroups).map(([date, stats]) => ({
    date,
    ...stats
  }));

  return {
    totalEvents,
    totalTokens,
    totalCost,
    eventsByType,
    dailyStats
  };
}