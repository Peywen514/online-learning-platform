// Data model & RBAC Accounts for PentaSkill Platform

const mockUsers = [
  {
    id: "u-1",
    name: "Wen總監",
    email: "pey514514@gmail.com",
    password: "admin514",
    role: "manager",
    roleLabel: "👑 平台主管 (Manager)",
    bankInfo: { bankName: "玉山銀行 (808)", bankAccount: "80812345678999999", accountLast5: "99999" },
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-1b",
    name: "林顧問",
    email: "consultant@pentaskill.com",
    password: "consultant123",
    role: "consultant",
    roleLabel: "💼 顧問 (Consultant)",
    bankInfo: { bankName: "中國信託 (822)", bankAccount: "82299887766554433", accountLast5: "54433" },
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-2",
    name: "張雅涵",
    email: "yahan@pentaskill.com",
    phone: "0912-334-556",
    password: "staff123",
    role: "staff",
    roleLabel: "🧑‍💼 營運員工 (Staff)",
    bankInfo: { bankName: "國泰世華 (013)", bankAccount: "01358899123419482", accountLast5: "19482" },
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-2b",
    name: "陳冠宇",
    email: "guanyu@pentaskill.com",
    phone: "0922-111-222",
    password: "staff123",
    role: "staff",
    roleLabel: "🧑‍💼 營運員工 (Staff)",
    bankInfo: { bankName: "玉山銀行 (808)", bankAccount: "80866554433238104", accountLast5: "38104" },
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-2c",
    name: "林怡均",
    email: "yijun@pentaskill.com",
    phone: "0933-444-555",
    password: "staff123",
    role: "staff",
    roleLabel: "🧑‍💼 營運員工 (Staff)",
    bankInfo: { bankName: "台新銀行 (812)", bankAccount: "81288776655462951", accountLast5: "62951" },
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-3",
    name: "林小明 (學員)",
    email: "student@pentaskill.com",
    password: "user123",
    role: "student",
    roleLabel: "🎓 消費者學員 (Student)",
    bankInfo: { bankName: "台新銀行 (812)", bankAccount: "81200112233445566", accountLast5: "45566" },
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
    bankInfo: { bankName: "玉山銀行 (808)", bankAccount: "80898765432158923", accountLast5: "58923" },
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-5",
    name: "陳婷俐 (Tina)",
    email: "tina@pentaskill.com",
    password: "tina123",
    role: "instructor",
    roleLabel: "👨‍🏫 金牌講師 (Instructor)",
    bankInfo: { bankName: "國泰世華 (013)", bankAccount: "01377889900147281", accountLast5: "47281" },
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-6",
    name: "歐陽翔 (Shawn)",
    email: "shawn@pentaskill.com",
    password: "shawn123",
    role: "instructor",
    roleLabel: "👨‍🏫 金牌講師 (Instructor)",
    bankInfo: { bankName: "台新銀行 (812)", bankAccount: "81255667788992345", accountLast5: "92345" },
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-7",
    name: "林雅涵 (Hannah)",
    email: "hannah@pentaskill.com",
    password: "hannah123",
    role: "instructor",
    roleLabel: "👨‍🏫 金牌講師 (Instructor)",
    bankInfo: { bankName: "中國信託 (822)", bankAccount: "82233445566731980", accountLast5: "31980" },
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80"
  }
];

let mockBookings = [
  {
    id: "bk-101",
    instructor: "張哲銘 (Ethan)",
    studentName: "林小明",
    studentEmail: "student@pentaskill.com",
    date: "2026-09-11",
    slotTime: "14:00 - 15:00",
    topic: "專案作品 1 對 1 精準批改與架構診斷 (1小時)",
    notes: "想檢討 React 19 與 AI API 串接效能優化...",
    status: "已預約",
    fee: 1800,
    payout: 1800 // 100% 全額撥付給講師 (是多少就給多少)
  },
  {
    id: "bk-102",
    instructor: "陳婷俐 (Tina)",
    studentName: "黃雅婷",
    studentEmail: "yating@example.com",
    date: "2026-09-09",
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
    date: "2026-09-07",
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
    date: "2026-09-05",
    slotTime: "20:30 - 21:30",
    topic: "副業接案定價與商業合約教練 (1小時)",
    notes: "短影音腳本對接品牌客戶過單報價問題...",
    status: "已完成",
    fee: 1800,
    payout: 1800
  }
];

// 講師月結薪資資料庫 (綁定個人名下錄播課程營收 × 20% 分潤 ＋ 1-on-1 個教鐘點 100% 全額)
let mockMentorSalaries = [
  {
    id: "sal-101",
    name: "張哲銘 (Ethan)",
    role: "Full-Stack & AI 技術專家",
    bankInfo: { bankName: "玉山銀行 (808)", accountLast5: "58923" },
    coursesDetail: [
      { courseTitle: "AI 驅動 Full-Stack Web 開發實戰營", price: 3600, soldCount: 15 },
      { courseTitle: "React 19 & Next.js 15 全端自學包", price: 2680, soldCount: 12 }
    ],
    recordedTotalSold: 27, // 15 + 12 = 27 門課
    recordedRevenue: 86160, // (3600*15) + (2680*12) = 54000 + 32160 = 86160
    recordedSplitRate: 0.20, // 2 成 (20%)
    recordedPayout: 17232, // 86160 * 20% = 17,232
    coachingRate: 1800,
    coachingCompleted: 18,
    coachingPayout: 32400, // 1800 * 18 (100% 全額)
    bonus: 2000,
    bonusNote: "新錄播單元上架獎勵",
    totalSalary: 51632, // 17232 + 32400 + 2000
    status: "待審核撥款"
  },
  {
    id: "sal-102",
    name: "陳婷俐 (Tina)",
    role: "UI/UX 與 Figma 系統總監",
    bankInfo: { bankName: "國泰世華 (013)", accountLast5: "14820" },
    coursesDetail: [
      { courseTitle: "UI/UX 產品設計與 Figma 設計系統實力班", price: 4200, soldCount: 16 },
      { courseTitle: "Figma 3D 擬態與高階原型實戰", price: 2980, soldCount: 10 }
    ],
    recordedTotalSold: 26,
    recordedRevenue: 97000, // (4200*16) + (2980*10) = 67200 + 29800 = 97000
    recordedSplitRate: 0.20,
    recordedPayout: 19400, // 97000 * 20% = 19,400
    coachingRate: 2000,
    coachingCompleted: 15,
    coachingPayout: 30000,
    bonus: 0,
    bonusNote: "",
    totalSalary: 49400, // 19400 + 30000
    status: "待審核撥款"
  },
  {
    id: "sal-103",
    name: "歐陽翔 (Shawn)",
    role: "Python 數據分析與 AI 顧問",
    bankInfo: { bankName: "台新銀行 (812)", accountLast5: "77312" },
    coursesDetail: [
      { courseTitle: "Python 數據分析與自動化爬蟲實務", price: 3200, soldCount: 16 },
      { courseTitle: "AI 機器學習與商業預測模型入門", price: 2680, soldCount: 4 }
    ],
    recordedTotalSold: 20,
    recordedRevenue: 61920, // (3200*16) + (2680*4) = 51200 + 10720 = 61920
    recordedSplitRate: 0.20,
    recordedPayout: 12384, // 61920 * 20% = 12,384
    coachingRate: 1600,
    coachingCompleted: 12,
    coachingPayout: 19200,
    bonus: 1000,
    bonusNote: "客製化講義編撰補貼",
    totalSalary: 32584, // 12384 + 19200 + 1000
    status: "已撥款完成"
  },
  {
    id: "sal-104",
    name: "林雅涵 (Hannah)",
    role: "短影音與數位整合行銷總監",
    bankInfo: { bankName: "台北富邦 (012)", accountLast5: "90416" },
    coursesDetail: [
      { courseTitle: "高轉化率數位整合行銷與短影音電商實操", price: 2980, soldCount: 14 },
      { courseTitle: "自媒體個人品牌接案定價課", price: 1880, soldCount: 6 }
    ],
    recordedTotalSold: 20,
    recordedRevenue: 53000, // (2980*14) + (1880*6) = 41720 + 11280 = 53000
    recordedSplitRate: 0.20,
    recordedPayout: 10600, // 53000 * 20% = 10,600
    coachingRate: 1800,
    coachingCompleted: 10,
    coachingPayout: 18000,
    bonus: 0,
    bonusNote: "",
    totalSalary: 28600, // 10600 + 18000
    status: "已撥款完成"
  }
];

// 平台員工薪資發放資料庫 (Wen總監專屬管理)
let mockStaffSalaries = [
  {
    id: "staff-101",
    name: "張雅涵",
    role: "營運企劃與教務主管",
    bankInfo: { bankName: "國泰世華 (013)", accountLast5: "19482" },
    baseSalary: 38000,
    bonus: 3000,
    bonusNote: "新課程上架達標獎勵",
    totalSalary: 41000,
    status: "已發放"
  },
  {
    id: "staff-102",
    name: "陳冠宇",
    role: "LINE@ 客服小編與社群經營",
    bankInfo: { bankName: "玉山銀行 (808)", accountLast5: "38104" },
    baseSalary: 18000,
    bonus: 2000,
    bonusNote: "諮詢轉換達標獎勵",
    totalSalary: 20000,
    status: "待發放"
  },
  {
    id: "staff-103",
    name: "林怡均",
    role: "短影音剪輯與教材視覺設計 (兼職)",
    bankInfo: { bankName: "台新銀行 (812)", accountLast5: "62951" },
    baseSalary: 12000,
    bonus: 0,
    bonusNote: "",
    totalSalary: 12000,
    status: "已發放"
  }
];

// 平台運營與伺服器固定花費資料庫
let mockPlatformExpenses = [
  {
    id: "exp-101",
    name: "Cloudflare Stream 影音串流與 CDN 頻寬",
    category: "伺服器與主機",
    amount: 3500,
    cycle: "月繳",
    notes: "錄播高畫質防盜串流與極速載入"
  },
  {
    id: "exp-102",
    name: "第三方金流手續費與電子發票系統",
    category: "金流與稅務",
    amount: 6000,
    cycle: "月結",
    notes: "信用卡/ATM/超商金流約 2.8% 手續費"
  },
  {
    id: "exp-103",
    name: "Meta / Google 官方課程廣告投放預算",
    category: "行銷廣告",
    amount: 15000,
    cycle: "月度預算",
    notes: "官方獲客導流廣告支出 (團隊全額吸收)"
  }
];

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
    videoDuration: "32 小時錄播視訊",
    liveSlotsCount: "4 次 1-on-1 專屬個教批改",
    description: "結合 React, Node.js 與 OpenAI/Claude API。從基礎語法到獨立完成可上線的 AI SaaS 應用，並提供講師 1 對 1 Code Review。",
    badge: "🔥 熱銷首選"
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
    videoDuration: "28 小時錄播視訊",
    liveSlotsCount: "4 次 1對1 Figma 作品集重構",
    description: "掌握 Auto-Layout、Design System 與 Prototype。透過 1 對 1 個教微調作品細節，打造能直接面試求職的星級作品集。",
    badge: "👑 教學多年業師陪跑"
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
    videoDuration: "24 小時錄播視訊",
    liveSlotsCount: "3 次 數據模型與腳本一對一診斷",
    description: "學會 Pandas, BeautifulSoup, Selenium 與數據視覺化。協助學員打造公司自動化工具或個人接案專案。",
    badge: "⚡ 實務高效"
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
    videoDuration: "20 小時錄播視訊",
    liveSlotsCount: "3 次 廣告文案與投放數據個教診斷",
    description: "全方位解析 Meta 廣告、Google SEO、TikTok 短影音文案。配合 1 對 1 實作，即刻優化你的電商或接案轉換率。",
    badge: "📈 業績翻倍"
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
    videoDuration: "無限次觀看全站錄播視訊",
    liveSlotsCount: "12 次 雙週 1-on-1 深入個教輔導",
    description: "適合想在 3-6 個月內轉職工程師、設計師或接案自由工作者。包含履歷改造、模擬面試與外包案源優先派案。",
    badge: "🏆 轉職首選"
  }
];

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

try {
  const savedInstructors = localStorage.getItem('pentaskill_instructors');
  if (savedInstructors) {
    const parsed = JSON.parse(savedInstructors);
    if (Array.isArray(parsed) && parsed.length > 0) {
      mockInstructors = parsed;
    }
  }
} catch (e) {}

let cloudflareStreamConfig = {
  accountId: "c6a2e87901fb4a88bc345123456789ab",
  customerSubdomain: "customer-88nzk2.cloudflarestream.com",
  requireSignedTokens: true,
  allowedOrigins: ["online-class.pey514514.workers.dev", "peywen514.github.io", "pentaskill.com", "localhost"],
  hlsEncryption: "AES-128 / Dynamic HLS Bitrate",
  signingKeyId: "key-cf-stream-pentaskill-2026"
};

let mockChapters = [
  {
    id: 1,
    title: "第 1 章：專案環境建置與現代前端趨勢",
    duration: "45 分鐘",
    lessons: [
      { 
        id: "1-1", 
        title: "1-1 開發環境準備與 VS Code 神級 Extension", 
        completed: true,
        streamId: "5d5ba37905d088d80097030722b813f2",
        isTrialAllowed: true,
        durationSeconds: 900
      },
      { 
        id: "1-2", 
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
    title: "第 2 章：Full-Stack React & AI 專案架構拆解",
    duration: "65 分鐘",
    lessons: [
      { 
        id: "2-1", 
        title: "2-1 React 19 新特性與 Component 設計哲學", 
        completed: true,
        streamId: "fc38d9982a1740d7a0491823901bc093",
        isTrialAllowed: true,
        durationSeconds: 1500
      },
      { 
        id: "2-2", 
        title: "2-2 LLM API 串接與 Server-Sent Events (SSE)", 
        completed: false, 
        active: true,
        streamId: "729486c91a0248888bf402a7b189872e",
        isTrialAllowed: false,
        durationSeconds: 2280
      },
      { 
        id: "2-3", 
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
    title: "第 3 章：1-on-1 個教 Code Review 實戰微調",
    duration: "40 分鐘",
    lessons: [
      { 
        id: "3-1", 
        title: "3-1 講師帶你審視性能瓶頸 (Re-render 優化)", 
        completed: false,
        streamId: "e4418a09bcae412398457788102947a1",
        isTrialAllowed: false,
        durationSeconds: 1200
      },
      { 
        id: "3-2", 
        title: "3-2 部署至 Vercel / Cloudflare 並設定 Domain", 
        completed: false,
        streamId: "fa90812bc81047712a55981245671190",
        isTrialAllowed: false,
        durationSeconds: 1200
      }
    ]
  }
];

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
    title: "CyberPulse — 4K 電影級賽博朋克短影音與視覺調色",
    categoryTag: "🎥 影音剪輯 & 短影音",
    badgeClass: "bg-green",
    instructorName: "林雅涵 (Hannah)",
    instructorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
    studentName: "張宇彤 (自媒體創作者)",
    imgUrl: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80",
    desc: "Premiere 4K 剪輯與 AE 特效包，前 3 秒強效 Hook 腳本設計，創造 500 萬次觀看爆款流量。",
    feedback: "短影音前 3 秒開頭鉤子文案與電影級 LUTs 調色。經過林雅涵講師 3 次 1-on-1 對齊商業客戶過單標準，觀看次數與接案轉化率翻倍提升。"
  }
];

let mockMaterials = [
  { id: "mat-1", title: "React 19 與 AI Agent 核心講義 (PDF)", instructor: "張哲銘 (Ethan)", course: "Full-Stack AI 專案開發", url: "https://cdn.pentaskill.com/react19_ai_handbook.pdf" },
  { id: "mat-2", title: "UI/UX Design System 150+ Figma 元件庫", instructor: "陳婷俐 (Tina)", course: "UI/UX 產品設計與 3D 擬態", url: "https://figma.com/file/demo-design-system" }
];

let mockLeads = [
  {
    id: "lead-101",
    createdAt: "2026-09-09 14:15",
    name: "陳姿涵",
    phone: "0912-345-678",
    email: "zihan@example.com",
    course: "UI/UX 產品設計與 Figma 設計系統實力班",
    identity: "💼 上班族 (希望職場提升/加薪)",
    goal: "🎯 想要在 3-6 個月內成功轉職",
    experience: "📖 曾看影片/買書自學，但缺乏實作與批改",
    timePerWeek: "⏱️ 4 ~ 8 小時 (積極學習)",
    priorityHelp: "🤖 想解決目前使用 AI 工具遇到問題",
    notes: "想瞭解專案作品集要放幾份比較容易拿到大廠面試？方便聯繫時間：晚間7點後。",
    status: "🆕 新進諮詢"
  },
  {
    id: "lead-102",
    createdAt: "2026-09-09 11:30",
    name: "王建宏",
    phone: "0987-654-321",
    email: "kenwang@example.com",
    course: "AI 驅動 Full-Stack Web 開發實戰營",
    identity: "🚀 待業 / 準備轉職中 (希望快速完課對接求職)",
    goal: "🎯 想要在 3-6 個月內成功轉職",
    experience: "🌱 零基礎白紙新手 (希望講師手把手入門)",
    timePerWeek: "⏱️ 9 小時以上 (全職衝刺/全速個教)",
    priorityHelp: "📅 索取課程大綱與免費試聽影片",
    notes: "希望能安排張哲銘 (Ethan) 講師個教！主要想了解完課率與作品集輔導機制。",
    status: "✅ 已聯繫洽談"
  }
];

let mockCustomQuotes = [
  {
    id: "quote-101",
    studentEmail: "student@pentaskill.com",
    studentName: "林小明 (學員)",
    courseTitle: "AI 驅動 Full-Stack Web 開發實戰營 (👑 專屬對接 85 折優惠包)",
    customPrice: 10880,
    createdBy: "👑 平台主管",
    details: "包含全套錄播視訊 + 4次張哲銘講師 1-on-1 個教 + 贈送 Figma 專案元件庫",
    updatedAt: "2026-09-09 16:30"
  }
];

let googleSheetConfig = {
  sheetId: "1fqgvE5wBRYuU-U28xO63DYAQUgUaSlEsn6I8I4sHHRY",
  sheetUrl: "https://docs.google.com/spreadsheets/d/1fqgvE5wBRYuU-U28xO63DYAQUgUaSlEsn6I8I4sHHRY/edit",
  webhookUrl: localStorage.getItem('pentaskill_sheet_webhook') || "https://script.google.com/macros/s/AKfycbx9jqEQ07dxqpMa8gupoW8KKqKUFJMPX1cDWUaRWPSZWP1H_1SKX3IwvPaNGq6uthy1IA/exec",
  sheetName: "潛在學員諮詢紀錄",
  autoSync: true
};
