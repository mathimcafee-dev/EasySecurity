export const maxDuration = 60;
export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabaseUrl = 'https://zwgdpsuvduexcdzcwjau.supabase.co';
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2Rwc3V2ZHVleGNkemN3amF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTkzMTMsImV4cCI6MjA5MzUzNTMxM30.p_tMALKCRZeqQX7jO3jfwhGSYIbjoVKRpGhvJjMdlcs';

    // req.body is already parsed by Vercel when bodyParser: true
    const body = req.body;
    console.log('acme proxy body:', JSON.stringify(body));

    const response = await fetch(`${supabaseUrl}/functions/v1/acme-ssl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('acme proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
