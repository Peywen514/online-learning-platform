# ☁️ 精五門 PentaSkill — Cloudflare Workers KV 雲端資料庫同步操作指南

> **建立時間**：2026-08-31  
> **適用場景**：解決 Cloudflare KV Pairs 初始為空問題、將全站資料（會員帳密、點數、客製報價單、課程、諮詢紀錄）全量寫入 KV，實現跨裝置自動同步。

---

## 📌 一、為什麼剛建好 Binding，進去「KV Pairs」是空的？

1. **KV 是一個「空白的雲端倉庫」**：
   - 在 Cloudflare 建立 KV Namespace 並新增 Binding（綁定），只是把「水管」接上 Worker，但**水管接好時，倉庫裡面預設是沒有任何資料的**。
2. **需要「寫入指令（PUT）」才會產生資料**：
   - 網站原本的預設資料存放在前端的 `data.js` 與瀏覽器中，必須透過程式碼發送儲存要求（POST），KV 才會產生對應的鍵值（KV Pairs）。
3. **Worker 需要包含 API 處理端點**：
   - Cloudflare Worker 需要包含 `/api/cloud-sync` 後端路由，才能接收網站傳來的資料並寫入 `PENTASKILL_KV`。

---

## 🚀 二、3 步驟將網站所有資料存入 Cloudflare KV

### 🔹 步驟 1：檢查 Cloudflare 後台的 Binding 變數名稱

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ 點入您的 Worker（例如 `online-class`）。
2. 點擊上方選單 **「Settings」➔「Variables and Secrets」➔「KV Namespace Bindings」**。
3. 確認或新增綁定：
   - **Variable Name（變數名稱）**：`PENTASKILL_KV` *(⚠️ 必須全大寫，完全相符)*
   - **KV Namespace**：選擇您建立的 KV（例如 `PENTASKILL_KV`）
4. 點擊 **「Save and Deploy」**。

---

### 🔹 步驟 2：確保 Worker 腳本已貼上後端程式碼 (`worker.js`)

專案目錄內已為您建立好完整的 `worker.js`。

如果您是在 Cloudflare 網頁版編輯器（Quick Edit / Edit code）操作：
1. 進入 Worker 的 **「Edit Code」**（線上編輯器）。
2. 將以下程式碼完整複製並覆蓋貼上：

```javascript
/**
 * Cloudflare Worker for PentaSkill (精五門)
 * Handles /api/cloud-sync for Cloudflare KV global synchronization
 * Namespace Binding: env.PENTASKILL_KV
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS Headers 跨域標頭
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    // 1. API: /api/cloud-sync (單一 Key 讀取 / 寫入)
    if (url.pathname === '/api/cloud-sync') {
      if (!env.PENTASKILL_KV) {
        return new Response(
          JSON.stringify({ error: 'KV Namespace PENTASKILL_KV is not bound in Worker settings.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // GET: 讀取指定 Key 的資料
      if (request.method === 'GET') {
        const key = url.searchParams.get('key');
        if (!key) {
          return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const data = await env.PENTASKILL_KV.get(key, { type: 'json' });
        return new Response(JSON.stringify(data || null), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // POST: 寫入指定 Key 的資料
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
          await env.PENTASKILL_KV.put(key, JSON.stringify(data));
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

    // 2. API: /api/cloud-sync-all (批次全量寫入所有資料表)
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

    // 3. 靜態資源處理 (若透過 Cloudflare Pages / Assets 部署)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('PentaSkill Cloudflare Worker API is running.', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
};
```

3. 點擊右上角 **「Save and Deploy」**。

---

### 🔹 步驟 3：在網站後台一鍵推送所有資料至 Cloudflare KV

網站前台已經加裝好專屬同步按鈕：

1. 打開您的網站（例如 `https://online-class.pey514514.workers.dev/` 或本地環境）。
2. 點擊右上角「登入」，使用主管權限帳號登入：
   - **帳號**：`pey514514@gmail.com`
   - **密碼**：`admin514`
3. 進入 **「後台管理中心」**。
4. 點擊右上角金黃色按鈕：
   > **`⚡ 一鍵推送資料至 Cloudflare KV`**
5. 看到綠色提示訊息：「🎉 全站資料已成功全量寫入 Cloudflare KV！」即代表完成！

---

## 🎯 三、驗證成果（KV Pairs 預期清單）

推送完成後，回到 Cloudflare Dashboard 的 **KV Pairs** 頁面按重新整理（F5），您將會看到以下 5 大核心 Key-Value 資料表：

| KV Key 名稱 | 資料型態 | 內容說明 |
| :--- | :--- | :--- |
| `users` | JSON Array | 包含主管、員工、講師、學員名單、登入密碼、🪙 精幣與 🏆 精通寶餘額 |
| `custom_quotes` | JSON Array | Wen總監 與員工設定的所有客製化報價單清單 |
| `leads` | JSON Array | 前台學員填寫的所有客製化諮詢需求紀錄 |
| `courses` | JSON Array | 全站五大領域線上課程、單元與價格資訊 |
| `instructors` | JSON Array | 頂尖師資團隊名單與 1 對 1 個教鐘點費率設定 |

---

## 💡 四、自動同步機制說明（日常維運）

- **自動讀取**：任何人打開網頁時，系統會自動非同步向 Cloudflare KV 拉取最新資料。
- **自動寫入**：學員註冊、總監後台修改點數、新增報價單時，系統均會**自動即時非同步寫入 Cloudflare KV**，毋須每次手動按推送。
- **資料永不丟失**：即使更換電腦、手機或清除瀏覽器 Cookie/快取，資料皆完整保留在 Cloudflare 全球雲端資料庫中！

---

## 🗣️ 五、明天繼續時的快速呼叫口令 (Prompt)

明天您開啟對話時，只需輸入以下這句話，我就會直接接續引導您：

> **「請讀取 CLOUDFLARE_KV_教學與操作指南.md，教我一步步完成 Cloudflare KV 的資料同步與檢查！」**
