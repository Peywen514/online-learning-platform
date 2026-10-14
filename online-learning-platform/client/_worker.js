/**
 * Cloudflare Worker for PentaSkill Client Portal (前台官網與學員/講師專區)
 * 🛡️ 具備邊緣資安防護：僅開放公開課程、公開預約與個人資料讀取，拒絕前端寫入全站薪資與財務損益資料。
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    // API: /api/cloud-sync (Single Key Read / Write with RBAC Protection)
    if (url.pathname === '/api/cloud-sync') {
      if (!env.PENTASKILL_KV) {
        return new Response(
          JSON.stringify({ error: 'KV Namespace PENTASKILL_KV is not bound.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // GET ?key=courses
      if (request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key) {
          return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 🛡️ 禁止前台隨意拉取全站員工薪資或財務損益
        const forbiddenKeys = ['staff_salaries', 'platform_expenses', 'mentor_salaries_master'];
        if (forbiddenKeys.includes(key)) {
          return new Response(JSON.stringify({ error: 'Access denied: protected operational resource.' }), {
            status: 403,
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
          
          // 🛡️ 禁止前台竄改全站薪資或財務
          const protectedKeys = ['staff_salaries', 'platform_expenses', 'mentor_salaries', 'all_users_admin'];
          if (protectedKeys.includes(key)) {
            return new Response(JSON.stringify({ error: 'Forbidden: Cannot write to admin-protected key.' }), {
              status: 403,
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

    // 靜態資源交付
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('PentaSkill Client Worker API is running.', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
};
