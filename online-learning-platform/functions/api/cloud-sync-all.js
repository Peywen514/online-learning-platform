const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Authorization',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders, status: 204 });
}

export async function onRequestPost({ request, env }) {
  if (!env.PENTASKILL_KV) {
    return new Response(
      JSON.stringify({ error: 'KV Namespace PENTASKILL_KV is not bound in Functions settings.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const results = [];
    for (const [key, value] of Object.entries(body)) {
      await env.PENTASKILL_KV.put(key, JSON.stringify(value));
      results.push(key);
    }
    return new Response(JSON.stringify({ success: true, syncedKeys: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
