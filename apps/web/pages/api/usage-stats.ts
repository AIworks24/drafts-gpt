// apps/web/pages/api/usage-stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer as supabase } from '@/lib/supabase-server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { client_id, days = '30' } = req.query;
    const daysNum = parseInt(days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    let query = supabase
      .from('usage_events')
      .select('event_type, tokens_prompt, tokens_completion, cost_usd, created_at, status')
      .gte('created_at', startDate.toISOString());

    if (client_id && client_id !== 'all') {
      query = query.eq('client_id', client_id);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.json({
        totalEvents: 0,
        totalTokens: 0,
        totalCost: 0,
        eventsByType: {},
        dailyStats: []
      });
    }

    // Calculate statistics
    const totalEvents = data.length;
    const totalTokens = data.reduce((sum, event) => 
      sum + (event.tokens_prompt || 0) + (event.tokens_completion || 0), 0);
    const totalCost = data.reduce((sum, event) => 
      sum + parseFloat(event.cost_usd?.toString() || '0'), 0);

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

    const dailyStats = Object.entries(dailyGroups)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.json({
      totalEvents,
      totalTokens,
      totalCost,
      eventsByType,
      dailyStats
    });

  } catch (error: any) {
    console.error('Usage stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}