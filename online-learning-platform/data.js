// Data model & RBAC Accounts for 練課室 SkillSync Platform

// System Mock Accounts with Roles
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
  }
];

let mockCourses = [
  {
    id: "course-1",
    title: "AI 驅動 Full-Stack Web 開發實戰營",
    category: "frontend",
    categoryLabel: "網頁開發 / AI",
    instructor: "張哲銘",
    instructorTitle: "近10年全台培訓體系資深 Front-End & AI 架構師",
    instructorAvatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=600&q=80",
    priceRecordOnly: 3600,
    priceWith1on1: 12800,
    rating: 4.9,
    reviewCount: 142,
    videoDuration: "32 小時錄播視訊",
    liveSlotsCount: "4 次 1-on-1 專屬個教批改",
    description: "結合 React, Node.js 與 OpenAI/Claude API。從基礎語法到獨立完成可上線的 AI SaaS 應用，並提供導師 1 對 1 Code Review。",
    badge: "🔥 熱銷首選"
  },
  {
    id: "course-2",
    title: "UI/UX 產品設計與 Figma 設計系統實力班",
    category: "design",
    categoryLabel: "UI/UX 與 設計",
    instructor: "陳婷俐",
    instructorTitle: "前知名電腦培訓體系 跨國專案 UI/UX 設計總監",
    instructorAvatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?auto=format&fit=crop&w=600&q=80",
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
    instructor: "林威宏",
    instructorTitle: "知名教育體系資深 Python 資料科學專任講師",
    instructorAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80",
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
    instructor: "黃佩珊",
    instructorTitle: "資深職業培訓電商行銷顧問 • 累計輔導 200+ 品牌",
    instructorAvatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80",
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
    instructor: "業界頂尖名師顧問團",
    instructorTitle: "總監級導師 1對1 親自陪跑",
    instructorAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
    coverImage: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=600&q=80",
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
    name: "張哲銘",
    role: "Full-Stack & AI 技術專家",
    exp: "全台知名電腦教育體系近10年金牌講師 / 前知名科技公司技術長",
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=300&q=80",
    skills: ["React", "Node.js", "AI Agent Integration", "TypeScript"],
    rating: 4.9,
    studentCount: 1850,
    rate1on1: "NT$ 1,800 / 45分鐘",
    quote: "「程式不是用看的，是用手寫跟導師一對一問出來的！」"
  },
  {
    id: "inst-2",
    name: "陳婷俐",
    role: "UI/UX 與 Figma 系統總監",
    exp: "知名電腦教育機構近10年高級講師 / 矽谷新創產品設計顧問",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80",
    skills: ["Figma Design System", "User Research", "Prototyping", "Design Review"],
    rating: 5.0,
    studentCount: 2200,
    rate1on1: "NT$ 2,000 / 45分鐘",
    quote: "「透過一對一微調像素細節，你的作品集將會脫穎而出。」"
  },
  {
    id: "inst-3",
    name: "林威宏",
    role: "Python 數據分析與自動化顧問",
    exp: "職業培訓機構近10年專任導師 / 數據金融分析師",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80",
    skills: ["Python", "Pandas", "Web Scraping", "SQL Database"],
    rating: 4.8,
    studentCount: 1400,
    rate1on1: "NT$ 1,600 / 45分鐘",
    quote: "「自動化工具能節省你 90% 的繁瑣工作，我教你寫出實用腳本。」"
  },
  {
    id: "inst-4",
    name: "黃佩珊",
    role: "數位整合行銷與電商教練",
    exp: "知名教育機構近10年行銷名師 / 品牌電商營運總監",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=300&q=80",
    skills: ["Meta Ads", "SEO", "Short Video Content", "Conversion Funnel"],
    rating: 4.9,
    studentCount: 1950,
    rate1on1: "NT$ 1,800 / 45分鐘",
    quote: "「精準流量加上好的個教文案批改，打造極致轉化率率。」"
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
      { id: "3-1", title: "3-1 導師帶你審視性能瓶頸 (Re-render 優化)", completed: false },
      { id: "3-2", title: "3-2 部署至 Vercel / Cloudflare 並設定 Domain", completed: false }
    ]
  }
];
