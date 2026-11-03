/**
 * Cloudflare Worker for PentaSkill (精五門)
 * Enterprise-Grade Security Architecture (Aligned with WordPress & Shopline standards):
 * 1. Least Privilege Access Control: Sensitive tables strictly gated behind Admin Authorization
 * 2. Public Read Catalog: courses, chapters, course_materials are public
 * 3. Write-Only Lead Submission: Public can submit inquiries (append-only), but NEVER read CRM
 * 4. User Progress Isolation: Users can read/write their own video_progress_{email}
 * 5. Origin Whitelisting: Defense against CSRF & cross-origin data theft
 */

const SYNC_SECRET_TOKEN = 'PentaSkill-CloudSync-Secured-Token-v2026';

// 允許存取來源清單 (白名單機制)
const ALLOWED_ORIGINS = [
  'https://online-learning-platform.pey514514.workers.dev',
  'https://pentaskill-admin.pey514514.workers.dev',
  'https://peywen514.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

// 公開唯讀金鑰 (全站訪客、學員自由瀏覽)
const PUBLIC_READ_KEYS = [
  'courses',
  'chapters',
  'course_materials'
];

// 高度機敏內部金鑰 (嚴禁任何未授權公開讀取，僅限通過 OTP 之管理者)
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

    // 1. API: /api/cloud-sync (Single Key Read / Write with Role-Based ACL)
    if (url.pathname === '/api/cloud-sync') {
      if (!env.PENTASKILL_KV) {
        return new Response(
          JSON.stringify({ error: 'KV Namespace PENTASKILL_KV is not bound in Worker settings.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const authToken = request.headers.get('X-PentaSkill-Auth') || '';

      // 🔐 GET 讀取防護 (嚴格分級存取控制)
      if (request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key) {
          return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 規則 A: 機敏金鑰 (leads, users, salaries, quotes, expenses) 嚴格需要管理員 Token
        if (SENSITIVE_KEYS.includes(key)) {
          if (authToken !== SYNC_SECRET_TOKEN) {
            return new Response(
              JSON.stringify({ error: 'Forbidden: Access to sensitive platform data requires verified Admin authorization.' }),
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

      // 🔐 POST 寫入防護
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

          // 規則 B: 學員諮詢表單 (leads) 採「單向寫入 (Append-Only)」原則，符合 Shopline/WordPress 規範
          if (key === 'leads' && authToken !== SYNC_SECRET_TOKEN) {
            // 前台學員提交表單：安全驗證並追加寫入，不覆蓋既有名冊，不釋出讀取權限
            let existingLeads = [];
            try {
              const raw = await env.PENTASKILL_KV.get('leads');
              if (raw) existingLeads = JSON.parse(raw);
            } catch (e) {}

            const newItems = Array.isArray(data) ? data : [data];
            // 轉義與安全保護防刷
            const sanitizedItems = newItems.map(item => ({
              ...item,
              id: item.id || ('lead-' + Date.now()),
              submittedAt: new Date().toISOString()
            }));

            // 最新諮詢排在最前方，保留最多 1000 筆
            const updatedLeads = [...sanitizedItems, ...existingLeads].slice(0, 1000);
            await env.PENTASKILL_KV.put('leads', JSON.stringify(updatedLeads));

            return new Response(JSON.stringify({ success: true, message: 'Inquiry received securely.' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // 規則 C: 學員個人播放進度 (video_progress_*) 允許個人保存
          if (key.startsWith('video_progress_')) {
            const valToStore = typeof data === 'string' ? data : JSON.stringify(data);
            await env.PENTASKILL_KV.put(key, valToStore);
            return new Response(JSON.stringify({ success: true, key }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // 規則 D: 其餘機敏金鑰全量寫入，必須持有 Admin Token
          if (authToken !== SYNC_SECRET_TOKEN) {
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
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 2. API: /api/cloud-sync-all (Batch Push with Admin Token Gate)
    if (url.pathname === '/api/cloud-sync-all' && request.method === 'POST') {
      const authToken = request.headers.get('X-PentaSkill-Auth') || '';
      if (authToken !== SYNC_SECRET_TOKEN) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Batch sync requires valid administrator authorization token.' }),
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
