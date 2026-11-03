const SYNC_SECRET_TOKEN = 'PentaSkill-CloudSync-Secured-Token-v2026';
const PUBLIC_READ_KEYS = ['courses', 'chapters', 'course_materials'];
const SENSITIVE_KEYS = [
  'users', 'all_users_admin', 'otp_whitelists', 'leads',
  'custom_quotes', 'mentor_salaries', 'staff_salaries', 'platform_expenses', 'bookings'
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Authorization, X-PentaSkill-Auth',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders, status: 204 });
}

export async function onRequestGet({ request, env }) {
  if (!env.PENTASKILL_KV) {
    return new Response(
      JSON.stringify({ error: 'KV Namespace PENTASKILL_KV is not bound in Functions settings.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authToken = request.headers.get('X-PentaSkill-Auth') || '';
  if (SENSITIVE_KEYS.includes(key) && authToken !== SYNC_SECRET_TOKEN) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: Access to sensitive data requires authorization token.' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const data = await env.PENTASKILL_KV.get(key, { type: 'json' });
  return new Response(JSON.stringify(data || null), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.PENTASKILL_KV) {
    return new Response(
      JSON.stringify({ error: 'KV Namespace PENTASKILL_KV is not bound in Functions settings.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const authToken = request.headers.get('X-PentaSkill-Auth') || '';
  const body = await request.json();
  const { key, data } = body;

  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Allow append-only for leads without admin token
  if (key === 'leads' && authToken !== SYNC_SECRET_TOKEN) {
    let existingLeads = [];
    try {
      const raw = await env.PENTASKILL_KV.get('leads');
      if (raw) existingLeads = JSON.parse(raw);
    } catch(e) {}
    const newItems = Array.isArray(data) ? data : [data];
    const updated = [...newItems, ...existingLeads].slice(0, 1000);
    await env.PENTASKILL_KV.put('leads', JSON.stringify(updated));
    return new Response(JSON.stringify({ success: true, message: 'Inquiry received securely.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (authToken !== SYNC_SECRET_TOKEN && !key.startsWith('video_progress_')) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: Writing to Cloud Sync requires valid authorization token.' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const valToStore = typeof data === 'string' ? data : JSON.stringify(data);
  await env.PENTASKILL_KV.put(key, valToStore);
  return new Response(JSON.stringify({ success: true, key }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
