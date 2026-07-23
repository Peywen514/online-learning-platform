// Data model & RBAC Accounts for SkillSync Platform

const mockUsers = [
  {
    id: "u-1",
    name: "Wen總監",
    email: "pey514514@gmail.com",
    password: "admin514",
    role: "manager",
    roleLabel: "👑 平台主管 (Manager)",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-2",
    name: "李專案經理",
    email: "staff@skillsync.com",
    password: "staff123",
    role: "staff",
    roleLabel: "🧑‍💼 營運員工 (Staff)",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
  },
  {
    id: "u-3",
    name: "林小明 (學員)",
    email: "student@skillsync.com",
    password: "user123",
    role: "student",
    roleLabel: "🎓 消費者學員 (Student)",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80",
    purchasedCourses: ["course-1"]
  },
  {
    id: "u-4",
    name: "張哲銘 (Ethan講師)",
    email: "ethan@skillsync.com",
    password: "ethan123",
    role: "instructor",
    roleLabel: "👨‍🏫 金牌講師 (Instructor)",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80"
  }
];

let mockBookings = [
  {
    id: "bk-101",
    instructor: "張哲銘 (Ethan)",
    studentName: "林小明",
    studentEmail: "student@skillsync.com",
    date: "2026-07-25",
    slotTime: "14:00 - 15:00",
    topic: "專案作品 1 對 1 精準批修與架構診斷 (1小時)",
    notes: "想檢討 React 19 與 AI API 串接效能優化...",
    status: "已預約",
    fee: 1800,
    payout: 1080
  },
  {
    id: "bk-102",
    instructor: "陳婷俐 (Tina)",
    studentName: "黃雅婷",
    studentEmail: "yating@example.com",
    date: "2026-07-25",
    slotTime: "15:30 - 16:30",
    topic: "UI/UX 與 跨領域作品集 1 對 1 精細修稿 (1小時)",
    notes: "請講師幫忙檢視 Figma 3D 擬態作品集排版...",
    status: "已預約",
    fee: 2000,
    payout: 1200
  },
  {
    id: "bk-103",
    instructor: "歐陽翔 (Shawn)",
    studentName: "林家豪",
    studentEmail: "jiahao@example.com",
    date: "2026-07-26",
    slotTime: "19:00 - 20:00",
    topic: "專案作品 1 對 1 精準批修與架構診斷 (1小時)",
    notes: "針對北歐風 3D 全景渲染光影參數調整...",
    status: "已完成",
    fee: 1600,
    payout: 960
  },
  {
    id: "bk-104",
    instructor: "林雅涵 (Hannah)",
    studentName: "張宇彤",
    studentEmail: "yutong@example.com",
    date: "2026-07-26",
    slotTime: "20:30 - 21:30",
    topic: "副業接案定價與商業合約教練 (1小時)",
    notes: "短影音腳本對接品牌客戶過單報價問題...",
    status: "已完成",
    fee: 1800,
    payout: 1080
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
    badge: "👑 名師陪跑"
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
    rate1on1: "NT$ 1,800 / 1小時",
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
    rate1on1: "NT$ 2,000 / 1小時",
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
    rate1on1: "NT$ 1,600 / 1小時",
    quote: "「自動化工具能節省你 90% 的繁瑣工作，我教你寫出實用腳本。」"
  },
  {
    id: "inst-4",
    name: "林雅涵 (Hannah)",
    role: "數位整合行銷與短影音教練",
    tag: "氣質電商爆款行銷師",
    exp: "知名教育機構近10年行銷名師 / 品牌電商營運總監",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    skills: ["Meta Ads", "SEO", "Short Video", "Conversion Funnel"],
    rating: 4.9,
    studentCount: 1950,
    rate1on1: "NT$ 1,800 / 1小時",
    quote: "「精準流量加上好的個教文案批改，打造極致轉化率。」"
  }
];

let mockChapters = [
  {
    id: 1,
    title: "第 1 章：專案環境建置與現代前端趨勢",
    duration: "45 分鐘",
    lessons: [
      { id: "1-1", title: "1-1 開發環境準備與 VS Code 神級 Extension", completed: true },
      { id: "1-2", title: "1-2 Git / GitHub 團隊協作與個教作業繳交流程", completed: true }
    ]
  },
  {
    id: 2,
    title: "第 2 章：Full-Stack React & AI 專案架構拆解",
    duration: "65 分鐘",
    lessons: [
      { id: "2-1", title: "2-1 React 19 新特性與 Component 設計哲學", completed: true },
      { id: "2-2", title: "2-2 LLM API 串接與 Server-Sent Events (SSE)", completed: false, active: true },
      { id: "2-3", title: "2-3 【作業】建立第一個 AI 對話模組與 Error 處理", completed: false }
    ]
  },
  {
    id: 3,
    title: "第 3 章：1-on-1 個教 Code Review 實戰微調",
    duration: "40 分鐘",
    lessons: [
      { id: "3-1", title: "3-1 講師帶你審視性能瓶頸 (Re-render 優化)", completed: false },
      { id: "3-2", title: "3-2 部署至 Vercel / Cloudflare 並設定 Domain", completed: false }
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
  { id: "mat-1", title: "React 19 與 AI Agent 核心講義 (PDF)", instructor: "張哲銘 (Ethan)", course: "Full-Stack AI 專案開發", url: "https://cdn.skillsync.com/react19_ai_handbook.pdf" },
  { id: "mat-2", title: "UI/UX Design System 150+ Figma 元件庫", instructor: "陳婷俐 (Tina)", course: "UI/UX 產品設計與 3D 擬態", url: "https://figma.com/file/demo-design-system" }
];
