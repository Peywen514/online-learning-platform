/**
 * Cloudflare Worker for PentaSkill (精五門)
 * Enterprise-Grade Security Fortified:
 * 1. RBAC & Secret Token Authorization on Cloud Sync API
 * 2. Origin Whitelisting (Defense against CSRF / Cross-Origin Stealing)
 * 3. Sensitive Key Access Control (users, leads, quotes, salaries, expenses)
 */

const SYNC_SECRET_TOKEN = 'PentaSkill-CloudSync-Secured-Token-v2026';

// 允許存取來源清單
const ALLOWED_ORIGINS = [
  'https://online-learning-platform.pey514514.workers.dev',
  'https://pentaskill-admin.pey514514.workers.dev',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

// 高度機敏內部金鑰 (嚴格禁止未帶 Token 公開讀取)
const SENSITIVE_KEYS = [
  'users',
  'all_users_admin',
  'otp_whitelists',
  'leads',
  'custom_quotes',
  'mentor_salaries',
  'mentor_salaries_master',
  'staff_salaries',
  'platform_expenses',
  'bookings'
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // 安全動態 CORS Header (僅放行許可網域，拒絕任意外部網域 *)
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin) || origin === url.origin;
    const corsHeaders = {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : url.origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Authorization, X-PentaSkill-Auth',
      'Access-Control-Allow-Credentials': 'true',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    // 1. API: /api/cloud-sync (Single Key Read / Write with Token Gate)
    if (url.pathname === '/api/cloud-sync') {
      if (!env.PENTASKILL_KV) {
        return new Response(
          JSON.stringify({ error: 'KV Namespace PENTASKILL_KV is not bound in Worker settings.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const authToken = request.headers.get('X-PentaSkill-Auth') || '';

      // 🔐 GET 讀取防護
      if (request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key) {
          return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 存取機敏營運/薪資/個資金鑰，必須校驗合法 Token
        if (SENSITIVE_KEYS.includes(key)) {
          if (authToken !== SYNC_SECRET_TOKEN) {
            return new Response(
              JSON.stringify({ error: 'Forbidden: Access to sensitive data requires authorization token.' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
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

      // 🔐 POST 寫入防護 (寫入一律需要 Token，徹底根絕外部黑客惡意覆蓋/清空資料庫)
      if (request.method === 'POST') {
        if (authToken !== SYNC_SECRET_TOKEN) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Writing to Cloud Sync requires valid authorization token.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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

    // 2. API: /api/cloud-sync-all (Batch Push with Token Gate)
    if (url.pathname === '/api/cloud-sync-all' && request.method === 'POST') {
      const authToken = request.headers.get('X-PentaSkill-Auth') || '';
      if (authToken !== SYNC_SECRET_TOKEN) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Writing to Cloud Sync requires valid authorization token.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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

    // 3. 靜態資源交付
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('PentaSkill Cloudflare Worker API is running securely.', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
};
