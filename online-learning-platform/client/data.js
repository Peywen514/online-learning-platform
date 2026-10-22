// Data model & RBAC Accounts for PentaSkill Client Portal (前台與講師工作台專用脫敏資料庫)
// 🛡️ 本檔案經過嚴格資安脫敏：已徹底剔除平台主管、顧問、員工最高權限帳密、全體員工薪資與全站損益機密。

// 📅 全站即時本地日期與時間格式化輔助引擎 (避免 UTC 時差誤差，確保所有日期皆為即時動態計算)
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDateTimeString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function calcDynamicDateOffset(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return getLocalDateString(d);
}

function calcDynamicDateTimeOffset(offsetDays = 0, timeStr = '12:00') {
  return `${calcDynamicDateOffset(offsetDays)} ${timeStr}`;
}

// 脫敏使用者列表：僅保留前台學員與金牌講師帳號（已徹底剔除 Wen總監、陳顧問、營運員工帳號與密碼）
const mockUsers = [
  {
    id: "u-3",
    name: "林小明 (學員)",
    email: "student@pentaskill.com",
    phone: "0912-345-678",
    title: "先生",
    password: "user123",
    role: "student",
    roleLabel: "🎓 消費者學員 (Student)",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
    coins: 100,
    masterTokens: 2,
    birthday: "1998-08-15",
    purchasedCourses: ["course-1"]
  },
  {
    id: "u-4",
    name: "張哲銘 (Ethan)",
    email: "ethan@pentaskill.com",
    password: "ethan123",
    role: "instructor",
    roleLabel: "👨‍🏫 金牌講師 (Instructor)",
    bankInfo: { bankName: "玉山銀行 (808)", accountLast5: "58923" },
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-5",
    name: "陳婷俐 (Tina)",
    email: "tina@pentaskill.com",
    password: "tina123",
    role: "instructor",
    roleLabel: "👨‍🏫 金牌講師 (Instructor)",
    bankInfo: { bankName: "國泰世華 (013)", accountLast5: "47281" },
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-6",
    name: "歐陽翔 (Shawn)",
    email: "shawn@pentaskill.com",
    password: "shawn123",
    role: "instructor",
    roleLabel: "👨‍🏫 金牌講師 (Instructor)",
    bankInfo: { bankName: "台新銀行 (812)", accountLast5: "92345" },
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-7",
    name: "林雅涵 (Hannah)",
    email: "hannah@pentaskill.com",
    password: "hannah123",
    role: "instructor",
    roleLabel: "👨‍🏫 金牌講師 (Instructor)",
    bankInfo: { bankName: "中國信託 (822)", accountLast5: "31980" },
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80"
  }
];

// 1-on-1 個教預約排班清單 (前台時段防撞與講師授課專屬視圖)
let mockBookings = [
  {
    id: "bk-101",
    instructor: "張哲銘 (Ethan)",
    studentName: "林小明",
    studentEmail: "student@pentaskill.com",
    date: calcDynamicDateOffset(3),
    slotTime: "14:00 - 15:00",
    topic: "專案作品 1 對 1 精準批改與架構診斷 (1小時)",
    notes: "想檢討 React 19 與 AI API 串接效能優化...",
    status: "已預約",
    fee: 1800,
    payout: 1800
  },
  {
    id: "bk-102",
    instructor: "陳婷俐 (Tina)",
    studentName: "黃雅婷",
    studentEmail: "yating@example.com",
    date: calcDynamicDateOffset(1),
    slotTime: "15:30 - 16:30",
    topic: "UI/UX 與 跨領域作品集 1 對 1 精細修稿 (1小時)",
    notes: "請講師幫忙檢視 Figma 3D 擬態作品集排版...",
    status: "已預約",
    fee: 2000,
    payout: 2000
  },
  {
    id: "bk-103",
    instructor: "歐陽翔 (Shawn)",
    studentName: "林小明",
    studentEmail: "student@pentaskill.com",
    date: calcDynamicDateOffset(0),
    slotTime: "23:30 - 00:30",
    topic: "Python 數據模型與 AI 輔助個教 (1小時)",
    notes: "即時 1-on-1 示範時段...",
    status: "已預約",
    fee: 1600,
    payout: 1600
  },
  {
    id: "bk-104",
    instructor: "林雅涵 (Hannah)",
    studentName: "張宇彤",
    studentEmail: "yutong@example.com",
    date: calcDynamicDateOffset(-2),
    slotTime: "20:30 - 21:30",
    topic: "副業接案定價與商業合約教練 (1小時)",
    notes: "短影音腳本對接品牌客戶過單報價問題...",
    status: "已完成",
    fee: 1800,
    payout: 1800
  }
];

// 🛡️ 講師個人隱私隔離薪資試算模組 (僅計算當前登入講師名下課程 20% 分潤與已完成個教鐘點)
function getInstructorPersonalSalary(instructorName) {
  if (!instructorName) return null;
  const cleanName = instructorName.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();

  // 1. 查找名下課程售出堂數與分潤 (20%)
  const myCourses = mockCourses.filter(c => c.instructor && c.instructor.includes(cleanName));
  let recordedRevenue = 0;
  let recordedProfitShare = 0;
  const courseDetails = [];

  myCourses.forEach(c => {
    // 預設模擬售出堂數
    const soldCount = c.reviewCount ? Math.round(c.reviewCount * 1.5) : 30;
    const courseGross = (c.priceRecordOnly || 3600) * soldCount;
    const myShare = Math.round(courseGross * 0.20);
    recordedRevenue += courseGross;
    recordedProfitShare += myShare;
    courseDetails.push({
      title: c.title,
      price: c.priceRecordOnly,
      soldCount: soldCount,
      gross: courseGross,
      share: myShare
    });
  });

  // 2. 查找 1-on-1 個教預約完成場次與鐘點費
  const myBookings = mockBookings.filter(b => b.instructor && b.instructor.includes(cleanName));
  let liveSessionsCount = 0;
  let liveTotalPayout = 0;
  myBookings.forEach(b => {
    liveSessionsCount++;
    liveTotalPayout += (b.payout || b.fee || 1800);
  });

  const totalPayout = recordedProfitShare + liveTotalPayout;

  return {
    instructorName: cleanName,
    recordedProfitShare: recordedProfitShare,
    recordedRevenue: recordedRevenue,
    courseDetails: courseDetails,
    liveSessionsCount: liveSessionsCount,
    liveTotalPayout: liveTotalPayout,
    totalPayout: totalPayout,
    status: "待每月 10 日核發",
    payoutDate: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-10`
  };
}

// 線上課程清單 (全公開商城與前台)
let mockCourses = [
  {
    id: "course-1",
    title: "AI 驅動 Full-Stack Web 開發實戰營",
    category: "frontend",
    categoryLabel: "網頁開發 / AI",
    instructor: "張哲銘 (Ethan)",
    instructorTitle: "近10年全台培訓體系資深 Front-End & AI 架構師",
    instructorAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80",
    priceRecordOnly: 3600,
    priceWith1on1: 12800,
    rating: 4.9,
    reviewCount: 142,
    videoDuration: "32 小時錄播影音單元",
    liveSlotsCount: "4 次 1-on-1 專屬個教批改",
    description: "結合 React, Node.js 與 OpenAI/Claude API。從基礎語法到獨立完成可上線的 AI SaaS 應用，並提供講師 1 對 1 Code Review。",
    badge: "🔥 熱銷首選",
    isFeatured: true
  },
  {
    id: "course-2",
    title: "UI/UX 產品設計與 Figma 設計系統實力班",
    category: "design",
    categoryLabel: "UI/UX 與 設計",
    instructor: "陳婷俐 (Tina)",
    instructorTitle: "前知名電腦培訓體系 跨國專案 UI/UX 設計總監",
    instructorAvatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=1200&q=80",
    priceRecordOnly: 4200,
    priceWith1on1: 14800,
    rating: 5.0,
    reviewCount: 98,
    videoDuration: "28 小時錄播影音單元",
    liveSlotsCount: "4 次 1對1 Figma 作品集重構",
    description: "掌握 Auto-Layout、Design System 與 Prototype。透過 1 對 1 個教微調作品細節，打造能直接面試求職的星級作品集。",
    badge: "👑 教學多年業師陪跑",
    isFeatured: true
  },
  {
    id: "course-3",
    title: "Python 數據分析與自動化爬蟲實務",
    category: "frontend",
    categoryLabel: "網頁開發 / AI",
    instructor: "歐陽翔 (Shawn)",
    instructorTitle: "知名教育體系資深 Python 資料科學專任講師",
    instructorAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
    priceRecordOnly: 3200,
    priceWith1on1: 9800,
    rating: 4.8,
    reviewCount: 76,
    videoDuration: "24 小時錄播影音單元",
    liveSlotsCount: "3 次 數據模型與腳本一對一診斷",
    description: "學會 Pandas, BeautifulSoup, Selenium 與數據視覺化。協助學員打造公司自動化工具或個人接案專案。",
    badge: "⚡ 實務高效",
    isFeatured: true
  },
  {
    id: "course-4",
    title: "高轉化率數位整合行銷與短影音電商實操",
    category: "marketing",
    categoryLabel: "數位行銷 / 商業",
    instructor: "林雅涵 (Hannah)",
    instructorTitle: "資深職業培訓電商行銷顧問 • 累計輔導 200+ 品牌",
    instructorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80",
    priceRecordOnly: 2980,
    priceWith1on1: 8800,
    rating: 4.9,
    reviewCount: 115,
    videoDuration: "20 小時錄播影音單元",
    liveSlotsCount: "3 次 廣告文案與投放數據個教診斷",
    description: "全方位解析 Meta 廣告、Google SEO、TikTok 短影音文案。配合 1 對 1 實作，即刻優化你的電商或接案轉換率。",
    badge: "📈 業績翻倍",
    isFeatured: true
  },
  {
    id: "course-5",
    title: "1 對 1 專屬職涯個教陪跑卡 (3個月全期保證)",
    category: "individual",
    categoryLabel: "實務個教",
    instructor: "創辦人兼師資總監 團隊",
    instructorTitle: "總監級講師 1對1 親自陪跑",
    instructorAvatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
    priceRecordOnly: 0,
    priceWith1on1: 28800,
    rating: 5.0,
    reviewCount: 45,
    videoDuration: "無限次觀看全站錄播影音單元",
    liveSlotsCount: "12 次 雙週 1-on-1 深入個教輔導",
    description: "適合想在 3-6 個月內轉職工程師、設計師或接案自由工作者。包含履歷改造、模擬面試與外包案源優先派案。",
    badge: "🏆 轉職首選",
    isFeatured: false
  }
];

// 金牌講師清單
let mockInstructors = [
  {
    id: "inst-1",
    name: "張哲銘 (Ethan)",
    role: "Full-Stack & AI 技術專家",
    tag: "型男技術架構師",
    exp: "全台知名電腦教育體系近10年金牌講師 / 前知名科技公司技術長",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
    skills: ["React 19", "Node.js", "AI Agent", "TypeScript"],
    rating: 4.9,
    studentCount: 1850,
    rate1on1: "洽小編專屬規劃 (提供個別專屬服務)",
    quote: "「程式不是用看的，是用手寫跟講師一對一問出來的！」"
  },
  {
    id: "inst-2",
    name: "陳婷俐 (Tina)",
    role: "UI/UX 與 Figma 系統總監",
    tag: "星級產品設計女神",
    exp: "知名電腦教育機構近10年高級講師 / 矽谷新創產品設計顧問",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
    skills: ["Figma Design System", "User Research", "Prototyping"],
    rating: 5.0,
    studentCount: 2200,
    rate1on1: "洽小編專屬規劃 (提供個別專屬服務)",
    quote: "「透過一對一微調像素細節，你的作品集將會脫穎而出。」"
  },
  {
    id: "inst-3",
    name: "歐陽翔 (Shawn)",
    role: "Python 數據分析與 AI 顧問",
    tag: "極客帥哥數據講師",
    exp: "職業培訓機構近10年專任講師 / 數據金融分析師",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
    skills: ["Python", "Pandas", "Web Scraping", "SQL Database"],
    rating: 4.8,
    studentCount: 1400,
    rate1on1: "洽小編專屬規劃 (提供個別專屬服務)",
    quote: "「自動化工具能節省你 90% 的繁瑣工作，我教你寫出實用腳本。」"
  },
  {
    id: "inst-4",
    name: "林雅涵 (Hannah)",
    role: "數位整合行銷與短影音教練",
    tag: "氣質電商爆款行銷師",
    exp: "知名教育機構近10年行銷教學多年業師 / 品牌電商營運總監",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    skills: ["Meta Ads", "SEO", "Short Video", "Conversion Funnel"],
    rating: 4.9,
    studentCount: 1950,
    rate1on1: "洽小編專屬規劃 (提供個別專屬服務)",
    quote: "「精準流量加上好的個教文案批改，打造極致轉化率。」"
  }
];

// Cloudflare Stream 公開配置
let cloudflareStreamConfig = {
  customerSubdomain: "customer-88nzk2.cloudflarestream.com",
  requireSignedTokens: true,
  allowedOrigins: ["online-learning-platform.pey514514.workers.dev", "peywen514.github.io", "pentaskill.com", "localhost"],
  hlsEncryption: "AES-128 / Dynamic HLS Bitrate"
};

// 課程章節與影音單元
let mockChapters = [
  // ===== 課程 1：AI 驅動 Full-Stack Web 開發實戰營 (張哲銘 Ethan) =====
  {
    id: 1,
    courseId: "course-1",
    title: "第 1 章：專案環境建置與現代前端趨勢",
    duration: "45 分鐘",
    lessons: [
      { 
        id: "1-1", 
        courseId: "course-1",
        title: "1-1 開發環境準備與 VS Code 神級 Extension", 
        completed: true,
        streamId: "5d5ba37905d088d80097030722b813f2",
        isTrialAllowed: true,
        durationSeconds: 900
      },
      { 
        id: "1-2", 
        courseId: "course-1",
        title: "1-2 Git / GitHub 團隊協作與個教作業繳交流程", 
        completed: true,
        streamId: "b67c489721ad43209887711aa6768892",
        isTrialAllowed: false,
        durationSeconds: 1800
      }
    ]
  },
  {
    id: 2,
    courseId: "course-1",
    title: "第 2 章：Full-Stack React & AI 專案架構拆解",
    duration: "65 分鐘",
    lessons: [
      { 
        id: "2-1", 
        courseId: "course-1",
        title: "2-1 React 19 新特性與 Component 設計哲學", 
        completed: true,
        streamId: "fc38d9982a1740d7a0491823901bc093",
        isTrialAllowed: true,
        durationSeconds: 1500
      },
      { 
        id: "2-2", 
        courseId: "course-1",
        title: "2-2 LLM API 串接與 Server-Sent Events (SSE)", 
        completed: false, 
        active: true,
        streamId: "729486c91a0248888bf402a7b189872e",
        isTrialAllowed: false,
        durationSeconds: 2280
      },
      { 
        id: "2-3", 
        courseId: "course-1",
        title: "2-3 【作業】建立第一個 AI 對話模組與 Error 處理", 
        completed: false,
        streamId: "9a1829bc8310495ea721980012bc4410",
        isTrialAllowed: false,
        durationSeconds: 1200
      }
    ]
  },
  {
    id: 3,
    courseId: "course-1",
    title: "第 3 章：1-on-1 個教 Code Review 實戰微調",
    duration: "40 分鐘",
    lessons: [
      { 
        id: "3-1", 
        courseId: "course-1",
        title: "3-1 講師帶你審視性能瓶頸 (Re-render 優化)", 
        completed: false,
        streamId: "e4418a09bcae412398457788102947a1",
        isTrialAllowed: false,
        durationSeconds: 1200
      },
      { 
        id: "3-2", 
        courseId: "course-1",
        title: "3-2 部署至 Vercel / Cloudflare 並設定 Domain", 
        completed: false,
        streamId: "fa90812bc81047712a55981245671190",
        isTrialAllowed: false,
        durationSeconds: 1200
      }
    ]
  },

  // ===== 課程 2：UI/UX 產品設計與 Figma 設計系統實力班 (陳婷俐 Tina) =====
  {
    id: 101,
    courseId: "course-2",
    title: "第 1 章：Figma 介面佈局與 Auto-Layout 實務規範",
    duration: "50 分鐘",
    lessons: [
      {
        id: "c2-1-1",
        courseId: "course-2",
        title: "1-1 Figma 核心操作流與全域快捷鍵心法",
        completed: true,
        streamId: "5d5ba37905d088d80097030722b813f2",
        isTrialAllowed: true,
        durationSeconds: 1200
      },
      {
        id: "c2-1-2",
        courseId: "course-2",
        title: "1-2 Auto-Layout 深入解析：動態拉伸與響應式斷點",
        completed: false,
        streamId: "b67c489721ad43209887711aa6768892",
        isTrialAllowed: false,
        durationSeconds: 1800
      }
    ]
  },
  {
    id: 102,
    courseId: "course-2",
    title: "第 2 章：Design System 企業級組件庫與 Design Tokens",
    duration: "60 分鐘",
    lessons: [
      {
        id: "c2-2-1",
        courseId: "course-2",
        title: "2-1 變體組件 Variants 與屬性架構規劃",
        completed: false,
        streamId: "fc38d9982a1740d7a0491823901bc093",
        isTrialAllowed: true,
        durationSeconds: 1500
      },
      {
        id: "c2-2-2",
        courseId: "course-2",
        title: "2-2 企業級色彩與字級 Tokens 跨端同步技巧",
        completed: false,
        streamId: "729486c91a0248888bf402a7b189872e",
        isTrialAllowed: false,
        durationSeconds: 2100
      }
    ]
  },
  {
    id: 103,
    courseId: "course-2",
    title: "第 3 章：星級高保真原型與 1-on-1 業師作品集重構",
    duration: "45 分鐘",
    lessons: [
      {
        id: "c2-3-1",
        courseId: "course-2",
        title: "3-1 Smart Animate 微互動微動效全流程串接",
        completed: false,
        streamId: "e4418a09bcae412398457788102947a1",
        isTrialAllowed: false,
        durationSeconds: 1500
      },
      {
        id: "c2-3-2",
        courseId: "course-2",
        title: "3-2 【個教準備】業師 1 對 1 商業作品集通關診斷",
        completed: false,
        streamId: "fa90812bc81047712a55981245671190",
        isTrialAllowed: false,
        durationSeconds: 1200
      }
    ]
  },

  // ===== 課程 3：Python 數據分析與自動化爬蟲實務 (歐陽翔 Shawn) =====
  {
    id: 201,
    courseId: "course-3",
    title: "第 1 章：Python 資料科學環境與 HTTP 爬蟲基石",
    duration: "45 分鐘",
    lessons: [
      {
        id: "c3-1-1",
        courseId: "course-3",
        title: "1-1 VS Code + Jupyter Notebook 開發環境配置",
        completed: true,
        streamId: "5d5ba37905d088d80097030722b813f2",
        isTrialAllowed: true,
        durationSeconds: 1200
      },
      {
        id: "c3-1-2",
        courseId: "course-3",
        title: "1-2 Requests 模組請求與 JSON API 資料抓取",
        completed: false,
        streamId: "b67c489721ad43209887711aa6768892",
        isTrialAllowed: false,
        durationSeconds: 1500
      }
    ]
  },
  {
    id: 202,
    courseId: "course-3",
    title: "第 2 章：BeautifulSoup 與 Selenium 動態網頁爬蟲",
    duration: "55 分鐘",
    lessons: [
      {
        id: "c3-2-1",
        courseId: "course-3",
        title: "2-1 DOM 樹解析與防爬 Headers 對策實操",
        completed: false,
        streamId: "fc38d9982a1740d7a0491823901bc093",
        isTrialAllowed: true,
        durationSeconds: 1500
      },
      {
        id: "c3-2-2",
        courseId: "course-3",
        title: "2-2 Selenium 模擬點擊登入與無限滾動翻頁",
        completed: false,
        streamId: "729486c91a0248888bf402a7b189872e",
        isTrialAllowed: false,
        durationSeconds: 1800
      }
    ]
  },
  {
    id: 203,
    courseId: "course-3",
    title: "第 3 章：Pandas 數據清洗與視覺化自動排程",
    duration: "50 分鐘",
    lessons: [
      {
        id: "c3-3-1",
        courseId: "course-3",
        title: "3-1 Pandas 異常值篩選、聚合統計與特徵工程",
        completed: false,
        streamId: "e4418a09bcae412398457788102947a1",
        isTrialAllowed: false,
        durationSeconds: 1500
      },
      {
        id: "c3-3-2",
        courseId: "course-3",
        title: "3-2 Matplotlib 視覺化與自動排程寄送報表",
        completed: false,
        streamId: "fa90812bc81047712a55981245671190",
        isTrialAllowed: false,
        durationSeconds: 1500
      }
    ]
  },

  // ===== 課程 4：高轉化率數位整合行銷與短影音電商實操 (林雅涵 Hannah) =====
  {
    id: 301,
    courseId: "course-4",
    title: "第 1 章：數位行銷轉化漏斗與精準受眾定位",
    duration: "45 分鐘",
    lessons: [
      {
        id: "c4-1-1",
        courseId: "course-4",
        title: "1-1 商業模式拆解與精準受眾痛點畫像",
        completed: true,
        streamId: "5d5ba37905d088d80097030722b813f2",
        isTrialAllowed: true,
        durationSeconds: 1200
      },
      {
        id: "c4-1-2",
        courseId: "course-4",
        title: "1-2 競爭對手分析與高轉化文案切角法",
        completed: false,
        streamId: "b67c489721ad43209887711aa6768892",
        isTrialAllowed: false,
        durationSeconds: 1500
      }
    ]
  },
  {
    id: 302,
    courseId: "course-4",
    title: "第 2 章：Meta & Google 廣告投放實操與數據分析",
    duration: "55 分鐘",
    lessons: [
      {
        id: "c4-2-1",
        courseId: "course-4",
        title: "2-1 Meta 像素設定與自訂受眾群漏斗",
        completed: false,
        streamId: "fc38d9982a1740d7a0491823901bc093",
        isTrialAllowed: true,
        durationSeconds: 1500
      },
      {
        id: "c4-2-2",
        courseId: "course-4",
        title: "2-2 廣告成效解讀與 ROAS 投報率優化實戰",
        completed: false,
        streamId: "729486c91a0248888bf402a7b189872e",
        isTrialAllowed: false,
        durationSeconds: 1800
      }
    ]
  },
  {
    id: 303,
    courseId: "course-4",
    title: "第 3 章：爆款短影音腳本結構與剪輯實操",
    duration: "50 分鐘",
    lessons: [
      {
        id: "c4-3-1",
        courseId: "course-4",
        title: "3-1 前 3 秒吸睛鉤子 Hook 設計公式",
        completed: false,
        streamId: "e4418a09bcae412398457788102947a1",
        isTrialAllowed: false,
        durationSeconds: 1500
      },
      {
        id: "c4-3-2",
        courseId: "course-4",
        title: "3-2 剪映專業節奏踩點與商業完播率調校",
        completed: false,
        streamId: "fa90812bc81047712a55981245671190",
        isTrialAllowed: false,
        durationSeconds: 1500
      }
    ]
  }
];

// 學員代表作示範
let mockPortfolios = [
  {
    id: "port-1",
    title: "AuraAI — 全自動 AI Agent 與數據儀表板",
    categoryTag: "🤖 AI & 程式開發",
    badgeClass: "bg-purple",
    instructorName: "張哲銘 (Ethan)",
    instructorAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80",
    studentName: "陳威立 (轉職成功)",
    imgUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
    desc: "結合 React 19、Python 與 LLM 對話串接。學員獨立完成百萬級架構，獲科技大廠錄取 Offer。",
    feedback: "React 19 + Python FastAPI + OpenAI Agent 串接。經張哲銘講師 4 次 1-on-1 針對數據傳輸效能與 UI 儀表板架構診斷微調，成果獲企業高分錄用。"
  },
  {
    id: "port-2",
    title: "VortexPay — 現代金流 3D 玻璃擬態 Design System",
    categoryTag: "🎨 平面 & UI/UX 設計",
    badgeClass: "bg-pink",
    instructorName: "陳婷俐 (Tina)",
    instructorAvatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80",
    studentName: "黃雅婷 (UI設計師)",
    imgUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",
    desc: "超過 150+ 彈性 UI 元件庫與全互動原型，經 Tina 講師微調光影質調後獲 Behance 官方推薦。",
    feedback: "包含完整 UI 規範、Dark/Light Mode 擬態視覺與微交互動畫。經陳婷俐講師 1 對 1 重構層級質感，打造能直接面試頂尖設計公司的作品集。"
  },
  {
    id: "port-3",
    title: "Nordic Zenith — 極簡北歐風豪宅 3D 全景建模渲染",
    categoryTag: "🏡 室內設計 & 3D 空間",
    badgeClass: "bg-blue",
    instructorName: "歐陽翔 (Shawn)",
    instructorAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80",
    studentName: "林家豪 (接案設計師)",
    imgUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
    desc: "運用 3ds Max / Blender 還原自然採光與材質細節，包含完整施工圖面與接案報價範本。",
    feedback: "高規格真實材質光影比對與大樓空間配置。歐陽翔講師親自診斷 V-Ray 渲染參數與施工圖細節，學員完成後即順利成立個人接案工作室。"
  },
  {
    id: "port-4",
    title: "CyberPulse — 電影級賽博朋克短影音與視覺調色",
    categoryTag: "🎥 影音剪輯 & 短影音",
    badgeClass: "bg-green",
    instructorName: "林雅涵 (Hannah)",
    instructorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
    studentName: "張宇彤 (自媒體創作者)",
    imgUrl: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80",
    desc: "Premiere 專業剪輯與 AE 特效包，前 3 秒強效 Hook 腳本設計，創造 500 萬次觀看爆款流量。",
    feedback: "短影音前 3 秒開頭鉤子文案與電影級 LUTs 調色。經過林雅涵講師 3 次 1-on-1 對齊商業客戶過單標準，觀看次數與接案轉化率翻倍提升。"
  }
];

// 講義教材清單
let mockMaterials = [
  { id: "mat-1", courseId: "course-1", title: "React 19 與 AI Agent 核心講義 (PDF)", instructor: "張哲銘 (Ethan)", course: "AI 驅動 Full-Stack Web 開發實戰營", fileName: "React19_AI_Handbook.pdf", fileType: "pdf", fileSize: "3.8 MB", url: "https://cdn.pentaskill.com/react19_ai_handbook.pdf" },
  { id: "mat-2", courseId: "course-1", title: "全端專案架構與 API 串接範例檔 (Word)", instructor: "張哲銘 (Ethan)", course: "AI 驅動 Full-Stack Web 開發實戰營", fileName: "Fullstack_Architecture_Guide.docx", fileType: "word", fileSize: "1.9 MB", url: "https://cdn.pentaskill.com/fullstack_guide.docx" },
  { id: "mat-3", courseId: "course-2", title: "UI/UX Design System 150+ Figma 元件庫 (Figma)", instructor: "陳婷俐 (Tina)", course: "UI/UX 產品設計與 Figma 設計系統實力班", fileName: "Design_System_150_Tokens.figma", fileType: "ppt", fileSize: "8.2 MB", url: "https://figma.com/file/demo-design-system" },
  { id: "mat-4", courseId: "course-2", title: "星級求職作品集排版與設計覆盤指南 (PDF)", instructor: "陳婷俐 (Tina)", course: "UI/UX 產品設計與 Figma 設計系統實力班", fileName: "Portfolio_Review_Framework.pdf", fileType: "pdf", fileSize: "4.5 MB", url: "https://cdn.pentaskill.com/portfolio_framework.pdf" },
  { id: "mat-5", courseId: "course-3", title: "Python 爬蟲腳本範例與 Requests 模組實戰 (PDF)", instructor: "歐陽翔 (Shawn)", course: "Python 數據分析與自動化爬蟲實務", fileName: "Python_Crawler_Mastery.pdf", fileType: "pdf", fileSize: "2.7 MB", url: "https://cdn.pentaskill.com/python_crawler.pdf" },
  { id: "mat-6", courseId: "course-4", title: "短影音爆款 10 大黃金 Hook 腳本範本 (Word)", instructor: "林雅涵 (Hannah)", course: "高轉化率數位整合行銷與短影音電商實操", fileName: "Short_Video_10_Hooks.docx", fileType: "word", fileSize: "1.4 MB", url: "https://cdn.pentaskill.com/short_video_hooks.docx" }
];

// 🛡️ 脫敏處理：前台不內建任何其他潛在客戶個資
let mockLeads = [];

// 🛡️ 脫敏處理：前台不內建全體客戶私密客製報價單清單，僅於查詢或短網址時透過安全管道讀取
let mockCustomQuotes = [
  {
    id: "quote-101",
    studentEmail: "student@pentaskill.com",
    studentName: "林小明 (學員)",
    courseTitle: "AI 驅動 Full-Stack Web 開發實戰營 (👑 專屬對接 85 折優惠包)",
    customPrice: 10880,
    createdBy: "👑 平台主管",
    details: "包含全套錄播影音課程 + 4次張哲銘講師 1-on-1 個教 + 贈送 Figma 專案元件庫",
    updatedAt: calcDynamicDateTimeOffset(0, '16:30')
  }
];

// Google Sheet 前台送出表單 Webhook 配置
let googleSheetConfig = {
  sheetId: "1fqgvE5wBRYuU-U28xO63DYAQUgUaSlEsn6I8I4sHHRY",
  webhookUrl: "https://script.google.com/macros/s/AKfycbx9jqEQ07dxqpMa8gupoW8KKqKUFJMPX1cDWUaRWPSZWP1H_1SKX3IwvPaNGq6uthy1IA/exec",
  sheetName: "潛在學員諮詢紀錄",
  autoSync: true
};
