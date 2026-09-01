/**
 * Cloudflare Worker for PentaSkill (精五門)
 * Handles /api/cloud-sync for Cloudflare KV global synchronization
 * Namespace Binding: env.PENTASKILL_KV
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    // 1. API: /api/cloud-sync (Single Key Read / Write)
    if (url.pathname === '/api/cloud-sync') {
      if (!env.PENTASKILL_KV) {
        return new Response(
          JSON.stringify({ error: 'KV Namespace PENTASKILL_KV is not bound in Worker settings.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // GET ?key=users
      if (request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key) {
          return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        try {
          const raw = await env.PENTASKILL_KV.get(key);
          let data = null;
          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch (e) {
              data = raw;
            }
          }
          return new Response(JSON.stringify(data || null), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // POST { key, data }
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          const { key, data } = body;
          if (!key) {
            return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          const valToStore = typeof data === 'string' ? data : JSON.stringify(data);
          await env.PENTASKILL_KV.put(key, valToStore);
          return new Response(JSON.stringify({ success: true, key }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 2. API: /api/cloud-sync-all (Batch Push All Keys)
    if (url.pathname === '/api/cloud-sync-all' && request.method === 'POST') {
      if (!env.PENTASKILL_KV) {
        return new Response(
          JSON.stringify({ error: 'KV Namespace PENTASKILL_KV is not bound.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const body = await request.json();
        const results = [];
        for (const [key, value] of Object.entries(body)) {
          const valToStore = typeof value === 'string' ? value : JSON.stringify(value);
          await env.PENTASKILL_KV.put(key, valToStore);
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

    // 3. Static Asset / Fallback handler
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('PentaSkill Cloudflare Worker API is running.', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
};
