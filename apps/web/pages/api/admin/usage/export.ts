// apps/web/pages/api/admin/usage/export.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer as supabase } from '@/lib/supabase-server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { client_id, days = '30', format = 'csv' } = req.query;
    const daysNum = parseInt(days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    let query = supabase
      .from('usage_events')
      .select(`
        *,
        clients(name)
      `)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (client_id && client_id !== 'all') {
      query = query.eq('client_id', client_id);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (format === 'csv') {
      const csvHeaders = 'Date,Client,Mailbox,Event Type,Subject,Tokens Prompt,Tokens Completion,Cost USD,Status\n';
      const csvRows = (data || []).map(row => {
        const clientName = (row.clients as any)?.name || 'Unknown';
        return [
          new Date(row.created_at).toISOString(),
          `"${clientName}"`,
          `"${row.mailbox_upn || ''}"`,
          row.event_type,
          `"${(row.subject || '').replace(/"/g, '""')}"`,
          row.tokens_prompt || 0,
          row.tokens_completion || 0,
          row.cost_usd || 0,
          row.status
        ].join(',');
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=usage-export.csv');
      return res.send(csvHeaders + csvRows);
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=usage-export.json');
      return res.json(data);
    }

    return res.status(400).json({ error: 'Invalid format' });

  } catch (error: any) {
    console.error('Export error:', error);
    return res.status(500).json({ error: 'Export failed' });
  }
}