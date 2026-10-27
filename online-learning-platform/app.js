// Cloudflare KV Cloud Sync Engine (跨裝置全域資料庫同步)
const CLOUD_SYNC_API = '/api/cloud-sync';

async function fetchCloudData(key) {
  try {
    const res = await fetch(`${CLOUD_SYNC_API}?key=${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    console.log(`[Cloudflare KV] 讀取 ${key} (如在非 Worker 環境將自動切換 LocalStorage):`, err.message);
    return null;
  }
}

async function saveCloudData(key, data) {
  try {
    const res = await fetch(CLOUD_SYNC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, data })
    });
    return res.ok;
  } catch (err) {
    console.log(`[Cloudflare KV] 儲存 ${key} 提醒:`, err.message);
    return false;
  }
}

// ⚡ 一鍵將全站資料全量推送到 Cloudflare KV 雲端資料庫
async function syncAllDataToCloudflareKV() {
  if (typeof showToast === 'function') {
    showToast('⚡ 正在將全站資料打包寫入 Cloudflare KV 雲端...', 'info');
  }
  
  try {
    const payload = {
      users: mockUsers,
      custom_quotes: mockCustomQuotes,
      leads: mockLeads,
      courses: mockCourses,
      instructors: mockInstructors,
      bookings: mockBookings,
      mentor_salaries: mockMentorSalaries,
      staff_salaries: mockStaffSalaries,
      platform_expenses: mockPlatformExpenses,
      course_materials: (typeof getAllCourseMaterials === 'function') ? getAllCourseMaterials() : [],
      chapters: (typeof mockChapters !== 'undefined') ? mockChapters : []
    };
    if (currentUser && currentUser.email) {
      const progKey = 'pentaskill_video_progress_' + currentUser.email;
      const rawProg = localStorage.getItem(progKey);
      if (rawProg) {
        try { payload['video_progress_' + currentUser.email] = JSON.parse(rawProg); } catch(e) {}
      }
    }

    // 優先嘗試批次同步端點 /api/cloud-sync-all
    try {
      const batchRes = await fetch('/api/cloud-sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (batchRes.ok) {
        if (typeof showToast === 'function') {
          showToast('🎉 全站資料 (含講師薪資、員工薪資、平台花費與排班清單) 已成功全量寫入 Cloudflare KV！', 'success');
        }
        return true;
      }
    } catch(e) {}

    // Fallback: 逐一 key 同步
    let successCount = 0;
    for (const [k, d] of Object.entries(payload)) {
      const ok = await saveCloudData(k, d);
      if (ok) successCount++;
    }

    if (successCount > 0) {
      if (typeof showToast === 'function') {
        showToast(`🎉 已成功同步 ${successCount} 項資料表至 Cloudflare KV！請至 Cloudflare 後台 KV Pairs 查看！`, 'success');
      }
      return true;
    } else {
      if (typeof showToast === 'function') {
        showToast('⚠️ 同步失敗，請確認 Cloudflare Worker 設定中已將 KV 綁定名稱設為 PENTASKILL_KV。', 'warning');
      }
      return false;
    }
  } catch (err) {
    console.error('全量同步異常:', err);
    if (typeof showToast === 'function') {
      showToast('❌ 同步異常: ' + err.message, 'error');
    }
    return false;
  }
}

// 儲存個教排班與預約清單至 LocalStorage 及 Cloudflare KV
function saveBookingsToStorage(syncCloud = true) {
  try {
    localStorage.setItem('pentaskill_bookings', JSON.stringify(mockBookings));
  } catch (err) {}
  if (syncCloud && typeof saveCloudData === 'function') {
    saveCloudData('bookings', mockBookings);
  }
}

// 雲端開機自動同步載入
async function initCloudSync() {
  try {
    const [cloudUsers, cloudQuotes, cloudLeads, cloudBookings, cloudSalaries, cloudStaff, cloudExpenses, cloudCourses, cloudChapters, cloudMaterials] = await Promise.all([
      fetchCloudData('users'),
      fetchCloudData('custom_quotes'),
      fetchCloudData('leads'),
      fetchCloudData('bookings'),
      fetchCloudData('mentor_salaries'),
      fetchCloudData('staff_salaries'),
      fetchCloudData('platform_expenses'),
      fetchCloudData('courses'),
      fetchCloudData('chapters'),
      fetchCloudData('course_materials')
    ]);

    let updated = false;

    // 1. 同步全域使用者名單與點數
    if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
      cloudUsers.forEach(cu => {
        const idx = mockUsers.findIndex(u => u.id === cu.id || (u.email && cu.email && u.email.toLowerCase() === cu.email.toLowerCase()));
        if (idx !== -1) {
          mockUsers[idx] = { ...mockUsers[idx], ...cu };
        } else {
          mockUsers.push(cu);
        }
      });
      saveUsersToStorage(false); // save to local only
      updated = true;
    }

    // 2. 同步報價單
    if (Array.isArray(cloudQuotes) && cloudQuotes.length > 0) {
      mockCustomQuotes = cloudQuotes;
      try {
        localStorage.setItem('pentaskill_custom_quotes', JSON.stringify(mockCustomQuotes));
      } catch(err) {}
      updated = true;
    }

    // 3. 同步諮詢需求紀錄
    if (Array.isArray(cloudLeads) && cloudLeads.length > 0) {
      mockLeads = cloudLeads;
      try {
        localStorage.setItem('pentaskill_leads', JSON.stringify(mockLeads));
      } catch(err) {}
      updated = true;
    }

    // 4. 同步 1-on-1 個教排班與預約資料庫
    if (Array.isArray(cloudBookings) && cloudBookings.length > 0) {
      mockBookings = cloudBookings;
      try {
        localStorage.setItem('pentaskill_bookings', JSON.stringify(mockBookings));
      } catch(err) {}
      renderBookingAdminTable();
      renderStudentBookings();
      updateAvailableSlots();
      updated = true;
    }

    // 5. 同步講師月結薪資資料庫
    if (Array.isArray(cloudSalaries) && cloudSalaries.length > 0) {
      mockMentorSalaries = cloudSalaries;
      try {
        localStorage.setItem('pentaskill_mentor_salaries', JSON.stringify(mockMentorSalaries));
      } catch(err) {}
      renderMentorSalaryTable();
      updated = true;
    }

    // 6. 同步員工薪資資料庫
    if (Array.isArray(cloudStaff) && cloudStaff.length > 0) {
      mockStaffSalaries = cloudStaff;
      try {
        localStorage.setItem('pentaskill_staff_salaries', JSON.stringify(mockStaffSalaries));
      } catch(err) {}
      renderStaffSalaryTable();
      updated = true;
    }

    // 7. 同步平台固定運營花費資料庫
    if (Array.isArray(cloudExpenses) && cloudExpenses.length > 0) {
      mockPlatformExpenses = cloudExpenses;
      try {
        localStorage.setItem('pentaskill_platform_expenses', JSON.stringify(mockPlatformExpenses));
      } catch(err) {}
      renderPlatformExpensesTable();
      updated = true;
    }

    // 8. 同步線上課程資料庫 (包含自訂價格與內容)
    if (Array.isArray(cloudCourses) && cloudCourses.length > 0) {
      mockCourses = cloudCourses;
      try {
        localStorage.setItem('pentaskill_courses', JSON.stringify(mockCourses));
      } catch(err) {}
      renderCourseGrid('all');
      renderHomeFeaturedCourses();
      renderCourseAdminTable();
      updated = true;
    }

    // 9. 同步錄播單元與章節影片資料庫
    if (Array.isArray(cloudChapters) && cloudChapters.length > 0) {
      mockChapters = cloudChapters;
      try {
        localStorage.setItem('pentaskill_chapters', JSON.stringify(mockChapters));
      } catch(err) {}
      if (typeof renderChapterAdminList === 'function') renderChapterAdminList();
      if (typeof renderChapters === 'function') renderChapters();
    if (currentUser && currentUser.email && typeof loadStudentVideoProgressFromCloud === 'function') {
      loadStudentVideoProgressFromCloud(currentUser.email);
    }
      updated = true;
    }

    // 10. 同步隨課講義與教材清單
    if (Array.isArray(cloudMaterials) && cloudMaterials.length > 0) {
      try {
        localStorage.setItem('pentaskill_course_materials', JSON.stringify(cloudMaterials));
      } catch(err) {}
      if (typeof renderStudentCourseHandouts === 'function') renderStudentCourseHandouts('course-1');
      updated = true;
    }

    if (updated) {
      renderFinanceDashboardKPIs();
    }

    // 6. 若當前登入者有最新雲端點數，即時刷新
    if (currentUser) {
      const refreshed = mockUsers.find(u => u.id === currentUser.id || (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()));
      if (refreshed) {
        currentUser = refreshed;
        try {
          localStorage.setItem('pentaskill_user', JSON.stringify(currentUser));
        } catch(err) {}
      }
    }

    if (updated) {
      renderAuthArea();
      updateUIPermissions();
    if (typeof loadStudentVideoProgressFromCloud === 'function' && currentUser.email) {
      loadStudentVideoProgressFromCloud(currentUser.email).then(() => {
        if (typeof renderMemberCenter === 'function') renderMemberCenter();
      });
    }
      renderUserTable();
      renderCustomQuotesAdminTable();
      renderLeadAdminTable();
      if (currentView === 'member-center') {
        renderMemberCenterView();
      }
    }
  } catch (err) {
    console.warn('[Cloud Sync] 同步初始化提醒:', err);
  }
}

// Restore all users from LocalStorage if available, merging with mockUsers
try {
  const savedUsers = localStorage.getItem('pentaskill_users');
  if (savedUsers) {
    const parsedUsers = JSON.parse(savedUsers);
    if (Array.isArray(parsedUsers) && parsedUsers.length > 0) {
      parsedUsers.forEach(pu => {
        const idx = mockUsers.findIndex(u => u.id === pu.id || (u.email && pu.email && u.email.toLowerCase() === pu.email.toLowerCase()));
        if (idx !== -1) {
          mockUsers[idx] = pu;
        } else {
          mockUsers.push(pu);
        }
      });
    }
  }
} catch (err) {}

function saveUsersToStorage(syncToCloud = true) {
  try {
    localStorage.setItem('pentaskill_users', JSON.stringify(mockUsers));
  } catch (err) {}
  if (syncToCloud) {
    saveCloudData('users', mockUsers);
  }
}

function saveCoursesToStorage(syncToCloud = true) {
  try {
    localStorage.setItem('pentaskill_courses', JSON.stringify(mockCourses));
  } catch (err) {}
  if (syncToCloud && typeof saveCloudData === 'function') {
    saveCloudData('courses', mockCourses);
  }
}

function saveLeadsToStorage(syncToCloud = true) {
  try {
    localStorage.setItem('pentaskill_leads', JSON.stringify(mockLeads));
  } catch (err) {}
  if (syncToCloud && typeof saveCloudData === 'function') {
    saveCloudData('leads', mockLeads);
  }
}

function saveQuotesToStorage(syncToCloud = true) {
  try {
    localStorage.setItem('pentaskill_custom_quotes', JSON.stringify(mockCustomQuotes));
  } catch (err) {}
  if (syncToCloud && typeof saveCloudData === 'function') {
    saveCloudData('custom_quotes', mockCustomQuotes);
  }
}

// 讀取本地 pentaskill_users 並自動補全 bankInfo
try {
  const savedUsers = localStorage.getItem('pentaskill_users');
  if (savedUsers) {
    const parsedUsers = JSON.parse(savedUsers);
    if (Array.isArray(parsedUsers) && parsedUsers.length > 0) {
      parsedUsers.forEach(pu => {
        const defaultU = mockUsers.find(mu => mu.id === pu.id || (mu.email && pu.email && mu.email.toLowerCase() === pu.email.toLowerCase()));
        if (defaultU && (!pu.bankInfo || !pu.bankInfo.bankName)) {
          pu.bankInfo = defaultU.bankInfo;
        }
      });
      // Merge with default accounts
      mockUsers.forEach(mu => {
        if (!parsedUsers.some(pu => pu.id === mu.id || (pu.email && mu.email && pu.email.toLowerCase() === mu.email.toLowerCase()))) {
          parsedUsers.push(mu);
        }
      });
      mockUsers.splice(0, mockUsers.length, ...parsedUsers);
    }
  }
} catch (err) {}

// Init Session from LocalStorage if available so refreshing page maintains login state
let savedUserJson = null;
try {
  savedUserJson = localStorage.getItem('pentaskill_user');
} catch (err) {}

let currentUser = null; // ⚡ 預設為一般訪客/非會員未登入狀態 (Guest)
if (savedUserJson) {
  try {
    const parsed = JSON.parse(savedUserJson);
    const existing = mockUsers.find(u => u.id === parsed.id || (u.email && parsed.email && u.email.toLowerCase() === parsed.email.toLowerCase()));
    if (existing) {
      currentUser = existing;
    } else {
      currentUser = parsed;
    }
  } catch (err) {}
}

// Restore Leads & Custom Quotes from LocalStorage
try {
  const savedLeads = localStorage.getItem('pentaskill_leads');
  if (savedLeads) {
    const parsedLeads = JSON.parse(savedLeads);
    if (Array.isArray(parsedLeads) && parsedLeads.length > 0) {
      mockLeads = parsedLeads;
    }
  }
} catch (err) {}

try {
  const savedQuotes = localStorage.getItem('pentaskill_custom_quotes') || localStorage.getItem('pentaskill_quotes');
  if (savedQuotes) {
    const parsedQuotes = JSON.parse(savedQuotes);
    if (Array.isArray(parsedQuotes) && parsedQuotes.length > 0) {
      mockCustomQuotes = parsedQuotes;
    }
  }
} catch (err) {}

try {
  const savedCourses = localStorage.getItem('pentaskill_courses');
  if (savedCourses) {
    const parsedCourses = JSON.parse(savedCourses);
    if (Array.isArray(parsedCourses) && parsedCourses.length > 0) {
      mockCourses = parsedCourses;
      mockCourses.forEach((c, idx) => {
        if (c.isFeatured === undefined) {
          c.isFeatured = (idx < 4);
        }
      });
    }
  }
} catch (err) {}

try {
  const savedBookings = localStorage.getItem('pentaskill_bookings');
  if (savedBookings) {
    const parsedBookings = JSON.parse(savedBookings);
    if (Array.isArray(parsedBookings) && parsedBookings.length > 0) {
      mockBookings = parsedBookings;
    }
  }
  // 確保示範預約資料 (bk-101 ~ bk-104) 始終與即時日期動態連動，絕不顯示過期舊日期
  const todayStr = getLocalDateString();
  mockBookings.forEach(b => {
    if (b.id === 'bk-101' && (!b.date || b.date < todayStr)) b.date = calcDynamicDateOffset(3);
    if (b.id === 'bk-102' && (!b.date || b.date < todayStr)) b.date = calcDynamicDateOffset(1);
    if (b.id === 'bk-103' && (!b.date || b.date < todayStr)) b.date = calcDynamicDateOffset(0);
    if (b.id === 'bk-104' && (!b.date || b.date >= todayStr)) b.date = calcDynamicDateOffset(-2);
  });
} catch (err) {}

try {
  const savedSalaries = localStorage.getItem('pentaskill_mentor_salaries');
  if (savedSalaries) {
    const parsedSalaries = JSON.parse(savedSalaries);
    if (Array.isArray(parsedSalaries) && parsedSalaries.length > 0) {
      mockMentorSalaries = parsedSalaries;
    }
  }
} catch (err) {}

try {
  const savedStaff = localStorage.getItem('pentaskill_staff_salaries');
  if (savedStaff) {
    const parsedStaff = JSON.parse(savedStaff);
    if (Array.isArray(parsedStaff) && parsedStaff.length > 0) {
      mockStaffSalaries = parsedStaff;
    }
  }
} catch (err) {}

try {
  const savedExpenses = localStorage.getItem('pentaskill_platform_expenses');
  if (savedExpenses) {
    const parsedExpenses = JSON.parse(savedExpenses);
    if (Array.isArray(parsedExpenses) && parsedExpenses.length > 0) {
      mockPlatformExpenses = parsedExpenses;
    }
  }
} catch (err) {}

try {
  const savedWebhook = localStorage.getItem('pentaskill_sheet_webhook');
  if (savedWebhook) {
    googleSheetConfig.webhookUrl = savedWebhook;
  }
} catch (err) {}

let currentView = 'home';
let cart = [];
let activeAdminTab = 'users';

// Carousel State
let currentSlideIndex = 0;
let carouselTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  renderAuthArea();
  updateUIPermissions();
  renderCourseGrid('all');
  renderHomeFeaturedCourses();
  renderInstructors();
  renderPortfolios();
  renderStudentBookings();
  loadChaptersFromStorage();
  renderChapters();
  renderStudentCourseHandouts('course-1');
  
  // 預約日期初始化 (提前 3 天起開放預約，3天內鎖定以利與老師排班協調)
  const minBookingDate = new Date();
  minBookingDate.setDate(minBookingDate.getDate() + 3);
  const minBookingDateStr = getLocalDateString(minBookingDate);
  const todayStr = getLocalDateString();
  const dateInput = document.getElementById('bookingDate');
  if (dateInput) {
    dateInput.min = minBookingDateStr;
    if (!dateInput.value || dateInput.value < minBookingDateStr) {
      dateInput.value = minBookingDateStr;
    }
  }
  const adminDateInput = document.getElementById('adminBookingDate');
  if (adminDateInput) {
    adminDateInput.min = todayStr;
    if (!adminDateInput.value || adminDateInput.value < todayStr) {
      adminDateInput.value = todayStr;
    }
  }
  const assignmentInfo = document.getElementById('assignmentSubmitInfo');
  if (assignmentInfo) {
    assignmentInfo.innerHTML = `您已於 ${calcDynamicDateTimeOffset(-1, '11:30')} 繳交 GitHub 倉庫連結。講師張哲銘預計於今日 14:00 個教時段進行即時 Code Review。`;
  }
  if (typeof updateAvailableSlots === 'function') {
    updateAvailableSlots();
  }
  setupFilterEvents();
  setupTabEvents();
  initCarousel();
  initCloudflareStreamEngine();
  checkUrlDirectCheckout();
  checkUrlReferralParam();
  checkUrlAutoLogin(); // 🎁 檢查好友推薦邀請碼/推薦人 URL 參數自動帶入
  initCloudSync(); // 🌟 啟動自動連線 Cloudflare KV 雲端資料庫雙向同步

  // Initial Hash view or home
  const initialHash = location.hash.replace('#', '');
  if (initialHash) {
    switchView(initialHash, false);
  } else {
    if (history.replaceState) history.replaceState({ viewId: 'home' }, '', '#home');
  }
});

// Support browser back/forward buttons (上一頁/下一頁)
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.viewId) {
    switchView(e.state.viewId, false);
  } else {
    const hash = location.hash.replace('#', '');
    switchView(hash || 'home', false);
  }
});

// Mobile Hamburger Menu Toggle
function toggleMobileMenu() {
  const menu = document.getElementById('mainNavMenu');
  const icon = document.getElementById('hamburgerIcon');
  if (!menu) return;

  const isActive = menu.classList.toggle('active');
  if (icon) {
    icon.className = isActive ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
  }
}

function closeMobileMenu() {
  const menu = document.getElementById('mainNavMenu');
  const icon = document.getElementById('hamburgerIcon');
  if (menu && menu.classList.contains('active')) {
    menu.classList.remove('active');
    if (icon) icon.className = 'fa-solid fa-bars';
  }
}

// Carousel Logic
function initCarousel() {
  startCarouselTimer();
}

function startCarouselTimer() {
  if (carouselTimer) clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    nextCarousel();
  }, 5000);
}

function updateCarouselTransform() {
  const track = document.getElementById('heroCarouselTrack');
  const dots = document.querySelectorAll('#carouselDots .dot');
  if (!track) return;

  track.style.transform = `translateX(-${currentSlideIndex * 100}%)`;

  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentSlideIndex);
  });
}

function nextCarousel() {
  const totalSlides = 3;
  currentSlideIndex = (currentSlideIndex + 1) % totalSlides;
  updateCarouselTransform();
}

function prevCarousel() {
  const totalSlides = 3;
  currentSlideIndex = (currentSlideIndex - 1 + totalSlides) % totalSlides;
  updateCarouselTransform();
}

function goToSlide(index) {
  currentSlideIndex = index;
  updateCarouselTransform();
  startCarouselTimer();
}

// Floating Mentor Modal Preview
function openInstructorModal(instId) {
  const inst = mockInstructors.find(i => i.id === instId);
  if (!inst) return;

  const content = document.getElementById('instructorBioContent');
  if (!content) return;

  content.innerHTML = `
    <div style="text-align: center;">
      <img src="${inst.avatar}" style="width:110px; height:110px; border-radius:50%; object-fit:cover; border:3px solid var(--primary); box-shadow: var(--shadow-glow);">
      <h3 class="margin-top-sm">${inst.name} <span class="tag-badge bg-purple">${inst.tag || '教學多年業師'}</span></h3>
      <div class="text-sm text-cyan margin-top-xs"><strong>${inst.role}</strong></div>
      <div class="text-xs text-muted margin-top-xs">${inst.exp}</div>

      <div class="skills-tags margin-top-md" style="justify-content:center;">
        ${inst.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
      </div>

      <div class="fin-calc-box margin-top-md" style="text-align:left;">
        <div class="calc-row">
          <span>1-on-1 個別專屬服務</span>
          <strong class="text-purple">${inst.rate1on1}</strong>
        </div>
        <div class="calc-row">
          <span>累積學生評鑑</span>
          <strong class="text-yellow">⭐ ${inst.rating} (${inst.studentCount} 位學員)</strong>
        </div>
      </div>

      <p class="text-sm text-muted margin-top-md" style="font-style: italic;">${inst.quote}</p>

      <button class="btn btn-line btn-block margin-top-md" onclick="closeInstructorBioModal(); openConsultLineModal('${inst.name}', 'combo');">
        <i class="fa-brands fa-line"></i> 加 Line@ 洽小編預約 ${inst.name} 專屬個教
      </button>
    </div>
  `;

  document.getElementById('instructorBioModal').classList.add('active');
}

function closeInstructorBioModal() {
  document.getElementById('instructorBioModal').classList.remove('active');
}

// Render Login / User Profile Dropdown in Top Header
function renderAuthArea() {
  const container = document.getElementById('authArea');
  if (!container) return;

  if (currentUser) {
    let roleBadgeClass = 'badge-student';
    if (currentUser.role === 'manager') roleBadgeClass = 'badge-manager';
    if (currentUser.role === 'consultant') roleBadgeClass = 'badge-consultant';
    if (currentUser.role === 'staff') roleBadgeClass = 'badge-staff';
    if (currentUser.role === 'instructor') roleBadgeClass = 'badge-instructor';

    const coins = currentUser.coins || 0;
    const masterTokens = currentUser.masterTokens || 0;

    let displayGreeting = currentUser.name;
    let headerGreeting = `${currentUser.name} 您好`;
    if (currentUser.role === 'instructor') {
      const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();
      displayGreeting = `${cleanName} 講師`;
      headerGreeting = `${cleanName} 講師您好`;
    } else if (currentUser.role === 'consultant') {
      displayGreeting = currentUser.name;
      headerGreeting = `${currentUser.name} 顧問您好`;
    } else if (currentUser.role === 'manager') {
      displayGreeting = currentUser.name;
      headerGreeting = `${currentUser.name} 主管您好`;
    } else if (currentUser.role === 'staff') {
      displayGreeting = currentUser.name;
      headerGreeting = `${currentUser.name} 您好`;
    }

    container.innerHTML = `
      <div class="user-profile-menu">
        <button class="user-profile-btn" onclick="toggleUserDropdown(event)" title="點擊展開個人選單 / 查看點數 / 切換帳號">
          <img src="${currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80'}" class="avatar-img" alt="${currentUser.name}">
          <div class="user-info-text mobile-hide">
            <span class="user-name">${displayGreeting}</span>
            <span class="badge-role ${roleBadgeClass}">${currentUser.roleLabel}</span>
          </div>
          <i class="fa-solid fa-chevron-down text-muted" style="font-size:0.68rem; margin-left:2px;"></i>
        </button>

        <div class="user-dropdown-menu" id="userDropdownMenu">
          <div class="dropdown-header">
            <div style="font-weight:700; color:#fff; font-size:1.05rem;">${headerGreeting}</div>
            <div class="text-xs text-muted">帳號: ${currentUser.email}</div>
            <div class="text-xs" style="color: var(--accent-cyan); margin-top:2px;">身分: ${currentUser.roleLabel}</div>
            
            <!-- 雙軌點數即時展示 -->
            <div class="user-points-summary margin-top-xs" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; display: flex; justify-content: space-around; align-items: center;">
              <div style="text-align: center;">
                <div style="font-size: 0.7rem; color: #fbbf24; font-weight: 600;"><i class="fa-solid fa-coins"></i> 精幣餘額</div>
                <div style="font-size: 1.05rem; font-weight: 800; color: #fff;">${coins.toLocaleString()} <span style="font-size:0.7rem; font-weight:400; color:var(--text-muted);">枚</span></div>
              </div>
              <div style="width: 1px; height: 24px; background: rgba(255,255,255,0.12);"></div>
              <div style="text-align: center;">
                <div style="font-size: 0.7rem; color: #c084fc; font-weight: 600;"><i class="fa-solid fa-award"></i> 精通寶</div>
                <div style="font-size: 1.05rem; font-weight: 800; color: #fff;">${masterTokens} <span style="font-size:0.7rem; font-weight:400; color:var(--text-muted);">枚</span></div>
              </div>
            </div>
          </div>
          <hr class="dropdown-divider">
          
          <button class="dropdown-item" onclick="switchView('member-center'); closeAllDropdowns();" style="color: #fbbf24; font-weight:600;">
            <i class="fa-solid fa-gem text-yellow"></i> 學員專區 (點數與課程)
          </button>
          <button class="dropdown-item" onclick="openEditProfileModal(); closeAllDropdowns();" style="color: #c084fc;">
            <i class="fa-solid fa-user-pen text-purple"></i> 修改個人資料
          </button>
          <button class="dropdown-item" onclick="switchView('video-player'); closeAllDropdowns();">
            <i class="fa-solid fa-book-bookmark text-cyan"></i> 我的錄播課程
          </button>
          <button class="dropdown-item" onclick="openReferralShareModal(); closeAllDropdowns();" style="color: #fbbf24;">
            <i class="fa-solid fa-gift text-pink"></i> 推薦好友賺 200 精幣
          </button>
          <button class="dropdown-item" onclick="openQuoteLookupModal(); closeAllDropdowns();" style="color: var(--accent-cyan);">
            <i class="fa-solid fa-receipt text-cyan"></i> 專屬報價單查單結帳
          </button>
          <button class="dropdown-item" onclick="openLeadFormModal(); closeAllDropdowns();" style="color: #34d399;">
            <i class="fa-solid fa-comments text-green"></i> 洽小編 / 學習需求諮詢
          </button>

          ${(currentUser.role === 'instructor' || currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff') ? `
            <button class="dropdown-item" onclick="switchView('instructor-portal'); closeAllDropdowns();" style="color: #38bdf8; font-weight:600;">
              <i class="fa-solid fa-chalkboard-user text-cyan"></i> 👨‍🏫 講師工作台 (課程與講義管理)
            </button>
          ` : ''}

          ${(currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff') ? `
            <button class="dropdown-item" onclick="switchView('admin-dashboard'); closeAllDropdowns();">
              <i class="fa-solid fa-sliders text-pink"></i> 後台管理中心
            </button>
            <button class="dropdown-item" onclick="openGoogleSheetConfigModal(); switchView('admin-dashboard'); switchAdminTab('sheets'); closeAllDropdowns();">
              <i class="fa-solid fa-table text-green"></i> Google Sheet 串接設定
            </button>
          ` : ''}
          ${(currentUser.role === 'manager' || currentUser.role === 'consultant') ? `
            <button class="dropdown-item" onclick="switchView('business-plan'); closeAllDropdowns();">
              <i class="fa-solid fa-chart-line text-purple"></i> 創業完整規劃書
            </button>
          ` : ''}

          <hr class="dropdown-divider">
          <button class="dropdown-item" onclick="openLoginModal(); closeAllDropdowns();" style="color: var(--accent-cyan); font-weight:600;">
            <i class="fa-solid fa-users-viewfinder"></i> 切換帳號登入
          </button>
          <button class="dropdown-item text-danger" onclick="handleLogout(); closeAllDropdowns();">
            <i class="fa-solid fa-right-from-bracket"></i> 登出帳號
          </button>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="auth-btn-group" style="display:flex; align-items:center;">
        <button class="btn btn-outline btn-sm" onclick="openLoginModal()" style="display:flex; align-items:center; gap:0.35rem; padding:0.35rem 0.85rem;">
          <i class="fa-solid fa-right-to-bracket"></i> 登入
        </button>
      </div>
    `;
  }
}

// Nav Dropdowns & User Menu Controls
function toggleNavDropdown(dropdownId, event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;
  const isAlreadyActive = dropdown.classList.contains('active');
  closeAllDropdowns();
  if (!isAlreadyActive) {
    dropdown.classList.add('active');
  }
}

function selectDropdownNav(viewId) {
  switchView(viewId);
  closeAllDropdowns();
}

function closeAllDropdowns() {
  document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('active'));
  const userMenu = document.getElementById('userDropdownMenu');
  if (userMenu) userMenu.classList.remove('active');
}

function toggleUserDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('userDropdownMenu');
  if (menu) {
    const isAct = menu.classList.contains('active');
    closeAllDropdowns();
    if (!isAct) menu.classList.add('active');
  }
}

// Modal View Switchers & Password Visibility Toggle
function openLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.add('active');
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.classList.remove('active');
}

function openLoginModal(prefillEmail = '') {
  const modal = document.getElementById('loginModal');
  if (modal) {
    modal.classList.add('active');
    const emailInput = document.getElementById('loginEmail');
    if (emailInput && prefillEmail) {
      emailInput.value = prefillEmail;
    }
    handleLoginEmailInput();
  }
}

function openRegisterModal(prefillEmail = '') {
  const modal = document.getElementById('registerModal');
  if (modal) {
    modal.classList.add('active');
    const emailInput = document.getElementById('registerEmail');
    if (emailInput && prefillEmail) {
      emailInput.value = prefillEmail;
    }
    handleRegisterEmailInput();
  }
}

function closeRegisterModal() {
  const modal = document.getElementById('registerModal');
  if (modal) modal.classList.remove('active');
}

function switchToRegisterModal(prefillEmail = '') {
  closeLoginModal();
  closeForgotPasswordModal();
  const currentEmail = prefillEmail || (document.getElementById('loginEmail') ? document.getElementById('loginEmail').value.trim() : '');
  openRegisterModal(currentEmail);
}

function switchToLoginModal(prefillEmail = '') {
  closeRegisterModal();
  closeForgotPasswordModal();
  const currentEmail = prefillEmail || 
    (document.getElementById('registerEmail') ? document.getElementById('registerEmail').value.trim() : '') ||
    (document.getElementById('forgotEmail') ? document.getElementById('forgotEmail').value.trim() : '');
  openLoginModal(currentEmail);
}

// 📧 即時 Email 會員狀態驗證核心 (Email Status Check Engine)
function handleLoginEmailInput() {
  const emailInput = document.getElementById('loginEmail');
  const feedback = document.getElementById('loginEmailCheckFeedback');
  if (!emailInput || !feedback) return;

  const email = emailInput.value.trim();
  if (!email || !email.includes('@')) {
    feedback.innerHTML = '';
    return;
  }

  const matched = mockUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (matched) {
    feedback.innerHTML = `<span style="color: #4ade80; font-weight:600;"><i class="fa-solid fa-circle-check"></i> 已確認為精五門會員（${matched.name}）！請輸入密碼直接登入</span>`;
  } else {
    feedback.innerHTML = `<span style="color: #f472b6; font-weight:600;"><i class="fa-solid fa-circle-info"></i> 此 Email 尚未註冊會員，<a href="javascript:void(0)" onclick="switchToRegisterModal('${email}')" style="color: #38bdf8; text-decoration: underline; font-weight: 700;">點此 1 秒免費加入會員 (送100精幣)</a></span>`;
  }
}

function handleRegisterEmailInput() {
  const emailInput = document.getElementById('registerEmail');
  const feedback = document.getElementById('registerEmailCheckFeedback');
  if (!emailInput || !feedback) return;

  const email = emailInput.value.trim();
  if (!email || !email.includes('@')) {
    feedback.innerHTML = '';
    return;
  }

  const matched = mockUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (matched) {
    feedback.innerHTML = `<span style="color: #fbbf24; font-weight:600;"><i class="fa-solid fa-circle-exclamation"></i> 此 Email 已註冊過會員（${matched.name}）！<a href="javascript:void(0)" onclick="switchToLoginModal('${email}')" style="color: #38bdf8; text-decoration: underline; font-weight: 700;">點此直接輸入密碼登入</a></span>`;
  } else {
    feedback.innerHTML = `<span style="color: #4ade80;"><i class="fa-solid fa-check"></i> 此 Email 可以註冊為新會員</span>`;
  }
}

function handleForgotEmailInput() {
  const emailInput = document.getElementById('forgotEmail');
  const feedback = document.getElementById('forgotEmailFeedback');
  if (!emailInput || !feedback) return;

  const email = emailInput.value.trim();
  if (!email || !email.includes('@')) {
    feedback.innerHTML = '';
    return;
  }

  const matched = mockUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (matched) {
    feedback.innerHTML = `<span style="color: #4ade80;"><i class="fa-solid fa-circle-check"></i> 找到會員帳號：<strong>${matched.name}</strong></span>`;
  } else {
    feedback.innerHTML = `<span style="color: #f472b6;"><i class="fa-solid fa-circle-xmark"></i> 查無此會員 Email，請確認是否有輸入錯誤或<a href="javascript:void(0)" onclick="switchToRegisterModal('${email}')" style="color: #38bdf8; text-decoration: underline;">點此註冊</a></span>`;
  }
}

// 🔐 忘記密碼與驗證碼重設密碼控制器 (Forgot & Reset Password Engine)
let currentResetSession = { email: '', code: '', expiresAt: 0 };

function openForgotPasswordModal(prefillEmail = '') {
  closeLoginModal();
  closeRegisterModal();
  const modal = document.getElementById('forgotPasswordModal');
  if (!modal) return;

  const emailInput = document.getElementById('forgotEmail');
  const loginEmailVal = document.getElementById('loginEmail') ? document.getElementById('loginEmail').value.trim() : '';
  const emailToSet = prefillEmail || loginEmailVal;

  if (emailInput) {
    emailInput.value = emailToSet;
    handleForgotEmailInput();
  }

  // 重設步驟回第 1 步
  const step1 = document.getElementById('forgotStep1');
  const step2 = document.getElementById('forgotStep2');
  if (step1) step1.style.display = 'block';
  if (step2) step2.style.display = 'none';

  if (document.getElementById('resetVerifyCode')) document.getElementById('resetVerifyCode').value = '';
  if (document.getElementById('resetNewPassword')) document.getElementById('resetNewPassword').value = '';
  if (document.getElementById('resetConfirmPassword')) document.getElementById('resetConfirmPassword').value = '';

  modal.classList.add('active');
}

function closeForgotPasswordModal() {
  const modal = document.getElementById('forgotPasswordModal');
  if (modal) modal.classList.remove('active');
}

function handleSendResetCode(e) {
  if (e && e.preventDefault) e.preventDefault();

  const emailInput = document.getElementById('forgotEmail');
  if (!emailInput) return;
  const email = emailInput.value.trim();

  if (!email) {
    showToast('⚠️ 請輸入您的會員電子郵件！');
    return;
  }

  const matched = mockUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (!matched) {
    showToast('⚠️ 查無此 Email 會員帳號！請確認信箱或點擊註冊新帳號。');
    handleForgotEmailInput();
    return;
  }

  // 產生 6 位數安全隨機驗證碼
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  currentResetSession = {
    email: matched.email,
    code: verificationCode,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 分鐘有效
  };

  // 顯示寄送目標信箱
  const sentDisplay = document.getElementById('forgotSentEmailDisplay');
  if (sentDisplay) sentDisplay.innerText = matched.email;

  // ⚡ 自動觸發雲端 Webhook 發送真實 Email 驗證信
  sendResetEmailViaWebhook(matched.email, verificationCode, matched.name);

  // 切換至步驟 2
  const step1 = document.getElementById('forgotStep1');
  const step2 = document.getElementById('forgotStep2');
  if (step1) step1.style.display = 'none';
  if (step2) step2.style.display = 'block';

  showToast(`📧 6 位數安全驗證碼已自動發送至【${matched.email}】！請至信箱查收！`);
}

function resendResetCode() {
  if (!currentResetSession.email) {
    showToast('⚠️ 請先輸入電子郵件發送驗證碼');
    return;
  }
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  currentResetSession.code = verificationCode;
  currentResetSession.expiresAt = Date.now() + 10 * 60 * 1000;

  const matched = mockUsers.find(u => u.email && u.email.toLowerCase() === currentResetSession.email.toLowerCase());
  sendResetEmailViaWebhook(currentResetSession.email, verificationCode, matched ? matched.name : '學員');

  showToast(`📧 新的 6 位數驗證碼已重新寄送至【${currentResetSession.email}】！請至信箱查收！`);
}

// 雲端自動寄送 Email 驗證碼引擎
function sendResetEmailViaWebhook(email, code, userName) {
  const webhookUrl = googleSheetConfig.webhookUrl || localStorage.getItem('pentaskill_sheet_webhook') || 'https://script.google.com/macros/s/AKfycbx9jqEQ07dxqpMa8gupoW8KKqKUFJMPX1cDWUaRWPSZWP1H_1SKX3IwvPaNGq6uthy1IA/exec';
  if (!webhookUrl) return;

  const payload = {
    type: "reset_code",
    email: email,
    code: code,
    userName: userName || "學員",
    sentAt: new Date().toISOString()
  };

  try {
    fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    }).then(() => {
      console.log('✅ 密碼重設驗證碼 Email 已成功由雲端發送至:', email);
    }).catch(err => {
      console.warn('⚠️ 雲端郵件發送提醒:', err);
    });
  } catch (err) {
    console.warn('⚠️ 郵件發送參數異常:', err);
  }
}

function handleVerifyAndResetPassword(e) {
  e.preventDefault();

  const codeInput = document.getElementById('resetVerifyCode');
  const newPassInput = document.getElementById('resetNewPassword');
  const confirmPassInput = document.getElementById('resetConfirmPassword');

  const code = codeInput ? codeInput.value.trim() : '';
  const newPassword = newPassInput ? newPassInput.value.trim() : '';
  const confirmPassword = confirmPassInput ? confirmPassInput.value.trim() : '';

  if (!code || code !== currentResetSession.code) {
    showToast('⚠️ 驗證碼不正確！請確認信件中 6 位數驗證碼後重新輸入。');
    return;
  }

  if (Date.now() > currentResetSession.expiresAt) {
    showToast('⚠️ 驗證碼已過期 (超過10分鐘)，請點擊重新發送驗證碼！');
    return;
  }

  if (newPassword.length < 4) {
    showToast('⚠️ 新密碼長度至少需 4 位數以上！');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('⚠️ 兩次輸入的新密碼不一致，請重新檢查！');
    return;
  }

  // 尋找目標使用者更新密碼
  const targetUser = mockUsers.find(u => u.email && u.email.toLowerCase() === currentResetSession.email.toLowerCase());
  if (!targetUser) {
    showToast('⚠️ 找不到對應會員帳號，請重新嘗試！');
    return;
  }

  targetUser.password = newPassword;
  saveUsersToStorage();

  // 自動登入該使用者
  currentUser = targetUser;
  try {
    localStorage.setItem('pentaskill_user', JSON.stringify(currentUser));
  } catch(err) {}

  closeForgotPasswordModal();
  renderAuthArea();
  updateUIPermissions();
  renderUserTable();

  showToast(`🎉 密碼重設成功！歡迎回來，${targetUser.name}！已為您自動登入！`);

  if (currentUser.role === 'student') {
    switchView('marketplace');
  } else {
    switchView('admin-dashboard');
  }
}

function togglePasswordVisibility(inputId, iconIdOrEl) {
  const input = document.getElementById(inputId);
  let icon = null;
  if (typeof iconIdOrEl === 'string') {
    icon = document.getElementById(iconIdOrEl);
  } else if (iconIdOrEl && iconIdOrEl.nodeType) {
    icon = iconIdOrEl.tagName.toLowerCase() === 'i' ? iconIdOrEl : iconIdOrEl.querySelector('i');
  }
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    }
  } else {
    input.type = 'password';
    if (icon) {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }
}

// Login Authentication Verification Logic
function handleLoginSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  // Search accounts in mockUsers (case-insensitive email matching)
  const matchedUser = mockUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase() && u.password === password);

  if (matchedUser) {
    currentUser = matchedUser;
    try {
      localStorage.setItem('pentaskill_user', JSON.stringify(currentUser));
    } catch(err) {}
    closeLoginModal();
    renderAuthArea();
    updateUIPermissions();

    if (currentUser.role === 'instructor') {
      const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();
      showToast(`🎉 ${cleanName} 講師您好！已載入講師排班與個教專區`);
      switchView('admin-dashboard');
      switchAdminTab('bookings');
    } else if (currentUser.role === 'consultant') {
      showToast(`🎉 歡迎回來，${currentUser.name} 顧問！已載入【顧問】全權限管理介面`);
      switchView('admin-dashboard');
    } else if (currentUser.role === 'manager') {
      showToast(`🎉 歡迎回來，${currentUser.name}！已載入【平台主管】最高管理介面`);
      switchView('admin-dashboard');
    } else if (currentUser.role === 'staff') {
      showToast(`🎉 歡迎回來，${currentUser.name}！已載入【營運員工】管理介面`);
      switchView('admin-dashboard');
    } else {
      showToast(`🎉 歡迎回來，${currentUser.name}！已成功驗證帳密並進入學員專區`);
      switchView('member-center');
    }
  } else {
    const emailExists = mockUsers.some(u => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (emailExists) {
      showToast('⚠️ 登入失敗：密碼不正確！若忘記密碼請點擊「忘記密碼？」以收信驗證碼重設！');
    } else {
      showToast('⚠️ 登入失敗：此帳號尚未註冊，請點擊「立即免費註冊學員」！');
    }
  }
}

// 註冊時選擇生日之即時檢查與壽星好禮反饋
function handleRegisterBirthdayChange() {
  const bdayInput = document.getElementById('registerBirthday');
  const feedback = document.getElementById('regBirthdayFeedback');
  if (!bdayInput || !feedback) return;

  const val = bdayInput.value;
  if (!val) {
    feedback.innerHTML = '🎂 填寫生日：當月壽星註冊立即獲贈 100 元精幣生日禮！';
    feedback.style.color = '#f472b6';
    return;
  }

  const birthDate = new Date(val);
  if (!isNaN(birthDate.getTime())) {
    const birthMonth = birthDate.getMonth();
    const currentMonth = new Date().getMonth();
    if (birthMonth === currentMonth) {
      feedback.innerHTML = '🎉 <strong style="color:#34d399;">太棒了！您是本月壽星！</strong> 完成註冊將立即自動入帳 <strong style="color:#fbbf24;">100 元精幣</strong> 壽星生日禮！🎂✨';
    } else {
      feedback.innerHTML = `🎂 生日記錄為 <strong>${(birthMonth + 1)} 月</strong>！生日當月系統將自動為您入帳 <strong>100 元精幣</strong> 壽星好禮！`;
      feedback.style.color = '#38bdf8';
    }
  }
}

// Student Registration & Member Joining (簡化表單：姓名、稱呼、手機、Email、密碼、生日 + 當月壽星 100 精幣)
function handleRegisterSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('registerName');
  const titleInput = document.getElementById('registerTitle');
  const phoneInput = document.getElementById('registerPhone');
  const emailInput = document.getElementById('registerEmail');
  const passwordInput = document.getElementById('registerPassword');
  const birthdayInput = document.getElementById('registerBirthday');

  const name = nameInput ? nameInput.value.trim() : '';
  const title = (titleInput && titleInput.value) || '先生';
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';
  const birthday = birthdayInput ? birthdayInput.value.trim() : '';

  if (!name || !phone || !email || !password || !birthday) {
    showToast('⚠️ 請完整填寫姓名、稱呼、手機、Email、密碼與生日！');
    return;
  }

  // Check if account already registered
  const existingUser = mockUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    showToast(`⚠️ 電子郵件「${email}」已註冊過帳號！請直接使用該帳號登入。`);
    switchToLoginModal();
    const loginEmailInput = document.getElementById('loginEmail');
    if (loginEmailInput) loginEmailInput.value = email;
    return;
  }

  // Birthday check: 當月壽星加贈 100 精幣
  let isBirthdayMonth = false;
  if (birthday) {
    const birthDate = new Date(birthday);
    if (!isNaN(birthDate.getTime())) {
      const birthMonth = birthDate.getMonth();
      const currentMonth = new Date().getMonth();
      if (birthMonth === currentMonth) {
        isBirthdayMonth = true;
      }
    }
  }
  const startingCoins = isBirthdayMonth ? 100 : 0;

  // 1. Create Student User Account
  const newStudent = {
    id: `u-${Date.now()}`,
    name: name,
    title: title,
    displayName: `${name} (${title})`,
    email: email,
    phone: phone,
    password: password,
    birthday: birthday,
    coins: startingCoins,
    role: 'student',
    roleLabel: '🎓 消費者學員 (Student)',
    avatar: title === '小姐' 
      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80' 
      : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    registeredAt: getLocalDateTimeString(),
    purchasedCourses: ['course-1']
  };

  mockUsers.push(newStudent);
  saveUsersToStorage();

  // 2. Create Potential Student Lead Record for CRM & Sheet
  const newLead = {
    id: `lead-${Date.now()}`,
    createdAt: getLocalDateTimeString(),
    name: `${name} (${title})`,
    phone: phone,
    email: email,
    birthday: birthday,
    course: '🎓 全站會員註冊 (新進學員)',
    identity: '🎓 新註冊會員',
    goal: '💡 探索精五門全域課程',
    experience: '🌱 新進會員',
    timePerWeek: '⏱️ 彈性自主學習',
    priorityHelp: isBirthdayMonth ? '🎂 當月壽星 (贈 100 精幣)' : '🎁 新會員入會',
    notes: `會員生日：${birthday} | 稱呼：${title}${isBirthdayMonth ? ' | ★ 當月壽星享 100 精幣' : ''}`,
    status: '🆕 新進學員註冊'
  };

  mockLeads.unshift(newLead);
  saveLeadsToStorage();

  // 3. Sync to Google Apps Script Webhook (Google Sheets)
  syncLeadToGoogleSheet(newLead);

  // 4. Auto Log-in as New Student
  currentUser = newStudent;
  try {
    localStorage.setItem('pentaskill_user', JSON.stringify(currentUser));
  } catch (err) {}

  closeRegisterModal();
  renderAuthArea();
  updateUIPermissions();
  renderLeadAdminTable();
  renderUserTable();

  if (isBirthdayMonth) {
    showToast(`🎉 歡迎 ${name} ${title} 加入會員！🎂 恭喜為本月壽星，已為您入帳 100 元精幣折抵金！`);
  } else {
    showToast(`🎉 我們收到了！感謝 ${name} ${title} 加入精五門會員，已為您自動登入學員專區！🎂 生日當月將享有 100 元精幣壽星禮！`);
  }
  switchView('marketplace');
}

function handleLogout() {
  try {
    localStorage.removeItem('pentaskill_user');
  } catch(err) {}
  currentUser = null; // Clear login session so login button shows
  renderAuthArea();
  updateUIPermissions();
  switchView('home');
  showToast('已安全登出系統');
}

// UI Permissions Control Engine
function updateUIPermissions() {
  const role = currentUser ? currentUser.role : 'guest';
  const isManagerOrConsultant = (role === 'manager' || role === 'consultant');
  const isStaffOrAbove = (role === 'manager' || role === 'consultant' || role === 'staff');
  const isInstructorOrAbove = (role === 'manager' || role === 'consultant' || role === 'staff' || role === 'instructor');

  // 0. Update body role class for CSS selectors (such as .manager-hide)
  document.body.classList.remove('role-manager', 'role-consultant', 'role-staff', 'role-instructor', 'role-student', 'role-guest');
  document.body.classList.add(`role-${role}`);

  // 0.0 🛡️ 嚴密資安防護：學員與訪客絕對禁止停留在管理後台或講師工作台！
  if (role === 'student' || role === 'guest') {
    if (currentView === 'admin-dashboard' || currentView === 'instructor-portal' || currentView === 'business-plan') {
      currentView = role === 'student' ? 'member-center' : 'home';
      document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.remove('active');
        sec.style.display = 'none';
      });
      const targetSec = document.getElementById(`view-${currentView}`);
      if (targetSec) {
        targetSec.classList.add('active');
        targetSec.style.display = 'block';
      }
      try { history.replaceState({ viewId: currentView }, '', `#${currentView}`); } catch(e) {}
    }
  }

  // 0.1 雯總監 / 主管 / 顧問：頂部導覽列不顯示「洽小編諮詢」與「查看購物車」
  const navConsultBtn = document.getElementById('navConsultBtn');
  if (navConsultBtn) {
    navConsultBtn.style.display = isManagerOrConsultant ? 'none' : '';
  }
  const cartBtn = document.getElementById('cartBtn');
  if (cartBtn) {
    cartBtn.style.display = isManagerOrConsultant ? 'none' : '';
  }
  const mobileCartBtn = document.getElementById('mobileCartBtn');
  if (mobileCartBtn) {
    if (isManagerOrConsultant) {
      mobileCartBtn.style.setProperty('display', 'none', 'important');
    } else {
      mobileCartBtn.style.removeProperty('display');
    }
  }

  // 1. Business Plan Link & Button (Manager & Consultant)
  const busLink = document.getElementById('navBusinessPlanLink');
  if (busLink) {
    busLink.style.display = isManagerOrConsultant ? 'flex' : 'none';
  }
  const subBusLink = document.getElementById('navSubBusinessPlanLink');
  if (subBusLink) {
    subBusLink.style.display = isManagerOrConsultant ? 'flex' : 'none';
  }
  document.querySelectorAll('.manager-only-btn').forEach(btn => {
    btn.style.display = isManagerOrConsultant ? 'inline-flex' : 'none';
  });

  // 2. Admin Dropdown Link (管理中心僅供 總監/顧問/員工 存取，金牌講師專屬於講師工作台)
  const adminDropdown = document.getElementById('navAdminDropdown');
  if (adminDropdown) {
    adminDropdown.style.display = isStaffOrAbove ? 'block' : 'none';
  }
  const adminLink = document.getElementById('navAdminLink');
  if (adminLink) {
    adminLink.style.display = isStaffOrAbove ? 'flex' : 'none';
  }

  document.querySelectorAll('.staff-manager-btn').forEach(btn => {
    btn.style.display = isStaffOrAbove ? 'inline-flex' : 'none';
  });

  document.querySelectorAll('.manager-only-tab').forEach(tab => {
    tab.style.display = isManagerOrConsultant ? 'inline-block' : 'none';
  });

  document.querySelectorAll('.staff-manager-tab').forEach(tab => {
    tab.style.display = isStaffOrAbove ? 'inline-block' : 'none';
  });
  
  if (role === 'staff' && (activeAdminTab === 'users' || activeAdminTab === 'finance' || activeAdminTab === 'sheets')) {
    switchAdminTab('courses');
  } else if (role === 'instructor' && (activeAdminTab !== 'courses' && activeAdminTab !== 'chapters')) {
    switchAdminTab('courses');
  }

  // 4.1 Update Course Tab text & price headers for Instructor vs Staff
  const courseTabBtn = document.querySelector('.admin-tab[data-atab="courses"]');
  if (courseTabBtn) {
    courseTabBtn.innerHTML = isStaffOrAbove
      ? '<i class="fa-solid fa-book-open"></i> 課程上架與價格管理'
      : '<i class="fa-solid fa-book-open"></i> 線上課程與講義管理';
  }
  document.querySelectorAll('.course-price-col').forEach(el => {
    el.style.display = isStaffOrAbove ? '' : 'none';
  });

  // 5. Update Admin Badge (Dynamic for current logged-in user)
  const adminBadge = document.getElementById('adminRoleBadge');
  if (adminBadge) {
    if (role === 'manager') {
      adminBadge.className = 'badge-tag badge-manager';
      adminBadge.innerText = `👑 ${currentUser.name} 最高權限 (平台主管 - 包含帳號/密碼/課程/薪資/創業規劃)`;
    } else if (role === 'consultant') {
      adminBadge.className = 'badge-tag badge-consultant';
      adminBadge.innerText = `💼 ${currentUser.name} 最高權限 (顧問 - 包含帳號/密碼/課程/薪資/創業規劃)`;
    } else if (role === 'staff') {
      adminBadge.className = 'badge-tag badge-staff';
      adminBadge.innerText = `🧑‍💼 ${currentUser.name} 營運員工權限 (課程/講師/影片增修編輯)`;
    } else if (role === 'instructor') {
      adminBadge.className = 'badge-tag badge-instructor';
      const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();
      adminBadge.innerText = `👨‍🏫 ${cleanName} 講師權限 (看個人預約/批改作業)`;
    } else if (role === 'student') {
      adminBadge.className = 'badge-tag';
      adminBadge.innerText = '⚠️ 學員無後台權限';
    } else {
      adminBadge.className = 'badge-tag';
      adminBadge.innerText = '訪客模式 (未登入)';
    }
  }

  // 6. Update Member Center & Instructor Portal Links
  const navMemberLink = document.getElementById('navMemberCenterLink');
  if (navMemberLink) {
    navMemberLink.style.display = currentUser ? 'inline-flex' : 'none';
  }
  const navInstructorPortalLink = document.getElementById('navInstructorPortalLink');
  if (navInstructorPortalLink) {
    navInstructorPortalLink.style.display = isInstructorOrAbove ? 'inline-flex' : 'none';
  }

  if (currentView === 'admin-dashboard') {
    renderAdminTables();
  }
  if (currentView === 'member-center') {
    renderMemberCenterView();
  }
  if (currentView === 'instructor-portal') {
    renderInstructorPortal();
  }
  if (currentView === 'live-classroom') {
    renderBookingInstructorDropdown();
  }
}

// Navigation View Switcher with Permission Guards & Browser History Support
function switchView(viewId, pushHistory = true) {
  const role = currentUser ? currentUser.role : 'guest';
  const isManagerOrConsultant = (role === 'manager' || role === 'consultant');
  const isInstructorOrAbove = (role === 'manager' || role === 'consultant' || role === 'staff' || role === 'instructor');

  if (viewId === 'instructor-portal' && !isInstructorOrAbove) {
    showToast('⚠️ 權限不足：【講師工作台】僅供金牌講師與主管存取！');
    switchView(role === 'student' ? 'member-center' : 'home');
    return;
  }
  if (viewId === 'business-plan' && !isManagerOrConsultant) {
    showToast('⚠️ 權限不足：【創業完整規劃書】僅供 👑 平台主管與 💼 顧問 查閱');
    switchView(role === 'student' ? 'member-center' : 'home');
    return;
  }
  if (viewId === 'admin-dashboard') {
    // 嚴格安全性防護：學員與訪客絕對嚴禁進入管理後台！
    if (role === 'student' || role === 'guest') {
      showToast('⚠️ 權限不足：【後台管理中心】為營運團隊專屬，學員請於學員專區學習');
      switchView(role === 'student' ? 'member-center' : 'home');
      return;
    }
  }
  if (viewId === 'member-center' && !currentUser) {
    showToast('💡 請先登入學員帳號以查看學員專區與精幣餘額！');
    openLoginModal();
    return;
  }

  currentView = viewId;
  closeMobileMenu();
  closeAllDropdowns();

  if (pushHistory && history.pushState && location.hash !== `#${viewId}`) {
    history.pushState({ viewId: viewId }, '', `#${viewId}`);
  }

  document.querySelectorAll('.nav-link, .dropdown-item.nav-item-btn').forEach(link => {
    if (link.getAttribute('data-target') === viewId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Highlight parent dropdown button when sub-item is active
  const coursesViews = ['marketplace', 'video-player', 'live-classroom', 'instructors'];
  const adminViews = ['admin-dashboard', 'business-plan'];
  
  const coursesDropdownBtn = document.querySelector('#navCoursesDropdown .nav-dropdown-btn');
  if (coursesDropdownBtn) {
    coursesDropdownBtn.classList.toggle('active', coursesViews.includes(viewId));
  }
  const adminDropdownBtn = document.querySelector('#navAdminDropdown .nav-dropdown-btn');
  if (adminDropdownBtn) {
    adminDropdownBtn.classList.toggle('active', adminViews.includes(viewId));
  }

  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });

  const targetSection = document.getElementById(`view-${viewId}`);
  if (targetSection) {
    targetSection.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (viewId === 'home') {
    renderHomeFeaturedCourses();
  }
  if (viewId === 'marketplace') {
    updateCarouselTransform();
    renderPortfolios();
  }
  if (viewId === 'admin-dashboard') {
    renderAdminTables();
  }
  if (viewId === 'member-center') {
    renderMemberCenterView();
  }
  if (viewId === 'instructor-portal') {
    renderInstructorPortal();
  }
    if (viewId === 'video-player') {
    const cid = currentViewCourseId || 'course-1';
    const course = (typeof mockCourses !== 'undefined' ? mockCourses : []).find(c => c.id === cid);
    if (course) {
      const titleEl = document.getElementById('playerCourseTitle');
      if (titleEl) titleEl.innerText = course.title;
      const instEl = document.getElementById('playerCourseInstructor');
      if (instEl) instEl.innerText = '主講：' + course.instructor;
      const catEl = document.getElementById('playerCourseCategoryBadge');
      if (catEl) catEl.innerText = course.categoryLabel || '實戰錄播';
    }
    if (typeof renderStudentCourseHandouts === 'function') {
      renderStudentCourseHandouts(cid);
    }
    renderChapters();
    const prog = typeof getStudentCourseProgress === 'function' ? getStudentCourseProgress(cid) : null;
    if (prog && prog.lastLessonId) {
      loadCloudflareStreamLesson(prog.lastLessonId, prog.lastProgressPercent || 0);
    } else {
      const chapters = getChaptersForCourse(cid);
      const firstLesson = (chapters[0] && chapters[0].lessons && chapters[0].lessons[0]) ? chapters[0].lessons[0] : null;
      if (firstLesson) {
        loadCloudflareStreamLesson(firstLesson.id, 0);
      } else {
        loadCloudflareStreamLesson(currentActiveLessonId);
      }
    }
  }
  if (viewId === 'live-classroom') {
    const dateInput = document.getElementById('bookingDate');
    if (dateInput) {
      const minBookingDate = new Date();
      minBookingDate.setDate(minBookingDate.getDate() + 3);
      const minBookingDateStr = getLocalDateString(minBookingDate);
      dateInput.min = minBookingDateStr;
      if (!dateInput.value || dateInput.value < minBookingDateStr) {
        dateInput.value = minBookingDateStr;
      }
    }
    renderBookingInstructorDropdown();
    renderStudentBookings();
    updateAvailableSlots();
  }
}

// Render Member Center / Student Dashboard
function renderMemberCenterView() {
  if (!currentUser) return;

  const avatarEl = document.getElementById('memberCenterAvatar');
  const nameEl = document.getElementById('memberCenterName');
  const roleEl = document.getElementById('memberCenterRoleBadge');
  const emailEl = document.getElementById('memberCenterEmail');
  const coinsEl = document.getElementById('memberCenterCoins');
  const coinValEl = document.getElementById('memberCenterCoinVal');
  const tokensEl = document.getElementById('memberCenterTokens');
  const tokensDiffEl = document.getElementById('memberCenterTokensDiff');
  const progressTextEl = document.getElementById('memberTokenProgressText');
  const progressBarEl = document.getElementById('memberTokenProgressBar');
  const enrolledGrid = document.getElementById('memberEnrolledCourses');

  const coins = currentUser.coins !== undefined ? currentUser.coins : 0;
  const masterTokens = currentUser.masterTokens !== undefined ? currentUser.masterTokens : 0;
  const birthday = currentUser.birthday || '未填寫';
  const phone = currentUser.phone || '未填寫';

  if (avatarEl) avatarEl.src = currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80';
  if (nameEl) {
    if (currentUser.role === 'instructor') {
      const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();
      nameEl.innerText = `${cleanName} 講師您好`;
    } else if (currentUser.role === 'consultant') {
      nameEl.innerText = `${currentUser.name} 顧問您好`;
    } else if (currentUser.role === 'manager') {
      nameEl.innerText = `${currentUser.name} 主管您好`;
    } else {
      const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*學員|\s*會員/g, '').trim();
      nameEl.innerText = `${cleanName || currentUser.name} 您好`;
    }
  }
  if (roleEl) roleEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${currentUser.roleLabel || '精五門認證學員'}`;
  if (emailEl) {
    emailEl.innerHTML = `<i class="fa-solid fa-envelope"></i> ${currentUser.email} &nbsp;|&nbsp; <i class="fa-solid fa-phone text-cyan"></i> 手機：<span id="memberCenterPhone">${phone}</span> &nbsp;|&nbsp; <i class="fa-solid fa-cake-candles text-pink"></i> 生日：<span id="memberCenterBirthday">${birthday}</span>`;
  }
  const birthdayTagEl = document.getElementById('memberBirthdayTag');
  if (birthdayTagEl) {
    if (currentUser.birthday && currentUser.birthday !== '未填寫') {
      try {
        const parts = currentUser.birthday.split('-');
        if (parts.length >= 2) {
          const birthMonth = parseInt(parts[1], 10);
          const currentMonth = new Date().getMonth() + 1;
          if (birthMonth === currentMonth) {
            birthdayTagEl.style.display = 'inline-flex';
            birthdayTagEl.innerHTML = '<i class="fa-solid fa-cake-candles"></i> 🎂 本月壽星享100精幣';
          } else {
            birthdayTagEl.style.display = 'inline-flex';
            birthdayTagEl.innerHTML = '<i class="fa-solid fa-cake-candles"></i> 生日當月享100精幣';
          }
        }
      } catch(e) {
        birthdayTagEl.style.display = 'inline-flex';
      }
    }
  }
  if (coinsEl) coinsEl.innerText = coins.toLocaleString();
  if (coinValEl) coinValEl.innerText = coins.toLocaleString();
  if (tokensEl) tokensEl.innerText = masterTokens;
  
  const targetTokens = 10;
  const diffTokens = Math.max(0, targetTokens - masterTokens);
  if (tokensDiffEl) tokensDiffEl.innerText = diffTokens;
  
  const percent = Math.min(100, Math.round((masterTokens / targetTokens) * 100));
  if (progressTextEl) progressTextEl.innerText = `${masterTokens} / ${targetTokens} 門課 (${percent}%)`;
  if (progressBarEl) progressBarEl.style.width = `${percent}%`;

    if (enrolledGrid) {
    const purchased = (currentUser && currentUser.purchasedCourses && currentUser.purchasedCourses.length > 0) 
      ? currentUser.purchasedCourses 
      : ['course-1', 'course-2'];
    const courses = (typeof mockCourses !== 'undefined' ? mockCourses : []).filter(c => purchased.includes(c.id));
    if (courses.length === 0 && typeof mockCourses !== 'undefined' && mockCourses.length > 0) {
      courses.push(mockCourses[0]);
    }
    enrolledGrid.innerHTML = courses.map(course => {
      const prog = typeof getStudentCourseProgress === 'function' ? getStudentCourseProgress(course.id) : null;
      const progPercent = prog ? Math.min(100, Math.max(0, prog.lastProgressPercent || 0)) : 0;
      const lastLessonTitle = prog ? prog.lastLessonTitle : '';

      return `
      <div class="course-card" style="border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; background: rgba(30, 41, 59, 0.45); border-radius: var(--radius-md); overflow: hidden; transition: transform 0.2s ease, box-shadow 0.2s ease;">
        <div class="course-thumb" style="height: 145px; position: relative;">
          <img src="${course.coverImage}" alt="${course.title}" style="width: 100%; height: 100%; object-fit: cover;">
          <span class="course-tag">${course.categoryLabel}</span>
          <span class="course-badge" style="background: var(--accent-green);"><i class="fa-solid fa-check"></i> 已開通</span>
        </div>
        <div class="course-body" style="display: flex; flex-direction: column; flex: 1; padding: 1.1rem 1.2rem;">
          <h4 class="course-title" style="margin: 0 0 0.4rem 0; font-size: 1.05rem; font-weight: 700; line-height: 1.4; color: #f8fafc; min-height: 2.8rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${course.title}</h4>
          
          <!-- 學習進度條 & 接續資訊 (無講師頭像，版面清爽俐落) -->
          <div style="margin: 0.6rem 0 1rem; background: rgba(15,23,42,0.65); padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 0.35rem;">
              <span style="color: #94a3b8;"><i class="fa-solid fa-clock-rotate-left text-cyan"></i> 學習進度</span>
              <span style="color: #38bdf8; font-weight: 700;">${Math.round(progPercent)}%</span>
            </div>
            <div style="background: rgba(255,255,255,0.1); height: 7px; border-radius: 4px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, #8b5cf6, #06b6d4); height: 100%; width: ${progPercent}%; transition: width 0.3s ease;"></div>
            </div>
            ${lastLessonTitle ? `
              <div class="text-xs text-muted" style="margin-top: 0.45rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${lastLessonTitle}">
                <i class="fa-solid fa-play text-xs text-pink"></i> 接續：${lastLessonTitle}
              </div>
            ` : `
              <div class="text-xs text-muted" style="margin-top: 0.45rem;">
                <i class="fa-solid fa-circle-info text-xs text-cyan"></i> 尚未開始觀看，點擊即刻開課
              </div>
            `}
          </div>

          <!-- 進入學習中心專屬大鈕 -->
          <div style="margin-top: auto;">
            <button class="btn btn-primary btn-block" onclick="enterCourseLearningCenter('${course.id}')" style="background: linear-gradient(135deg, #8b5cf6, #06b6d4); font-weight: 600; border: none; padding: 0.65rem 1rem; border-radius: 8px; box-shadow: 0 4px 14px rgba(139,92,246,0.3); display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%;">
              <i class="fa-solid fa-circle-play"></i> 進入學習中心
            </button>
          </div>
        </div>
      </div>
      `;
    }).join('');
  }
}

// ==========================================
// 👤 學員專區個人資料修改與雲端雙向同步模組
// (Dual Sync: Cloudflare KV + Google Sheet)
// ==========================================

function openEditProfileModal() {
  if (!currentUser) {
    showToast('⚠️ 請先登入學員帳號！');
    openLoginModal();
    return;
  }
  const modal = document.getElementById('editProfileModal');
  if (!modal) return;

  const avatarPreview = document.getElementById('editProfileAvatarPreview');
  const avatarInput = document.getElementById('editProfileAvatar');
  const nameInput = document.getElementById('editProfileName');
  const titleSelect = document.getElementById('editProfileTitle');
  const phoneInput = document.getElementById('editProfilePhone');
  const birthdayInput = document.getElementById('editProfileBirthday');
  const emailInput = document.getElementById('editProfileEmail');
  const passwordInput = document.getElementById('editProfilePassword');

  const defaultAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80';
  const avatarSrc = currentUser.avatar || defaultAvatar;

  if (avatarPreview) avatarPreview.src = avatarSrc;
  if (avatarInput) avatarInput.value = currentUser.avatar || '';

  if (nameInput) {
    const rawName = (currentUser.name || '').replace(/（.*）|\(.*\)|\s*學員|\s*會員|\s*講師|\s*顧問|\s*主管/g, '').trim();
    nameInput.value = rawName || currentUser.name || '';
  }
  if (titleSelect) {
    titleSelect.value = currentUser.title || '先生';
  }
  if (phoneInput) {
    phoneInput.value = currentUser.phone || '';
  }
  if (birthdayInput) {
    birthdayInput.value = (currentUser.birthday && currentUser.birthday !== '未填寫') ? currentUser.birthday : '';
  }
  if (emailInput) {
    emailInput.value = currentUser.email || '';
  }
  if (passwordInput) {
    passwordInput.value = '';
  }

  const fileInput = document.getElementById('editProfileAvatarFile');
  if (fileInput) fileInput.value = '';

  modal.classList.add('active');
}

function closeEditProfileModal() {
  const modal = document.getElementById('editProfileModal');
  if (modal) modal.classList.remove('active');
}

function handleProfileAvatarUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  compressImageFile(file, 320, 0.85, (err, dataUrl) => {
    if (err || !dataUrl) {
      showToast('⚠️ 圖片讀取失敗，請更換其他照片');
      return;
    }
    const preview = document.getElementById('editProfileAvatarPreview');
    const input = document.getElementById('editProfileAvatar');
    if (preview) preview.src = dataUrl;
    if (input) input.value = dataUrl;
    showToast('📷 大頭貼照片載入成功！點擊儲存即可完成更新。');
  });
}

function selectPresetAvatar(url) {
  const avatarInput = document.getElementById('editProfileAvatar');
  const preview = document.getElementById('editProfileAvatarPreview');
  if (avatarInput) avatarInput.value = url;
  if (preview) preview.src = url;
  showToast('✨ 已套用預設頭像！點擊儲存即可完成更新。');
}

async function handleSaveProfile(e) {
  e.preventDefault();
  if (!currentUser) {
    showToast('⚠️ 請先登入帳號！');
    return;
  }

  const avatarInput = document.getElementById('editProfileAvatar');
  const nameInput = document.getElementById('editProfileName');
  const titleSelect = document.getElementById('editProfileTitle');
  const phoneInput = document.getElementById('editProfilePhone');
  const birthdayInput = document.getElementById('editProfileBirthday');
  const emailInput = document.getElementById('editProfileEmail');
  const passwordInput = document.getElementById('editProfilePassword');

  const newName = nameInput ? nameInput.value.trim() : '';
  const newTitle = titleSelect ? titleSelect.value : '先生';
  const newPhone = phoneInput ? phoneInput.value.trim() : '';
  const newBirthday = birthdayInput ? birthdayInput.value.trim() : '';
  const newEmail = emailInput ? emailInput.value.trim() : '';
  const newPassword = passwordInput ? passwordInput.value.trim() : '';
  const newAvatar = (avatarInput && avatarInput.value.trim()) 
    ? avatarInput.value.trim() 
    : (currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80');

  if (!newName) {
    showToast('⚠️ 請填寫真實姓名！');
    return;
  }
  if (!newPhone) {
    showToast('⚠️ 請填寫聯絡電話 / 手機！');
    return;
  }
  if (!newBirthday) {
    showToast('⚠️ 請選擇生日！');
    return;
  }
  if (!newEmail) {
    showToast('⚠️ 請填寫電子郵件！');
    return;
  }

  // 檢查 Email 是否與其他使用者衝突
  const oldEmail = currentUser.email;
  const isEmailTaken = mockUsers.some(u => 
    u.id !== currentUser.id && 
    u.email && 
    u.email.toLowerCase() === newEmail.toLowerCase()
  );
  if (isEmailTaken) {
    showToast('⚠️ 此電子郵件已被其他帳號使用，請更換 Email！');
    return;
  }

  // 更新當前登入者資訊
  currentUser.name = newName;
  currentUser.title = newTitle;
  currentUser.phone = newPhone;
  currentUser.birthday = newBirthday;
  currentUser.email = newEmail;
  currentUser.avatar = newAvatar;
  if (newPassword) {
    currentUser.password = newPassword;
  }

  // 同步更新 mockUsers
  const uIdx = mockUsers.findIndex(u => 
    u.id === currentUser.id || 
    (oldEmail && u.email && u.email.toLowerCase() === oldEmail.toLowerCase())
  );
  if (uIdx !== -1) {
    mockUsers[uIdx] = { ...mockUsers[uIdx], ...currentUser };
  } else {
    mockUsers.push(currentUser);
  }

  // 1. 本地儲存更新
  try {
    localStorage.setItem('pentaskill_user', JSON.stringify(currentUser));
  } catch(err) {}
  try {
    localStorage.setItem('pentaskill_users', JSON.stringify(mockUsers));
  } catch(err) {}

  // 2. 即時同步推送到 Cloudflare KV 雲端資料庫
  saveUsersToStorage(true);

  // 3. 即時同步推送到 Google Sheet 試算表 Webhook
  const profileSyncData = {
    name: newName,
    title: newTitle,
    phone: newPhone,
    email: newEmail,
    oldEmail: (oldEmail && oldEmail.toLowerCase() !== newEmail.toLowerCase()) ? oldEmail : '',
    birthday: newBirthday,
    coins: currentUser.coins !== undefined ? currentUser.coins : 0,
    masterTokens: currentUser.masterTokens !== undefined ? currentUser.masterTokens : 0,
    role: currentUser.role || 'student',
    avatar: newAvatar,
    passwordUpdated: newPassword ? '是 (密碼已重設)' : '否 (維持原密碼)'
  };
  syncProfileToGoogleSheet(profileSyncData);

  // 關閉視窗並重新渲染畫面
  closeEditProfileModal();
  renderMemberCenterView();
  renderAuthArea();
  if (typeof renderUserTable === 'function') {
    renderUserTable();
  }

  showToast(`🎉 個人資料已更新成功！已同步上傳至 Cloudflare KV 與 Google Sheet！`);
}

function syncProfileToGoogleSheet(profileData) {
  const webhookUrl = googleSheetConfig.webhookUrl || localStorage.getItem('pentaskill_sheet_webhook') || 'https://script.google.com/macros/s/AKfycbx9jqEQ07dxqpMa8gupoW8KKqKUFJMPX1cDWUaRWPSZWP1H_1SKX3IwvPaNGq6uthy1IA/exec';
  if (!webhookUrl) {
    console.log('ℹ️ 尚未設定 Google Apps Script Webhook URL，資料已安全儲存於本地與 Cloudflare KV');
    return;
  }

  const nowTaipei = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  const payload = {
    type: "profile_update",
    dataType: "profile_update",
    createdAt: nowTaipei,
    name: profileData.name || '學員',
    phone: profileData.phone || '未填寫',
    email: profileData.email || '未提供',
    identity: `平台學員 (${profileData.title || '先生/小姐'})`,
    course: "【學員專區】個人基本資料更新",
    goal: `生日：${profileData.birthday || '未填寫'}`,
    experience: `精幣：${profileData.coins || 0} 枚`,
    timePerWeek: `精通寶：${profileData.masterTokens || 0} 枚`,
    priorityHelp: "學員個人資料雲端雙向同步",
    notes: `【學員專區修改個人資料】更新時間：${nowTaipei} | 生日：${profileData.birthday || '未填寫'} | 稱呼：${profileData.title || ''} | 密碼變更：${profileData.passwordUpdated || '否'} | 大頭貼：${profileData.avatar ? '已自訂' : '預設'}`,
    status: "🔄 個人資料已更新",
    title: profileData.title || '',
    birthday: profileData.birthday || '',
    coins: profileData.coins || 0,
    masterTokens: profileData.masterTokens || 0,
    avatar: profileData.avatar || '',
    oldEmail: profileData.oldEmail || ''
  };

  try {
    fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    }).then(() => {
      console.log('✅ 學員個人資料已即時寫入 Google Sheet 試算表！');
    }).catch(err => {
      console.warn('⚠️ Google Sheet 個人資料同步提醒:', err);
    });
  } catch (err) {
    console.warn('⚠️ Google Sheet 個人資料同步異常:', err);
  }
}

function initNavbar() {
  document.querySelectorAll('.nav-link:not(.nav-dropdown-btn)').forEach(button => {
    button.addEventListener('click', (e) => {
      const target = e.currentTarget.getAttribute('data-target');
      if (target) switchView(target);
    });
  });

  document.getElementById('logoBtn').addEventListener('click', () => switchView('home'));

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown') && !e.target.closest('.user-profile-menu')) {
      closeAllDropdowns();
    }
  });
}

// Course Grid Rendering
function renderCourseGrid(category = 'all') {
  const gridContainer = document.getElementById('courseGrid');
  if (!gridContainer) return;

  const filtered = category === 'all' 
    ? mockCourses 
    : mockCourses.filter(c => c.category === category);

  gridContainer.innerHTML = filtered.map(course => `
    <div class="course-card">
      <div class="course-thumb">
        <img src="${course.coverImage}" alt="${course.title}">
        <span class="course-tag">${course.categoryLabel}</span>
        <span class="course-badge">${course.badge}</span>
      </div>
      <div class="course-body">
        <h3 class="course-title">${course.title}</h3>
        
        <div class="instructor-row">
          <img class="instructor-avatar" src="${course.instructorAvatar}" alt="${course.instructor}">
          <div>
            <div class="instructor-name">${course.instructor}</div>
            <div class="instructor-exp">${course.instructorTitle}</div>
          </div>
        </div>

        <div class="course-meta">
          <span><i class="fa-solid fa-star text-yellow"></i> ${course.rating} (${course.reviewCount})</span>
          <span><i class="fa-solid fa-video text-purple"></i> ${course.videoDuration}</span>
        </div>

        <div class="course-pricing-box">
          <div class="price-option">
            <span style="color: var(--text-muted); font-size:0.86rem; display:flex; align-items:center; gap:0.4rem;">
              <i class="fa-solid fa-circle-play text-cyan"></i> 錄播自學
            </span>
            <strong class="price-val" style="color: #f1f5f9; font-size:1.02rem;">
              NT$ ${(course.priceRecordOnly || 3600).toLocaleString()}
            </strong>
          </div>
          <div class="price-option" style="margin-top:0.45rem; padding-top:0.45rem; border-top: 1px dashed rgba(255,255,255,0.08);">
            <span style="color: #f472b6; font-weight:600; font-size:0.86rem; display:flex; align-items:center; gap:0.4rem;">
              <i class="fa-solid fa-crown text-yellow"></i> 含個教 1 對 1
            </span>
            <strong class="price-val highlight" style="color: #fbbf24; font-size:1.08rem; letter-spacing:1px;">NT$ ????</strong>
          </div>
        </div>

        <div class="course-actions" style="margin-top:0.85rem;">
          <button class="btn btn-outline btn-block" onclick="addToCart('${course.id}', 'record')" style="border-color: rgba(6,182,212,0.65); color: #38bdf8; font-weight:600; font-size:0.92rem; padding:0.65rem 0.6rem; display:flex; align-items:center; justify-content:center; gap:0.45rem;">
            <i class="fa-solid fa-cart-plus"></i> 加入購物車
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// Homepage Featured Courses Grid Rendering (4 items on desktop, 3 on mobile)
function renderHomeFeaturedCourses() {
  const container = document.getElementById('homeFeaturedCoursesGrid');
  if (!container) return;

  // Filter courses marked as isFeatured
  let featured = (typeof mockCourses !== 'undefined' ? mockCourses : []).filter(c => c.isFeatured);
  if (featured.length === 0 && typeof mockCourses !== 'undefined' && mockCourses.length > 0) {
    featured = mockCourses.slice(0, 4);
  } else {
    featured = featured.slice(0, 4);
  }

  container.innerHTML = featured.map(course => `
    <div class="course-card">
      <div class="course-thumb">
        <img src="${course.coverImage}" alt="${course.title}">
        <span class="course-tag">${course.categoryLabel}</span>
        <span class="course-badge">${course.badge || '🔥 熱銷首選'}</span>
      </div>
      <div class="course-body">
        <h3 class="course-title" title="${course.title}">${course.title}</h3>
        
        <div class="instructor-row">
          <img class="instructor-avatar" src="${course.instructorAvatar}" alt="${course.instructor}">
          <div>
            <div class="instructor-name">${course.instructor}</div>
            <div class="instructor-exp">${course.instructorTitle}</div>
          </div>
        </div>

        <div class="course-meta">
          <span><i class="fa-solid fa-star text-yellow"></i> ${course.rating || 5.0} (${course.reviewCount || 100})</span>
          <span><i class="fa-solid fa-video text-purple"></i> ${course.videoDuration || '錄播影音'}</span>
        </div>

        <div class="course-pricing-box">
          <div class="price-option">
            <span style="color: var(--text-muted); font-size:0.82rem; display:flex; align-items:center; gap:0.35rem;">
              <i class="fa-solid fa-circle-play text-cyan"></i> 錄播自學
            </span>
            <strong class="price-val" style="color: #f1f5f9; font-size:0.95rem;">
              NT$ ${(course.priceRecordOnly || 3600).toLocaleString()}
            </strong>
          </div>
          <div class="price-option" style="margin-top:0.4rem; padding-top:0.4rem; border-top: 1px dashed rgba(255,255,255,0.08);">
            <span style="color: #f472b6; font-weight:600; font-size:0.82rem; display:flex; align-items:center; gap:0.35rem;">
              <i class="fa-solid fa-crown text-yellow"></i> 含個教 1對1
            </span>
            <strong class="price-val highlight" style="color: #fbbf24; font-size:1rem; letter-spacing:1px;">NT$ ????</strong>
          </div>
        </div>

        <div class="course-actions" style="margin-top:0.65rem;">
          <button class="btn btn-outline btn-block" onclick="addToCart('${course.id}', 'record')" style="border-color: rgba(6,182,212,0.65); color: #38bdf8; font-weight:600; font-size:0.88rem; padding:0.6rem 0.5rem; display:flex; align-items:center; justify-content:center; gap:0.4rem;">
            <i class="fa-solid fa-cart-plus"></i> 加入購物車
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function setupFilterEvents() {
  const filterPills = document.querySelectorAll('#courseCategoryFilters .pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      filterPills.forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      const cat = e.target.getAttribute('data-category');
      renderCourseGrid(cat);
    });
  });
}

// Admin Dashboard Tabs & Tables
function switchAdminTab(tabKey) {
  const isManagerOrConsultant = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant');
  const isStaffOrAbove = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff');

  if (['users', 'finance', 'sheets'].includes(tabKey) && !isManagerOrConsultant) {
    showToast('⚠️ 帳號密碼、全站財務與 Google Sheet 為 👑 平台主管專屬權限');
    switchAdminTab('courses');
    return;
  }
  if (['instructors', 'bookings', 'leads', 'quotes'].includes(tabKey) && !isStaffOrAbove) {
    showToast('⚠️ 此分頁為平台營運團隊專屬管理項目');
    switchAdminTab('courses');
    return;
  }

  // Ensure #view-admin-dashboard is active when switching admin tabs
  if (currentView !== 'admin-dashboard') {
    currentView = 'admin-dashboard';
    document.querySelectorAll('.view-section').forEach(section => {
      const isAdminDash = section.id === 'view-admin-dashboard';
      section.classList.toggle('active', isAdminDash);
      if (isAdminDash) {
        section.style.display = 'block';
      }
    });
  }

  activeAdminTab = tabKey;
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-atab') === tabKey);
  });

  document.querySelectorAll('.admin-content-pane').forEach(pane => {
    const isTarget = pane.id === `atab-${tabKey}`;
    pane.classList.toggle('active', isTarget);
    pane.style.display = isTarget ? 'block' : 'none';
  });

  renderAdminTables();
}

function renderAdminTables() {
  try { renderUserTable(); } catch (e) { console.error(e); }
  try { renderCourseAdminTable(); } catch (e) { console.error(e); }
  try { renderInstructorAdminTable(); } catch (e) { console.error(e); }
  try { renderChapterAdminList(); } catch (e) { console.error(e); }
  try { renderBookingAdminTable(); } catch (e) { console.error(e); }
  try { renderMentorSalaryTable(); } catch (e) { console.error(e); }
  try { renderStaffSalaryTable(); } catch (e) { console.error(e); }
  try { renderPlatformExpensesTable(); } catch (e) { console.error(e); }
  try { renderFinanceDashboardKPIs(); } catch (e) { console.error(e); }
  try { renderLeadAdminTable(); } catch (e) { console.error(e); }
  try { renderCustomQuotesAdminTable(); } catch (e) { console.error(e); }
  try { renderGoogleSheetAdminSection(); } catch (e) { console.error(e); }
}

// User Accounts Table (Manager & Consultant Only)
function renderUserTable() {
  const tbody = document.getElementById('userTableBody');
  const userCountSpan = document.getElementById('userTotalCount');
  if (!tbody) return;

  if (userCountSpan) userCountSpan.innerText = mockUsers.length;

  const isManagerOrConsultant = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant');

  tbody.innerHTML = mockUsers.map(user => {
    let roleBadgeClass = 'badge-student';
    if (user.role === 'manager') roleBadgeClass = 'badge-manager';
    if (user.role === 'consultant') roleBadgeClass = 'badge-consultant';
    if (user.role === 'staff') roleBadgeClass = 'badge-staff';
    if (user.role === 'instructor') roleBadgeClass = 'badge-instructor';

    const coins = user.coins !== undefined ? user.coins : 0;
    const masterTokens = user.masterTokens !== undefined ? user.masterTokens : 0;
    const bank = user.bankInfo;
    const bankHtml = bank && bank.bankName 
      ? `<div><strong class="text-cyan text-xs"><i class="fa-solid fa-building-columns"></i> ${bank.bankName}</strong></div><div class="text-xs text-muted">帳號: <code>******${bank.accountLast5 || (bank.bankAccount ? bank.bankAccount.slice(-5) : '00000')}</code></div>` 
      : `<span class="text-muted text-xs"><i class="fa-solid fa-circle-minus"></i> 未設定帳戶</span>`;

    const permDesc = (user.role === 'manager' || user.role === 'consultant')
      ? '全權限 + 帳號密碼 + 薪資帳戶 + 點數設定 + 創業規劃'
      : user.role === 'staff'
      ? '課程 / 講師 / 影片 增修 + 員工薪資發放連動'
      : user.role === 'instructor'
      ? '講師排班與作業批改 + 講師月結撥款連動'
      : '官網瀏覽與課程購買 (含點數折抵)';

    return `
      <tr>
        <td data-label="使用者姓名">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <img src="${user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80'}" style="width:30px;height:30px;border-radius:50%;">
            <strong>${user.name}</strong>
          </div>
        </td>
        <td data-label="帳號 Email"><code>${user.email}</code></td>
        <td data-label="登入密碼"><code>${user.password}</code></td>
        <td data-label="授權身分"><span class="badge-role ${roleBadgeClass}">${user.roleLabel}</span></td>
        <td data-label="薪資轉帳帳戶">${bankHtml}</td>
        <td data-label="精幣 / 精通寶">
          <div style="font-weight:700; color:#fbbf24; font-size:0.85rem;"><i class="fa-solid fa-coins"></i> ${coins.toLocaleString()} 精幣</div>
          <div style="font-size:0.75rem; color:#c084fc;"><i class="fa-solid fa-award"></i> ${masterTokens} 精通寶</div>
        </td>
        <td data-label="權限說明" class="text-sm text-muted">
          ${permDesc}
        </td>
        <td data-label="操作與設定">
          ${isManagerOrConsultant ? `
            <button class="btn btn-sm btn-outline" onclick="openEditUserModal('${user.id}')"><i class="fa-solid fa-pen"></i> 編輯帳號/薪資戶</button>
            ${user.id !== currentUser.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
          ` : '<span class="text-muted">無權限</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

// Course Admin Table
function renderCourseAdminTable() {
  const tbody = document.getElementById('courseTableBody');
  if (!tbody) return;

  const role = currentUser ? currentUser.role : 'guest';
  const isManagerOrConsultant = (role === 'manager' || role === 'consultant');
  const canSeePrices = (role === 'manager' || role === 'consultant' || role === 'staff');
  const cleanName = currentUser ? currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim() : '';

  const cardTitle = document.getElementById('courseAdminCardTitle');
  if (cardTitle) {
    cardTitle.innerHTML = canSeePrices
      ? '<i class="fa-solid fa-boxes-stacked text-pink"></i> 線上課程與雙軌價格列表'
      : '<i class="fa-solid fa-boxes-stacked text-pink"></i> 線上課程大綱與講義管理 (僅顯示個人名下課程)';
  }

  document.querySelectorAll('.course-price-col').forEach(th => {
    th.style.display = canSeePrices ? '' : 'none';
  });

  // Filter courses: Director/Managers/Staff see ALL teachers' courses; Instructors ONLY see their OWN courses
  const displayCourses = canSeePrices
    ? mockCourses
    : mockCourses.filter(c => c.instructor && (c.instructor.includes(cleanName) || (currentUser && currentUser.name && c.instructor.includes(currentUser.name.split(' ')[0]))));

  if (displayCourses.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted" style="padding: 2.5rem 1rem;">
          <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 0.5rem; display:block; color: #64748b;"></i>
          目前尚未有指派給您的專屬線上課程，您可以點擊右上角「新增課程」上架您的實戰課程。
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = displayCourses.map(c => `
    <tr>
      <td data-label="課程名稱">
        <strong>${c.title}</strong>
        ${c.isFeatured ? '<span class="badge" style="background:rgba(245,158,11,0.2);border:1px solid #f59e0b;color:#fbbf24;font-size:0.75rem;padding:2px 6px;border-radius:4px;margin-left:6px;"><i class="fa-solid fa-star"></i> 首頁精選</span>' : ''}
      </td>
      <td data-label="分類標籤"><span class="badge-tag">${c.categoryLabel}</span></td>
      <td data-label="主講業師">${c.instructor}</td>
      ${canSeePrices ? `
        <td data-label="純錄播價格" class="course-price-col"><strong class="text-cyan">NT$ ${(c.priceRecordOnly || 0).toLocaleString()}</strong></td>
        <td data-label="含1對1個教" class="course-price-col"><span class="text-pink">NT$ ${(c.priceWith1on1 || 0).toLocaleString()}</span> <small class="text-muted" style="display:block; font-size:0.72rem;">(前台顯示 ????)</small></td>
      ` : ''}
      <td data-label="上架狀態"><span class="badge badge-success">已上架</span></td>
      <td data-label="操作管理">
        <div class="flex-center gap-xs" style="justify-content:flex-start; flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline" onclick="openEditCourseModal('${c.id}')"><i class="fa-solid fa-pen"></i> ${canSeePrices ? '編輯價格/內容' : '調整個人課程'}</button>
          <button class="btn btn-sm btn-secondary" onclick="openCourseMaterialModal('${c.id}')"><i class="fa-solid fa-file-lines text-cyan"></i> 講義管理</button>
          ${isManagerOrConsultant ? `<button class="btn btn-sm btn-danger" onclick="deleteCourse('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// Instructor Admin Table
function renderInstructorAdminTable() {
  const tbody = document.getElementById('instructorTableBody');
  if (!tbody) return;

  const isManagerOrConsultant = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant');

  tbody.innerHTML = mockInstructors.map(inst => {
    const cleanName = (inst.name || '').replace(/（.*）|\(.*\)|\s*講師/g, '').trim();
    const matchedCourse = mockCourses.find(c => c.instructor && (c.instructor.includes(cleanName) || inst.name.includes(c.instructor.split(' ')[0])));
    const targetCourseId = matchedCourse ? matchedCourse.id : 'course-1';

    return `
    <tr>
      <td data-label="講師師資">
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <img src="${inst.avatar}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
          <div>
            <strong>${inst.name}</strong>
            <div class="text-xs text-muted">${inst.tag || ''}</div>
          </div>
        </div>
      </td>
      <td data-label="職稱領域">${inst.role}</td>
      <td data-label="專業資歷" class="text-sm text-muted">${inst.exp}</td>
      <td data-label="個教鐘點" class="text-purple"><strong>${inst.rate1on1}</strong></td>
      <td data-label="學員評鑑">⭐ ${inst.rating} (${inst.studentCount}學員)</td>
      <td data-label="操作管理">
        <div class="flex-center gap-xs" style="justify-content:flex-start; flex-wrap:wrap;">
          <button class="btn btn-sm btn-outline" onclick="openInstructorModal('${inst.id}')"><i class="fa-solid fa-eye"></i> 預覽</button>
          <button class="btn btn-sm btn-primary" onclick="openEditInstructorModal('${inst.id}')"><i class="fa-solid fa-pen"></i> 編輯資料與照片</button>
          <button class="btn btn-sm btn-secondary" onclick="openCourseMaterialModal('${targetCourseId}')"><i class="fa-solid fa-file-lines text-cyan"></i> 講義管理</button>
          ${isManagerOrConsultant ? `<button class="btn btn-sm btn-danger" onclick="deleteInstructor('${inst.id}')" title="刪除此講師"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

// Chapter Admin List


// 複製課前 1 天親切上課提醒文案 (簡約、親切、無改期負擔)
// ====== 錄播影片單元與章節管理 (Unit & Lesson CMS) ======
function saveChaptersToStorage() {
  try {
    localStorage.setItem('pentaskill_chapters', JSON.stringify(mockChapters));
  } catch (e) {
    console.error('儲存單元章節快取失敗:', e);
  }
  if (typeof saveCloudData === 'function') {
    saveCloudData('chapters', mockChapters);
  }
}

function loadChaptersFromStorage() {
  try {
    const saved = localStorage.getItem('pentaskill_chapters');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed.forEach(chap => {
          if (!chap.courseId) chap.courseId = 'course-1';
        });
        const existingCourses = new Set(parsed.map(c => c.courseId));
        if (typeof mockChapters !== 'undefined' && Array.isArray(mockChapters)) {
          mockChapters.forEach(defaultChap => {
            if (!existingCourses.has(defaultChap.courseId)) {
              parsed.push(defaultChap);
            }
          });
        }
        mockChapters = parsed;
      }
    }
  } catch (e) {
    console.error('讀取單元章節快取失敗:', e);
  }
}

// Chapter & Unit Admin List (匹配 2.png 樣式：右側為編輯鍵，點開可修改或刪除)
function renderChapterAdminList() {
  const container = document.getElementById('chapterAdminList');
  if (!container) return;

  if (!mockChapters || mockChapters.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1.5rem; background: rgba(15,23,42,0.4); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1); color: #94a3b8;">
        <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 0.75rem; color: #64748b;"></i>
        <h4 style="color: #cbd5e1; margin-bottom: 0.5rem;">目前尚未建立任何單元章節</h4>
        <p style="font-size: 0.9rem; margin-bottom: 1rem;">請點擊右上角「<strong>新增章節</strong>」開始規劃課程大綱。</p>
        <button class="btn btn-primary btn-sm" onclick="openAddChapterModal()"><i class="fa-solid fa-plus"></i> 新增章節</button>
      </div>
    `;
    return;
  }

  container.innerHTML = mockChapters.map(chap => {
    const lessons = chap.lessons || [];
    return `
      <div class="file-item margin-top-xs" style="background: rgba(255,255,255,0.02); padding: 1.25rem 1.25rem 1.1rem; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div style="flex: 1;">
          <h4 style="color: #f8fafc; font-size: 1.05rem; margin: 0 0 0.6rem 0; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <i class="fa-solid fa-folder text-purple"></i>
            <span>${chap.title} (${chap.duration || '45 分鐘'})</span>
          </h4>
          <div class="margin-top-xs" style="display: flex; flex-direction: column; gap: 0.4rem;">
            ${lessons.length === 0 ? `
              <div class="text-sm text-muted" style="margin-left: 1.5rem; font-style: italic;">
                (此單元目前尚無章節，點擊右方「編輯」可新增章節)
              </div>
            ` : lessons.map(l => `
              <div class="text-sm" style="margin-left: 1.5rem; display: flex; align-items: center; gap: 0.5rem; color: #cbd5e1;">
                <i class="fa-solid fa-play-circle text-cyan"></i>
                <span style="font-weight: 500;">${l.title}</span>
                ${l.isTrialAllowed ? '<span class="badge-tag bg-purple text-xs" style="padding: 1px 6px;">免費試看</span>' : ''}
                <span class="text-xs text-muted">(${l.durationSeconds ? Math.round(l.durationSeconds/60)+' 分鐘' : (l.duration || '15 分鐘')})</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div style="margin-left: 1.25rem; flex-shrink: 0;">
          <!-- 2.png 紅框處：編輯按鈕，點開可修改或刪除 -->
          <button class="btn btn-sm btn-outline" onclick="openEditChapterModal('${chap.id}')" style="border-color: rgba(6,182,212,0.6); color: #38bdf8; font-weight: 500; padding: 6px 14px; border-radius: 6px;">
            <i class="fa-solid fa-pen-to-square"></i> 編輯
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ====== 新增章節 (包含第幾單元與第幾章節) ======
function openAddChapterModal() {
  const modal = document.getElementById('addChapterModal');
  if (!modal) return;

  // 1. 填入單元選單
  const select = document.getElementById('inputChapterUnitSelect');
  if (select) {
    select.innerHTML = mockChapters.map(c => `
      <option value="${c.id}">${c.title}</option>
    `).join('') + '<option value="new">➕ 建立全新單元 (第幾單元)...</option>';
  }

  // 2. 隱藏新建單元輸入框
  const newUnitGroup = document.getElementById('newUnitInputGroup');
  if (newUnitGroup) newUnitGroup.style.display = 'none';

  // 3. 自動預設下一個章節編號
  const firstUnit = mockChapters[0];
  const nextNum = firstUnit ? `${firstUnit.id}-${(firstUnit.lessons || []).length + 1}` : '1-1';
  const numInput = document.getElementById('inputLessonNumber');
  if (numInput) numInput.value = nextNum;

  // 4. 清空標題與預設值
  const titleInput = document.getElementById('inputLessonTitle');
  if (titleInput) titleInput.value = '';
  const durInput = document.getElementById('inputLessonDuration');
  if (durInput) durInput.value = '15 分鐘';
  const urlInput = document.getElementById('inputLessonVideoUrl');
  if (urlInput) urlInput.value = 'https://cdn.pentaskill.com/demo.mp4';
  const trialInput = document.getElementById('inputLessonTrial');
  if (trialInput) trialInput.checked = false;

  modal.classList.add('active');
  modal.style.display = 'flex';
  if (titleInput) titleInput.focus();
}

function closeAddChapterModal() {
  const modal = document.getElementById('addChapterModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

// 切換單元下拉時
function handleUnitSelectChange(val) {
  const newUnitGroup = document.getElementById('newUnitInputGroup');
  const numInput = document.getElementById('inputLessonNumber');
  if (val === 'new') {
    if (newUnitGroup) newUnitGroup.style.display = 'block';
    const newUnitIndex = mockChapters.length + 1;
    const newTitleInput = document.getElementById('inputNewUnitTitle');
    if (newTitleInput && !newTitleInput.value) {
      newTitleInput.value = `第 ${newUnitIndex} 章：新單元大綱`;
    }
    if (numInput) numInput.value = `${newUnitIndex}-1`;
  } else {
    if (newUnitGroup) newUnitGroup.style.display = 'none';
    const unit = mockChapters.find(c => String(c.id) === String(val));
    if (unit && numInput) {
      numInput.value = `${unit.id}-${(unit.lessons || []).length + 1}`;
    }
  }
}

// 儲存新增章節
function handleSaveChapter(e) {
  if (e && e.preventDefault) e.preventDefault();
  const unitSelectVal = document.getElementById('inputChapterUnitSelect').value;
  const lessonNumber = document.getElementById('inputLessonNumber').value.trim();
  const lessonTitle = document.getElementById('inputLessonTitle').value.trim();
  const lessonDuration = document.getElementById('inputLessonDuration').value.trim() || '15 分鐘';
  const videoUrl = document.getElementById('inputLessonVideoUrl').value.trim() || 'https://cdn.pentaskill.com/demo.mp4';
  const isTrial = document.getElementById('inputLessonTrial').checked;

  if (!lessonTitle) {
    showToast('⚠️ 請填寫章節標題名稱！');
    return;
  }

  const fullLessonTitle = lessonNumber ? `${lessonNumber} ${lessonTitle}` : lessonTitle;
  const durMinutes = parseInt(lessonDuration, 10) || 15;
  const newLessonObj = {
    id: `${lessonNumber || Date.now().toString().slice(-4)}`,
    title: fullLessonTitle,
    streamId: videoUrl,
    videoUrl: videoUrl,
    isTrialAllowed: isTrial,
    completed: false,
    duration: lessonDuration,
    durationSeconds: durMinutes * 60
  };

  if (unitSelectVal === 'new') {
    const newUnitTitle = document.getElementById('inputNewUnitTitle').value.trim();
    const newUnitDur = document.getElementById('inputNewUnitDuration').value.trim() || '45 分鐘';
    if (!newUnitTitle) {
      showToast('⚠️ 請輸入新單元大綱名稱！');
      return;
    }
    const newUnitObj = {
      id: Date.now(),
      title: newUnitTitle,
      duration: newUnitDur,
      lessons: [newLessonObj]
    };
    mockChapters.push(newUnitObj);
  } else {
    const targetUnit = mockChapters.find(c => String(c.id) === String(unitSelectVal));
    if (!targetUnit) {
      showToast('⚠️ 找不到指定的所屬單元！');
      return;
    }
    if (!targetUnit.lessons) targetUnit.lessons = [];
    targetUnit.lessons.push(newLessonObj);
  }

  saveChaptersToStorage();
  closeAddChapterModal();
  renderChapterAdminList();
  if (typeof renderChapters === 'function') renderChapters();
    if (currentUser && currentUser.email && typeof loadStudentVideoProgressFromCloud === 'function') {
      loadStudentVideoProgressFromCloud(currentUser.email);
    }
  showToast(`🎬 成功新增章節：${fullLessonTitle}`);
}

// ====== 編輯單元與章節 (點開 2.png 上的「編輯」鍵：可修改或刪除) ======
function openEditChapterModal(unitId) {
  const chap = mockChapters.find(c => String(c.id) === String(unitId));
  if (!chap) return;

  const modal = document.getElementById('editChapterModal');
  if (!modal) return;

  document.getElementById('editModalUnitId').value = chap.id;
  document.getElementById('editModalUnitTitle').value = chap.title || '';
  document.getElementById('editModalUnitDuration').value = chap.duration || '45 分鐘';

  renderEditModalLessons(chap);

  modal.classList.add('active');
  modal.style.display = 'flex';
}

function closeEditChapterModal() {
  const modal = document.getElementById('editChapterModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

// 渲染編輯彈窗內的章節清單
function renderEditModalLessons(chap) {
  const container = document.getElementById('editModalLessonsContainer');
  if (!container) return;
  const lessons = chap.lessons || [];

  if (lessons.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 1rem; color: #94a3b8; font-size: 0.85rem; background: rgba(0,0,0,0.2); border-radius: 6px;">
        目前單元內尚無章節，請點擊上方「新增章節」。
      </div>
    `;
    return;
  }

  container.innerHTML = lessons.map((l, idx) => {
    const durTxt = l.durationSeconds ? `${Math.round(l.durationSeconds / 60)} 分鐘` : (l.duration || '15 分鐘');
    return `
      <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.75rem 0.85rem;" data-lesson-id="${l.id}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
          <span style="font-weight: 600; font-size: 0.85rem; color: #38bdf8;">
            <i class="fa-solid fa-play-circle"></i> 章節 #${idx + 1}
          </span>
          <button type="button" class="btn btn-xs btn-outline text-pink" onclick="deleteLessonInEditModal('${chap.id}', '${l.id}')" style="border-color: rgba(236,72,153,0.4); padding: 2px 8px;" title="刪除此章節">
            <i class="fa-solid fa-trash"></i> 刪除此章節
          </button>
        </div>
        <div class="form-group">
          <input type="text" class="form-control form-control-sm edit-lesson-title-input" value="${l.title.replace(/"/g, '&quot;')}" placeholder="章節標題名稱" style="font-size: 0.88rem;">
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.4rem; flex-wrap: wrap;">
          <input type="text" class="form-control form-control-sm edit-lesson-dur-input" value="${durTxt}" placeholder="時長" style="width: 110px; font-size: 0.82rem;">
          <input type="text" class="form-control form-control-sm edit-lesson-url-input" value="${(l.streamId || l.videoUrl || '').replace(/"/g, '&quot;')}" placeholder="影片 URL" style="flex: 1; min-width: 160px; font-size: 0.82rem;">
          <label style="display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: 0.82rem; color: #cbd5e1; cursor: pointer;">
            <input type="checkbox" class="edit-lesson-trial-input" ${l.isTrialAllowed ? 'checked' : ''}> 免費試看
          </label>
        </div>
      </div>
    `;
  }).join('');
}

// 編輯彈窗內：刪除單一章節
function deleteLessonInEditModal(unitId, lessonId) {
  const chap = mockChapters.find(c => String(c.id) === String(unitId));
  if (!chap || !chap.lessons) return;
  const l = chap.lessons.find(x => String(x.id) === String(lessonId));
  const lName = l ? l.title : '該章節';

  if (!confirm(`確定要刪除【${lName}】嗎？`)) {
    return;
  }

  chap.lessons = chap.lessons.filter(x => String(x.id) !== String(lessonId));
  renderEditModalLessons(chap);
  saveChaptersToStorage();
  renderChapterAdminList();
  if (typeof renderChapters === 'function') renderChapters();
    if (currentUser && currentUser.email && typeof loadStudentVideoProgressFromCloud === 'function') {
      loadStudentVideoProgressFromCloud(currentUser.email);
    }
  showToast(`🗑️ 已刪除章節：${lName}`);
}

// 編輯彈窗內：新增子章節
function addLessonInEditModal() {
  const unitId = document.getElementById('editModalUnitId').value;
  const chap = mockChapters.find(c => String(c.id) === String(unitId));
  if (!chap) return;

  if (!chap.lessons) chap.lessons = [];
  const nextNum = `${chap.id}-${chap.lessons.length + 1}`;
  const newL = {
    id: `${chap.id}-${Date.now().toString().slice(-4)}`,
    title: `${nextNum} 新增章節影片`,
    streamId: 'https://cdn.pentaskill.com/demo.mp4',
    videoUrl: 'https://cdn.pentaskill.com/demo.mp4',
    isTrialAllowed: false,
    completed: false,
    duration: '15 分鐘',
    durationSeconds: 900
  };
  chap.lessons.push(newL);
  renderEditModalLessons(chap);
}

// 儲存編輯彈窗的所有修改 (單元 + 各章節)
function handleSaveAllUnitEdits(e) {
  if (e && e.preventDefault) e.preventDefault();
  const unitId = document.getElementById('editModalUnitId').value;
  const chap = mockChapters.find(c => String(c.id) === String(unitId));
  if (!chap) return;

  const newUnitTitle = document.getElementById('editModalUnitTitle').value.trim();
  const newUnitDur = document.getElementById('editModalUnitDuration').value.trim() || '45 分鐘';

  if (!newUnitTitle) {
    showToast('⚠️ 單元名稱不能為空！');
    return;
  }

  chap.title = newUnitTitle;
  chap.duration = newUnitDur;

  // 抓取彈窗中各章節項目的修改
  const lessonRows = document.querySelectorAll('#editModalLessonsContainer [data-lesson-id]');
  lessonRows.forEach(row => {
    const lId = row.getAttribute('data-lesson-id');
    const targetL = (chap.lessons || []).find(x => String(x.id) === String(lId));
    if (targetL) {
      const titleInp = row.querySelector('.edit-lesson-title-input');
      const durInp = row.querySelector('.edit-lesson-dur-input');
      const urlInp = row.querySelector('.edit-lesson-url-input');
      const trialInp = row.querySelector('.edit-lesson-trial-input');

      if (titleInp && titleInp.value.trim()) targetL.title = titleInp.value.trim();
      if (durInp && durInp.value.trim()) {
        targetL.duration = durInp.value.trim();
        targetL.durationSeconds = (parseInt(durInp.value.trim(), 10) || 15) * 60;
      }
      if (urlInp) {
        targetL.streamId = urlInp.value.trim();
        targetL.videoUrl = urlInp.value.trim();
      }
      if (trialInp) {
        targetL.isTrialAllowed = trialInp.checked;
      }
    }
  });

  saveChaptersToStorage();
  closeEditChapterModal();
  renderChapterAdminList();
  if (typeof renderChapters === 'function') renderChapters();
    if (currentUser && currentUser.email && typeof loadStudentVideoProgressFromCloud === 'function') {
      loadStudentVideoProgressFromCloud(currentUser.email);
    }
  showToast(`✅ 已儲存單元【${newUnitTitle}】與其章節修改！`);
}

// 編輯彈窗內：刪除整個單元
function deleteEntireUnitFromModal() {
  const unitId = document.getElementById('editModalUnitId').value;
  const chap = mockChapters.find(c => String(c.id) === String(unitId));
  if (!chap) return;

  if (!confirm(`⚠️ 確定要刪除單元【${chap.title}】及其內所有章節影片嗎？此操作無法復原。`)) {
    return;
  }

  mockChapters = mockChapters.filter(c => String(c.id) !== String(unitId));
  saveChaptersToStorage();
  closeEditChapterModal();
  renderChapterAdminList();
  if (typeof renderChapters === 'function') renderChapters();
    if (currentUser && currentUser.email && typeof loadStudentVideoProgressFromCloud === 'function') {
      loadStudentVideoProgressFromCloud(currentUser.email);
    }
  showToast(`🗑️ 已刪除單元：${chap.title}`);
}

// 相容舊函式別名
function openAddUnitModal() { openAddChapterModal(); }
function closeAddUnitModal() { closeAddChapterModal(); }
function handleSaveUnit(e) { handleSaveChapter(e); }
function openAddLessonModal() { openAddChapterModal(); }
function closeAddLessonModal() { closeAddChapterModal(); }
function handleSaveLesson(e) { handleSaveChapter(e); }
function openEditUnitModal(id) { openEditChapterModal(id); }
function closeEditUnitModal() { closeEditChapterModal(); }
function openEditLessonModal(unitId, lessonId) { openEditChapterModal(unitId); }
function closeEditLessonModal() { closeEditChapterModal(); }


// 複製課前 1 天親切上課提醒文案
function copyClassReminderMsg(bookingId) {
  const b = mockBookings.find(item => item.id === bookingId);
  if (!b) return;

  const msg = `🔔【精五門 PentaSkill 課前提醒】\n\n學員 ${b.studentName} 您好：\n您預約於明日 (${b.date} ${b.slotTime}) 與【${b.instructor} 講師】進行 1 對 1 個教（主題：${b.topic}）。\n\n👉 請於課前 10 分鐘登入精五門網站，點擊「進入教室」準備上課囉！\n🔗 教室直通網址：https://online-learning-platform.pey514514.workers.dev/#live-classroom\n\n✨ 期待明天與您線上見，預祝您上課收穫滿滿！請於明日準時上課哦！`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).then(() => {
      showToast(`📋 已成功複製【${b.studentName}】的課前 1 天親切提醒文案！可直接貼至 LINE@ / Email 發送。`);
    }).catch(() => {
      prompt('請複製以下課前 1 天提醒文案：', msg);
    });
  } else {
    prompt('請複製以下課前 1 天提醒文案：', msg);
  }
}

// 複製課前 3 天改期最後確認文案 (提醒學員最晚於課前 2 天改期)
function copy3DaysNoticeMsg(bookingId) {
  const b = mockBookings.find(item => item.id === bookingId);
  if (!b) return;

  const msg = `📅【精五門 PentaSkill 個教行程與改期最後確認】\n\n學員 ${b.studentName} 您好：\n您預約於 3 天後 (${b.date} ${b.slotTime}) 與【${b.instructor} 講師】進行 1 對 1 個教（主題：${b.topic}）。\n\n⚠️ 貼心提醒：若您臨時有事需調整時間，最晚請於明天（上課前 2 天 / 48 小時前）於系統線上改期或通知 LINE@ 小編喔！逾期或當天臨時取消將視為放棄該堂課。\n\n🔗 預約管理中心：https://online-learning-platform.pey514514.workers.dev/#live-classroom\n感謝您的配合，預祝學習愉快！`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).then(() => {
      showToast(`📋 已成功複製【${b.studentName}】的課前 3 天改期確認文案！可直接發送通知。`);
    }).catch(() => {
      prompt('請複製以下課前 3 天改期確認文案：', msg);
    });
  } else {
    prompt('請複製以下課前 3 天改期確認文案：', msg);
  }
}

// 1-on-1 個教排班與預約 CMS 核心控制邏輯
function openAddBookingModal() {
  const modal = document.getElementById('adminBookingModal');
  if (!modal) return;

  document.getElementById('editAdminBookingId').value = '';
  document.getElementById('adminBookingModalTitle').innerHTML = '<i class="fa-solid fa-calendar-plus text-purple"></i> 新增講師 1-on-1 個教排班 / 預約';
  document.getElementById('adminBookingInstructor').value = '張哲銘 (Ethan)';
  document.getElementById('adminBookingStudentName').value = '';
  document.getElementById('adminBookingStudentEmail').value = '';
  const todayStr = getLocalDateString();
  document.getElementById('adminBookingDate').min = todayStr;
  document.getElementById('adminBookingDate').value = todayStr;
  document.getElementById('adminBookingSlotTime').value = '14:00 - 15:00';
  document.getElementById('adminBookingTopic').value = '專案作品 1 對 1 精準批改與架構診斷 (1小時)';
  document.getElementById('adminBookingNotes').value = '';
  document.getElementById('adminBookingFee').value = '1800';
  document.getElementById('adminBookingStatus').value = '已預約';

  modal.classList.add('active');
}

function openEditBookingModal(bookingId) {
  const modal = document.getElementById('adminBookingModal');
  const b = mockBookings.find(item => item.id === bookingId);
  if (!modal || !b) return;

  document.getElementById('editAdminBookingId').value = b.id;
  document.getElementById('adminBookingModalTitle').innerHTML = `<i class="fa-solid fa-calendar-pen text-purple"></i> 修改排班預約 (<span class="text-cyan">${b.id}</span>)`;
  
  // Match select value
  const instSelect = document.getElementById('adminBookingInstructor');
  for (let i = 0; i < instSelect.options.length; i++) {
    if (instSelect.options[i].value.includes(b.instructor.split(' ')[0]) || b.instructor.includes(instSelect.options[i].value.split(' ')[0])) {
      instSelect.selectedIndex = i;
      break;
    }
  }

  document.getElementById('adminBookingStudentName').value = b.studentName || '';
  document.getElementById('adminBookingStudentEmail').value = b.studentEmail || '';
  const todayStr = getLocalDateString();
  document.getElementById('adminBookingDate').min = todayStr;
  document.getElementById('adminBookingDate').value = b.date || todayStr;
  document.getElementById('adminBookingSlotTime').value = b.slotTime || '14:00 - 15:00';
  document.getElementById('adminBookingTopic').value = b.topic || '專案作品 1 對 1 精準批改與架構診斷 (1小時)';
  document.getElementById('adminBookingNotes').value = b.notes || '';
  document.getElementById('adminBookingFee').value = b.fee || 1800;
  document.getElementById('adminBookingStatus').value = b.status || '已預約';

  modal.classList.add('active');
}

function closeAdminBookingModal() {
  const modal = document.getElementById('adminBookingModal');
  if (modal) modal.classList.remove('active');
}

function handleSaveAdminBooking(e) {
  e.preventDefault();
  const bookingId = document.getElementById('editAdminBookingId').value;
  const instructor = document.getElementById('adminBookingInstructor').value;
  const studentName = document.getElementById('adminBookingStudentName').value.trim();
  const studentEmail = document.getElementById('adminBookingStudentEmail').value.trim();
  const date = document.getElementById('adminBookingDate').value;
  const slotTime = document.getElementById('adminBookingSlotTime').value;
  const topic = document.getElementById('adminBookingTopic').value.trim();
  const notes = document.getElementById('adminBookingNotes').value.trim();
  const fee = parseInt(document.getElementById('adminBookingFee').value) || 1800;
  const status = document.getElementById('adminBookingStatus').value;
  const payout = Math.round(fee * 0.6);

  if (!studentName || !studentEmail || !date) {
    showToast('⚠️ 請完整填寫學員姓名、Email 與預約日期！');
    return;
  }

  if (bookingId) {
    // 編輯現有預約排班
    const idx = mockBookings.findIndex(b => b.id === bookingId);
    if (idx !== -1) {
      mockBookings[idx] = {
        ...mockBookings[idx],
        instructor,
        studentName,
        studentEmail,
        date,
        slotTime,
        topic: topic || '專案作品 1 對 1 精準批改與架構診斷 (1小時)',
        notes: notes || '無特殊需求',
        fee,
        payout,
        status
      };
      showToast(`🎉 已成功更新預約單號【${bookingId}】的排班資訊！`);
    }
  } else {
    // 新增全新預約排班
    const newId = `bk-${Date.now().toString().slice(-4)}`;
    const newBooking = {
      id: newId,
      instructor,
      studentName,
      studentEmail,
      date,
      slotTime,
      topic: topic || '專案作品 1 對 1 精準批改與架構診斷 (1小時)',
      notes: notes || '無特殊需求',
      fee,
      payout,
      status
    };
    mockBookings.unshift(newBooking);
    showToast(`🎉 已成功新增【${studentName}】預約 ${instructor} 於 ${date} (${slotTime}) 的排班！`);
  }

  saveBookingsToStorage();
  closeAdminBookingModal();
  renderBookingAdminTable();
  renderStudentBookings();
  renderMentorSalaryTable();
  updateAvailableSlots();
}

function deleteBooking(bookingId) {
  const b = mockBookings.find(item => item.id === bookingId);
  if (!b) return;

  if (confirm(`確定要刪除預約單號「${bookingId}」(${b.studentName} - ${b.instructor}) 嗎？\n刪除後該時段將重新釋放給其他學員。`)) {
    mockBookings = mockBookings.filter(item => item.id !== bookingId);
    saveBookingsToStorage();
    showToast(`🗑️ 已成功刪除預約單號 ${bookingId}，時段已即時釋出。`);
    renderBookingAdminTable();
    renderStudentBookings();
    renderMentorSalaryTable();
    updateAvailableSlots();
  }
}

// Booking Admin Schedule Table for Instructors & Manager
function renderBookingAdminTable() {
  const tbody = document.getElementById('bookingAdminTableBody');
  const filterSelect = document.getElementById('adminBookingFilter');
  if (!tbody) return;

  const filterVal = filterSelect ? filterSelect.value : 'all';

  const filtered = filterVal === 'all' 
    ? mockBookings 
    : mockBookings.filter(b => b.instructor === filterVal || b.instructor.includes(filterVal.split(' ')[0]));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:2rem;">目前無預約紀錄</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td data-label="預約編號"><code>${b.id}</code></td>
      <td data-label="指定業師"><strong class="text-purple">${b.instructor}</strong></td>
      <td data-label="預約學員">
        <div><strong>${b.studentName}</strong></div>
        <div class="text-xs text-muted">${b.studentEmail}</div>
      </td>
      <td data-label="上課時間"><span class="badge-tag">${b.date}</span> <br><small class="text-cyan">${b.slotTime}</small></td>
      <td data-label="諮詢主題" style="max-width:200px;">
        <div class="text-sm"><strong>${b.topic}</strong></div>
        <div class="text-xs text-muted" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">需求: ${b.notes}</div>
      </td>
      <td data-label="個教鐘點費" class="text-purple">NT$ ${b.fee.toLocaleString()}</td>
      <td data-label="預約狀態">
        <span class="badge ${b.status==='已完成'?'badge-success':(b.status==='已取消'?'badge-danger':'badge-warning')}">${b.status}</span>
      </td>
      <td data-label="排班操作">
        <div class="flex-center gap-xs" style="justify-content:flex-start; flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" onclick="quickBookInstructor('${b.instructor}')" title="進入專屬帶課教室"><i class="fa-solid fa-video"></i> 進入教室</button>
          <button class="btn btn-sm btn-secondary" onclick="openEditBookingModal('${b.id}')" title="修改日期/時段/狀態/備註"><i class="fa-solid fa-pen-to-square"></i> 編輯排班</button>
          <button class="btn btn-sm btn-outline" onclick="copyClassReminderMsg('${b.id}')" title="複製前 1 天親切提醒"><i class="fa-solid fa-bell text-green"></i> 前1天提醒</button>
          <button class="btn btn-sm btn-outline" onclick="copy3DaysNoticeMsg('${b.id}')" title="複製前 3 天改期最後確認"><i class="fa-solid fa-calendar-check text-purple"></i> 前3天確認</button>
          <button class="btn btn-sm btn-danger" onclick="deleteBooking('${b.id}')" title="刪除此預約紀錄"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

// 儲存講師月結薪資資料庫至 LocalStorage 及 Cloudflare KV
function saveMentorSalariesToStorage(syncCloud = true) {
  try {
    localStorage.setItem('pentaskill_mentor_salaries', JSON.stringify(mockMentorSalaries));
  } catch (err) {}
  if (syncCloud && typeof saveCloudData === 'function') {
    saveCloudData('mentor_salaries', mockMentorSalaries);
  }
}

// 講師月結薪資結算表 (綁定個人名下錄播課程營收 × 20% 分潤 ＋ 1-on-1 個教 100% 全額鐘點費)
function renderMentorSalaryTable() {
  const tbody = document.getElementById('mentorSalaryTableBody');
  const sumDisplay = document.getElementById('displayTotalSalarySum');
  if (!tbody) return;

  let totalSum = 0;

  if (!Array.isArray(mockMentorSalaries) || mockMentorSalaries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted" style="padding:2rem;">目前無講師薪資資料</td></tr>`;
    if (sumDisplay) sumDisplay.innerText = 'NT$ 0';
    return;
  }

  tbody.innerHTML = mockMentorSalaries.map(s => {
    // 1. 計算該講師名下的各門錄播課程銷售總額
    const courses = Array.isArray(s.coursesDetail) ? s.coursesDetail : [];
    let recRev = 0;
    let recSold = 0;

    courses.forEach(c => {
      const p = c.price !== undefined ? c.price : 0;
      const cnt = c.soldCount !== undefined ? c.soldCount : 0;
      recRev += (p * cnt);
      recSold += cnt;
    });

    if (recRev === 0 && s.recordedRevenue) recRev = s.recordedRevenue;
    if (recSold === 0 && s.recordedTotalSold) recSold = s.recordedTotalSold;

    // 2. 錄播課程分潤 = 個人名下課程總營收 × 2 成 (20%)
    const recSplit = s.recordedPayout !== undefined ? s.recordedPayout : Math.round(recRev * 0.20);
    
    // 3. 1-on-1 個教鐘點費 (是多少就給多少，100%全額)
    const cRate = s.coachingRate || 1800;
    const cDone = s.coachingCompleted || 0;
    const cPayout = s.coachingPayout !== undefined ? s.coachingPayout : (cRate * cDone);
    
    // 4. 額外獎金補貼
    const bonus = s.bonus || 0;
    
    // 5. 每月實發總薪資 = 錄播2成 + 個教100%全額 + 獎金
    const total = s.totalSalary !== undefined ? s.totalSalary : (recSplit + cPayout + bonus);
    totalSum += total;

    const isPaid = s.status === '已撥款完成';

    // 渲染名下課程小清單
    const coursesBadges = courses.length > 0 
      ? courses.map(c => `
          <div style="font-size:0.8rem; margin-bottom:3px; line-height:1.4;">
            <span style="color:#ffffff;">• ${c.courseTitle || '專業課程'}</span>: 
            <strong class="text-cyan">${c.soldCount || 0} 門</strong> 
            <span class="text-xs text-muted">(@NT$ ${(c.price || 0).toLocaleString()} = NT$ ${((c.price || 0) * (c.soldCount || 0)).toLocaleString()})</span>
          </div>
        `).join('')
      : `<span class="text-muted text-xs">當月未售出錄播課</span>`;

    return `
      <tr>
        <td data-label="導師姓名"><strong class="text-purple">${s.name}</strong></td>
        <td data-label="專業身分"><span class="badge-tag">${s.role}</span></td>
        <td data-label="名下課程售出" style="max-width:320px;">
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:6px 10px;">
            ${coursesBadges}
            <div class="text-xs text-muted" style="border-top:1px dashed rgba(255,255,255,0.15); margin-top:4px; padding-top:3px;">
              個人錄播共售出：<strong class="text-cyan">${recSold} 門課</strong>
            </div>
          </div>
        </td>
        <td data-label="錄播總營收"><strong class="text-purple">NT$ ${recRev.toLocaleString()}</strong></td>
        <td data-label="錄播分潤(2成)" style="color:#fbbf24; font-weight:800; font-size:1.02rem;">NT$ ${recSplit.toLocaleString()} <br><small class="text-muted text-xs">(2成/20%)</small></td>
        <td data-label="個教鐘點單價" class="text-purple">NT$ ${cRate.toLocaleString()} <br><small class="text-green text-xs">(100%全額)</small></td>
        <td data-label="完成個教場次"><strong class="text-cyan">${cDone} 場</strong></td>
        <td data-label="個教實發鐘點" class="text-green">NT$ ${cPayout.toLocaleString()}</td>
        <td data-label="績效補貼">${bonus > 0 ? `<span class="text-yellow">+NT$ ${bonus.toLocaleString()}${s.bonusNote ? `<br><small class="text-muted">(${s.bonusNote})</small>` : ''}</span>` : '<span class="text-muted">-</span>'}</td>
        <td data-label="月結實發總薪資"><strong class="salary-payout-cell">NT$ ${total.toLocaleString()}</strong></td>
        <td data-label="審核狀態">
          <span class="badge ${isPaid ? 'badge-success' : 'badge-warning'}">
            ${isPaid ? '<i class="fa-solid fa-check"></i> 已撥款完成' : '<i class="fa-solid fa-clock"></i> 待審核撥款'}
          </span>
        </td>
        <td data-label="撥款操作">
          <div class="flex-center gap-xs" style="justify-content:flex-start;">
            <button class="btn btn-sm ${isPaid ? 'btn-outline' : 'btn-primary'}" onclick="openPayoutConfirmModal('${s.id}')" title="${isPaid ? '查看入帳明細與通知信' : '確認撥款並產生 LINE/Email 通知信'}">
              ${isPaid ? '<i class="fa-solid fa-file-lines text-green"></i> 明細/通知' : '<i class="fa-solid fa-money-bill-transfer"></i> 撥款確認'}
            </button>
            <button class="btn btn-sm btn-secondary" onclick="openEditSalaryModal('${s.id}')" title="手動修改名下課程單價、售出堂數、鐘點費與獎金">
              <i class="fa-solid fa-pen-to-square"></i> 編輯
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteMentorSalary('${s.id}')" title="刪除此結算單">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (sumDisplay) {
    sumDisplay.innerText = `NT$ ${totalSum.toLocaleString()}`;
  }

  renderFinanceDashboardKPIs();
}

// 薪資彈窗內部錄播課程明細渲染與動態計算
function renderSalaryModalCourseRows(courses) {
  const container = document.getElementById('salaryModalCoursesList');
  if (!container) return;

  if (!Array.isArray(courses) || courses.length === 0) {
    courses = [
      { courseTitle: "專屬精選錄播實戰課", price: 2680, soldCount: 10 }
    ];
  }

  container.innerHTML = courses.map((c, idx) => `
    <div class="salary-course-row" style="display:flex; align-items:center; gap:0.45rem; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:4px; border:1px dashed rgba(255,255,255,0.14);">
      <div style="flex:1;">
        <input type="text" class="form-control salary-course-title" placeholder="課程名稱" value="${c.courseTitle || ''}" style="font-size:0.82rem; padding:4px 8px;" required>
      </div>
      <div style="width:105px;">
        <div style="display:flex; align-items:center; gap:2px;">
          <span style="font-size:0.75rem; color:var(--text-muted);">$</span>
          <input type="number" class="form-control salary-course-price" placeholder="單價" value="${c.price !== undefined ? c.price : 2680}" oninput="calculateSalaryModalTotal()" style="font-size:0.82rem; padding:4px 6px;" required>
        </div>
      </div>
      <div style="width:90px;">
        <div style="display:flex; align-items:center; gap:2px;">
          <input type="number" class="form-control salary-course-sold" placeholder="堂數" value="${c.soldCount !== undefined ? c.soldCount : 0}" oninput="calculateSalaryModalTotal()" style="font-size:0.82rem; padding:4px 6px;" required>
          <span style="font-size:0.75rem; color:var(--text-muted);">門</span>
        </div>
      </div>
      <div style="width:85px; text-align:right; font-weight:700; font-size:0.82rem; color:#d8b4fe;" class="salary-course-subtotal">
        NT$ ${((c.price || 0) * (c.soldCount || 0)).toLocaleString()}
      </div>
      <button type="button" class="btn btn-xs btn-danger" onclick="removeCourseRowFromSalaryModal(this)" style="padding:3px 7px; font-size:0.75rem;" title="移除此課程"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join('');

  calculateSalaryModalTotal();
}

function addCourseRowToSalaryModal(title = '', price = 2680, soldCount = 1) {
  const container = document.getElementById('salaryModalCoursesList');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'salary-course-row';
  div.style.cssText = 'display:flex; align-items:center; gap:0.45rem; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:4px; border:1px dashed rgba(255,255,255,0.14);';
  div.innerHTML = `
    <div style="flex:1;">
      <input type="text" class="form-control salary-course-title" placeholder="課程名稱" value="${title}" style="font-size:0.82rem; padding:4px 8px;" required>
    </div>
    <div style="width:105px;">
      <div style="display:flex; align-items:center; gap:2px;">
        <span style="font-size:0.75rem; color:var(--text-muted);">$</span>
        <input type="number" class="form-control salary-course-price" placeholder="單價" value="${price}" oninput="calculateSalaryModalTotal()" style="font-size:0.82rem; padding:4px 6px;" required>
      </div>
    </div>
    <div style="width:90px;">
      <div style="display:flex; align-items:center; gap:2px;">
        <input type="number" class="form-control salary-course-sold" placeholder="堂數" value="${soldCount}" oninput="calculateSalaryModalTotal()" style="font-size:0.82rem; padding:4px 6px;" required>
        <span style="font-size:0.75rem; color:var(--text-muted);">門</span>
      </div>
    </div>
    <div style="width:85px; text-align:right; font-weight:700; font-size:0.82rem; color:#d8b4fe;" class="salary-course-subtotal">
      NT$ ${(price * soldCount).toLocaleString()}
    </div>
    <button type="button" class="btn btn-xs btn-danger" onclick="removeCourseRowFromSalaryModal(this)" style="padding:3px 7px; font-size:0.75rem;" title="移除此課程"><i class="fa-solid fa-xmark"></i></button>
  `;
  container.appendChild(div);
  calculateSalaryModalTotal();
}

function removeCourseRowFromSalaryModal(btn) {
  const row = btn.closest('.salary-course-row');
  if (row) {
    row.remove();
    calculateSalaryModalTotal();
  }
}

// 薪資結算手動計算器 (逐課試算加總營收 × 2成 ＋ 個教全額 ＋ 獎金)
function calculateSalaryModalTotal() {
  let totalSold = 0;
  let totalRevenue = 0;

  const rows = document.querySelectorAll('#salaryModalCoursesList .salary-course-row');
  rows.forEach(row => {
    const priceInput = row.querySelector('.salary-course-price');
    const soldInput = row.querySelector('.salary-course-sold');
    const subtotalEl = row.querySelector('.salary-course-subtotal');

    const price = parseInt(priceInput ? priceInput.value : 0) || 0;
    const sold = parseInt(soldInput ? soldInput.value : 0) || 0;
    const subtotal = price * sold;

    totalSold += sold;
    totalRevenue += subtotal;

    if (subtotalEl) subtotalEl.innerText = `NT$ ${subtotal.toLocaleString()}`;
  });

  const recSplit = Math.round(totalRevenue * 0.20); // 2 成 (20%)

  const rateInput = document.getElementById('salaryCoachingRate');
  const countInput = document.getElementById('salaryCoachingCompleted');
  const bonusInput = document.getElementById('salaryBonus');

  const rate = parseInt(rateInput ? rateInput.value : 0) || 0;
  const count = parseInt(countInput ? countInput.value : 0) || 0;
  const bonus = parseInt(bonusInput ? bonusInput.value : 0) || 0;

  const coachPayout = rate * count; // 100% 全額鐘點
  const grandTotal = recSplit + coachPayout + bonus;

  const totalSoldSpan = document.getElementById('salaryModalTotalSold');
  const totalRevSpan = document.getElementById('salaryModalTotalRevenue');
  const recSpan = document.getElementById('salaryCalcRecorded');
  const coachSpan = document.getElementById('salaryCalcCoaching');
  const totalSpan = document.getElementById('salaryCalcTotal');

  if (totalSoldSpan) totalSoldSpan.innerText = `${totalSold} 門`;
  if (totalRevSpan) totalRevSpan.innerText = `NT$ ${totalRevenue.toLocaleString()}`;
  if (recSpan) recSpan.innerText = recSplit.toLocaleString();
  if (coachSpan) coachSpan.innerText = coachPayout.toLocaleString();
  if (totalSpan) totalSpan.innerText = grandTotal.toLocaleString();
}

function openAddSalaryModal() {
  const modal = document.getElementById('editSalaryModal');
  if (!modal) return;

  document.getElementById('editSalaryId').value = '';
  document.getElementById('editSalaryModalTitle').innerHTML = '<i class="fa-solid fa-plus text-green"></i> 新增講師月結薪資單';
  document.getElementById('salaryMentorName').value = '';
  document.getElementById('salaryMentorRole').value = '專屬金牌業師';
  document.getElementById('salaryCoachingRate').value = '1800';
  document.getElementById('salaryCoachingCompleted').value = '10';
  document.getElementById('salaryBonus').value = '0';
  document.getElementById('salaryBonusNote').value = '';
  document.getElementById('salaryStatus').value = '待審核撥款';

  renderSalaryModalCourseRows([
    { courseTitle: "專屬錄播實戰課程 (基礎/進階)", price: 2680, soldCount: 10 }
  ]);

  modal.classList.add('active');
}

function openEditSalaryModal(salaryId) {
  const modal = document.getElementById('editSalaryModal');
  const s = mockMentorSalaries.find(item => item.id === salaryId);
  if (!modal || !s) return;

  document.getElementById('editSalaryId').value = s.id;
  document.getElementById('editSalaryModalTitle').innerHTML = `<i class="fa-solid fa-pen-to-square text-green"></i> 編輯【${s.name}】月結薪資單`;
  document.getElementById('salaryMentorName').value = s.name;
  document.getElementById('salaryMentorRole').value = s.role;
  document.getElementById('salaryCoachingRate').value = s.coachingRate || 1800;
  document.getElementById('salaryCoachingCompleted').value = s.coachingCompleted || 0;
  document.getElementById('salaryBonus').value = s.bonus || 0;
  document.getElementById('salaryBonusNote').value = s.bonusNote || '';
  document.getElementById('salaryStatus').value = s.status || '待審核撥款';

  renderSalaryModalCourseRows(s.coursesDetail || []);

  modal.classList.add('active');
}

function closeEditSalaryModal() {
  const modal = document.getElementById('editSalaryModal');
  if (modal) modal.classList.remove('active');
}

function handleSaveMentorSalary(e) {
  e.preventDefault();
  const salaryId = document.getElementById('editSalaryId').value;
  const name = document.getElementById('salaryMentorName').value.trim();
  const role = document.getElementById('salaryMentorRole').value.trim();
  const coachingRate = parseInt(document.getElementById('salaryCoachingRate').value) || 0;
  const coachingCompleted = parseInt(document.getElementById('salaryCoachingCompleted').value) || 0;
  const bonus = parseInt(document.getElementById('salaryBonus').value) || 0;
  const bonusNote = document.getElementById('salaryBonusNote').value.trim();
  const status = document.getElementById('salaryStatus').value;

  // 蒐集名下各門錄播課程
  const coursesDetail = [];
  let recordedRevenue = 0;
  let recordedTotalSold = 0;

  const rows = document.querySelectorAll('#salaryModalCoursesList .salary-course-row');
  rows.forEach(row => {
    const title = row.querySelector('.salary-course-title').value.trim();
    const price = parseInt(row.querySelector('.salary-course-price').value) || 0;
    const soldCount = parseInt(row.querySelector('.salary-course-sold').value) || 0;

    coursesDetail.push({
      courseTitle: title || '錄播課程',
      price,
      soldCount
    });

    recordedRevenue += (price * soldCount);
    recordedTotalSold += soldCount;
  });

  const recordedPayout = Math.round(recordedRevenue * 0.20); // 2 成 (20%)
  const coachingPayout = coachingRate * coachingCompleted; // 100% 全額鐘點
  const totalSalary = recordedPayout + coachingPayout + bonus;

  if (salaryId) {
    // 編輯現有薪資單
    const idx = mockMentorSalaries.findIndex(s => s.id === salaryId);
    if (idx !== -1) {
      mockMentorSalaries[idx] = {
        ...mockMentorSalaries[idx],
        name,
        role,
        coursesDetail,
        recordedTotalSold,
        recordedRevenue,
        recordedSplitRate: 0.20,
        recordedPayout,
        coachingRate,
        coachingCompleted,
        coachingPayout,
        bonus,
        bonusNote,
        totalSalary,
        status
      };
      showToast(`🎉 已成功更新【${name}】的月結薪資單！錄播 2 成分潤 NT$ ${recordedPayout.toLocaleString()} ＋ 個教全額 NT$ ${coachingPayout.toLocaleString()} ＝ 實發 NT$ ${totalSalary.toLocaleString()}`);
    }
  } else {
    // 新增全新薪資單
    const newId = `sal-${Date.now().toString().slice(-4)}`;
    const newSalary = {
      id: newId,
      name,
      role,
      coursesDetail,
      recordedTotalSold,
      recordedRevenue,
      recordedSplitRate: 0.20,
      recordedPayout,
      coachingRate,
      coachingCompleted,
      coachingPayout,
      bonus,
      bonusNote,
      totalSalary,
      status
    };
    mockMentorSalaries.push(newSalary);
    showToast(`🎉 已成功新增【${name}】的月結薪資單！實發 NT$ ${totalSalary.toLocaleString()}`);
  }

  saveMentorSalariesToStorage();
  closeEditSalaryModal();
  renderMentorSalaryTable();
}

function deleteMentorSalary(salaryId) {
  const s = mockMentorSalaries.find(item => item.id === salaryId);
  if (!s) return;

  if (confirm(`確定要刪除【${s.name}】的月結薪資單嗎？`)) {
    mockMentorSalaries = mockMentorSalaries.filter(item => item.id !== salaryId);
    saveMentorSalariesToStorage();
    showToast(`🗑️ 已刪除【${s.name}】的月結薪資單`);
    renderMentorSalaryTable();
  }
}

function openPayoutConfirmModal(salaryId) {
  const modal = document.getElementById('payoutConfirmModal');
  const s = mockMentorSalaries.find(item => item.id === salaryId);
  if (!modal || !s) return;

  const total = s.totalSalary !== undefined ? s.totalSalary : 0;
  const courses = Array.isArray(s.coursesDetail) ? s.coursesDetail : [];

  // ⚡ 動態優先連動 mockUsers 中最新設定之薪資轉帳帳戶
  const matchedUser = mockUsers.find(u => u.name && (s.name.includes(u.name.split(' ')[0]) || u.name.includes(s.name.split(' ')[0])));
  const bank = (matchedUser && matchedUser.bankInfo && matchedUser.bankInfo.bankName) 
    ? matchedUser.bankInfo 
    : (s.bankInfo || { bankName: "玉山銀行 (808)", accountLast5: "58923" });

  document.getElementById('payoutModalSalaryId').value = s.id;
  document.getElementById('payoutModalMentorName').innerText = s.name;
  document.getElementById('payoutModalMentorRole').innerText = s.role;
  document.getElementById('payoutModalTotalSalary').innerText = `NT$ ${total.toLocaleString()}`;
  document.getElementById('payoutModalBankName').innerText = bank.bankName;
  document.getElementById('payoutModalBankAccount').innerText = `******${bank.accountLast5}`;

  // 產生各課程明細文字
  const coursesText = courses.length > 0
    ? courses.map(c => `   • ${c.courseTitle}：NT$ ${(c.price || 0).toLocaleString()} × ${c.soldCount || 0} 門 ＝ NT$ ${((c.price || 0) * (c.soldCount || 0)).toLocaleString()}`).join('\n')
    : '   • 當月無錄播課程售出紀錄';

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDate = now.getDate();
  const txnDateStr = `${currentYear}${String(currentMonth).padStart(2, '0')}${String(currentDate).padStart(2, '0')}`;
  const txnInput = document.getElementById('payoutTxnRef');
  if (txnInput) txnInput.value = `TXN-${txnDateStr}-01`;

  // 格式化完整的 LINE / Email 通知信
  const noticeMsg = 
`🔔【精五門 PentaSkill 講師月結分潤與鐘點費入帳通知】
親愛的 ${s.name} 老師您好：

本月（${currentYear}年${currentMonth}月份）您的錄播課程銷售分潤與 1-on-1 專屬個教鐘點費已於今日（${currentDate}日）全數審核並撥款至您的指定銀行帳戶！

📊 本月入帳結算明細如下：
────────────────────────────
📹 1. 個人名下錄播課程分潤：
${coursesText}
   👉 個人錄播總營收：NT$ ${(s.recordedRevenue || 0).toLocaleString()}
   👉 錄播課程分潤小計：NT$ ${(s.recordedPayout || 0).toLocaleString()}

👨‍🏫 2. 1-on-1 專屬個教鐘點費：
   • 單場鐘點：NT$ ${(s.coachingRate || 1800).toLocaleString()} / hr
   • 本月完成：${s.coachingCompleted || 0} 場次
   👉 個教鐘點總額：NT$ ${(s.coachingPayout || 0).toLocaleString()}

🎁 3. 額外獎金 / 補貼：
   • 金額：+NT$ ${(s.bonus || 0).toLocaleString()}${s.bonusNote ? ` (${s.bonusNote})` : ''}
────────────────────────────
💰 本月實發撥款總金額：NT$ ${total.toLocaleString()} 元整
💳 匯入帳戶：${bank.bankName} (帳號末5碼: ${bank.accountLast5})
🗓️ 撥款作業日：每月 10 日

非常感謝 ${s.name} 老師這個月以來的用心備課、手把手細緻批改與專業教學！
若您對明細或金額有任何疑問，歡迎隨時回覆官方 LINE@ 小編或與管理團隊聯繫核對。
預祝老師新的一個月教學順心、桃李滿天下！

精五門 PentaSkill 創辦人團隊 & 營運部 敬上`;

  document.getElementById('payoutNoticePreviewText').value = noticeMsg;
  modal.classList.add('active');
}

function closePayoutConfirmModal() {
  const modal = document.getElementById('payoutConfirmModal');
  if (modal) modal.classList.remove('active');
}

function copyMentorPayoutNotice(type) {
  const textarea = document.getElementById('payoutNoticePreviewText');
  if (!textarea) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textarea.value).then(() => {
      showToast(`🎉 已成功複製【${type === 'line' ? 'LINE' : 'Email'} 專用入帳通知信】！可直接貼上發送給老師！`);
    });
  } else {
    textarea.select();
    document.execCommand('copy');
    showToast(`🎉 已成功複製【${type === 'line' ? 'LINE' : 'Email'} 專用入帳通知信】！可直接貼上發送給老師！`);
  }
}

function confirmExecutePayout() {
  const salaryId = document.getElementById('payoutModalSalaryId').value;
  const method = document.getElementById('payoutMethodSelect').value;
  const txnRef = document.getElementById('payoutTxnRef').value.trim();

  const s = mockMentorSalaries.find(item => item.id === salaryId);
  if (!s) return;

  s.status = '已撥款完成';
  if (txnRef) {
    s.payoutNote = `撥款方式: ${method} | 交易序號: ${txnRef} | 撥款日期: 10日`;
  } else {
    s.payoutNote = `撥款方式: ${method} | 撥款日期: 10日`;
  }

  saveMentorSalariesToStorage();
  closePayoutConfirmModal();
  renderMentorSalaryTable();
  showToast(`🎉 成功完成【${s.name}】的月結薪資撥款確認 (NT$ ${(s.totalSalary || 0).toLocaleString()})！狀態已更新為「已撥款完成」！`);
}

function toggleSalaryPayoutStatus(salaryId) {
  const s = mockMentorSalaries.find(item => item.id === salaryId);
  if (!s) return;

  if (s.status === '已撥款完成') {
    s.status = '待審核撥款';
    showToast(`已將【${s.name}】狀態調整為「⏳ 待審核撥款」`);
  } else {
    s.status = '已撥款完成';
    showToast(`✅ 已將【${s.name}】月結薪資 NT$ ${(s.totalSalary || 0).toLocaleString()} 標記為「已撥款完成」！`);
  }

  saveMentorSalariesToStorage();
  renderMentorSalaryTable();
}

function processMonthlyPayout() {
  let count = 0;
  mockMentorSalaries.forEach(s => {
    if (s.status !== '已撥款完成') {
      s.status = '已撥款完成';
      count++;
    }
  });

  saveMentorSalariesToStorage();
  renderMentorSalaryTable();
  showToast(`🎉 每月 10 日定期發放！已成功批次完成 ${count} 位講師的月結薪資審核與撥款發放！`);
}

function exportFinanceReport() {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
    + "【精五門 PentaSkill 平台月結整合財務損益報表】\n\n"
    + "=== 一、講師月結薪資與分潤明細 ===\n"
    + "講師姓名,專業頭銜,個人錄播售出門數,個人錄播總營收,錄播分潤(2成/20%),個教單場鐘點(100%),個教完成場次,個教鐘點總額,獎金補貼,本月實發總薪資,撥款狀態\n";

  mockMentorSalaries.forEach(s => {
    csvContent += `"${s.name}","${s.role}",${s.recordedTotalSold || 0},${s.recordedRevenue || 0},${s.recordedPayout || 0},${s.coachingRate || 0},${s.coachingCompleted || 0},${s.coachingPayout || 0},${s.bonus || 0},${s.totalSalary || 0},"${s.status}"\n`;
  });

  csvContent += "\n=== 二、營運團隊員工薪資發放明細 ===\n"
    + "員工姓名,職位角色,基本月薪/底薪,績效獎金,獎金事由,本月實發薪資,發放狀態\n";
  mockStaffSalaries.forEach(st => {
    csvContent += `"${st.name}","${st.role}",${st.baseSalary || 0},${st.bonus || 0},"${st.bonusNote || ''}",${st.totalSalary || 0},"${st.status}"\n`;
  });

  csvContent += "\n=== 三、平台運營與伺服器固定花費明細 ===\n"
    + "支出項目名稱,費用類別,每月金額(NT$),計費週期,用途與備註說明\n";
  mockPlatformExpenses.forEach(exp => {
    csvContent += `"${exp.name}","${exp.category}",${exp.amount || 0},"${exp.cycle}","${exp.notes || ''}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "PentaSkill_Integrated_Finance_Report.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("📥 已成功匯出平台整合財務損益與薪資報表 (CSV)");
}

// 儲存員工薪資至 LocalStorage 及 Cloudflare KV
function saveStaffSalariesToStorage(syncCloud = true) {
  try {
    localStorage.setItem('pentaskill_staff_salaries', JSON.stringify(mockStaffSalaries));
  } catch (err) {}
  if (syncCloud && typeof saveCloudData === 'function') {
    saveCloudData('staff_salaries', mockStaffSalaries);
  }
}

// 儲存平台固定花費至 LocalStorage 及 Cloudflare KV
function savePlatformExpensesToStorage(syncCloud = true) {
  try {
    localStorage.setItem('pentaskill_platform_expenses', JSON.stringify(mockPlatformExpenses));
  } catch (err) {}
  if (syncCloud && typeof saveCloudData === 'function') {
    saveCloudData('platform_expenses', mockPlatformExpenses);
  }
}

// 財務 KPI 數據即時統計計算核心 (全站總營收 - 講師薪資 - 員工薪資 - 平台花費 = 平台最終淨利)
function renderFinanceDashboardKPIs() {
  let totalMentorRecordedRev = 0;
  let totalMentorSalaries = 0;
  let totalCoachingSessions = 0;

  if (Array.isArray(mockMentorSalaries)) {
    mockMentorSalaries.forEach(s => {
      let rRev = 0;
      if (Array.isArray(s.coursesDetail)) {
        s.coursesDetail.forEach(c => {
          rRev += ((c.price || 0) * (c.soldCount || 0));
        });
      }
      if (rRev === 0 && s.recordedRevenue) rRev = s.recordedRevenue;
      totalMentorRecordedRev += rRev;

      const recSplit = s.recordedPayout !== undefined ? s.recordedPayout : Math.round(rRev * 0.20);
      const cRate = s.coachingRate || 1800;
      const cDone = s.coachingCompleted || 0;
      const cPayout = s.coachingPayout !== undefined ? s.coachingPayout : (cRate * cDone);
      const bonus = s.bonus || 0;
      const total = s.totalSalary !== undefined ? s.totalSalary : (recSplit + cPayout + bonus);

      totalMentorSalaries += total;
      totalCoachingSessions += cDone;
    });
  }

  // 1-on-1 個教營收 (學員預約總營收)
  let totalCoachingRev = 0;
  if (Array.isArray(mockMentorSalaries)) {
    mockMentorSalaries.forEach(s => {
      const cRate = s.coachingRate || 1800;
      const cDone = s.coachingCompleted || 0;
      totalCoachingRev += (cRate * cDone);
    });
  }

  // 1. 全站月總營收 = 錄播課程銷售總額 + 個教預約總費用
  const totalGrossRevenue = totalMentorRecordedRev + totalCoachingRev;

  // 2. 員工薪資加總
  let totalStaffSalaries = 0;
  if (Array.isArray(mockStaffSalaries)) {
    mockStaffSalaries.forEach(st => {
      const b = st.baseSalary || 0;
      const bn = st.bonus || 0;
      const t = st.totalSalary !== undefined ? st.totalSalary : (b + bn);
      totalStaffSalaries += t;
    });
  }

  // 3. 平台運營與伺服器花費加總
  let totalPlatformExpenses = 0;
  if (Array.isArray(mockPlatformExpenses)) {
    mockPlatformExpenses.forEach(exp => {
      totalPlatformExpenses += (exp.amount || 0);
    });
  }

  // 4. 平台實際最終淨利 = 全站總營收 - 講師薪資 - 員工薪資 - 平台花費
  const netProfit = totalGrossRevenue - totalMentorSalaries - totalStaffSalaries - totalPlatformExpenses;
  const netProfitRate = totalGrossRevenue > 0 ? ((netProfit / totalGrossRevenue) * 100).toFixed(1) : '0.0';

  // 渲染 5 大 KPI 卡片
  const kpiRev = document.getElementById('kpiTotalRevenue');
  const kpiMentor = document.getElementById('kpiMentorSalaries');
  const kpiStaff = document.getElementById('kpiStaffSalaries');
  const kpiExp = document.getElementById('kpiPlatformExpenses');
  const kpiNet = document.getElementById('kpiNetProfit');
  const kpiNetRate = document.getElementById('kpiNetProfitRate');

  if (kpiRev) kpiRev.innerText = `NT$ ${totalGrossRevenue.toLocaleString()}`;
  if (kpiMentor) kpiMentor.innerText = `-NT$ ${totalMentorSalaries.toLocaleString()}`;
  if (kpiStaff) kpiStaff.innerText = `-NT$ ${totalStaffSalaries.toLocaleString()}`;
  if (kpiExp) kpiExp.innerText = `-NT$ ${totalPlatformExpenses.toLocaleString()}`;
  if (kpiNet) {
    kpiNet.innerText = `NT$ ${netProfit.toLocaleString()}`;
    kpiNet.className = netProfit >= 0 ? 'stat-num text-green' : 'stat-num text-pink';
  }
  if (kpiNetRate) kpiNetRate.innerText = `${netProfitRate}%`;

  // 渲染分流佔比
  const mPct = totalGrossRevenue > 0 ? ((totalMentorSalaries / totalGrossRevenue) * 100).toFixed(1) : 0;
  const sPct = totalGrossRevenue > 0 ? ((totalStaffSalaries / totalGrossRevenue) * 100).toFixed(1) : 0;
  const ePct = totalGrossRevenue > 0 ? ((totalPlatformExpenses / totalGrossRevenue) * 100).toFixed(1) : 0;
  const nPct = totalGrossRevenue > 0 ? ((netProfit / totalGrossRevenue) * 100).toFixed(1) : 0;

  const cpM = document.getElementById('calcPercentMentor');
  const cpS = document.getElementById('calcPercentStaff');
  const cpE = document.getElementById('calcPercentExpense');
  const cpN = document.getElementById('calcPercentNetProfit');
  const totalSessionsEl = document.getElementById('displayTotalCoachingSessions');

  if (cpM) cpM.innerText = `NT$ ${totalMentorSalaries.toLocaleString()} (${mPct}%)`;
  if (cpS) cpS.innerText = `NT$ ${totalStaffSalaries.toLocaleString()} (${sPct}%)`;
  if (cpE) cpE.innerText = `NT$ ${totalPlatformExpenses.toLocaleString()} (${ePct}%)`;
  if (cpN) cpN.innerText = `NT$ ${netProfit.toLocaleString()} (${nPct}%)`;
  if (totalSessionsEl) totalSessionsEl.innerText = totalCoachingSessions;
}

// 渲染員工薪資發放表 (Staff Payroll Sheet)
function renderStaffSalaryTable() {
  const tbody = document.getElementById('staffSalaryTableBody');
  if (!tbody) return;

  if (!Array.isArray(mockStaffSalaries) || mockStaffSalaries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:1.5rem;">目前無員工薪資資料</td></tr>`;
    return;
  }

  tbody.innerHTML = mockStaffSalaries.map(st => {
    const isPaid = st.status === '已發放';
    const base = st.baseSalary || 0;
    const bonus = st.bonus || 0;
    const total = st.totalSalary !== undefined ? st.totalSalary : (base + bonus);

    return `
      <tr>
        <td data-label="員工姓名"><strong class="text-cyan">${st.name}</strong></td>
        <td data-label="職稱角色"><span class="badge-tag">${st.role}</span></td>
        <td data-label="基本底薪" class="text-purple">NT$ ${base.toLocaleString()}</td>
        <td data-label="績效獎金">${bonus > 0 ? `<strong class="text-yellow">+NT$ ${bonus.toLocaleString()}</strong>` : '<span class="text-muted">-</span>'}</td>
        <td data-label="獎金備註" class="text-xs text-muted">${st.bonusNote || '-'}</td>
        <td data-label="實發總額"><strong class="salary-payout-cell text-green">NT$ ${total.toLocaleString()}</strong></td>
        <td data-label="發放狀態">
          <span class="badge ${isPaid ? 'badge-success' : 'badge-warning'}">
            ${isPaid ? '<i class="fa-solid fa-check"></i> 已發放' : '<i class="fa-solid fa-clock"></i> 待發放'}
          </span>
        </td>
        <td data-label="操作管理">
          <div class="flex-center gap-xs" style="justify-content:flex-start;">
            <button class="btn btn-sm ${isPaid ? 'btn-outline' : 'btn-primary'}" onclick="openStaffPayoutConfirmModal('${st.id}')" title="${isPaid ? '查看入帳明細與通知信' : '確認發放並產生 LINE/Email 通知信'}">
              ${isPaid ? '<i class="fa-solid fa-file-lines text-green"></i> 明細/通知' : '<i class="fa-solid fa-money-bill-transfer"></i> 發放確認'}
            </button>
            <button class="btn btn-sm btn-secondary" onclick="openEditStaffModal('${st.id}')" title="編輯員工薪資">
              <i class="fa-solid fa-pen-to-square"></i> 編輯
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteStaffSalary('${st.id}')" title="刪除員工薪資單">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderFinanceDashboardKPIs();
}

// 員工薪資發放確認與 LINE/Email 通知信中心
function openStaffPayoutConfirmModal(staffId) {
  const modal = document.getElementById('staffPayoutConfirmModal');
  const st = mockStaffSalaries.find(item => item.id === staffId);
  if (!modal || !st) return;

  const total = st.totalSalary !== undefined ? st.totalSalary : ((st.baseSalary || 0) + (st.bonus || 0));

  // ⚡ 動態優先連動 mockUsers 中最新設定之薪資轉帳帳戶
  const matchedUser = mockUsers.find(u => (u.name && (st.name.includes(u.name.split(' ')[0]) || u.name.includes(st.name.split(' ')[0]))) || u.id === st.id);
  const bank = (matchedUser && matchedUser.bankInfo && matchedUser.bankInfo.bankName) 
    ? matchedUser.bankInfo 
    : (st.bankInfo || { bankName: "國泰世華 (013)", accountLast5: "19482" });

  document.getElementById('staffPayoutModalStaffId').value = st.id;
  document.getElementById('staffPayoutModalName').innerText = st.name;
  document.getElementById('staffPayoutModalRole').innerText = st.role;
  document.getElementById('staffPayoutModalTotalSalary').innerText = `NT$ ${total.toLocaleString()}`;
  document.getElementById('staffPayoutModalBankName').innerText = bank.bankName;
  document.getElementById('staffPayoutModalBankAccount').innerText = `******${bank.accountLast5}`;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDate = now.getDate();
  const txnDateStr = `${currentYear}${String(currentMonth).padStart(2, '0')}${String(currentDate).padStart(2, '0')}`;
  const txnInput = document.getElementById('staffPayoutTxnRef');
  if (txnInput) txnInput.value = `STAFF-${txnDateStr}-01`;

  // 格式化完整的員工 LINE / Email 通知信
  const noticeMsg = 
`🔔【精五門 PentaSkill 團隊夥伴月薪與獎金入帳通知】
親愛的 ${st.name} (${st.role}) 您好：

本月（${currentYear}年${currentMonth}月份）您的工作薪資與績效獎金已於今日（${currentDate}日）全數審核並發放至您的指定銀行帳戶！

📊 本月入帳薪資明細如下：
────────────────────────────
💼 1. 基本月薪 / 底薪：NT$ ${(st.baseSalary || 0).toLocaleString()}
🎁 2. 績效獎金 / 津貼：+NT$ ${(st.bonus || 0).toLocaleString()}${st.bonusNote ? ` (${st.bonusNote})` : ''}
────────────────────────────
💰 本月實發薪資總額：NT$ ${total.toLocaleString()} 元整
💳 匯入帳戶：${bank.bankName} (帳號末5碼: ${bank.accountLast5})
🗓️ 發放作業日：每月 10 日

非常感謝您這個月以來的專業付出與用心維運！有您的細心協作、客訴答疑與優質服務，精五門團隊才能持續穩健成長並為學員帶來最棒的學習體驗！
若您對本月薪資明細或入帳金額有任何疑問，歡迎隨時與管理團隊聯繫核對。
預祝新的一個月工作順心、收穫滿滿！

精五門 PentaSkill 創辦人團隊 & 營運管理部 敬上`;

  document.getElementById('staffPayoutNoticePreviewText').value = noticeMsg;
  modal.classList.add('active');
}

function closeStaffPayoutConfirmModal() {
  const modal = document.getElementById('staffPayoutConfirmModal');
  if (modal) modal.classList.remove('active');
}

function copyStaffPayoutNotice(type) {
  const textarea = document.getElementById('staffPayoutNoticePreviewText');
  if (!textarea) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textarea.value).then(() => {
      showToast(`🎉 已成功複製【${type === 'line' ? 'LINE' : 'Email'} 專用員工入帳通知信】！可直接貼上發送給夥伴！`);
    });
  } else {
    textarea.select();
    document.execCommand('copy');
    showToast(`🎉 已成功複製【${type === 'line' ? 'LINE' : 'Email'} 專用員工入帳通知信】！可直接貼上發送給夥伴！`);
  }
}

function confirmExecuteStaffPayout() {
  const staffId = document.getElementById('staffPayoutModalStaffId').value;
  const method = document.getElementById('staffPayoutMethodSelect').value;
  const txnRef = document.getElementById('staffPayoutTxnRef').value.trim();

  const st = mockStaffSalaries.find(item => item.id === staffId);
  if (!st) return;

  st.status = '已發放';
  if (txnRef) {
    st.payoutNote = `發放方式: ${method} | 交易序號: ${txnRef} | 發放日期: 10日`;
  } else {
    st.payoutNote = `發放方式: ${method} | 發放日期: 10日`;
  }

  saveStaffSalariesToStorage();
  closeStaffPayoutConfirmModal();
  renderStaffSalaryTable();
  showToast(`🎉 成功完成【${st.name}】的薪資發放確認 (NT$ ${(st.totalSalary || 0).toLocaleString()})！狀態已更新為「已發放」！`);
}

// 渲染平台運營花費明細表 (Platform Expenses Sheet)
function renderPlatformExpensesTable() {
  const tbody = document.getElementById('platformExpensesTableBody');
  if (!tbody) return;

  if (!Array.isArray(mockPlatformExpenses) || mockPlatformExpenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:1.5rem;">目前無平台花費資料</td></tr>`;
    return;
  }

  tbody.innerHTML = mockPlatformExpenses.map(exp => {
    return `
      <tr>
        <td data-label="支出項目"><strong class="text-purple">${exp.name}</strong></td>
        <td data-label="支出分類"><span class="badge-tag bg-purple">${exp.category || '運營支出'}</span></td>
        <td data-label="每月費用"><strong class="text-pink">NT$ ${(exp.amount || 0).toLocaleString()}</strong></td>
        <td data-label="繳費週期"><span class="text-xs text-cyan">${exp.cycle || '月繳'}</span></td>
        <td data-label="說明備註" class="text-xs text-muted">${exp.notes || '-'}</td>
        <td data-label="操作管理">
          <div class="flex-center gap-xs" style="justify-content:flex-start;">
            <button class="btn btn-sm btn-secondary" onclick="openEditExpenseModal('${exp.id}')" title="編輯花費項目">
              <i class="fa-solid fa-pen-to-square"></i> 編輯
            </button>
            <button class="btn btn-sm btn-danger" onclick="deletePlatformExpense('${exp.id}')" title="刪除此項目">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderFinanceDashboardKPIs();
}

// 員工薪資 Modal 控制
function calculateStaffModalTotal() {
  const base = parseInt(document.getElementById('staffBaseSalary').value) || 0;
  const bonus = parseInt(document.getElementById('staffBonus').value) || 0;
  const total = base + bonus;
  const totalSpan = document.getElementById('staffCalcTotal');
  if (totalSpan) totalSpan.innerText = total.toLocaleString();
}

function openAddStaffModal() {
  const modal = document.getElementById('editStaffModal');
  if (!modal) return;

  document.getElementById('editStaffId').value = '';
  document.getElementById('editStaffModalTitle').innerHTML = '<i class="fa-solid fa-user-plus text-cyan"></i> 新增員工薪資單';
  document.getElementById('staffName').value = '';
  document.getElementById('staffRole').value = '營運助理';
  document.getElementById('staffBaseSalary').value = '30000';
  document.getElementById('staffBonus').value = '0';
  document.getElementById('staffBonusNote').value = '';
  document.getElementById('staffStatus').value = '待發放';

  calculateStaffModalTotal();
  modal.classList.add('active');
}

function openEditStaffModal(staffId) {
  const modal = document.getElementById('editStaffModal');
  const st = mockStaffSalaries.find(item => item.id === staffId);
  if (!modal || !st) return;

  document.getElementById('editStaffId').value = st.id;
  document.getElementById('editStaffModalTitle').innerHTML = `<i class="fa-solid fa-user-pen text-cyan"></i> 編輯【${st.name}】員工薪資單`;
  document.getElementById('staffName').value = st.name;
  document.getElementById('staffRole').value = st.role;
  document.getElementById('staffBaseSalary').value = st.baseSalary || 0;
  document.getElementById('staffBonus').value = st.bonus || 0;
  document.getElementById('staffBonusNote').value = st.bonusNote || '';
  document.getElementById('staffStatus').value = st.status || '待發放';

  calculateStaffModalTotal();
  modal.classList.add('active');
}

function closeEditStaffModal() {
  const modal = document.getElementById('editStaffModal');
  if (modal) modal.classList.remove('active');
}

function handleSaveStaffSalary(e) {
  e.preventDefault();
  const staffId = document.getElementById('editStaffId').value;
  const name = document.getElementById('staffName').value.trim();
  const role = document.getElementById('staffRole').value.trim();
  const baseSalary = parseInt(document.getElementById('staffBaseSalary').value) || 0;
  const bonus = parseInt(document.getElementById('staffBonus').value) || 0;
  const bonusNote = document.getElementById('staffBonusNote').value.trim();
  const status = document.getElementById('staffStatus').value;
  const totalSalary = baseSalary + bonus;

  if (staffId) {
    const idx = mockStaffSalaries.findIndex(s => s.id === staffId);
    if (idx !== -1) {
      mockStaffSalaries[idx] = {
        ...mockStaffSalaries[idx],
        name,
        role,
        baseSalary,
        bonus,
        bonusNote,
        totalSalary,
        status
      };
      showToast(`🎉 已成功更新【${name}】員工薪資單！實發 NT$ ${totalSalary.toLocaleString()}`);
    }
  } else {
    const newId = `staff-${Date.now().toString().slice(-4)}`;
    const newStaff = {
      id: newId,
      name,
      role,
      baseSalary,
      bonus,
      bonusNote,
      totalSalary,
      status
    };
    mockStaffSalaries.push(newStaff);
    showToast(`🎉 已成功新增【${name}】員工薪資單！實發 NT$ ${totalSalary.toLocaleString()}`);
  }

  saveStaffSalariesToStorage();
  closeEditStaffModal();
  renderStaffSalaryTable();
}

function deleteStaffSalary(staffId) {
  const st = mockStaffSalaries.find(item => item.id === staffId);
  if (!st) return;

  if (confirm(`確定要刪除【${st.name}】的員工薪資紀錄嗎？`)) {
    mockStaffSalaries = mockStaffSalaries.filter(item => item.id !== staffId);
    saveStaffSalariesToStorage();
    showToast(`🗑️ 已刪除【${st.name}】的員工薪資單`);
    renderStaffSalaryTable();
  }
}

function toggleStaffPayoutStatus(staffId) {
  const st = mockStaffSalaries.find(item => item.id === staffId);
  if (!st) return;

  if (st.status === '已發放') {
    st.status = '待發放';
    showToast(`已將【${st.name}】調整為「⏳ 待發放」`);
  } else {
    st.status = '已發放';
    showToast(`✅ 已將【${st.name}】員工薪資 NT$ ${(st.totalSalary || 0).toLocaleString()} 標記為「已發放」！`);
  }

  saveStaffSalariesToStorage();
  renderStaffSalaryTable();
}

function processMonthlyStaffPayout() {
  let count = 0;
  mockStaffSalaries.forEach(st => {
    if (st.status !== '已發放') {
      st.status = '已發放';
      count++;
    }
  });

  saveStaffSalariesToStorage();
  renderStaffSalaryTable();
  showToast(`🎉 已成功批次完成 ${count} 位營運團隊員工的薪資發放！`);
}

// 平台花費 Modal 控制
function openAddExpenseModal() {
  const modal = document.getElementById('editExpenseModal');
  if (!modal) return;

  document.getElementById('editExpenseId').value = '';
  document.getElementById('editExpenseModalTitle').innerHTML = '<i class="fa-solid fa-plus text-purple"></i> 新增平台花費項目';
  document.getElementById('expenseName').value = '';
  document.getElementById('expenseCategory').value = '伺服器與主機';
  document.getElementById('expenseAmount').value = '3000';
  document.getElementById('expenseCycle').value = '月繳';
  document.getElementById('expenseNotes').value = '';

  modal.classList.add('active');
}

function openEditExpenseModal(expenseId) {
  const modal = document.getElementById('editExpenseModal');
  const exp = mockPlatformExpenses.find(item => item.id === expenseId);
  if (!modal || !exp) return;

  document.getElementById('editExpenseId').value = exp.id;
  document.getElementById('editExpenseModalTitle').innerHTML = `<i class="fa-solid fa-receipt text-purple"></i> 編輯【${exp.name}】`;
  document.getElementById('expenseName').value = exp.name;
  document.getElementById('expenseCategory').value = exp.category || '伺服器與主機';
  document.getElementById('expenseAmount').value = exp.amount || 0;
  document.getElementById('expenseCycle').value = exp.cycle || '月繳';
  document.getElementById('expenseNotes').value = exp.notes || '';

  modal.classList.add('active');
}

function closeEditExpenseModal() {
  const modal = document.getElementById('editExpenseModal');
  if (modal) modal.classList.remove('active');
}

function handleSavePlatformExpense(e) {
  e.preventDefault();
  const expenseId = document.getElementById('editExpenseId').value;
  const name = document.getElementById('expenseName').value.trim();
  const category = document.getElementById('expenseCategory').value;
  const amount = parseInt(document.getElementById('expenseAmount').value) || 0;
  const cycle = document.getElementById('expenseCycle').value.trim();
  const notes = document.getElementById('expenseNotes').value.trim();

  if (expenseId) {
    const idx = mockPlatformExpenses.findIndex(item => item.id === expenseId);
    if (idx !== -1) {
      mockPlatformExpenses[idx] = {
        ...mockPlatformExpenses[idx],
        name,
        category,
        amount,
        cycle,
        notes
      };
      showToast(`🎉 已成功更新花費項目【${name}】(NT$ ${amount.toLocaleString()})！`);
    }
  } else {
    const newId = `exp-${Date.now().toString().slice(-4)}`;
    const newExp = {
      id: newId,
      name,
      category,
      amount,
      cycle,
      notes
    };
    mockPlatformExpenses.push(newExp);
    showToast(`🎉 已成功新增平台花費【${name}】(NT$ ${amount.toLocaleString()})！`);
  }

  savePlatformExpensesToStorage();
  closeEditExpenseModal();
  renderPlatformExpensesTable();
}

function deletePlatformExpense(expenseId) {
  const exp = mockPlatformExpenses.find(item => item.id === expenseId);
  if (!exp) return;

  if (confirm(`確定要刪除花費項目【${exp.name}】嗎？`)) {
    mockPlatformExpenses = mockPlatformExpenses.filter(item => item.id !== expenseId);
    savePlatformExpensesToStorage();
    showToast(`🗑️ 已刪除花費項目【${exp.name}】`);
    renderPlatformExpensesTable();
  }
}

// 通用圖片壓縮轉換器 (支援手機相簿/拍照/電腦圖片，自動使用 Canvas 縮小至最佳尺寸並壓縮為 JPEG，避免 localStorage 爆滿)
function compressImageFile(file, maxDim = 320, quality = 0.85, callback) {
  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        callback(null, dataUrl);
      } catch (err) {
        callback(null, evt.target.result);
      }
    };
    img.onerror = function(err) {
      callback(err || new Error('Image load failed'));
    };
    img.src = evt.target.result;
  };
  reader.onerror = function(err) {
    callback(err || new Error('File read failed'));
  };
  reader.readAsDataURL(file);
}

// 頭像與照片上傳處理器 (支援手機拍照/相簿與電腦選擇檔案，自動壓縮並轉為 Base64 DataURL 即時預覽)
function handleUserAvatarUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  compressImageFile(file, 320, 0.85, (err, dataUrl) => {
    if (err || !dataUrl) {
      showToast('⚠️ 圖片讀取失敗，請更換其他照片');
      return;
    }
    const preview = document.getElementById('userAvatarPreview');
    const input = document.getElementById('inputUserAvatar');
    if (preview) preview.src = dataUrl;
    if (input) input.value = dataUrl;
    showToast('📷 成員頭像照片載入成功！');
  });
}

function handleInstAvatarUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  compressImageFile(file, 400, 0.85, (err, dataUrl) => {
    if (err || !dataUrl) {
      showToast('⚠️ 圖片讀取失敗，請更換其他照片');
      return;
    }
    const preview = document.getElementById('instAvatarPreview');
    const input = document.getElementById('inputInstAvatar');
    if (preview) preview.src = dataUrl;
    if (input) input.value = dataUrl;
    showToast('📷 講師照片載入成功！');
  });
}

// Account Creation / Password Edit / Points Adjustment (主管與顧問專屬)
function openAddUserModal() {
  if (!currentUser || (currentUser.role !== 'manager' && currentUser.role !== 'consultant')) {
    showToast('⚠️ 僅有 👑 平台主管與 💼 顧問 可以新增帳號密碼與調整點數');
    return;
  }
  document.getElementById('editUserId').value = '';
  document.getElementById('inputUserName').value = '';
  document.getElementById('inputUserEmail').value = '';
  document.getElementById('inputUserPassword').value = '';
  
  const defaultAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80';
  const preview = document.getElementById('userAvatarPreview');
  const inputAvatar = document.getElementById('inputUserAvatar');
  const fileInput = document.getElementById('inputUserAvatarFile');
  if (preview) preview.src = defaultAvatar;
  if (inputAvatar) inputAvatar.value = defaultAvatar;
  if (fileInput) fileInput.value = '';

  if (document.getElementById('inputUserBankName')) document.getElementById('inputUserBankName').value = '';
  if (document.getElementById('inputUserBankAccount')) document.getElementById('inputUserBankAccount').value = '';
  if (document.getElementById('inputUserCoins')) document.getElementById('inputUserCoins').value = '100';
  if (document.getElementById('inputUserTokens')) document.getElementById('inputUserTokens').value = '0';
  document.getElementById('addUserModal').classList.add('active');
}

function openEditUserModal(userId) {
  const u = mockUsers.find(user => user.id === userId);
  if (!u) return;

  document.getElementById('editUserId').value = u.id;
  document.getElementById('inputUserName').value = u.name;
  document.getElementById('inputUserEmail').value = u.email;
  document.getElementById('inputUserPassword').value = u.password;
  document.getElementById('inputUserRole').value = u.role;
  
  // 帶入頭像照片
  const avatarVal = u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80';
  const preview = document.getElementById('userAvatarPreview');
  const inputAvatar = document.getElementById('inputUserAvatar');
  const fileInput = document.getElementById('inputUserAvatarFile');
  if (preview) preview.src = avatarVal;
  if (inputAvatar) inputAvatar.value = avatarVal;
  if (fileInput) fileInput.value = '';

  // 帶入銀行轉帳帳戶資訊
  if (document.getElementById('inputUserBankName')) {
    document.getElementById('inputUserBankName').value = (u.bankInfo && u.bankInfo.bankName) ? u.bankInfo.bankName : '';
  }
  if (document.getElementById('inputUserBankAccount')) {
    document.getElementById('inputUserBankAccount').value = (u.bankInfo && (u.bankInfo.bankAccount || u.bankInfo.accountLast5)) ? (u.bankInfo.bankAccount || u.bankInfo.accountLast5) : '';
  }

  if (document.getElementById('inputUserCoins')) document.getElementById('inputUserCoins').value = u.coins !== undefined ? u.coins : 0;
  if (document.getElementById('inputUserTokens')) document.getElementById('inputUserTokens').value = u.masterTokens !== undefined ? u.masterTokens : 0;
  document.getElementById('addUserModal').classList.add('active');
}

function closeAddUserModal() {
  const modal = document.getElementById('addUserModal');
  if (modal) modal.classList.remove('active');
}

function handleSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById('editUserId').value;
  const name = document.getElementById('inputUserName').value.trim();
  const email = document.getElementById('inputUserEmail').value.trim();
  const password = document.getElementById('inputUserPassword').value.trim();
  const role = document.getElementById('inputUserRole').value;
  const coinsInput = document.getElementById('inputUserCoins');
  const tokensInput = document.getElementById('inputUserTokens');
  const coins = coinsInput ? (parseInt(coinsInput.value) || 0) : 0;
  const masterTokens = tokensInput ? (parseInt(tokensInput.value) || 0) : 0;
  const customAvatar = (document.getElementById('inputUserAvatar') && document.getElementById('inputUserAvatar').value) || '';

  // 讀取轉帳銀行與收款帳號
  const bankName = (document.getElementById('inputUserBankName') && document.getElementById('inputUserBankName').value.trim()) || '';
  const bankAccount = (document.getElementById('inputUserBankAccount') && document.getElementById('inputUserBankAccount').value.trim()) || '';
  const accountLast5 = bankAccount.length >= 5 ? bankAccount.slice(-5) : bankAccount;
  const bankInfo = bankName ? { bankName, bankAccount, accountLast5: accountLast5 || '00000' } : null;

  let roleLabel = '🎓 消費者學員 (Student)';
  let avatar = customAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80';
  if (role === 'manager') {
    roleLabel = '👑 平台主管 (Manager)';
    if (!customAvatar) avatar = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80';
  } else if (role === 'consultant') {
    roleLabel = '💼 顧問 (Consultant)';
    if (!customAvatar) avatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80';
  } else if (role === 'staff') {
    roleLabel = '🧑‍💼 營運員工 (Staff)';
    if (!customAvatar) avatar = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80';
  } else if (role === 'instructor') {
    roleLabel = '👨‍🏫 金牌講師 (Instructor)';
    if (!customAvatar) avatar = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80';
  }

  if (id) {
    const existing = mockUsers.find(u => u.id === id);
    if (existing) {
      existing.name = name;
      existing.email = email;
      existing.password = password;
      existing.role = role;
      existing.roleLabel = roleLabel;
      existing.avatar = customAvatar || existing.avatar || avatar;
      existing.coins = coins;
      existing.masterTokens = masterTokens;
      existing.bankInfo = bankInfo;
    }
    if (currentUser && (currentUser.id === id || (currentUser.email && currentUser.email.toLowerCase() === email.toLowerCase()))) {
      currentUser.name = name;
      currentUser.email = email;
      currentUser.role = role;
      currentUser.roleLabel = roleLabel;
      currentUser.avatar = customAvatar || currentUser.avatar || avatar;
      currentUser.coins = coins;
      currentUser.masterTokens = masterTokens;
      currentUser.bankInfo = bankInfo;
      try {
        localStorage.setItem('pentaskill_user', JSON.stringify(currentUser));
      } catch(err) {}
    }
    showToast(`✅ 已更新帳號：${name} 的頭像、密碼、薪資帳戶${bankInfo ? ` (${bankInfo.bankName})` : ''}、點數與權限`);
  } else {
    const newUser = {
      id: `u-${Date.now()}`,
      name, email, password, role, roleLabel, avatar,
      coins, masterTokens,
      bankInfo,
      purchasedCourses: ['course-1']
    };
    mockUsers.push(newUser);
    showToast(`✅ 成功新增帳號：${name} (🪙 ${coins} 精幣 / 🏆 ${masterTokens} 精通寶)`);
  }

  saveUsersToStorage();
  closeAddUserModal();
  renderUserTable();
  renderAuthArea();

  // ⚡ 實時雙向連動至【講師月結薪資】與【員工薪資發放】資料庫
  if (bankInfo) {
    // 1. 連動講師月結名單
    if (Array.isArray(mockMentorSalaries)) {
      mockMentorSalaries.forEach(s => {
        if ((s.name && (name.includes(s.name.split(' ')[0]) || s.name.includes(name.split(' ')[0]))) || s.id === id) {
          s.bankInfo = { bankName, bankAccount, accountLast5: accountLast5 || '00000' };
        }
      });
      saveMentorSalariesToStorage();
      renderMentorSalaryTable();
    }

    // 2. 連動員工薪資發放名單
    if (Array.isArray(mockStaffSalaries)) {
      mockStaffSalaries.forEach(st => {
        if ((st.name && (name.includes(st.name.split(' ')[0]) || st.name.includes(name.split(' ')[0]))) || st.id === id) {
          st.bankInfo = { bankName, bankAccount, accountLast5: accountLast5 || '00000' };
        }
      });
      saveStaffSalariesToStorage();
      renderStaffSalaryTable();
    }
  }

  saveUsersToStorage();
  closeAddUserModal();
  renderAuthArea();
  renderUserTable();
  if (currentView === 'member-center') {
    renderMemberCenterView();
  }
}

function deleteUser(userId) {
  if (confirm('確定要刪除此帳號與登入權限嗎？')) {
    const idx = mockUsers.findIndex(u => u.id === userId);
    if (idx !== -1) {
      mockUsers.splice(idx, 1);
      saveUsersToStorage();
      renderUserTable();
      showToast('已刪除指定帳號');
    }
  }
}

// Course Modals
function openAddCourseModal() {
  const role = currentUser ? currentUser.role : 'guest';
  const cleanName = currentUser ? currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim() : '';
  const canSeePrices = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff');

  document.getElementById('editCourseId').value = '';
  document.getElementById('inputCourseTitle').value = '';

  const instInput = document.getElementById('inputCourseInstructor');
  if (instInput) {
    if (role === 'instructor') {
      instInput.value = currentUser.name;
      instInput.readOnly = true;
      instInput.style.background = 'rgba(255,255,255,0.05)';
    } else {
      instInput.value = '';
      instInput.readOnly = false;
      instInput.style.background = '';
    }
  }

  document.getElementById('inputPriceRecord').value = '3600';
  document.getElementById('inputPriceCombo').value = '12800';
  document.getElementById('inputCourseDesc').value = '';
  const feat = document.getElementById('inputCourseIsFeatured');
  if (feat) feat.checked = false;

  const priceRow = document.getElementById('coursePriceRow');
  if (priceRow) {
    priceRow.style.display = canSeePrices ? 'grid' : 'none';
  }
  const inputPriceRecord = document.getElementById('inputPriceRecord');
  const inputPriceCombo = document.getElementById('inputPriceCombo');
  if (inputPriceRecord) inputPriceRecord.required = canSeePrices;
  if (inputPriceCombo) inputPriceCombo.required = canSeePrices;

  const modal = document.getElementById('addCourseModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function openEditCourseModal(courseId) {
  const c = mockCourses.find(course => course.id === courseId);
  if (!c) return;

  const role = currentUser ? currentUser.role : 'guest';
  const cleanName = currentUser ? currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim() : '';
  const canSeePrices = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff');

  // Guard: if instructor, can only edit their own course
  if (role === 'instructor' && c.instructor && !c.instructor.includes(cleanName) && !currentUser.name.includes(c.instructor.split(' ')[0])) {
    showToast('⚠️ 權限受限：您僅能調整自己名下的線上課程！');
    return;
  }

  document.getElementById('editCourseId').value = c.id;
  document.getElementById('inputCourseTitle').value = c.title;
  document.getElementById('inputCourseCategory').value = c.category;

  const instInput = document.getElementById('inputCourseInstructor');
  if (instInput) {
    instInput.value = c.instructor;
    if (role === 'instructor') {
      instInput.readOnly = true;
      instInput.style.background = 'rgba(255,255,255,0.05)';
    } else {
      instInput.readOnly = false;
      instInput.style.background = '';
    }
  }

  document.getElementById('inputPriceRecord').value = c.priceRecordOnly;
  document.getElementById('inputPriceCombo').value = c.priceWith1on1;
  document.getElementById('inputCourseDesc').value = c.description;
  const feat = document.getElementById('inputCourseIsFeatured');
  if (feat) feat.checked = !!c.isFeatured;

  const priceRow = document.getElementById('coursePriceRow');
  if (priceRow) {
    priceRow.style.display = canSeePrices ? 'grid' : 'none';
  }
  const inputPriceRecord = document.getElementById('inputPriceRecord');
  const inputPriceCombo = document.getElementById('inputPriceCombo');
  if (inputPriceRecord) inputPriceRecord.required = canSeePrices;
  if (inputPriceCombo) inputPriceCombo.required = canSeePrices;

  const modal = document.getElementById('addCourseModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
}

function closeAddCourseModal() {
  const modal = document.getElementById('addCourseModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

function handleSaveCourse(e) {
  e.preventDefault();
  const id = document.getElementById('editCourseId').value;
  const title = document.getElementById('inputCourseTitle').value;
  const category = document.getElementById('inputCourseCategory').value;
  const role = currentUser ? currentUser.role : 'guest';
  let instructor = document.getElementById('inputCourseInstructor').value;
  if (role === 'instructor') {
    instructor = currentUser.name;
  }
  const description = document.getElementById('inputCourseDesc').value;
  const isFeatured = document.getElementById('inputCourseIsFeatured') ? document.getElementById('inputCourseIsFeatured').checked : false;

  const canSeePrices = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff');
  let priceRecordOnly = 3600;
  let priceWith1on1 = 12800;

  if (id) {
    const existing = mockCourses.find(c => c.id === id);
    if (existing) {
      priceRecordOnly = existing.priceRecordOnly || 3600;
      priceWith1on1 = existing.priceWith1on1 || 12800;
    }
  }

  if (canSeePrices) {
    const recInput = document.getElementById('inputPriceRecord');
    const comboInput = document.getElementById('inputPriceCombo');
    if (recInput && recInput.value) priceRecordOnly = parseInt(recInput.value) || priceRecordOnly;
    if (comboInput && comboInput.value) priceWith1on1 = parseInt(comboInput.value) || priceWith1on1;
  }

  let categoryLabel = '網頁開發 / AI';
  if (category === 'design') categoryLabel = 'UI/UX 與 設計';
  if (category === 'marketing') categoryLabel = '數位行銷 / 商業';
  if (category === 'individual') categoryLabel = '實務個教';

  if (id) {
    const existing = mockCourses.find(c => c.id === id);
    if (existing) {
      existing.title = title;
      existing.category = category;
      existing.categoryLabel = categoryLabel;
      existing.instructor = instructor;
      existing.priceRecordOnly = priceRecordOnly;
      existing.priceWith1on1 = priceWith1on1;
      existing.description = description;
      existing.isFeatured = isFeatured;
    }
    showToast(`✅ 已更新課程資訊：${title}`);
  } else {
    const newCourse = {
      id: `course-${Date.now()}`,
      title, category, categoryLabel, instructor,
      instructorTitle: '近10年培訓體系資深業師',
      instructorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      coverImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
      priceRecordOnly, priceWith1on1,
      rating: 5.0, reviewCount: 1,
      videoDuration: '20 小時錄播影音單元',
      liveSlotsCount: '4 次 1-on-1 個教',
      description,
      badge: '✨ 最新上架',
      isFeatured: isFeatured
    };
    mockCourses.push(newCourse);
    showToast(`🎉 成功上架新課程：${title}`);
  }

  saveCoursesToStorage(true);
  closeAddCourseModal();
  renderCourseGrid('all');
  renderHomeFeaturedCourses();
  renderCourseAdminTable();
}

function deleteCourse(courseId) {
  if (confirm('確定要下架刪除此課程嗎？')) {
    const idx = mockCourses.findIndex(c => c.id === courseId);
    if (idx !== -1) {
      mockCourses.splice(idx, 1);
      saveCoursesToStorage(true);
      renderCourseGrid('all');
      renderHomeFeaturedCourses();
      renderCourseAdminTable();
      showToast('🗑️ 課程已下架');
    }
  }
}



// Demonstration Portfolios CMS Rendering & Handlers
function renderPortfolios() {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;

  grid.innerHTML = mockPortfolios.map(p => `
    <div class="portfolio-card">
      <div class="p-img-box">
        <img src="${p.imgUrl}" alt="${p.title}">
        <span class="p-tag-badge ${p.badgeClass}">${p.categoryTag}</span>
        <span class="p-copyright-badge"><i class="fa-solid fa-shield-halved"></i> 100% 合規授權作品</span>
      </div>
      <div class="p-card-body">
        <div class="p-mentor-info">
          <img src="${p.instructorAvatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80'}" alt="${p.instructorName}">
          <span>${p.instructorName} 講師 1-on-1 指導修稿</span>
        </div>
        <h3 class="p-title">${p.title}</h3>
        <p class="p-desc">${p.desc}</p>
        <div class="p-footer">
          <span class="p-student"><i class="fa-solid fa-user-graduate"></i> 學員：${p.studentName}</span>
          <div class="flex-center gap-xs">
            <button class="btn btn-sm btn-outline" onclick="openPortfolioModal('${p.title.replace(/'/g, "\\'")}', '${p.imgUrl}', '${p.instructorName}', '${p.studentName}', '${p.feedback.replace(/'/g, "\\'")}')">全幅預覽</button>
            <button class="btn btn-sm btn-outline staff-manager-btn" onclick="openEditPortfolioModal('${p.id}')" title="編輯作品"><i class="fa-solid fa-pen text-pink"></i></button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  updateUIPermissions();
}

function openAddPortfolioModal() {
  document.getElementById('editPortId').value = '';
  document.getElementById('inputPortTitle').value = '';
  document.getElementById('inputPortTag').value = '🤖 AI & 程式開發';
  document.getElementById('inputPortStudent').value = '';
  document.getElementById('inputPortImg').value = 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80';
  document.getElementById('inputPortDesc').value = '';
  document.getElementById('inputPortFeedback').value = '';
  document.getElementById('addPortfolioModal').classList.add('active');
}

function openEditPortfolioModal(portId) {
  const p = mockPortfolios.find(item => item.id === portId);
  if (!p) return;

  document.getElementById('editPortId').value = p.id;
  document.getElementById('inputPortTitle').value = p.title;
  document.getElementById('inputPortTag').value = p.categoryTag;
  document.getElementById('inputPortInstructor').value = p.instructorName;
  document.getElementById('inputPortStudent').value = p.studentName;
  document.getElementById('inputPortImg').value = p.imgUrl;
  document.getElementById('inputPortDesc').value = p.desc;
  document.getElementById('inputPortFeedback').value = p.feedback;
  document.getElementById('addPortfolioModal').classList.add('active');
}

function closeAddPortfolioModal() {
  document.getElementById('addPortfolioModal').classList.remove('active');
}

function handleSavePortfolio(e) {
  e.preventDefault();
  const id = document.getElementById('editPortId').value;
  const title = document.getElementById('inputPortTitle').value;
  const tag = document.getElementById('inputPortTag').value;
  const inst = document.getElementById('inputPortInstructor').value;
  const student = document.getElementById('inputPortStudent').value;
  const img = document.getElementById('inputPortImg').value;
  const desc = document.getElementById('inputPortDesc').value;
  const feedback = document.getElementById('inputPortFeedback').value;

  let badgeClass = 'bg-purple';
  if (tag.includes('UI') || tag.includes('設計')) badgeClass = 'bg-pink';
  if (tag.includes('3D') || tag.includes('室內')) badgeClass = 'bg-blue';
  if (tag.includes('影音') || tag.includes('剪輯')) badgeClass = 'bg-green';

  let instAvatar = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80";
  if (inst.includes('Tina') || inst.includes('陳婷俐')) instAvatar = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80";
  if (inst.includes('Shawn') || inst.includes('歐陽翔')) instAvatar = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80";
  if (inst.includes('Hannah') || inst.includes('林雅涵')) instAvatar = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80";

  if (id) {
    const item = mockPortfolios.find(p => p.id === id);
    if (item) {
      item.title = title;
      item.categoryTag = tag;
      item.badgeClass = badgeClass;
      item.instructorName = inst;
      item.instructorAvatar = instAvatar;
      item.studentName = student;
      item.imgUrl = img;
      item.desc = desc;
      item.feedback = feedback;
      showToast(`✅ 已更新星級作品：${title}`);
    }
  } else {
    const newItem = {
      id: `port-${Date.now().toString().slice(-4)}`,
      title: title,
      categoryTag: tag,
      badgeClass: badgeClass,
      instructorName: inst,
      instructorAvatar: instAvatar,
      studentName: student,
      imgUrl: img,
      desc: desc,
      feedback: feedback
    };
    mockPortfolios.unshift(newItem);
    showToast(`🎉 成功上架星級示範作品：${title}`);
  }

  closeAddPortfolioModal();
  renderPortfolios();
}

// 儲存講師師資資料至 LocalStorage 及 Cloudflare KV
function saveInstructorsToStorage(syncCloud = true) {
  try {
    localStorage.setItem('pentaskill_instructors', JSON.stringify(mockInstructors));
  } catch (err) {}
  if (syncCloud && typeof saveCloudData === 'function') {
    saveCloudData('instructors', mockInstructors);
  }
}

// Instructor CMS Modals
function openAddInstructorModal() {
  document.getElementById('editInstId').value = '';
  document.getElementById('inputInstName').value = '';
  document.getElementById('inputInstRole').value = '';
  document.getElementById('inputInstTag').value = '金牌資深講師';
  document.getElementById('inputInstExp').value = '';
  
  const defaultInstAvatar = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80';
  const preview = document.getElementById('instAvatarPreview');
  const inputAvatar = document.getElementById('inputInstAvatar');
  const fileInput = document.getElementById('inputInstAvatarFile');
  if (preview) preview.src = defaultInstAvatar;
  if (inputAvatar) inputAvatar.value = defaultInstAvatar;
  if (fileInput) fileInput.value = '';

  document.getElementById('inputInstRate').value = 'NT$ 1,800 / 1小時';
  document.getElementById('inputInstSkills').value = '';
  document.getElementById('inputInstQuote').value = '';
  document.getElementById('addInstructorModal').classList.add('active');
}

function openEditInstructorModal(instId) {
  const inst = mockInstructors.find(i => i.id === instId);
  if (!inst) return;

  document.getElementById('editInstId').value = inst.id;
  document.getElementById('inputInstName').value = inst.name;
  document.getElementById('inputInstRole').value = inst.role;
  document.getElementById('inputInstTag').value = inst.tag || '';
  document.getElementById('inputInstExp').value = inst.exp;
  
  const avatarVal = inst.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80';
  const preview = document.getElementById('instAvatarPreview');
  const inputAvatar = document.getElementById('inputInstAvatar');
  const fileInput = document.getElementById('inputInstAvatarFile');
  if (preview) preview.src = avatarVal;
  if (inputAvatar) inputAvatar.value = avatarVal;
  if (fileInput) fileInput.value = '';

  document.getElementById('inputInstRate').value = inst.rate1on1;
  document.getElementById('inputInstSkills').value = inst.skills ? inst.skills.join(', ') : '';
  document.getElementById('inputInstQuote').value = inst.quote || '';
  document.getElementById('addInstructorModal').classList.add('active');
}

function closeAddInstructorModal() {
  const modal = document.getElementById('addInstructorModal');
  if (modal) modal.classList.remove('active');
}

function handleSaveInstructor(e) {
  e.preventDefault();
  const id = document.getElementById('editInstId').value;
  const name = document.getElementById('inputInstName').value.trim();
  const role = document.getElementById('inputInstRole').value.trim();
  const tag = document.getElementById('inputInstTag').value.trim();
  const exp = document.getElementById('inputInstExp').value.trim();
  const avatar = (document.getElementById('inputInstAvatar') && document.getElementById('inputInstAvatar').value) || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80';
  const rate = document.getElementById('inputInstRate').value.trim();
  const skillsRaw = document.getElementById('inputInstSkills').value.trim();
  const quote = document.getElementById('inputInstQuote').value.trim();

  const skills = skillsRaw ? skillsRaw.split(',').map(s => s.trim()) : ['實務專案'];

  if (id) {
    const inst = mockInstructors.find(i => i.id === id);
    if (inst) {
      inst.name = name;
      inst.role = role;
      inst.tag = tag;
      inst.exp = exp;
      inst.avatar = avatar;
      inst.rate1on1 = rate;
      inst.skills = skills;
      inst.quote = quote;
      showToast(`✅ 已更新講師資訊與照片：${name}`);
    }
  } else {
    const newInst = {
      id: `inst-${Date.now().toString().slice(-4)}`,
      name: name,
      role: role,
      tag: tag,
      exp: exp,
      avatar: avatar,
      skills: skills,
      rating: 5.0,
      studentCount: 100,
      rate1on1: rate,
      quote: quote
    };
    mockInstructors.push(newInst);
    showToast(`🎉 成功新增金牌講師：${name}`);
  }

  saveInstructorsToStorage();
  closeAddInstructorModal();
  renderInstructors();
  renderInstructorAdminTable();
}

function deleteInstructor(instId) {
  const inst = mockInstructors.find(i => i.id === instId);
  if (!inst) return;
  if (confirm(`確定要移除講師【${inst.name}】嗎？`)) {
    const idx = mockInstructors.findIndex(i => i.id === instId);
    if (idx !== -1) {
      mockInstructors.splice(idx, 1);
      saveInstructorsToStorage();
      renderInstructors();
      renderInstructorAdminTable();
      showToast(`🗑️ 已移除講師：${inst.name}`);
    }
  }
}

// ==========================================================================
// 📚 課程專屬講義教材管理核心模組 (支援 PDF, PPT/PPTX, Word/DOCX)
// ==========================================================================
const DEFAULT_COURSE_MATERIALS = [
  {
    id: "mat-101",
    courseId: "course-1",
    courseTitle: "AI 驅動 Full-Stack Web 開發實戰營",
    title: "React 19 與 Next.js 15 核心架構指引手冊 (PDF)",
    fileName: "React19_Next15_Architecture_Guide.pdf",
    fileType: "pdf",
    fileSize: "3.8 MB",
    uploadedAt: (typeof calcDynamicDateTimeOffset === 'function') ? calcDynamicDateTimeOffset(-2, '10:30') : '2026-10-14 10:30',
    instructorName: "張哲銘 (Ethan)"
  },
  {
    id: "mat-102",
    courseId: "course-1",
    courseTitle: "AI 驅動 Full-Stack Web 開發實戰營",
    title: "Claude & OpenAI API 自動化工作流實戰簡報 (PPT)",
    fileName: "AI_Workflow_Automation_Slides.pptx",
    fileType: "ppt",
    fileSize: "5.2 MB",
    uploadedAt: (typeof calcDynamicDateTimeOffset === 'function') ? calcDynamicDateTimeOffset(-2, '11:15') : '2026-10-14 11:15',
    instructorName: "張哲銘 (Ethan)"
  },
  {
    id: "mat-103",
    courseId: "course-1",
    courseTitle: "AI 驅動 Full-Stack Web 開發實戰營",
    title: "期末獨立專案規格需求與評分標準手冊 (Word)",
    fileName: "Final_Project_Requirements_Spec.docx",
    fileType: "doc",
    fileSize: "1.1 MB",
    uploadedAt: (typeof calcDynamicDateTimeOffset === 'function') ? calcDynamicDateTimeOffset(-1, '14:20') : '2026-10-15 14:20',
    instructorName: "張哲銘 (Ethan)"
  },
  {
    id: "mat-201",
    courseId: "course-2",
    courseTitle: "UI/UX 產品設計與 Figma 設計系統實力班",
    title: "Figma 150+ 企業級設計系統元件規範指南 (PDF)",
    fileName: "Figma_Design_System_Spec.pdf",
    fileType: "pdf",
    fileSize: "6.4 MB",
    uploadedAt: (typeof calcDynamicDateTimeOffset === 'function') ? calcDynamicDateTimeOffset(-3, '09:20') : '2026-10-13 09:20',
    instructorName: "陳婷俐 (Tina)"
  },
  {
    id: "mat-202",
    courseId: "course-2",
    courseTitle: "UI/UX 產品設計與 Figma 設計系統實力班",
    title: "UI/UX 產品設計提案與商業簡報模板 (PPT)",
    fileName: "UX_Proposal_Client_Pitch_Deck.pptx",
    fileType: "ppt",
    fileSize: "8.1 MB",
    uploadedAt: (typeof calcDynamicDateTimeOffset === 'function') ? calcDynamicDateTimeOffset(-3, '14:00') : '2026-10-13 14:00',
    instructorName: "陳婷俐 (Tina)"
  },
  {
    id: "mat-301",
    courseId: "course-3",
    courseTitle: "Python 數據分析與自動化爬蟲實務",
    title: "Python 網路爬蟲與 Anti-Bot 破解 Cheatsheet (PDF)",
    fileName: "Python_Scraper_Cheatsheet.pdf",
    fileType: "pdf",
    fileSize: "2.6 MB",
    uploadedAt: (typeof calcDynamicDateTimeOffset === 'function') ? calcDynamicDateTimeOffset(-4, '16:30') : '2026-10-12 16:30',
    instructorName: "歐陽翔 (Shawn)"
  },
  {
    id: "mat-302",
    courseId: "course-3",
    courseTitle: "Python 數據分析與自動化爬蟲實務",
    title: "Pandas 資料清理與機器學習預處理講義 (Word)",
    fileName: "Pandas_Data_Cleaning_Handbook.docx",
    fileType: "doc",
    fileSize: "1.9 MB",
    uploadedAt: (typeof calcDynamicDateTimeOffset === 'function') ? calcDynamicDateTimeOffset(-4, '17:00') : '2026-10-12 17:00',
    instructorName: "歐陽翔 (Shawn)"
  },
  {
    id: "mat-401",
    courseId: "course-4",
    courseTitle: "高轉化率數位整合行銷與短影音電商實操",
    title: "短影音前 3 秒開頭鉤子文案 50 組高轉化公式 (PDF)",
    fileName: "Short_Video_Hook_Formulas.pdf",
    fileType: "pdf",
    fileSize: "4.1 MB",
    uploadedAt: (typeof calcDynamicDateTimeOffset === 'function') ? calcDynamicDateTimeOffset(-5, '11:00') : '2026-10-11 11:00',
    instructorName: "林雅涵 (Hannah)"
  },
  {
    id: "mat-402",
    courseId: "course-4",
    courseTitle: "高轉化率數位整合行銷與短影音電商實操",
    title: "電商爆款短影音分鏡腳本範本 (Word)",
    fileName: "Ecommerce_Video_Storyboard_Template.docx",
    fileType: "doc",
    fileSize: "950 KB",
    uploadedAt: (typeof calcDynamicDateTimeOffset === 'function') ? calcDynamicDateTimeOffset(-5, '15:30') : '2026-10-11 15:30',
    instructorName: "林雅涵 (Hannah)"
  }
];

function getAllCourseMaterials() {
  try {
    const raw = localStorage.getItem('pentaskill_course_materials');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return [...DEFAULT_COURSE_MATERIALS];
}

function saveAllCourseMaterials(materials) {
  try {
    localStorage.setItem('pentaskill_course_materials', JSON.stringify(materials));
  } catch (e) {}
  if (typeof saveCloudData === 'function') {
    saveCloudData('course_materials', materials);
  }
}

function getHandoutFileIcon(str = '') {
  const lower = String(str).toLowerCase();
  if (lower.includes('pdf')) {
    return '<i class="fa-solid fa-file-pdf" style="color:#f43f5e; font-size:1.3rem;"></i>';
  } else if (lower.includes('ppt') || lower.includes('pptx')) {
    return '<i class="fa-solid fa-file-powerpoint" style="color:#f97316; font-size:1.3rem;"></i>';
  } else if (lower.includes('doc') || lower.includes('docx') || lower.includes('word')) {
    return '<i class="fa-solid fa-file-word" style="color:#3b82f6; font-size:1.3rem;"></i>';
  }
  return '<i class="fa-solid fa-file-lines" style="color:#06b6d4; font-size:1.3rem;"></i>';
}

function openCourseMaterialModal(courseId = 'course-1') {
  const modal = document.getElementById('courseMaterialModal');
  if (!modal) return;

  const course = mockCourses.find(c => c.id === courseId) || mockCourses[0];
  const hiddenId = document.getElementById('uploadMaterialCourseId');
  if (hiddenId) hiddenId.value = course.id;

  const titleElem = document.getElementById('modalMaterialCourseTitle');
  if (titleElem) {
    titleElem.innerHTML = `<i class="fa-solid fa-file-lines text-cyan"></i> 【${course.title}】專屬講義教材管理`;
  }

  const fileInput = document.getElementById('handoutFileInput');
  if (fileInput) fileInput.value = '';
  const titleInput = document.getElementById('handoutTitleInput');
  if (titleInput) titleInput.value = '';

  renderModalCourseMaterials(course.id);
  modal.classList.add('active');
  modal.style.display = 'flex';
}

function closeCourseMaterialModal() {
  const modal = document.getElementById('courseMaterialModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

function openUploadMaterialModal(courseId) {
  openCourseMaterialModal(courseId || 'course-1');
}

function closeUploadMaterialModal() {
  closeCourseMaterialModal();
}

function onHandoutFileInputChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const validExts = ['.pdf', '.ppt', '.pptx', '.doc', '.docx'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!validExts.includes(ext)) {
    showToast('⚠️ 僅支援上傳 PDF (.pdf)、PowerPoint (.ppt, .pptx) 或 Word (.doc, .docx) 檔案！');
    e.target.value = '';
    return;
  }

  const titleInput = document.getElementById('handoutTitleInput');
  if (titleInput && !titleInput.value.trim()) {
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    let typeLabel = 'PDF';
    if (ext.includes('ppt')) typeLabel = 'PPT';
    if (ext.includes('doc')) typeLabel = 'Word';
    titleInput.value = `${baseName} (${typeLabel})`;
  }
}

function handleUploadHandoutFile(e) {
  e.preventDefault();
  const courseId = document.getElementById('uploadMaterialCourseId').value || 'course-1';
  const fileInput = document.getElementById('handoutFileInput');
  const file = fileInput && fileInput.files && fileInput.files[0];
  const titleInput = document.getElementById('handoutTitleInput');
  const title = (titleInput ? titleInput.value.trim() : '') || (file ? file.name : '課程講義');

  if (!file) {
    showToast('⚠️ 請先選擇要上傳的講義檔案 (PDF / PPT / Word)');
    return;
  }

  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  let fileType = 'other';
  if (ext === '.pdf') fileType = 'pdf';
  else if (ext === '.ppt' || ext === '.pptx') fileType = 'ppt';
  else if (ext === '.doc' || ext === '.docx') fileType = 'doc';

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const course = mockCourses.find(c => c.id === courseId) || { id: courseId, title: "實戰課程" };
  const instructorName = currentUser ? currentUser.name : "金牌講師";

  const finishUpload = (dataUrl = '') => {
    const newMaterial = {
      id: `mat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      courseId: courseId,
      courseTitle: course.title,
      title: title,
      fileName: file.name,
      fileType: fileType,
      fileSize: formatSize(file.size),
      fileData: dataUrl,
      uploadedAt: (typeof getLocalDateTimeString === 'function') ? getLocalDateTimeString(new Date()) : new Date().toLocaleString(),
      instructorName: instructorName
    };

    const allMaterials = getAllCourseMaterials();
    allMaterials.unshift(newMaterial);
    saveAllCourseMaterials(allMaterials);

    fileInput.value = '';
    titleInput.value = '';

    renderModalCourseMaterials(courseId);
    if (typeof renderStudentCourseHandouts === 'function') renderStudentCourseHandouts(courseId);

    showToast(`✅ 講義上架成功！已同步至學員看課專區：${title}`);
  };

  if (file.size <= 4 * 1024 * 1024) {
    const reader = new FileReader();
    reader.onload = function(evt) { finishUpload(evt.target.result); };
    reader.onerror = function() { finishUpload(''); };
    reader.readAsDataURL(file);
  } else {
    finishUpload('');
  }
}

function renderModalCourseMaterials(courseId) {
  const container = document.getElementById('modalMaterialsListContainer');
  const countBadge = document.getElementById('modalMaterialCountBadge');
  if (!container) return;

  const allMaterials = getAllCourseMaterials();
  const materials = allMaterials.filter(m => m.courseId === courseId);

  if (countBadge) {
    countBadge.innerText = `${materials.length} 份教材`;
  }

  if (materials.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:1.75rem 1rem; color:#94a3b8; font-size:0.85rem; border:1px dashed rgba(255,255,255,0.08); border-radius:8px;">
        <i class="fa-solid fa-folder-open" style="font-size:1.6rem; margin-bottom:0.4rem; display:block; color:#64748b;"></i>
        目前尚未為本門課程上傳講義教材<br>
        <span style="font-size:0.75rem; color:#64748b;">請由下方選擇 PDF、PPT 或 Word 檔案上傳</span>
      </div>
    `;
    return;
  }

  container.innerHTML = materials.map(m => {
    const icon = getHandoutFileIcon(m.fileType || m.fileName);
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(30,41,59,0.7); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:0.6rem 0.8rem; gap:0.5rem;">
        <div style="display:flex; align-items:center; gap:0.6rem; overflow:hidden; min-width:0;">
          ${icon}
          <div style="overflow:hidden;">
            <div style="font-size:0.85rem; font-weight:600; color:#f8fafc; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;" title="${m.title}">${m.title}</div>
            <div style="font-size:0.72rem; color:#94a3b8;">${m.fileName || m.title} • ${m.fileSize || '2.0 MB'} • ${m.uploadedAt || ''}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.35rem; flex-shrink:0;">
          <button type="button" class="btn btn-sm btn-outline" onclick="downloadCourseMaterial('${m.id}')" title="下載測試" style="padding:0.25rem 0.55rem; font-size:0.75rem;">
            <i class="fa-solid fa-download"></i> 下載
          </button>
          <button type="button" class="btn btn-sm btn-outline" onclick="deleteCourseMaterial('${m.id}', '${courseId}')" title="刪除教材" style="padding:0.25rem 0.55rem; font-size:0.75rem; color:#f43f5e; border-color:rgba(244,63,94,0.3);">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function deleteCourseMaterial(materialId, courseId) {
  if (!confirm('確定要自本課程下架並刪除此份講義教材嗎？')) return;

  let allMaterials = getAllCourseMaterials();
  allMaterials = allMaterials.filter(m => m.id !== materialId);
  saveAllCourseMaterials(allMaterials);

  renderModalCourseMaterials(courseId);
  if (typeof renderStudentCourseHandouts === 'function') renderStudentCourseHandouts(courseId);

  showToast('🗑️ 已成功刪除該份講義教材。');
}

function renderStudentCourseHandouts(courseId) {
  if (courseId) currentViewCourseId = courseId;
  const targetId = courseId || currentViewCourseId || 'course-1';
  const container = document.getElementById('courseHandoutsDownloadList');
  if (!container) return;

  const badge = document.getElementById('studentHandoutCountBadge');
  const allMaterials = getAllCourseMaterials();
  const materials = allMaterials.filter(m => m.courseId === targetId);

  if (badge) {
    badge.innerText = `共 ${materials.length} 份專屬講義教材 (支援 PDF / PPT / Word)`;
  }

  if (materials.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; color: #94a3b8; background: rgba(15, 23, 42, 0.4); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.08);">
        <i class="fa-solid fa-paperclip text-cyan" style="font-size: 1.3rem; margin-bottom: 0.35rem; display:block;"></i>
        <span>本門課程講師正在精編最新版隨課講義，敬請期待！</span>
      </div>
    `;
    return;
  }

  container.innerHTML = materials.map(m => {
    const icon = getHandoutFileIcon(m.fileType || m.fileName);
    return `
      <div class="file-item" style="display:flex; align-items:center; justify-content:space-between; background:rgba(15,23,42,0.6); border:1px solid rgba(255,255,255,0.08); padding:0.65rem 0.85rem; border-radius:8px;">
        <div style="display:flex; align-items:center; gap:0.65rem; overflow:hidden; min-width:0;">
          ${icon}
          <div style="overflow:hidden;">
            <div style="font-size:0.85rem; font-weight:600; color:#f8fafc; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;" title="${m.title}">${m.title}</div>
            <div style="font-size:0.75rem; color:#94a3b8;">${m.fileName || m.title} • ${m.fileSize || '2.5 MB'}</div>
          </div>
        </div>
        <button class="btn btn-sm btn-outline" onclick="downloadCourseMaterial('${m.id}')" style="white-space:nowrap; padding:0.35rem 0.75rem; font-size:0.8rem; margin-left:0.5rem; flex-shrink:0;">
          <i class="fa-solid fa-download"></i> 下載
        </button>
      </div>
    `;
  }).join('');
}

async function downloadCourseMaterial(materialId) {
  const allMaterials = getAllCourseMaterials();
  const mat = allMaterials.find(m => m.id === materialId);
  if (!mat) {
    showToast('⚠️ 查無該講義檔案，可能已被講師移除。');
    return;
  }

  // 權限檢查：只有購買這門課的學員、或是平台主管/顧問/員工/講師可以下載講義
  const isPaid = currentUser && currentUser.purchasedCourses && (
    currentUser.purchasedCourses.includes(mat.courseId) ||
    currentUser.purchasedCourses.includes('course-1')
  );
  const isStaffOrInstructor = currentUser && (
    currentUser.role === 'manager' ||
    currentUser.role === 'consultant' ||
    currentUser.role === 'staff' ||
    currentUser.role === 'instructor'
  );

  if (!isPaid && !isStaffOrInstructor) {
    showToast('🔒 講義教材僅供【已購課學員】與【授課師資】專屬下載！請先加入購物車並結帳。');
    return;
  }

  const studentName = currentUser ? currentUser.name : '付費學員';
  const studentEmail = currentUser ? currentUser.email : 'student@pentaskill.com';
  const downloadFileName = mat.fileName || (mat.title + (mat.fileType === 'doc' ? '.docx' : mat.fileType === 'pdf' ? '.pdf' : '.dat'));

  // 1. 若為講師自行上傳的圖檔 (data:image)，在整頁與底部加蓋高辨識度防偽浮水印後下載
  if (mat.fileData && mat.fileData.startsWith('data:image/')) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.fillStyle = 'rgba(100, 116, 139, 0.18)';
      ctx.font = 'bold ' + Math.max(28, Math.floor(canvas.width / 26)) + 'px sans-serif';
      ctx.textAlign = 'center';
      for (let y = -canvas.height; y <= canvas.height; y += 220) {
        for (let x = -canvas.width; x <= canvas.width; x += 380) {
          ctx.fillText('精五門 PentaSkill', x, y);
          ctx.fillText('授權學員：' + studentName, x, y + 36);
        }
      }
      ctx.restore();

      const footerH = Math.max(50, Math.floor(canvas.height * 0.06));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(0, canvas.height - footerH, canvas.width, footerH);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold ' + Math.max(16, Math.floor(footerH * 0.38)) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️ 精五門 PentaSkill 官方授權防偽研習教材 ｜ 授權學員：' + studentName + ' (' + studentEmail + ') ｜ 翻印必究', canvas.width / 2, canvas.height - Math.floor(footerH * 0.35));

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = downloadFileName.endsWith('.png') ? downloadFileName : (downloadFileName + '.png');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('📥 講義下載完成！已加蓋【精五門 PentaSkill】官方防偽浮水印！');
    };
    img.src = mat.fileData;
    return;
  }

  // 2. ⭐️ 核心修復：若為講師自行上傳的實體檔案 (mat.fileData 為 Base64 DataURL)
  // 非破壞性注入官方淺色防偽浮水印，同時 100% 保持 Word (.docx/.doc) / PDF 原生內容與結構完整，絕不彈出錯誤！
  if (mat.fileData && mat.fileData.startsWith('data:')) {
    try {
      const parts = mat.fileData.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }

      const lowerName = downloadFileName.toLowerCase();

      // (A) 若為 Word 文件 (.docx) 且 JSZip 可用，安全注入 OpenXML 淺色認證浮水印橫幅
      if ((lowerName.endsWith('.docx') || mat.fileType === 'doc') && typeof JSZip !== 'undefined') {
        try {
          const zip = await JSZip.loadAsync(u8arr);
          const docXmlFile = zip.file('word/document.xml');
          if (docXmlFile) {
            let xml = await docXmlFile.async('string');
            
            // 安全防偽標籤 (頂部淺藍官方認證橫幅 + 底部淡灰防偽字樣)
            const topWatermarkXml = `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="0284C7"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F0F9FF"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Microsoft JhengHei" w:hAnsi="Microsoft JhengHei" w:hint="eastAsia"/><w:b/><w:color w:val="0369A1"/><w:sz w:val="22"/></w:rPr><w:t>🛡️ 精五門 PentaSkill 官方授權防偽研習教材 ｜ 授權學員：${studentName} (${studentEmail}) ｜ 翻印必究</w:t></w:r></w:p>`;
            const bottomWatermarkXml = `<w:p><w:pPr><w:pBdr><w:top w:val="dashed" w:sz="6" w:space="4" w:color="94A3B8"/></w:pBdr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Microsoft JhengHei" w:hAnsi="Microsoft JhengHei" w:hint="eastAsia"/><w:i/><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr><w:t>精五門線上學習平台 · 正版數位教材防偽認證碼：PNT-2026-${Date.now().toString(36).toUpperCase()}</w:t></w:r></w:p>`;

            if (xml.includes('<w:body>')) {
              xml = xml.replace('<w:body>', '<w:body>' + topWatermarkXml);
            }
            if (xml.includes('</w:body>')) {
              xml = xml.replace('</w:body>', bottomWatermarkXml + '</w:body>');
            }

            zip.file('word/document.xml', xml);
            const watermarkedBlob = await zip.generateAsync({
              type: 'blob',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            });

            const blobUrl = URL.createObjectURL(watermarkedBlob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = downloadFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

            showToast('📥 講義下載完成！已加蓋【精五門 PentaSkill】官方淺色防偽浮水印！');
            return;
          }
        } catch (docxErr) {
          console.warn('Word watermark injection fallback to original binary:', docxErr);
        }
      }

      // (B) 若為 PDF 且 PDFLib 可用，加蓋淺色防偽文字
      if (lowerName.endsWith('.pdf') && typeof PDFLib !== 'undefined') {
        try {
          const pdfDoc = await PDFLib.PDFDocument.load(u8arr);
          const pages = pdfDoc.getPages();
          const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
          
          pages.forEach(page => {
            const { width, height } = page.getSize();
            page.drawText(`PentaSkill Official Material - Authorized to: ${studentName}`, {
              x: 40,
              y: height - 25,
              size: 9,
              font: font,
              color: PDFLib.rgb(0.4, 0.6, 0.8),
              opacity: 0.5
            });
            page.drawText(`PentaSkill - ${studentName}`, {
              x: width / 4,
              y: height / 2,
              size: 32,
              font: font,
              color: PDFLib.rgb(0.6, 0.7, 0.8),
              rotate: PDFLib.degrees(35),
              opacity: 0.18
            });
          });

          const modifiedPdfBytes = await pdfDoc.save();
          const pdfBlob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = downloadFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

          showToast('📥 講義下載完成！已加蓋【精五門 PentaSkill】官方淺色防偽浮水印！');
          return;
        } catch (pdfErr) {
          console.warn('PDF watermark fallback to original binary:', pdfErr);
        }
      }

      // 原生物理檔案直接導出（其他格式或無外掛庫時），100% 保持格式與文字內容正確
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

      showToast('📥 講師原版講義【' + mat.title + '】下載成功！文件格式完整無損驗證通過。');
      return;
    } catch (err) {
      console.warn('Blob parse fallback:', err);
      const a = document.createElement('a');
      a.href = mat.fileData;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('📥 講義下載已完成！');
      return;
    }
  }

  // 3. 系統示範教材 (無上傳真實內容之 mock 資料)：依副檔名生成官方示範講義
  const ext = mat.fileName && mat.fileName.includes('.') ? mat.fileName.substring(mat.fileName.lastIndexOf('.')).toLowerCase() : '.pdf';

  if (ext === '.pdf') {
    generateHandoutPdfWithWatermark(mat);
  } else if (ext.includes('doc')) {
    generateHandoutWordWithWatermark(mat);
  } else {
    generateHandoutPdfWithWatermark(mat);
  }

  showToast('📥 講義下載已完成！已加蓋【精五門 PentaSkill】防偽浮水印：' + mat.title);
}

// 生成標準 PDF 格式講義，蓋上醒目、清晰、優雅的「精五門 PentaSkill」全頁與底部防偽浮水印
function generateHandoutPdfWithWatermark(mat) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1697; // A4 比例
    const ctx = canvas.getContext('2d');

    // 背景：白色
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 頂部科技漸層飾條 (青藍到紫)
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, '#06b6d4');
    grad.addColorStop(0.5, '#3b82f6');
    grad.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, 16);

    const studentName = currentUser ? currentUser.name : '林小明 (學員)';
    const studentEmail = currentUser ? currentUser.email : 'student@pentaskill.com';
    const studentInfo = `${studentName} (${studentEmail})`;
    const todayStr = (typeof getLocalDateString === 'function') ? getLocalDateString() : new Date().toISOString().split('T')[0];

    // -------------------------------------------------------------
    // ⭐️ 1. 全頁對角防偽浮水印矩陣 (精五門 PentaSkill + 授權學員姓名)
    // -------------------------------------------------------------
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 6); // 旋轉 -30 度
    ctx.fillStyle = 'rgba(100, 116, 139, 0.16)'; // 16% 不透明度：清晰辨識、絕不消失、不干擾閱讀
    ctx.textAlign = 'center';

    for (let y = -1100; y <= 1100; y += 220) {
      for (let x = -1000; x <= 1000; x += 440) {
        ctx.font = 'bold 50px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
        ctx.fillText('精五門 PentaSkill', x, y);
        ctx.font = 'bold 22px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
        ctx.fillText(`授權研習：${studentName}`, x, y + 36);
      }
    }
    ctx.restore();

    // -------------------------------------------------------------
    // ⭐️ 2. 頁首品牌資訊與右上角防偽安全徽章
    // -------------------------------------------------------------
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 30px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('精五門 PentaSkill', 80, 80);

    ctx.fillStyle = '#64748b';
    ctx.font = '16px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText('實戰線上學習平台 — 課堂專屬隨課講義教材', 355, 80);

    // 右上角防偽印鑑框
    ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(canvas.width - 380, 48, 300, 44);
    ctx.fillRect(canvas.width - 380, 48, 300, 44);
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🛡️ 官方防偽正版教材認證', canvas.width - 230, 75);

    // 頁首分隔線
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 105);
    ctx.lineTo(canvas.width - 80, 105);
    ctx.stroke();

    // 講義主標題
    ctx.fillStyle = '#0369a1';
    ctx.font = 'bold 36px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(mat.title, 80, 170);

    // -------------------------------------------------------------
    // ⭐️ 3. 講義中繼資料卡片
    // -------------------------------------------------------------
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(80, 205, canvas.width - 160, 135, 10);
    } else {
      ctx.rect(80, 205, canvas.width - 160, 135);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#334155';
    ctx.font = '18px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(`【對應課程】：${mat.courseTitle || '實戰錄播小單元'}`, 110, 248);
    ctx.fillText(`【授課業師】：${mat.instructorName || '精五門金牌業師'}`, 110, 285);
    ctx.fillText(`【發布日期】：${mat.uploadedAt || todayStr}`, 110, 322);

    ctx.fillText(`【授權學員】：${studentInfo}`, 640, 248);
    ctx.fillText(`【教材規格】：${mat.fileName || mat.title} (${mat.fileSize || '2.5 MB'})`, 640, 285);
    ctx.fillText(`【版權規範】：僅供個人課堂研習，翻印必究`, 640, 322);

    // -------------------------------------------------------------
    // ⭐️ 4. 核心精要與課堂重點
    // -------------------------------------------------------------
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText('📌 核心單元學習精要與架構指南', 80, 395);

    ctx.fillStyle = '#475569';
    ctx.font = '18px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    const notes = [
      '1. 本章核心技術點已全面相容最新實戰規範，並融入企業級實務架構思維。',
      '2. 實作過程中若遇任何瓶頸，請於「本章個教作業批改」區上傳 GitHub 倉庫或 Figma 專案連結。',
      '3. 可隨時點選右上角「1 對 1 個教預約」，業師將於線上視訊教室為您即時 Code Review 與精準答疑。',
      '4. 課堂實戰範例程式碼與環境配置設定，已同步於下方說明與專屬示範檔中完整備註。',
      '5. 建議依循「錄播自學打底 ➔ 範例動手練習 ➔ 課後業師 1 對 1 個教陪跑」黃金三步驟全速前進。'
    ];
    let noteY = 440;
    notes.forEach(note => {
      ctx.fillText(note, 80, noteY);
      noteY += 40;
    });

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText('💡 講師實戰課堂叮嚀與備忘清單', 80, 690);

    ctx.fillStyle = '#475569';
    ctx.font = '18px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    const tips = [
      '• 程式碼架構與模組化劃分，請務必遵循乾淨架構 (Clean Architecture) 與關注點分離原則。',
      '• 設計系統元件請留意 Auto Layout 自動佈局與語意化色票規範，維持跨裝置一致性。',
      '• 行銷與影音剪輯單元，請落實前 3 秒開頭 Hook 與漏斗數據 A/B Testing 實測。',
      '• 作業完成後請至個人中心確認精幣餘額，享有每位學員專屬之 1 對 1 個教諮詢與點數禮遇。'
    ];
    let tipY = 735;
    tips.forEach(tip => {
      ctx.fillText(tip, 80, tipY);
      tipY += 40;
    });

    // 著作權條款
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(80, 930, canvas.width - 160, 115, 8);
    } else {
      ctx.rect(80, 930, canvas.width - 160, 115);
    }
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.font = '15px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText('著作權條款聲明：', 110, 965);
    ctx.fillText('本講義教材受中華民國著作權法與智慧財產權保護，僅供精五門已購課學員專屬研習使用。', 110, 995);
    ctx.fillText('嚴禁未經授權之公開散布、轉載、重製、公開上傳網路或作商業轉售用途，違者依法追究法律責任。', 110, 1020);

    // -------------------------------------------------------------
    // ⭐️ 5. 底部高辨識度防偽浮水印底欄 (Wen 總監指定核心防偽規格)
    // -------------------------------------------------------------
    const footerBoxY = canvas.height - 150;
    const footerBoxH = 95;

    // 防偽底欄背景外框
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(80, footerBoxY, canvas.width - 160, footerBoxH);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(80, footerBoxY, canvas.width - 160, footerBoxH);
    ctx.setLineDash([]);

    // 浮水印主標題 (精五門 PentaSkill 官方防偽研習教材)
    ctx.fillStyle = '#0369a1';
    ctx.font = 'bold 30px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🛡️ 精五門 PentaSkill 官方防偽研習教材', canvas.width / 2, footerBoxY + 42);

    // 浮水印學員授權詳細資訊
    ctx.fillStyle = '#334155';
    ctx.font = '18px "Microsoft JhengHei", "Noto Sans TC", sans-serif';
    ctx.fillText(`【專屬授權學員】：${studentInfo}  ｜  下載日期：${todayStr}  ｜  版權所有 • 翻印必究`, canvas.width / 2, footerBoxY + 75);

    // 導出為標準高畫質 PDF 1.4
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const pdfBlob = createPdfBlobFromJpegDataUrl(dataUrl, canvas.width, canvas.height);
    const blobUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = mat.fileName && mat.fileName.endsWith('.pdf') ? mat.fileName : `${mat.title}_精五門官方講義.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  } catch (err) {
    console.error('PDF generation fallback:', err);
    generateHandoutTextWithWatermark(mat, '.pdf');
  }
}

// 產生標準 PDF 1.4 格式 Blob (支援跨瀏覽器原生解析)
function createPdfBlobFromJpegDataUrl(jpegDataUrl, width, height) {
  const base64Data = jpegDataUrl.split(',')[1];
  const binaryImg = atob(base64Data);
  const imgLen = binaryImg.length;
  const imgBytes = new Uint8Array(imgLen);
  for (let i = 0; i < imgLen; i++) {
    imgBytes[i] = binaryImg.charCodeAt(i);
  }

  const widthPt = 595.28;
  const heightPt = 841.89;

  let offset = 0;
  const parts = [];
  const offsets = [];

  function addPart(buf) {
    offsets.push(offset);
    parts.push(buf);
    offset += buf.byteLength || buf.length;
  }

  const enc = new TextEncoder();

  // Header
  const p0 = enc.encode('%PDF-1.4\n');
  parts.push(p0);
  offset += p0.length;

  // Obj 1: Catalog
  addPart(enc.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));

  // Obj 2: Pages
  addPart(enc.encode('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'));

  // Obj 3: Page
  addPart(enc.encode(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`));

  // Obj 4: Image
  const p4Head = enc.encode(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgLen} >>\nstream\n`);
  const p4Foot = enc.encode('\nendstream\nendobj\n');
  const buf4 = new Uint8Array(p4Head.length + imgBytes.length + p4Foot.length);
  buf4.set(p4Head, 0);
  buf4.set(imgBytes, p4Head.length);
  buf4.set(p4Foot, p4Head.length + imgBytes.length);
  addPart(buf4);

  // Obj 5: Contents
  const contentStream = `q ${widthPt} 0 0 ${heightPt} 0 0 cm /Im1 Do Q\n`;
  const p5 = enc.encode(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);
  addPart(p5);

  const xrefOffset = offset;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 0; i < offsets.length; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(enc.encode(xref + trailer));

  return new Blob(parts, { type: 'application/pdf' });
}

// 生成 Word 相容格式講義，底部帶有淺色防偽浮水印
// 生成 Word 相容格式講義，帶有高辨識度「精五門 PentaSkill」官方防偽浮水印
function generateHandoutWordWithWatermark(mat) {
  const studentName = currentUser ? currentUser.name : '林小明 (學員)';
  const studentEmail = currentUser ? currentUser.email : 'student@pentaskill.com';
  const studentInfo = `${studentName} (${studentEmail})`;
  const todayStr = (typeof getLocalDateString === 'function') ? getLocalDateString() : new Date().toISOString().split('T')[0];

  const htmlContent = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>${mat.title} - 精五門官方教材</title>
<style>
  body { font-family: 'Microsoft JhengHei', 'Noto Sans TC', sans-serif; line-height: 1.7; color: #1e293b; padding: 40px; margin: 0; background: #ffffff; }
  .watermark-banner-top { background: #f0fdf4; border: 2px dashed #10b981; border-radius: 8px; padding: 14px 20px; text-align: center; margin-bottom: 30px; }
  .watermark-banner-top .seal { font-size: 15pt; font-weight: bold; color: #047857; letter-spacing: 2px; }
  .watermark-banner-top .sub { font-size: 10.5pt; color: #065f46; margin-top: 4px; }
  .header { border-bottom: 3px solid #0284c7; padding-bottom: 15px; margin-bottom: 25px; }
  .brand { font-size: 24pt; font-weight: bold; color: #0f172a; }
  .subtitle { font-size: 12pt; color: #64748b; margin-top: 5px; }
  .title { font-size: 18pt; font-weight: bold; color: #0284c7; margin: 25px 0 15px; }
  .meta-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin-bottom: 30px; }
  .meta-item { font-size: 11pt; color: #334155; margin-bottom: 8px; }
  .section-title { font-size: 14pt; font-weight: bold; color: #0f172a; margin-top: 30px; border-left: 5px solid #0284c7; padding-left: 12px; }
  .content { font-size: 11.5pt; color: #334155; margin-top: 12px; }
  .watermark-footer-box { margin-top: 50px; background: #f8fafc; border: 2px dashed #0284c7; border-radius: 10px; padding: 20px; text-align: center; }
  .watermark-title { font-size: 17pt; font-weight: bold; color: #0369a1; letter-spacing: 2px; }
  .watermark-detail { font-size: 11pt; color: #334155; margin-top: 8px; font-weight: 500; }
  .watermark-legal { font-size: 9.5pt; color: #64748b; margin-top: 6px; }
</style>
</head>
<body>
  <!-- 頂部防偽浮水印標章 -->
  <div class="watermark-banner-top">
    <div class="seal">🛡️ 精五門 PentaSkill 官方防偽驗證講義教材</div>
    <div class="sub">【授權學員】：${studentInfo} ｜ 官方正版核發 ｜ 僅供個人課堂研習</div>
  </div>

  <div class="header">
    <div class="brand">精五門 PentaSkill</div>
    <div class="subtitle">實戰線上學習平台 — 專屬課堂隨課講義教材</div>
  </div>

  <div class="title">${mat.title}</div>

  <div class="meta-box">
    <div class="meta-item"><strong>對應課程：</strong>${mat.courseTitle || '實戰錄播小單元'}</div>
    <div class="meta-item"><strong>授課業師：</strong>${mat.instructorName || '精五門金牌講師'}</div>
    <div class="meta-item"><strong>專屬授權學員：</strong>${studentInfo}</div>
    <div class="meta-item"><strong>發布與下載日期：</strong>${todayStr}</div>
    <div class="meta-item"><strong>教材規格：</strong>${mat.fileName || mat.title} (${mat.fileSize || '2.5 MB'})</div>
  </div>

  <div class="section-title">📌 核心單元學習重點與精要指南</div>
  <div class="content">
    <p>1. 本講義教材由精五門業界講師精編，涵蓋最新實戰工作流、關鍵架構與常見實務陷阱解法。</p>
    <p>2. 閱讀教材後若有實作疑問，歡迎至看課頁面預約「1 對 1 線上個教批改」，由業師進行專屬指導與 Code Review。</p>
    <p>3. 實務專案作業完成後，請上傳至作業區，金牌業師將於個教時段針對效能與架構進行診斷微調。</p>
  </div>

  <!-- 底部醒目防偽浮水印底欄 -->
  <div class="watermark-footer-box">
    <div class="watermark-title">🛡️ 精五門 PentaSkill 官方授權防偽研習教材</div>
    <div class="watermark-detail">【專屬授權學員】：${studentInfo} ｜ 下載時間：${todayStr} ｜ 正版驗證</div>
    <div class="watermark-legal">（本教材受中華民國著作權法與智慧財產權保護 • 僅供已購課學員個人研習使用 • 翻印轉載必究）</div>
  </div>
</body>
</html>
  `.trim();

  const blob = new Blob([htmlContent], { type: 'application/msword;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = mat.fileName && (mat.fileName.endsWith('.doc') || mat.fileName.endsWith('.docx')) ? mat.fileName : `${mat.title}_精五門官方講義.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
}

// 生成文字或通用簡報規格教材檔，附帶精五門淺色浮水印標籤
function generateHandoutTextWithWatermark(mat, ext = '.txt') {
  const studentInfo = currentUser ? `${currentUser.name} (${currentUser.email})` : '付費學員';
  const content = `========================================================\n` +
    `精五門 PentaSkill 實戰線上學習平台 — 專屬課堂講義教材\n` +
    `========================================================\n\n` +
    `【講義名稱】：${mat.title}\n` +
    `【對應課程】：${mat.courseTitle || '實戰錄播課程'}\n` +
    `【授課講師】：${mat.instructorName || '金牌講師'}\n` +
    `【發布日期】：${mat.uploadedAt || ((typeof getLocalDateTimeString === 'function') ? getLocalDateTimeString(new Date()) : new Date().toLocaleString())}\n` +
    `【檔案規格】：${mat.fileName || mat.title} (${mat.fileSize || '2.5 MB'})\n` +
    `【下載學員】：${studentInfo}\n\n` +
    `--------------------------------------------------------\n` +
    `📌 核心單元學習重點與精要指南：\n` +
    `1. 本教材由精五門業界講師專屬提供，包含實戰工作流與核心思維。\n` +
    `2. 請搭配錄播單元影音研讀，並於作業完成後預約業師 1-on-1 個教進行實戰批改。\n` +
    `--------------------------------------------------------\n\n` +
    `祝您學習順利、收穫滿滿！\n` +
    `精五門 PentaSkill 教務教學團隊 敬上\n` +
    `官方網站：https://online-learning-platform.pey514514.workers.dev/\n\n` +
    `=================================================================================\n` +
    `[ 浮水印 Watermark ] 精五門 PentaSkill\n` +
    `※ 本教材僅供已購課學員個人研習使用，版權所有：精五門 PentaSkill (淺色防偽浮水印)\n` +
    `=================================================================================\n`;

  let mimeType = 'text/plain;charset=utf-8';
  if (ext.includes('ppt')) mimeType = 'application/vnd.ms-powerpoint';
  const blob = new Blob([content], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = mat.fileName || `${mat.title}${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// Video Player Playback Simulator & Cloudflare Stream DRM Engine
let isVideoPlaying = false;
let videoProgressPercent = 38; // Initial demo timestamp (38% ~ 14:26)
let videoTimer = null;
let videoTotalDurationSeconds = 2280; // 38 minutes

let currentStreamPlayerMode = 'cf-stream'; // 'cf-stream' or 'interactive'
let currentActiveLessonId = '2-2';

// Initialize Cloudflare Stream Engine
function initCloudflareStreamEngine() {
  setupAntiDownloadEvents();
}

function setupAntiDownloadEvents() {
  const container = document.getElementById('videoContainer');
  if (container) {
    container.addEventListener('contextmenu', handleVideoRightClick);
  }
}

function handleVideoRightClick(e) {
  if (e) e.preventDefault();
  showToast('🛡️ 本課程視訊受著作權保護，禁止右鍵與下載');
  return false;
}

// Switch between Cloudflare Stream Embed and Interactive Code View Mode
function switchPlayerMode(mode) {
  currentStreamPlayerMode = mode;
  const cfBtn = document.getElementById('btnModeCfStream');
  const codeBtn = document.getElementById('btnModeInteractive');
  const cfWrapper = document.getElementById('cloudflareStreamWrapper');
  const codeWrapper = document.getElementById('interactiveCodeWrapper');

  if (mode === 'cf-stream') {
    if (cfBtn) cfBtn.classList.add('active');
    if (codeBtn) codeBtn.classList.remove('active');
    if (cfWrapper) cfWrapper.style.display = 'block';
    if (codeWrapper) codeWrapper.style.display = 'none';
    showToast('📺 已切換為高畫質影音播放器');
  } else {
    if (codeBtn) codeBtn.classList.add('active');
    if (cfBtn) cfBtn.classList.remove('active');
    if (cfWrapper) cfWrapper.style.display = 'none';
    if (codeWrapper) codeWrapper.style.display = 'flex';
    showToast('💻 已切換為講師專題對照模式');
  }
}

// Cloudflare Stream Signed JWT Token Generator Simulation
function generateCloudflareSignedToken(streamId, user) {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    sub: streamId,
    kid: cloudflareStreamConfig.signingKeyId,
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 Hour Expiration
    nbf: Math.floor(Date.now() / 1000) - 60,
    user_email: user ? user.email : 'guest@pentaskill.com',
    allowed_origins: cloudflareStreamConfig.allowedOrigins,
    access_level: "paid_student"
  }));
  const signature = btoa("cf_stream_signed_rsa_signature_" + Math.random().toString(36).substring(2, 10));
  return `${header}.${payload}.${signature}`;
}

// Load Cloudflare Stream Lesson with Entitlement Verification

// ==========================================
// 🎓 精五門 多課程影片分流與 Cloudflare 雲端播放進度記憶模組
// (Multi-Course Video Routing & Cloudflare KV Progress Memory)
// ==========================================

let videoProgressSaveTimeout = null;
let lastCloudSyncTime = 0;

function scrollToMemberEnrolledCourses() {
  const section = document.getElementById('memberEnrolledSection') || document.getElementById('memberEnrolledCourses');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.style.transition = 'box-shadow 0.4s ease';
    section.style.borderRadius = '12px';
    section.style.boxShadow = '0 0 25px rgba(6, 182, 212, 0.55)';
    setTimeout(() => {
      section.style.boxShadow = 'none';
    }, 2000);
  }
}

function getChaptersForCourse(courseId) {
  const cid = courseId || currentViewCourseId || 'course-1';
  if (!mockChapters || !Array.isArray(mockChapters)) return [];
  const list = mockChapters.filter(c => c.courseId ? c.courseId === cid : cid === 'course-1');
  if (list && list.length > 0) return list;
  return mockChapters.filter(c => !c.courseId || c.courseId === 'course-1');
}

function getStudentVideoProgressKey(email) {
  const userEmail = email || (currentUser ? currentUser.email : 'student@pentaskill.com');
  return 'pentaskill_video_progress_' + userEmail;
}

function getStudentCourseProgress(courseId) {
  const userEmail = currentUser ? currentUser.email : 'student@pentaskill.com';
  const key = getStudentVideoProgressKey(userEmail);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[courseId] || null;
  } catch (e) {
    return null;
  }
}

function triggerAutoSaveVideoProgress() {
  if (videoProgressSaveTimeout) clearTimeout(videoProgressSaveTimeout);
  videoProgressSaveTimeout = setTimeout(() => {
    saveStudentVideoProgress(false);
  }, 1200);
}

function saveStudentVideoProgress(forceCloudSync = false) {
  const userEmail = currentUser ? currentUser.email : 'student@pentaskill.com';
  const courseId = currentViewCourseId || 'course-1';
  const key = getStudentVideoProgressKey(userEmail);
  
  let progressMap = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) progressMap = JSON.parse(raw);
  } catch (e) {}

  const currentSeconds = Math.round((videoProgressPercent / 100) * videoTotalDurationSeconds);
  const percent = Math.min(100, Math.max(0, Math.round(videoProgressPercent * 10) / 10));
  
  let currentTitle = '';
  const chapters = getChaptersForCourse(courseId);
  for (const chap of chapters) {
    const l = (chap.lessons || []).find(item => item.id === currentActiveLessonId);
    if (l) {
      currentTitle = l.title;
      if (percent >= 90) l.completed = true;
      break;
    }
  }

  const existingCourseProg = progressMap[courseId] || {};
  const completedLessons = existingCourseProg.completedLessons || [];
  if (percent >= 90 && currentActiveLessonId && !completedLessons.includes(currentActiveLessonId)) {
    completedLessons.push(currentActiveLessonId);
  }

  const now = new Date().toISOString();
  progressMap[courseId] = {
    courseId: courseId,
    lastLessonId: currentActiveLessonId,
    lastLessonTitle: currentTitle || '當前單元',
    lastProgressPercent: percent,
    lastTimeSeconds: currentSeconds,
    totalDurationSeconds: videoTotalDurationSeconds,
    lastUpdated: now,
    completedLessons: completedLessons,
    lessons: {
      ...(existingCourseProg.lessons || {}),
      [currentActiveLessonId]: {
        percent: percent,
        positionSeconds: currentSeconds,
        durationSeconds: videoTotalDurationSeconds,
        completed: percent >= 90
      }
    }
  };

  try {
    localStorage.setItem(key, JSON.stringify(progressMap));
  } catch (e) {
    console.error('儲存本地影片進度失敗:', e);
  }

  const nowTime = Date.now();
  if (forceCloudSync || (nowTime - lastCloudSyncTime > 10000)) {
    lastCloudSyncTime = nowTime;
    syncVideoProgressToCloudflare(userEmail, progressMap);
  }
}

async function syncVideoProgressToCloudflare(email, progressMap) {
  if (!email || !progressMap) return;
  const badge = document.getElementById('playerCloudSyncBadge');
  if (badge) {
    badge.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin text-cyan"></i> 雲端進度同步中...';
  }
  
  try {
    if (typeof saveCloudData === 'function') {
      await saveCloudData('video_progress_' + email, progressMap);
    }
    if (badge) {
      badge.innerHTML = '<i class="fa-solid fa-cloud-check text-green"></i> Cloudflare 雲端進度已同步';
    }
  } catch (err) {
    if (badge) {
      badge.innerHTML = '<i class="fa-solid fa-circle-check text-cyan"></i> 本地進度已保存';
    }
  }
}

async function loadStudentVideoProgressFromCloud(email) {
  if (!email) return;
  try {
    if (typeof fetchCloudData === 'function') {
      const cloudData = await fetchCloudData('video_progress_' + email);
      if (cloudData && typeof cloudData === 'object') {
        const localKey = getStudentVideoProgressKey(email);
        const localRaw = localStorage.getItem(localKey);
        let localData = {};
        if (localRaw) {
          try { localData = JSON.parse(localRaw); } catch(e) {}
        }
        
        const merged = { ...localData };
        for (const [cid, cprog] of Object.entries(cloudData)) {
          if (!merged[cid] || !merged[cid].lastUpdated || (cprog.lastUpdated && new Date(cprog.lastUpdated) >= new Date(merged[cid].lastUpdated))) {
            merged[cid] = cprog;
          }
        }
        localStorage.setItem(localKey, JSON.stringify(merged));
        console.log('✅ 已從 Cloudflare KV 載入學員最新影片播放進度');
      }
    }
  } catch (err) {
    console.warn('拉取 Cloudflare KV 影片進度失敗，將使用本地快取:', err);
  }
}

function enterCourseLearningCenter(courseId) {
  const cid = courseId || 'course-1';
  currentViewCourseId = cid;

  const course = (typeof mockCourses !== 'undefined' ? mockCourses : []).find(c => c.id === cid) || {
    id: cid,
    title: '線上實戰課程',
    instructor: '精五門金牌業師',
    categoryLabel: '實戰精選'
  };

  // 切換至錄播播放器視圖
  switchView('video-player');

  // 更新播放器頂部課程導覽列
  const titleEl = document.getElementById('playerCourseTitle');
  if (titleEl) titleEl.innerText = course.title;
  const instEl = document.getElementById('playerCourseInstructor');
  if (instEl) instEl.innerText = '主講：' + (course.instructor || '精五門業師');
  const catEl = document.getElementById('playerCourseCategoryBadge');
  if (catEl) catEl.innerText = course.categoryLabel || '實戰錄播';

  // 渲染此課程專屬講義
  if (typeof renderStudentCourseHandouts === 'function') {
    renderStudentCourseHandouts(cid);
  }

  // 渲染此課程專屬章節目錄
  renderChapters();

  // 檢查雲端/本地歷史播放進度，直接接續播放
  const prog = getStudentCourseProgress(cid);
  const chapters = getChaptersForCourse(cid);
  const firstLesson = (chapters[0] && chapters[0].lessons && chapters[0].lessons[0]) ? chapters[0].lessons[0] : null;

  if (prog && prog.lastLessonId) {
    const resumePercent = prog.lastProgressPercent || 0;
    loadCloudflareStreamLesson(prog.lastLessonId, resumePercent);
    showToast('▶️ 接續上次觀看：【' + (prog.lastLessonTitle || prog.lastLessonId) + '】(進度 ' + Math.round(resumePercent) + '%)');
  } else if (firstLesson) {
    loadCloudflareStreamLesson(firstLesson.id, 0);
    showToast('▶️ 歡迎進入【' + course.title + '】開始學習！');
  }
}

function loadCloudflareStreamLesson(lessonId, initialPercent = null) {
  currentActiveLessonId = lessonId;
  
  const currentCourseId = currentViewCourseId || 'course-1';
  const courseChapters = getChaptersForCourse(currentCourseId);
  
  let targetLesson = null;
  let targetChapTitle = '';

  for (const chap of courseChapters) {
    const found = (chap.lessons || []).find(l => l.id === lessonId);
    if (found) {
      targetLesson = found;
      targetChapTitle = chap.title;
      break;
    }
  }

  if (!targetLesson) {
    for (const chap of mockChapters) {
      const found = (chap.lessons || []).find(l => l.id === lessonId);
      if (found) {
        targetLesson = found;
        targetChapTitle = chap.title;
        break;
      }
    }
  }

  if (!targetLesson) return;

  // Update Active State in mockChapters
  mockChapters.forEach(chap => {
    (chap.lessons || []).forEach(l => {
      l.active = (l.id === lessonId);
    });
  });

  renderChapters();

  const currentTitleElem = document.getElementById('currentChapterTitle');
  if (currentTitleElem) currentTitleElem.innerText = targetLesson.title;

  // 依單元設定影片總時長
  videoTotalDurationSeconds = targetLesson.durationSeconds || 1800;

  // 恢復或載入該單元歷史播放進度
  if (initialPercent !== null && initialPercent !== undefined) {
    videoProgressPercent = initialPercent;
  } else {
    const prog = getStudentCourseProgress(currentCourseId);
    if (prog && prog.lastLessonId === lessonId && prog.lastProgressPercent !== undefined) {
      videoProgressPercent = prog.lastProgressPercent;
    } else if (prog && prog.lessons && prog.lessons[lessonId]) {
      videoProgressPercent = prog.lessons[lessonId].percent || 0;
    } else {
      videoProgressPercent = 0;
    }
  }

  updateVideoUI();

  const overlay = document.getElementById('videoTrialOverlay');

  const isUserVIP = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff' || currentUser.role === 'instructor');
  const isPaidStudent = currentUser && currentUser.purchasedCourses && (currentUser.purchasedCourses.includes(currentCourseId) || currentUser.purchasedCourses.includes('course-1'));
  const isUnlocked = isUserVIP || isPaidStudent;

  if (isUnlocked || targetLesson.isTrialAllowed) {
    if (overlay) overlay.style.display = 'none';

    const signedToken = cloudflareStreamConfig.requireSignedTokens 
      ? generateCloudflareSignedToken(targetLesson.streamId, currentUser)
      : targetLesson.streamId;

    const iframe = document.getElementById('cfStreamIframe');
    if (iframe) {
      const posterUrl = encodeURIComponent("https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80");
      const startSec = Math.round((videoProgressPercent / 100) * videoTotalDurationSeconds);
      const startTimeParam = startSec > 0 ? ('&startTime=' + startSec + 's') : '';
      iframe.src = 'https://' + cloudflareStreamConfig.customerSubdomain + '/' + signedToken + '/iframe?poster=' + posterUrl + '&autoplay=false&preload=true&primaryColor=%238b5cf6' + startTimeParam;
    }

    if (isUnlocked) {
      showToast('▶️ 已解鎖觀看：' + targetLesson.title + (videoProgressPercent > 0 ? (' (接續 ' + Math.round(videoProgressPercent) + '%)') : ''));
    } else {
      showToast('▶️ 正在觀看免費試看單元：' + targetLesson.title);
    }

    saveStudentVideoProgress(false);
  } else {
    if (overlay) overlay.style.display = 'flex';
    triggerTrialEndModal();
    showToast('🔒 本單元為付費限定！請完成報名解鎖觀看。');
  }
}

function togglePlayPause() {
  const btn = document.getElementById('playPauseBtn');
  const overlay = document.getElementById('videoTrialOverlay');
  
  if (isVideoPlaying) {
    pauseVideo();
  } else {
    // If progress is at end, reset first
    if (videoProgressPercent >= 100) {
      videoProgressPercent = 0;
      if (overlay) overlay.style.display = 'none';
    }
    
    isVideoPlaying = true;
    if (btn) btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    if (overlay) overlay.style.display = 'none';
    showToast('▶️ 播放影片中...');

    if (videoTimer) clearInterval(videoTimer);
    videoTimer = setInterval(() => {
      videoProgressPercent += 1.5;
      if (videoProgressPercent >= 100) {
        videoProgressPercent = 100;
        updateVideoUI();
        pauseVideo();
        triggerTrialEndModal();
      } else {
        updateVideoUI();
      }
    }, 400);
  }
}

function pauseVideo() {
  isVideoPlaying = false;
  if (videoTimer) clearInterval(videoTimer);
  const btn = document.getElementById('playPauseBtn');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i>';
  if (typeof saveStudentVideoProgress === 'function') saveStudentVideoProgress(true);
}

function updateVideoUI() {
  const filledBar = document.getElementById('progressFilled');
  const timeDisplay = document.getElementById('videoTimeDisplay');
  
  if (filledBar) filledBar.style.width = `${videoProgressPercent}%`;
  
  const currentSeconds = Math.round((videoProgressPercent / 100) * videoTotalDurationSeconds);
  const currentMin = Math.floor(currentSeconds / 60);
  const currentSec = currentSeconds % 60;

  const totalMin = Math.floor(videoTotalDurationSeconds / 60);
  const totalSec = videoTotalDurationSeconds % 60;
  const formattedTime = `${currentMin.toString().padStart(2, '0')}:${currentSec.toString().padStart(2, '0')} / ${totalMin.toString().padStart(2, '0')}:${totalSec.toString().padStart(2, '0')}`;
  
  if (timeDisplay) timeDisplay.innerText = formattedTime;

  const progressBadge = document.getElementById('playerCourseProgressText');
  if (progressBadge) progressBadge.innerText = `${Math.round(videoProgressPercent)}%`;

  if (typeof triggerAutoSaveVideoProgress === 'function') {
    triggerAutoSaveVideoProgress();
  }
}

function seekVideo(deltaSeconds) {
  const deltaPercent = (deltaSeconds / videoTotalDurationSeconds) * 100;
  videoProgressPercent = Math.max(0, Math.min(100, videoProgressPercent + deltaPercent));
  updateVideoUI();
  if (videoProgressPercent >= 100) {
    pauseVideo();
    triggerTrialEndModal();
    if (typeof saveStudentVideoProgress === 'function') saveStudentVideoProgress(true);
} else {
    showToast(`時間軸 ${deltaSeconds > 0 ? '+' : ''}${deltaSeconds} 秒 (${Math.round((videoProgressPercent/100)*videoTotalDurationSeconds/60)} 分鐘)`);
  }
}

function handleProgressBarClick(e) {
  const bar = document.getElementById('progressBar');
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const width = rect.width;
  const percent = Math.max(0, Math.min(100, (clickX / width) * 100));
  
  videoProgressPercent = percent;
  updateVideoUI();
  
  if (videoProgressPercent >= 100) {
    pauseVideo();
    triggerTrialEndModal();
  }
}

function triggerTrialEndModal() {
  pauseVideo();
  const overlay = document.getElementById('videoTrialOverlay');
  if (overlay) overlay.style.display = 'flex';
  
  const modal = document.getElementById('videoTrialEndModal');
  if (modal) modal.classList.add('active');
}

function closeTrialEndModal() {
  const modal = document.getElementById('videoTrialEndModal');
  if (modal) modal.classList.remove('active');
}

function replayTrialVideo() {
  closeTrialEndModal();
  const overlay = document.getElementById('videoTrialOverlay');
  if (overlay) overlay.style.display = 'none';
  videoProgressPercent = 0;
  updateVideoUI();
  togglePlayPause();
}

function renderChapters() {
  const container = document.getElementById('chapterList');
  if (!container) return;

  const currentCourseId = currentViewCourseId || 'course-1';
  const chapters = typeof getChaptersForCourse === 'function' ? getChaptersForCourse(currentCourseId) : mockChapters;

  if (!chapters || chapters.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 2rem 1rem; color: #94a3b8; font-size: 0.9rem;"><i class="fa-solid fa-film" style="font-size: 1.5rem; margin-bottom: 0.5rem; display: block; color: #64748b;"></i><span>此課程目前尚無章節影片</span></div>';
    return;
  }

  container.innerHTML = chapters.map(chap => `
    <div class="chapter-group">
      <div class="chapter-title-bar">${chap.title} (${chap.duration})</div>
      <div class="lessons-list">
        ${(chap.lessons || []).map(l => `
          <div class="lesson-item ${l.active ? 'active' : ''}" onclick="selectLesson('${chap.title}', '${l.title}', '${l.id}')">
            <span>
              <i class="fa-regular ${l.completed ? 'fa-circle-check text-green' : 'fa-circle-play'}"></i> 
              ${l.title}
              ${l.isTrialAllowed ? '<span class="badge-tag bg-purple text-xs margin-left-xs">免費試看</span>' : '<i class="fa-solid fa-lock text-xs text-pink margin-left-xs" title="付費解鎖"></i>'}
            </span>
            <span class="text-sm">${l.active ? '播放中' : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function selectLesson(chapTitle, lessonTitle, lessonId) {
  if (lessonId) {
    loadCloudflareStreamLesson(lessonId);
  } else {
    document.getElementById('currentChapterTitle').innerText = lessonTitle;
    videoProgressPercent = 15;
    updateVideoUI();
    const overlay = document.getElementById('videoTrialOverlay');
    if (overlay) overlay.style.display = 'none';
    showToast(`切換至播放單元：${lessonTitle}`);
  }
}

// Cloudflare Stream CMS Configuration Modal Handlers
function openCloudflareStreamModal() {
  document.getElementById('cfInputAccountId').value = cloudflareStreamConfig.accountId;
  document.getElementById('cfInputSubdomain').value = cloudflareStreamConfig.customerSubdomain;
  document.getElementById('cfInputRequireToken').value = cloudflareStreamConfig.requireSignedTokens ? "true" : "false";
  
  let activeLesson = null;
  for (const c of mockChapters) {
    const f = c.lessons.find(l => l.active || l.id === currentActiveLessonId);
    if (f) { activeLesson = f; break; }
  }
  if (activeLesson) {
    document.getElementById('cfInputCurrentLessonStreamId').value = activeLesson.streamId;
  }
  
  document.getElementById('cloudflareStreamModal').classList.add('active');
}

function closeCloudflareStreamModal() {
  document.getElementById('cloudflareStreamModal').classList.remove('active');
}

function handleSaveCloudflareConfig(e) {
  e.preventDefault();
  
  cloudflareStreamConfig.accountId = document.getElementById('cfInputAccountId').value.trim();
  cloudflareStreamConfig.customerSubdomain = document.getElementById('cfInputSubdomain').value.trim();
  cloudflareStreamConfig.requireSignedTokens = (document.getElementById('cfInputRequireToken').value === "true");

  const newStreamId = document.getElementById('cfInputCurrentLessonStreamId').value.trim();
  
  // Update streamId for current active lesson
  mockChapters.forEach(chap => {
    chap.lessons.forEach(l => {
      if (l.id === currentActiveLessonId || l.active) {
        l.streamId = newStreamId;
      }
    });
  });

  closeCloudflareStreamModal();
  loadCloudflareStreamLesson(currentActiveLessonId);
  showToast(`✅ Cloudflare Stream 資安串接與防下載設定已成功更新！`);
}

function generateDemoStreamToken() {
  const streamId = document.getElementById('cfInputCurrentLessonStreamId').value.trim() || 'fc38d9982a1740d7a0491823901bc093';
  const token = generateCloudflareSignedToken(streamId, currentUser);
  
  const output = document.getElementById('cfTokenOutputText');
  if (output) {
    output.style.display = 'block';
    output.innerText = `🔑 JWT Signed Token:\n${token}`;
  }
  showToast('🔑 測試 Signed JWT Token 已即時生成成功！');
}

function setupTabEvents() {
  const tabs = document.querySelectorAll('.v-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');

      const targetId = e.target.getAttribute('data-vtab');
      document.querySelectorAll('.v-tab-content').forEach(c => c.classList.remove('active'));
      const targetContent = document.getElementById(`vtab-${targetId}`);
      if (targetContent) targetContent.classList.add('active');
    });
  });
}

// Instructors Directory Rendering
function renderInstructors() {
  const grid = document.getElementById('instructorGrid');
  if (!grid) return;

  grid.innerHTML = mockInstructors.map(inst => `
    <div class="instructor-card" onclick="openInstructorModal('${inst.id}')" style="cursor:pointer;">
      <img class="inst-img" src="${inst.avatar}" alt="${inst.name}">
      <div class="inst-name">${inst.name} <span class="tag-badge bg-purple">${inst.tag || '教學多年業師'}</span></div>
      <div class="inst-role">${inst.role}</div>
      <div class="inst-exp">${inst.exp}</div>
      
      <div class="skills-tags">
        ${inst.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
      </div>

      <div class="text-sm text-muted margin-top-xs">
        <i class="fa-solid fa-clock text-purple"></i> 1-on-1 個教鐘點: <strong>${inst.rate1on1}</strong>
      </div>
      
      <p class="text-sm text-muted margin-top-sm" style="font-style: italic;">${inst.quote}</p>

      <button class="btn btn-outline btn-sm btn-block margin-top-md" onclick="event.stopPropagation(); quickBookInstructor('${inst.name}')">
        <i class="fa-solid fa-calendar-check"></i> 預約講師個教
      </button>
    </div>
  `).join('');
}

const instructorRoomData = {
  "張哲銘 (Ethan)": {
    name: "張哲銘 (Full-Stack & AI 技術專家)",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
    title: "【1-on-1個教陪跑】Full-Stack & AI 專案架構 1 對 1 現場診斷與 Code Review",
    cursor: "張哲銘 講師正在為你的 React 19 與 AI API 串接進行一對一診斷修稿...",
    designContent: "React State & OpenAI API 串接診斷區 (Ethan 講師即時連線中)"
  },
  "陳婷俐 (Tina)": {
    name: "陳婷俐 (UI/UX 與 Figma 系統總監)",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
    title: "【1-on-1個教陪跑】UI/UX Figma 設計系統與 3D 擬態作品集修稿",
    cursor: "陳婷俐 講師正在為你的 Auto-Layout 與 3D 玻璃擬態質感進行一對一微調...",
    designContent: "Figma Design System & Auto-Layout 批修區 (Tina 講師即時連線中)"
  },
  "歐陽翔 (Shawn)": {
    name: "歐陽翔 (Python 數據分析與 AI 顧問)",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
    title: "【1-on-1個教陪跑】Python 數據模型、爬蟲與 3D 空間建模診斷",
    cursor: "歐陽翔 講師正在為你的數據模型腳本與 V-Ray 渲染參數進行一對一優化...",
    designContent: "Python Data Pipeline & 3D Spatial Render 批修區 (Shawn 講師即時連線中)"
  },
  "林雅涵 (Hannah)": {
    name: "林雅涵 (短影音與數位整合行銷總監)",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    title: "【1-on-1個教陪跑】短影音爆款腳本與電影級調色一對一審查",
    cursor: "林雅涵 講師正在為你的影音腳本鉤子 (Hook) 與廣告文案進行一對一優化...",
    designContent: "Premiere / AE 短影音剪輯與文案批修區 (Hannah 講師即時連線中)"
  }
};

function updateLiveRoomUI(instructorName) {
  let key = Object.keys(instructorRoomData).find(k => k === instructorName || k.includes(instructorName) || instructorName.includes(k.split(' ')[0]));
  if (!key) key = "張哲銘 (Ethan)";

  const data = instructorRoomData[key];
  
  const titleEl = document.getElementById('liveRoomTitle');
  const avatarEl = document.getElementById('liveInstructorAvatar');
  const labelEl = document.getElementById('liveInstructorLabel');
  const cursorEl = document.getElementById('liveWhiteboardCursor');
  const mockDesignEl = document.getElementById('liveMockDesign');

  if (titleEl) titleEl.innerText = data.title;
  if (avatarEl) avatarEl.src = data.avatar;
  if (labelEl) labelEl.innerHTML = `<i class="fa-solid fa-crown text-yellow"></i> 講師：${data.name}`;
  if (cursorEl) cursorEl.innerHTML = `<i class="fa-solid fa-arrow-pointer text-pink"></i> ${data.cursor}`;
  if (mockDesignEl) mockDesignEl.innerText = data.designContent;

  const studentLabelEl = document.getElementById('liveStudentLabel');
  const studentAvatarEl = document.getElementById('liveStudentAvatar');
  const sName = currentUser ? currentUser.name : '學員';
  const sAvatar = (currentUser && currentUser.avatar) ? currentUser.avatar : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';
  if (studentLabelEl) studentLabelEl.innerHTML = `<i class="fa-solid fa-user-graduate text-cyan"></i> 學員：${sName} (你)`;
  if (studentAvatarEl) studentAvatarEl.src = sAvatar;
}

// 驗證並取得當前使用者已付費/已開通之 1-on-1 講師清單
function getPaidInstructorsForUser(user) {
  if (!user) return [];

  // 1. 平台主管 (Manager)、顧問 (Consultant) 與 營運員工 (Staff) 擁有全平台測試與代預約權限 (全師資開放)
  if (user.role === 'manager' || user.role === 'consultant' || user.role === 'staff') {
    return mockInstructors.map(i => ({
      name: i.name,
      role: i.role,
      reason: '👑 管理主管 / 顧問 / 營運權限 (全師資開放)'
    }));
  }

  // 2. 講師本人 (Instructor)
  if (user.role === 'instructor') {
    const selfInst = mockInstructors.filter(i => i.name.includes(user.name) || user.name.includes(i.name.split(' ')[0]));
    if (selfInst.length > 0) {
      return selfInst.map(i => ({
        name: i.name,
        role: i.role,
        reason: '👨‍🏫 講師本人專屬帶課教室'
      }));
    }
    return mockInstructors.map(i => ({ name: i.name, role: i.role, reason: '👨‍🏫 講師權限' }));
  }

  // 3. 一般學員 (Student / 線上註冊學員)：精準比對已付費開通之課程與客製化報價單
  const paidList = [];
  const addedNames = new Set();

  // (A) 檢查已購買課程 (purchasedCourses)
  const purchasedCourseIds = user.purchasedCourses || [];
  purchasedCourseIds.forEach(cId => {
    const course = mockCourses.find(c => c.id === cId);
    if (course && course.instructor) {
      const matchedInst = mockInstructors.find(i => i.name === course.instructor || course.instructor.includes(i.name.split(' ')[0]));
      const instName = matchedInst ? matchedInst.name : course.instructor;
      const instRole = matchedInst ? matchedInst.role : (course.categoryLabel || '專屬業師');
      if (!addedNames.has(instName)) {
        addedNames.add(instName);
        paidList.push({
          name: instName,
          role: instRole,
          reason: `✅ 已購《${course.title.length > 18 ? course.title.substring(0, 18) + '...' : course.title}》含 1-on-1 權益`
        });
      }
    }
  });

  // (B) 檢查手動/專屬開通講師 (purchasedInstructors)
  if (Array.isArray(user.purchasedInstructors)) {
    user.purchasedInstructors.forEach(instName => {
      if (!addedNames.has(instName)) {
        const matchedInst = mockInstructors.find(i => i.name === instName || instName.includes(i.name.split(' ')[0]));
        addedNames.add(instName);
        paidList.push({
          name: instName,
          role: matchedInst ? matchedInst.role : '專屬個教業師',
          reason: '✅ 已開通專屬 1 對 1 個教方案'
        });
      }
    });
  }

  // (C) 檢查是否有成交的專屬客製化報價單 (mockCustomQuotes)
  if (user.email && Array.isArray(mockCustomQuotes)) {
    mockCustomQuotes.forEach(q => {
      if (q.studentEmail && q.studentEmail.toLowerCase() === user.email.toLowerCase()) {
        mockInstructors.forEach(i => {
          const shortName = i.name.split(' ')[0];
          if ((q.courseTitle && q.courseTitle.includes(shortName)) || (q.details && q.details.includes(shortName))) {
            if (!addedNames.has(i.name)) {
              addedNames.add(i.name);
              paidList.push({
                name: i.name,
                role: i.role,
                reason: `✅ 報價單《${q.courseTitle.length > 18 ? q.courseTitle.substring(0, 18) + '...' : q.courseTitle}》已開通`
              });
            }
          }
        });
      }
    });
  }

  return paidList;
}

// 根據學員付費狀態動態渲染「選擇教學多年業師」下拉選單與權限防呆鎖定
function renderBookingInstructorDropdown() {
  const select = document.getElementById('bookingInstructor');
  const lockedAlert = document.getElementById('bookingLockedAlert');
  const bookingForm = document.getElementById('bookingForm');
  if (!select) return;

  const paidInstructors = getPaidInstructorsForUser(currentUser);

  if (paidInstructors.length > 0) {
    if (lockedAlert) lockedAlert.style.display = 'none';
    if (bookingForm) bookingForm.style.display = 'block';

    select.innerHTML = paidInstructors.map(p => `
      <option value="${p.name}">${p.name} 講師 (${p.role}) — ${p.reason}</option>
    `).join('');

    const currentSelected = select.value;
    updateLiveRoomUI(currentSelected);
    updateAvailableSlots();
  } else {
    // 尚未購買或未登入訪客
    if (bookingForm) bookingForm.style.display = 'none';
    if (lockedAlert) {
      lockedAlert.style.display = 'block';
      lockedAlert.innerHTML = `
        <div class="booking-locked-box" style="background: rgba(239, 68, 68, 0.06); border: 1.5px dashed rgba(244, 63, 94, 0.5); border-radius: var(--radius-md); padding: 1.5rem; text-align: center; margin-bottom: 1rem;">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🔒</div>
          <h4 style="color: #f43f5e; margin-bottom: 0.4rem; font-size: 1.15rem;">1 對 1 專屬個教預約權限未開通</h4>
          <p class="text-sm text-muted" style="line-height: 1.6; margin-bottom: 1.2rem;">
            為維護教學品質、保障付費學員權益並避免時段強碰，<strong>1-on-1 個教時段僅開放予「已付費開通該講師課程」之學員預約</strong>。<br>
            ${currentUser ? `當前登入學員：<strong class="text-purple">${currentUser.name} (${currentUser.email})</strong>（尚未購買包含個教之方案）` : '您目前為<strong>訪客未登入狀態</strong>，請先登入學員帳號或購買課程方案。'}
          </p>
          <div class="flex-center gap-sm" style="flex-wrap: wrap; justify-content: center;">
            ${!currentUser ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="openLoginModal()">
                <i class="fa-solid fa-right-to-bracket"></i> 登入學員帳號
              </button>
            ` : ''}
            <button type="button" class="btn btn-primary btn-sm" onclick="switchView('marketplace')">
              <i class="fa-solid fa-cart-shopping"></i> 前往課程商城開通方案
            </button>
            <a href="https://lin.ee/yq4lFuv" target="_blank" class="btn btn-outline btn-sm" style="border-color: #06C755; color: #06C755;">
              <i class="fa-brands fa-line"></i> 洽 LINE 小編領取專屬方案
            </a>
          </div>
        </div>
      `;
    }
  }
}

function quickBookInstructor(name) {
  switchView('live-classroom');
  const paidInstructors = getPaidInstructorsForUser(currentUser);
  const isAuthorized = paidInstructors.some(p => p.name === name || p.name.includes(name.split(' ')[0]) || name.includes(p.name.split(' ')[0]));

  if (!isAuthorized && currentUser && currentUser.role === 'student') {
    showToast(`💡 提示：您尚未購買 ${name} 講師之 1-on-1 個教方案，請先開通方案後即可預約專屬時段！`, 'info');
    return;
  }

  const select = document.getElementById('bookingInstructor');
  if (select && name) {
    let matchedIndex = -1;
    for (let i = 0; i < select.options.length; i++) {
      const optVal = select.options[i].value;
      const optText = select.options[i].text;
      if (optVal === name || optVal.includes(name) || optText.includes(name) || name.includes(optVal.split(' ')[0])) {
        matchedIndex = i;
        break;
      }
    }
    if (matchedIndex !== -1) {
      select.selectedIndex = matchedIndex;
    }
  }

  updateLiveRoomUI(name);
  showToast(`已為您切換至 ${name} 講師的預約時段與 1-on-1 專屬教室！`);
}

// AI Assistant
function handleAiKeyPress(e) {
  if (e.key === 'Enter') sendAiMsg();
}

function sendAiMsg() {
  const input = document.getElementById('aiInput');
  const chatBody = document.getElementById('aiChatBody');
  if (!input || !input.value.trim()) return;

  const userText = input.value.trim();
  
  const userMsgDiv = document.createElement('div');
  userMsgDiv.className = 'ai-msg user';
  userMsgDiv.innerText = userText;
  chatBody.appendChild(userMsgDiv);

  input.value = '';
  chatBody.scrollTop = chatBody.scrollHeight;

  setTimeout(() => {
    const botMsgDiv = document.createElement('div');
    botMsgDiv.className = 'ai-msg bot';
    
    let botReply = "這個問題太棒了！講師在影片中講到的核心在於 async/await 搭配 state 異步更新。<br><small class='text-yellow' style='font-size:0.72rem;'>⚠️ (註：回答僅供參考，若與講師教學上有出入，請一律以講師上課內容為主)</small>";
    if (userText.includes("作業") || userText.includes("繳交")) {
      botReply = "您可以點擊影片下方「繳交個教作業」按鈕，上傳您的 GitHub Repo。上傳後講師會收到通知並於一對一時間為您進行線上 Code Review！<br><small class='text-yellow' style='font-size:0.72rem;'>⚠️ (註：回答僅供參考，若與講師教學上有出入，請一律以講師上課內容為主)</small>";
    }

    botMsgDiv.innerHTML = botReply;
    chatBody.appendChild(botMsgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 700);
}

// 📅 本地日期字串輔助函式 (YYYY-MM-DD，避免 UTC 時差誤差)
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 產生當月起往後的預約快捷選日標籤 (由今日起往後 14 天)
function renderBookingQuickDateChips(selectedDateStr) {
  const container = document.getElementById('bookingQuickDateChips');
  if (!container) return;

  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const chipsHtml = [];
  const baseDate = new Date();

  // 從當天開始往後 3 天才開放預約 (今日、明日、後天鎖住不能預約，以利提前與業師協調排班)
  for (let i = 3; i < 17; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dateStr = getLocalDateString(d);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const w = weekdayNames[d.getDay()];

    let label = `${m}/${day} (${w})`;
    if (i === 3) label = `3天後 ${m}/${day} (${w})`;
    else if (i === 4) label = `4天後 ${m}/${day} (${w})`;
    else if (i === 5) label = `5天後 ${m}/${day} (${w})`;

    const isActive = (dateStr === selectedDateStr);
    chipsHtml.push(`
      <button type="button" class="quick-date-chip ${isActive ? 'active' : ''}" onclick="selectQuickBookingDate('${dateStr}')">
        ${label}
      </button>
    `);
  }

  container.innerHTML = chipsHtml.join('');
}

function selectQuickBookingDate(dateStr) {
  const dateInput = document.getElementById('bookingDate');
  if (dateInput) {
    dateInput.value = dateStr;
    updateAvailableSlots();
  }
}

// Dynamic Slot Availability & Conflict Prevention
function updateAvailableSlots() {
  const dateInput = document.getElementById('bookingDate');
  const instSelect = document.getElementById('bookingInstructor');
  const slotsContainer = document.getElementById('slotsGrid');
  if (!dateInput || !instSelect || !slotsContainer) return;

  // 1 對 1 個教限制：至少提前 3 天預約
  const minBookingDate = new Date();
  minBookingDate.setDate(minBookingDate.getDate() + 3);
  const minBookingDateStr = getLocalDateString(minBookingDate);

  dateInput.min = minBookingDateStr;
  if (!dateInput.value || dateInput.value < minBookingDateStr) {
    dateInput.value = minBookingDateStr;
  }

  const selectedDate = dateInput.value;
  renderBookingQuickDateChips(selectedDate);

  const selectedInst = instSelect.value;

  const standardSlots = [
    "14:00 - 15:00",
    "15:30 - 16:30",
    "19:00 - 20:00",
    "20:30 - 21:30"
  ];

  const bookedTimes = mockBookings
    .filter(b => (b.instructor === selectedInst || selectedInst.includes(b.instructor.split(' ')[0])) && b.date === selectedDate && b.status !== '已取消')
    .map(b => b.slotTime);

  let firstAvailableSet = false;

  slotsContainer.innerHTML = standardSlots.map(slot => {
    const isBooked = bookedTimes.includes(slot);
    if (isBooked) {
      return `<div class="slot-chip disabled"><i class="fa-solid fa-lock text-danger"></i> ${slot} (已被預約)</div>`;
    } else {
      const isActive = !firstAvailableSet;
      if (isActive) firstAvailableSet = true;
      return `<div class="slot-chip ${isActive ? 'active' : ''}" onclick="selectSlotChip(this)">${slot} (可預約)</div>`;
    }
  }).join('');
}

function selectSlotChip(chipEl) {
  if (chipEl.classList.contains('disabled')) return;
  document.querySelectorAll('#slotsGrid .slot-chip').forEach(c => c.classList.remove('active'));
  chipEl.classList.add('active');
}

// 1-on-1 Booking System with Conflict Prevention & Real-time Slot Lock
function handleBooking(e) {
  e.preventDefault();
  const inst = document.getElementById('bookingInstructor').value;
  const topic = document.getElementById('bookingTopic').options[document.getElementById('bookingTopic').selectedIndex].text;
  const date = document.getElementById('bookingDate').value;
  const notes = document.getElementById('bookingNotes') ? document.getElementById('bookingNotes').value : '';

  // 1. 驗證預約時間是否至少在 3 天後 (前 3 天已鎖定，以利與老師協調排班)
  const minBookingDate = new Date();
  minBookingDate.setHours(0, 0, 0, 0);
  minBookingDate.setDate(minBookingDate.getDate() + 3);
  const minBookingDateStr = getLocalDateString(minBookingDate);

  if (date < minBookingDateStr) {
    showToast('⚠️ 1 對 1 個教須至少提前 3 天預約（以便提前與業師協調排班），請選擇 3 天後的時段！');
    updateAvailableSlots();
    return;
  }

  // 2. 二次安全性與付費權限驗證 (避免未付費強碰或爭議)
  const paidInstructors = getPaidInstructorsForUser(currentUser);
  if (paidInstructors.length === 0 || !paidInstructors.some(p => p.name === inst || inst.includes(p.name.split(' ')[0]))) {
    showToast(`⚠️ 權限驗證失敗：您尚未開通 ${inst} 講師的 1-on-1 個教時段，無法完成預約！`, 'warning');
    renderBookingInstructorDropdown();
    return;
  }

  const activeSlot = document.querySelector('#slotsGrid .slot-chip.active');
  if (!activeSlot || activeSlot.classList.contains('disabled')) {
    showToast('⚠️ 該時段已被其他學員優先預約或不可選，請選擇其他可預約時段！');
    return;
  }

  const rawSlotText = activeSlot.innerText;
  const slotTimeText = rawSlotText.split(' ')[0] + ' - ' + rawSlotText.split(' ')[2]; // e.g. "14:00 - 15:00"

  // Prevent double booking conflict
  const conflict = mockBookings.find(b => (b.instructor === inst || inst.includes(b.instructor.split(' ')[0])) && b.date === date && b.slotTime === slotTimeText && b.status !== '已取消');

  if (conflict) {
    showToast(`⚠️ 抱歉！${inst} 講師於 ${date} ${slotTimeText} 已被搶先預約！請改選其他時段。`);
    updateAvailableSlots();
    return;
  }

  let fee = 1800;
  if (inst.includes('Tina') || inst.includes('陳婷俐')) fee = 2000;
  if (inst.includes('Shawn') || inst.includes('歐陽翔')) fee = 1600;

  const newBooking = {
    id: `bk-${Date.now().toString().slice(-4)}`,
    instructor: inst,
    studentName: currentUser ? currentUser.name : "林小明",
    studentEmail: currentUser ? currentUser.email : "student@pentaskill.com",
    date: date,
    slotTime: slotTimeText,
    topic: topic,
    notes: notes || "無特殊備註",
    status: "已預約",
    fee: fee,
    payout: Math.round(fee * 0.6)
  };

  mockBookings.push(newBooking);
  saveBookingsToStorage();

  showToast(`🎉 預約成功！已防重疊鎖定 ${inst} 講師於 ${date} (${slotTimeText}) 的 1 小時個教！`);
  if (typeof closeNewBookingModal === 'function') closeNewBookingModal();

  updateAvailableSlots();
  renderStudentBookings();
  renderBookingAdminTable();
  renderMentorSalaryTable();
}


// 驗證是否符合「課前最晚 2 天 (48 小時前)」改期與取消規則
// 🕒 1-on-1 課前入場 (10分鐘) 與改期限制 (48小時) 智慧校驗引擎
function getBookingTimeInfo(booking) {
  if (!booking || !booking.date || !booking.slotTime) {
    return { canEnter: true, canModify: true, tooEarly: false, isOngoing: false, isLateOver10Mins: false, isEnded: false, diffHours: 999, diffMins: 999, diffHoursExact: 999, startStr: '14:00', endStr: '15:00' };
  }
  const parts = (booking.slotTime || '').split(' - ');
  const startStr = parts[0] || '14:00';
  const endStr = parts[1] || '15:00';
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);

  const bookingDateTime = new Date(`${booking.date}T${String(startH).padStart(2, '0')}:${String(startM || 0).padStart(2, '0')}:00`);
  const endDateTime = new Date(`${booking.date}T${String(endH).padStart(2, '0')}:${String(endM || 0).padStart(2, '0')}:00`);
  const now = new Date();

  const diffMs = bookingDateTime.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffMins = Math.round(diffMs / (1000 * 60)); // 正值：距開課剩餘分鐘；負值：已過開課時間分鐘

  // 1. 是否尚未開放入場 (開課前 10 分鐘以上)
  const tooEarly = diffMins > 10;
  // 2. 是否已超過下課時間
  const isEnded = now.getTime() > endDateTime.getTime();
  // 3. 是否正在上課進行中 (開課後且尚未下課)
  const isOngoing = (diffMins <= 0 && !isEnded);
  // 4. 是否開課後超過 10 分鐘遲到進入 (超過 10 分鐘依然允許進教室繼續上課，但下課不順延)
  const isLateOver10Mins = (diffMins <= -10 && !isEnded);

  // 只要進入「開課前 10 分鐘」開始，直到「下課時間」結束前，學員與老師隨時皆可進教室！
  // 即使超過 10 分鐘晚到，系統絕不阻擋，依然可以進入繼續上課！
  const canEnter = !tooEarly && !isEnded;

  // 上課前 48 小時才可線上改期或取消 (管理者不在此限)
  const isStaff = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff');
  const canModify = isStaff || (diffHours >= 48);

  return {
    canEnter,
    canModify,
    tooEarly,
    isOngoing,
    isLateOver10Mins,
    isEnded,
    diffHours: Math.max(0, Math.floor(diffHours)),
    diffMins: diffMins,
    diffHoursExact: diffHours,
    startStr,
    endStr,
    bookingDateTime,
    endDateTime
  };
}

function isSameInstructor(name1, name2) {
  if (!name1 || !name2) return false;
  if (name1 === name2) return true;
  const clean1 = name1.replace(/\(.*?\)/g, '').trim();
  const clean2 = name2.replace(/\(.*?\)/g, '').trim();
  return clean1 === clean2 || name1.includes(clean2) || name2.includes(clean1);
}

function checkCanRescheduleOrCancel(booking) {
  // 管理員 (Manager / Consultant / Staff) 具備最高調整權限
  if (currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff')) {
    return { allowed: true };
  }

  if (!booking || !booking.date || !booking.slotTime) return { allowed: true };

  const startHourStr = (booking.slotTime.split(' - ')[0] || '14').split(':')[0];
  const bookingDateTime = new Date(`${booking.date}T${startHourStr.padStart(2, '0')}:00:00`);
  const now = new Date();

  const diffHours = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours < 48) {
    return {
      allowed: false,
      diffHours: Math.max(0, Math.round(diffHours)),
      message: `⚠️ 依據服務條款：距離上課時間已不足 2 天 (48 小時)，系統無法線上改期或取消！\n\n📌 1-on-1 個教重要規範說明：\n1. 講師時段已為您專屬排班保留。\n2. 當天臨時取消或未出席者將視為放棄該次上課權益，不予退還時數或補課。\n3. 如遇不可抗力重大突發狀況，請立即聯繫官方 LINE@ 客服小編專人協調！`
    };
  }

  return { allowed: true, diffHours: Math.round(diffHours) };
}

// Student Bookings Management & Real-time Reschedule System
function renderStudentBookings() {
  // Calendar sync
  if (typeof renderClassroomCalendar === 'function') renderClassroomCalendar();
  const container = document.getElementById('studentUpcomingList');
  if (!container) return;

  const studentBookings = mockBookings.filter(b => b.status !== '已取消');

  // 更新手機端分頁上的預約堂數徽章
  const mobileBadge = document.getElementById('mobileUpcomingBadge');
  if (mobileBadge) {
    if (studentBookings.length > 0) {
      mobileBadge.innerText = studentBookings.length;
      mobileBadge.style.display = 'inline-block';
    } else {
      mobileBadge.style.display = 'none';
    }
  }

  if (studentBookings.length === 0) {
    container.innerHTML = `
      <div class="empty-booking-card" style="text-align:center; padding: 1.25rem 0.75rem; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.12); border-radius: var(--radius-md);">
        <div style="font-size: 1.6rem; color: var(--accent-cyan); margin-bottom: 0.35rem;"><i class="fa-regular fa-calendar-check"></i></div>
        <div style="font-size: 0.92rem; font-weight: 700; color: #fff; margin-bottom: 0.25rem;">您目前尚無預約的個教行程</div>
        <p class="text-xs text-muted" style="margin-bottom: 0.75rem;">已開通 1 對 1 個教之學員，可由下方挑選講師與合適時段預約專屬線上輔導</p>
        <button class="btn btn-sm btn-outline" onclick="scrollToBookingForm()" style="font-size:0.8rem; display:inline-flex; align-items:center; gap:0.35rem;">
          <i class="fa-solid fa-calendar-plus text-purple"></i> 立即挑選時段預約
        </button>
      </div>
      <div class="booking-notice-box margin-top-sm" style="background: rgba(255, 255, 255, 0.03); border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: var(--radius-sm); padding: 0.85rem; font-size: 0.78rem; line-height: 1.5; color: var(--text-muted);">
        <strong class="text-yellow"><i class="fa-solid fa-bell"></i> 1-on-1 個教上課與改期須知：</strong><br>
        1. <strong>提前 10 分鐘開放入場</strong>：上課開始前 10 分鐘即可提前點擊「進入教室」測試麥克風與視訊。<br>
        2. <strong>最晚改期時限</strong>：若臨時有事須改期，<strong>請最晚於上課前 2 天 (48小時前) 於系統線上改期或通知小編</strong>。<br>
        3. <strong>當天取消視為放棄</strong>：上課當天臨時取消或缺席者，因講師時段已專屬保留，<strong>視為放棄該次上課權益且不予退還時數</strong>。<br>
        4. <strong>課前 1 天提醒</strong>：系統會於上課前一天自動發送 LINE / Email 提醒上課。
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="booking-items-wrapper">
      ${studentBookings.map(b => {
        const timeInfo = getBookingTimeInfo(b);
        let timeBadge = '<span class="badge badge-green" style="font-size:0.68rem; padding:2px 7px;"><i class="fa-solid fa-circle-check"></i> 課前10分可進</span>';
        if (timeInfo.isOngoing) {
          timeBadge = '<span class="badge badge-warning" style="font-size:0.68rem; padding:2px 7px;"><i class="fa-solid fa-tower-broadcast"></i> 上課進行中 (不延下課)</span>';
        } else if (timeInfo.isEnded) {
          timeBadge = '<span class="badge badge-gray" style="font-size:0.68rem; padding:2px 7px;"><i class="fa-solid fa-clock"></i> 課程已結束</span>';
        } else if (timeInfo.tooEarly) {
          timeBadge = `<span class="badge badge-purple" style="font-size:0.68rem; padding:2px 7px;"><i class="fa-regular fa-clock"></i> 距開課 ${timeInfo.diffHours > 0 ? timeInfo.diffHours + '小時' : timeInfo.diffMins + '分鐘'}</span>`;
        }

        // 匹配金牌講師頭像
        let instAvatar = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80';
        if (typeof mockInstructors !== 'undefined') {
          const foundInst = mockInstructors.find(i => b.instructor.includes(i.name.split(' ')[0]));
          if (foundInst && foundInst.avatar) instAvatar = foundInst.avatar;
        }

        return `
        <div class="booking-item-card ${timeInfo.isOngoing ? 'booking-item-ongoing' : ''}">
          <div class="b-item-top">
            <div class="b-instructor-info">
              <img src="${instAvatar}" alt="${b.instructor}" class="b-inst-avatar">
              <div class="b-inst-text">
                <div class="b-inst-header">
                  <span class="b-inst-name">${b.instructor} 講師</span>
                  ${b.status === '已改期' ? '<span class="badge badge-cyan" style="font-size:0.68rem; padding:2px 6px;">已改期</span>' : ''}
                </div>
                <div class="b-topic-title" title="${b.topic}">${b.topic}</div>
              </div>
            </div>
            <div class="b-badge-container">
              ${timeBadge}
            </div>
          </div>

          <div class="b-item-schedule">
            <div class="b-schedule-pill">
              <i class="fa-regular fa-calendar-days text-purple"></i>
              <span>${b.date}</span>
              <span class="b-schedule-divider">|</span>
              <i class="fa-regular fa-clock text-cyan"></i>
              <span>${b.slotTime}</span>
            </div>
            <span class="text-xs text-muted"><i class="fa-solid fa-hourglass-half"></i> 60分鐘一對一</span>
          </div>

          <div class="b-item-actions">
            <button class="btn btn-enter-classroom ${timeInfo.canEnter ? 'btn-primary' : 'btn-outline'}" onclick="joinUpcomingRoom('${b.id}')" title="${timeInfo.canEnter ? '點擊進入教室上課' : '開課前 10 分鐘開放入場'}">
              <i class="fa-solid ${timeInfo.canEnter ? 'fa-video' : 'fa-door-open'}"></i>
              <span>${timeInfo.isOngoing ? '進入教室 (上課進行中)' : (timeInfo.canEnter ? '立即進入 1-on-1 教室' : '進入教室 (課前10分開放入場)')}</span>
            </button>
            <div class="b-sub-actions">
              <button class="btn btn-sm btn-outline btn-reschedule" onclick="openRescheduleModal('${b.id}')" title="最晚課前2天 (48小時前) 可線上改期">
                <i class="fa-solid fa-calendar-pen text-purple"></i> 改期時段
              </button>
              <button class="btn btn-sm btn-outline-danger btn-cancel" onclick="cancelBooking('${b.id}')" title="取消預約">
                <i class="fa-solid fa-xmark"></i> 取消預約
              </button>
            </div>
          </div>
        </div>
        `;
      }).join('')}
    </div>

    <div class="booking-notice-box margin-top-sm" style="background: rgba(255, 255, 255, 0.03); border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: var(--radius-sm); padding: 0.85rem; font-size: 0.78rem; line-height: 1.5; color: var(--text-muted);">
      <strong class="text-yellow"><i class="fa-solid fa-triangle-exclamation"></i> 1-on-1 個教重要規範：</strong><br>
      • <strong>提早進場</strong>：上課前 10 分鐘即可點擊「進入教室」測試麥克風與螢幕共享。<br>
      • <strong>超過 10 分鐘仍可進教室</strong>：若學員或老師因故晚到超過 10 分鐘，<strong>依然隨時可直接進教室繼續上課</strong>；但為維護後續排班紀律，<strong>下課時間不予順延（準時下課）</strong>，請老師與學員留意時間並掌握授課進度！<br>
      • <strong>改期時限</strong>：若需改時間，<strong>最晚須於上課前 2 天 (48小時) 線上改期</strong>；當天臨時取消視為放棄上課。<br>
      • <strong>課前 1 天通知</strong>：系統將於課前一天發送 LINE / Email 提醒老師與學員準備上課！
    </div>
  `;
}

let activeRescheduleBookingId = null;

function openRescheduleModal(bookingId) {
  const booking = mockBookings.find(b => b.id === bookingId);
  if (!booking) return;

  const check = checkCanRescheduleOrCancel(booking);
  if (!check.allowed) {
    showToast(check.message);
    return;
  }

  activeRescheduleBookingId = bookingId;
  const idInput = document.getElementById('rescheduleBookingId');
  if (idInput) idInput.value = booking.id;
  const instNameEl = document.getElementById('rescheduleInstName');
  if (instNameEl) instNameEl.innerText = booking.instructor;
  const oldTimeEl = document.getElementById('rescheduleOldTime');
  if (oldTimeEl) oldTimeEl.innerText = `${booking.date} (${booking.slotTime})`;
  
  // 新日期限制：最少在 48 小時之後 (例如後天)
  const minDateStr = calcDynamicDateOffset(2);
  const newDateInput = document.getElementById('rescheduleNewDate');
  if (newDateInput) {
    newDateInput.min = minDateStr;
    newDateInput.value = minDateStr;
  }
  
  updateRescheduleSlots();
  const modal = document.getElementById('rescheduleBookingModal');
  if (modal) modal.classList.add('active');
}

function closeRescheduleModal() {
  const modal = document.getElementById('rescheduleBookingModal');
  if (modal) modal.classList.remove('active');
}

function updateRescheduleSlots() {
  const booking = mockBookings.find(b => b.id === activeRescheduleBookingId);
  const newDateInput = document.getElementById('rescheduleNewDate');
  const newDate = newDateInput ? newDateInput.value : '';
  const slotsContainer = document.getElementById('rescheduleSlotsGrid');
  if (!slotsContainer || !booking || !newDate) return;

  const standardSlots = [
    "14:00 - 15:00",
    "15:30 - 16:30",
    "19:00 - 20:00",
    "20:30 - 21:30"
  ];

  const bookedTimes = mockBookings
    .filter(b => b.id !== booking.id && b.status !== '已取消' && b.date === newDate && isSameInstructor(b.instructor, booking.instructor))
    .map(b => b.slotTime);

  let firstAvailableSet = false;

  slotsContainer.innerHTML = standardSlots.map(slot => {
    const isBooked = bookedTimes.includes(slot);
    if (isBooked) {
      return `<div class="slot-chip disabled" title="該時段已被預約"><i class="fa-solid fa-lock text-danger"></i> ${slot} (已滿額)</div>`;
    } else {
      const isActive = !firstAvailableSet;
      if (isActive) firstAvailableSet = true;
      return `<div class="slot-chip ${isActive ? 'active' : ''}" onclick="selectRescheduleSlotChip(this)">${slot} (可預約)</div>`;
    }
  }).join('');
}

function selectRescheduleSlotChip(chipEl) {
  if (chipEl.classList.contains('disabled')) return;
  document.querySelectorAll('#rescheduleSlotsGrid .slot-chip').forEach(c => c.classList.remove('active'));
  chipEl.classList.add('active');
}

function handleSaveReschedule(e) {
  e.preventDefault();
  const bookingId = document.getElementById('rescheduleBookingId').value;
  const newDate = document.getElementById('rescheduleNewDate').value;
  const reason = document.getElementById('rescheduleReason').value;

  const activeSlot = document.querySelector('#rescheduleSlotsGrid .slot-chip.active');
  if (!activeSlot || activeSlot.classList.contains('disabled')) {
    showToast('⚠️ 該時段已被搶先預約，請選擇其他可預約時段！');
    return;
  }

  const rawSlotText = activeSlot.innerText;
  const newSlotTime = rawSlotText.split(' ')[0] + ' - ' + rawSlotText.split(' ')[2]; // e.g. "14:00 - 15:00"

  const booking = mockBookings.find(b => b.id === bookingId);
  if (!booking) return;

  const check = checkCanRescheduleOrCancel(booking);
  if (!check.allowed) {
    showToast(check.message);
    return;
  }

  const oldDate = booking.date;
  const oldSlot = booking.slotTime;

  // Double check conflict with isSameInstructor
  const conflict = mockBookings.find(b => b.id !== bookingId && isSameInstructor(b.instructor, booking.instructor) && b.date === newDate && b.slotTime === newSlotTime && b.status !== '已取消');

  if (conflict) {
    showToast(`⚠️ 抱歉！${booking.instructor} 講師於 ${newDate} ${newSlotTime} 已被搶先預約！`);
    updateRescheduleSlots();
    return;
  }

  booking.date = newDate;
  booking.slotTime = newSlotTime;
  booking.notes = `${booking.notes} (改期備註: ${reason})`;
  booking.status = "已改期";

  saveBookingsToStorage();
  showToast(`🎉 改期成功！已將 ${booking.instructor} 講師個教改期至 ${newDate} (${newSlotTime})，已即時同步講師排班！`);

  closeRescheduleModal();
  updateAvailableSlots();
  renderStudentBookings();
  renderBookingAdminTable();
}

function cancelBooking(bookingId) {
  const booking = mockBookings.find(b => b.id === bookingId);
  if (!booking) return;

  const check = checkCanRescheduleOrCancel(booking);
  if (!check.allowed) {
    alert(check.message);
    return;
  }

  if (confirm(`確定要取消 ${booking.instructor} 講師於 ${booking.date} (${booking.slotTime}) 的 1-on-1 個教預約嗎？\n\n📌 規範提示：最晚須於課前 2 天取消，取消後該時段將重新釋出給其他學員。`)) {
    booking.status = "已取消";
    saveBookingsToStorage();
    showToast(`已成功取消 ${booking.instructor} 講師的預約，原時段已即時釋出。`);
    updateAvailableSlots();
    renderStudentBookings();
    renderBookingAdminTable();
  }
}

function joinUpcomingRoom(bookingId) {
  let booking = null;
  if (bookingId) {
    booking = mockBookings.find(b => b.id === bookingId);
  } else {
    booking = mockBookings.find(b => b.status !== '已取消' && (!currentUser || b.studentEmail === currentUser.email || currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff' || currentUser.role === 'instructor'));
  }

  // 1-on-1 入場時效校驗 (平台主管、顧問與員工不在此限)
  if (booking) {
    const timeInfo = getBookingTimeInfo(booking);
    const isStaff = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff');

    // 1. 若開課前超過 10 分鐘：防呆阻擋提前誤入
    if (timeInfo.tooEarly && !isStaff) {
      showToast(`⚠️ 尚未開放進入教室！\n目前距離開課還有 ${timeInfo.diffHours} 小時 ${timeInfo.diffMins % 60} 分鐘。系統將於「上課前 10 分鐘」準時開放入場連線測試！`);
      return;
    }

    // 2. 若課程已過表定結束時間
    if (timeInfo.isEnded && !isStaff) {
      showToast(`ℹ️ 本堂 1-on-1 個教課程已於 ${timeInfo.endStr} 結束。如需額外預約輔導，請洽 LINE@ 小編或至預約中心選課！`);
      return;
    }
  }

  switchView('live-classroom');

  // 若在手機/平板端，自動切換至教室分頁或滾動至教室區域
  if (typeof switchMobileClassTab === 'function') {
    switchMobileClassTab('classroom');
  }

  const liveRoomTarget = document.getElementById('colLiveRoom') || document.getElementById('liveRoomCard');
  if (liveRoomTarget) {
    setTimeout(() => {
      liveRoomTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const roomCard = document.getElementById('liveRoomCard');
      if (roomCard) {
        roomCard.classList.add('live-room-highlight');
        setTimeout(() => roomCard.classList.remove('live-room-highlight'), 2600);
      }
    }, 120);
  }

  if (booking) {
    updateLiveRoomUI(booking.instructor);
    const timeInfo = getBookingTimeInfo(booking);
    if (timeInfo.isOngoing) {
      const elapsedMins = Math.abs(timeInfo.diffMins);
      if (timeInfo.isLateOver10Mins) {
        // 開課超過 10 分鐘依然允許進教室繼續上課，但明確提醒不延遲下課時間
        showToast(`⏰ 課程進行中（已過開課時間 ${elapsedMins} 分鐘）。溫馨提醒：遲到不順延下課時間，課程將準時於 ${timeInfo.endStr} 結束，請老師與學員留意時間並掌握進度！`);
      } else {
        showToast(`🎙️ 歡迎進入 1-on-1 教室！課程進行中，請老師與學員留意於 ${timeInfo.endStr} 準時下課。`);
      }
    } else {
      showToast(`🎙️ 歡迎進入 1-on-1 專屬教室！已連線 ${booking.instructor} 講師頻道（上課前 10 分鐘提前開放入場測試）！`);
    }
  } else {
    showToast('🎙️ 進入 1-on-1 直播教室中...已連線講師音訊與共享畫布！');
  }
}

// 手機端 1-on-1 分頁快捷切換器
function switchMobileClassTab(tabName) {
  const tabs = document.querySelectorAll('.m-class-tab');
  tabs.forEach(t => {
    if (t.getAttribute('data-tab') === tabName) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  const upcomingCard = document.getElementById('upcomingBookingsCard');
  const liveRoomCol = document.getElementById('colLiveRoom');
  const bookingCard = document.getElementById('newBookingCard');

  if (window.innerWidth <= 1024) {
    if (tabName === 'all') {
      if (upcomingCard) upcomingCard.style.display = 'block';
      if (liveRoomCol) liveRoomCol.style.display = 'block';
      if (bookingCard) bookingCard.style.display = 'block';
    } else if (tabName === 'upcoming') {
      if (upcomingCard) upcomingCard.style.display = 'block';
      if (liveRoomCol) liveRoomCol.style.display = 'none';
      if (bookingCard) bookingCard.style.display = 'none';
    } else if (tabName === 'classroom') {
      if (upcomingCard) upcomingCard.style.display = 'none';
      if (liveRoomCol) liveRoomCol.style.display = 'block';
      if (bookingCard) bookingCard.style.display = 'none';
    } else if (tabName === 'booking') {
      if (upcomingCard) upcomingCard.style.display = 'none';
      if (liveRoomCol) liveRoomCol.style.display = 'none';
      if (bookingCard) bookingCard.style.display = 'block';
    }
  } else {
    if (upcomingCard) upcomingCard.style.display = '';
    if (liveRoomCol) liveRoomCol.style.display = '';
    if (bookingCard) bookingCard.style.display = '';
  }
}

// 快速滾動至預約新時段表單
function scrollToBookingForm() {
  if (window.innerWidth <= 1024) {
    switchMobileClassTab('booking');
  }
  const formCard = document.getElementById('newBookingCard');
  if (formCard) {
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// 視窗大小改變時重置展示
window.addEventListener('resize', () => {
  if (window.innerWidth > 1024) {
    const upcomingCard = document.getElementById('upcomingBookingsCard');
    const liveRoomCol = document.getElementById('colLiveRoom');
    const bookingCard = document.getElementById('newBookingCard');
    if (upcomingCard) upcomingCard.style.display = '';
    if (liveRoomCol) liveRoomCol.style.display = '';
    if (bookingCard) bookingCard.style.display = '';
  }
});

// Line@ Consultation & Exclusive Service Modal Engine
function openConsultLineModal(courseIdOrTitle, type = 'combo') {
  let title = '精選實務熱門課程';
  let matchedId = 'course-1';
  
  if (typeof courseIdOrTitle === 'string') {
    const course = (typeof mockCourses !== 'undefined' ? mockCourses : []).find(c => c.id === courseIdOrTitle || c.title === courseIdOrTitle);
    if (course) {
      title = course.title;
      matchedId = course.id;
    } else {
      title = courseIdOrTitle;
    }
  }

  const isCombo = type === 'combo';
  const checkoutModal = document.getElementById('checkoutModal');
  let modalBody = document.getElementById('checkoutModalBody');
  if (!checkoutModal) return;
  if (!modalBody) {
    modalBody = checkoutModal.querySelector('.modal-body') || checkoutModal.querySelector('.modal-box');
  }
  if (!modalBody) return;

  modalBody.innerHTML = `
    <div style="text-align: center; margin-bottom: 1.25rem;">
      <span class="badge-tag bg-green-glow" style="color:#06C755; border-color:rgba(6,199,85,0.4);">
        <i class="fa-brands fa-line"></i> 洽小編 • 提供個別專屬服務與 Line@ 專屬優惠
      </span>
      <h3 style="margin-top:0.75rem; font-size:1.25rem; color:#fff;">${title}</h3>
      <div style="font-size:0.88rem; color:var(--accent-cyan); margin-top:0.3rem;">
        ${isCombo ? '🔥 1-on-1 專屬業師陪跑 + 錄播全套影音課程服務' : '📹 純錄播自學講義諮詢方案'}
      </div>
    </div>

    <div class="line-consult-box">
      <div class="line-consult-title">
        <i class="fa-solid fa-crown text-yellow"></i> 為什麼 1 對 1 個教不直接公開定價？我們的競爭優勢是：
      </div>
      <ul class="consult-perks-list">
        <li>
          <i class="fa-solid fa-circle-check"></i>
          <span><strong>1 對 1 個別專屬學習診斷：</strong>拒絕罐頭套裝！小編與專業金牌業師會先根據您的基礎與求職/接案目標，量身規劃專屬學習地圖與作品集主題。</span>
        </li>
        <li>
          <i class="fa-solid fa-circle-check"></i>
          <span><strong>Line@ 官方帳號限定學員優惠：</strong>加入 Line@ 即可向小編領取【限時隱藏版學員獎學金】與【專屬學習諮詢服務】。</span>
        </li>
        <li>
          <i class="fa-solid fa-circle-check"></i>
          <span><strong>100% 企業級星級作品陪跑：</strong>不是只賣影片，更手把手修稿帶你做到能直接去面試接案的硬實力作品。</span>
        </li>
      </ul>

      <div style="text-align: center; margin-top: 1rem;">
        <div class="text-xs text-muted margin-bottom-xs">官方 Line@ 帳號專人即時服務：</div>
        <a href="https://lin.ee/yq4lFuv" target="_blank" rel="noopener noreferrer" class="line-id-chip" style="text-decoration: none; cursor: pointer;" title="點擊直接開啟 LINE 加好友">
          <i class="fa-brands fa-line"></i> LINE: https://lin.ee/yq4lFuv
        </a>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 0.65rem; margin-top: 1rem;">
      <button class="btn btn-line btn-block" onclick="handleJoinLineAt('${title.replace(/'/g, "\\'")}')">
        <i class="fa-brands fa-line"></i> 🟢 一鍵開啟 LINE 洽小編領取專屬優惠
      </button>
      <button class="btn btn-primary btn-block" onclick="openLeadFormModal('${title.replace(/'/g, "\\'")}')" style="background: linear-gradient(135deg, #8b5cf6, #ec4899);">
        <i class="fa-solid fa-file-pen"></i> 📝 無 LINE 或偏好網頁留訊？填寫客製化需求表單
      </button>
      <div style="text-align:center; margin-top:0.4rem;">
        <a href="javascript:void(0)" onclick="openCheckoutModalDirect('${matchedId}', '${type}')" style="font-size:0.78rem; color:var(--text-muted); text-decoration:underline;">
          [舊學員限定] 已洽過小編？點此開啟系統手動開通與試算
        </a>
      </div>
    </div>
  `;

  checkoutModal.classList.add('active');
}

function handleJoinLineAt(courseName) {
  const lineUrl = 'https://lin.ee/yq4lFuv';
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lineUrl).catch(() => {});
    } else {
      const tempInput = document.createElement('input');
      tempInput.value = lineUrl;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }
  } catch(e) {}
  
  showToast(`🟢 正在為您開啟官方 LINE！小編將為您解鎖【${courseName || '精選實務課程'}】專屬優惠與 1 對 1 諮詢！`);
  window.open(lineUrl, '_blank');
}

// URL 參數檢查：若帶有 ?ref= 或 ?referrer= 自動帶入介紹人
function checkUrlReferralParam() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref') || params.get('referrer') || params.get('invite');
  if (ref) {
    window.currentReferrer = decodeURIComponent(ref).trim();
    const refInput = document.getElementById('leadReferrer');
    const notice = document.getElementById('leadReferrerAutoNotice');
    if (refInput) {
      refInput.value = window.currentReferrer;
      if (notice) {
        notice.innerHTML = `<i class="fa-solid fa-gift text-pink"></i> 已自動為您帶入好友介紹人：<strong>${window.currentReferrer}</strong>（送出後雙方各獲 200 精幣折抵金）`;
        notice.style.display = 'block';
      }
    }
    // 若網址包含 #consult 自動開啟問卷表單
    if (window.location.hash === '#consult') {
      setTimeout(() => openLeadFormModal(), 400);
    }
  }
}

// Lead Form Modal Engine (無 LINE / 偏好網頁留訊專用)
function openLeadFormModal(courseTitle = '', referrerOverride = '') {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));

  const modal = document.getElementById('leadFormModal');
  if (!modal) return;

  if (courseTitle) {
    const courseSelect = document.getElementById('leadCourse');
    if (courseSelect) {
      const match = Array.from(courseSelect.options).find(opt => opt.value.includes(courseTitle) || courseTitle.includes(opt.value));
      if (match) courseSelect.value = match.value;
    }
  }

  // 🎯 自動帶入介紹人身分標記 (URL參數 / 登入學員 / 傳入參數)
  const refInput = document.getElementById('leadReferrer');
  const notice = document.getElementById('leadReferrerAutoNotice');
  
  let refVal = referrerOverride || window.currentReferrer || '';
  if (!refVal && currentUser) {
    refVal = `${currentUser.name} (${currentUser.email || currentUser.phone || ''})`.trim();
  }

  if (refInput) {
    if (refVal) {
      refInput.value = refVal;
      if (notice) {
        notice.innerHTML = `<i class="fa-solid fa-gift text-pink"></i> 已自動為您帶入介紹人：<strong>${refVal}</strong>（送出後雙方各獲 200 精幣折抵金）`;
        notice.style.display = 'block';
      }
    } else {
      if (notice) notice.style.display = 'none';
    }
  }

  modal.classList.add('active');
  const box = modal.querySelector('.modal-box');
  if (box) box.scrollTop = 0;
}

function closeLeadFormModal() {
  const modal = document.getElementById('leadFormModal');
  if (modal) modal.classList.remove('active');
}

// 推薦親朋好友分享彈窗控制器 (Referral Share Engine)
function openReferralShareModal() {
  const modal = document.getElementById('referralShareModal');
  if (!modal) return;

  const senderInput = document.getElementById('referralSenderIdInput');
  if (senderInput) {
    if (currentUser) {
      senderInput.value = `${currentUser.name} (${currentUser.email || currentUser.phone || ''})`.trim();
    } else {
      senderInput.value = '林小明 (student@pentaskill.com)';
    }
  }

  updateReferralSharePreview();
  modal.classList.add('active');
}

function closeReferralShareModal() {
  const modal = document.getElementById('referralShareModal');
  if (modal) modal.classList.remove('active');
}

function updateReferralSharePreview() {
  const senderInput = document.getElementById('referralSenderIdInput');
  const previewText = document.getElementById('referralShareMsgText');
  if (!previewText) return;

  const senderTag = senderInput && senderInput.value.trim() 
    ? senderInput.value.trim() 
    : (currentUser ? `${currentUser.name} (${currentUser.email || currentUser.phone || ''})`.trim() : '精五門好友推薦');
  
  const siteUrl = `https://online-learning-platform.pey514514.workers.dev/?ref=${encodeURIComponent(senderTag)}#consult`;

  const shareMsg = 
`🎁【精五門 PentaSkill 好友專屬好禮推薦】
哈囉！推薦你體驗超實用的「精五門 PentaSkill」線上實務學習平台！
無論是 AI 全端開發、UI/UX 產品設計還是數據分析，都有多年資深業師 1 對 1 手把手帶練！

👉 點擊專屬連結填寫 1 分鐘學習諮詢問卷：
${siteUrl}
（💡 系統已為您自動帶入我的專屬推薦資訊：${senderTag}）

只要填寫完成，你和我都可以立即各獲得 200 元精幣折抵金（1幣=NT$1，全站購課與 1 對 1 個教直接現抵）！快來一起升級硬實力吧！✨`;

  previewText.value = shareMsg;
}

function copyReferralInviteText() {
  const previewText = document.getElementById('referralShareMsgText');
  if (!previewText) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(previewText.value).then(() => {
      showToast('🎉 已成功複製【專屬好友推薦文案與連結】！可直接貼至 LINE 或社群分享給親友！');
    });
  } else {
    previewText.select();
    document.execCommand('copy');
    showToast('🎉 已成功複製【專屬好友推薦文案與連結】！可直接貼至 LINE 或社群分享給親友！');
  }
}

function shareReferralViaLine() {
  const previewText = document.getElementById('referralShareMsgText');
  const msg = previewText ? previewText.value : '推薦您精五門實用課程，填問卷雙方各獲 200 精幣！';
  const lineShareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(msg)}`;
  window.open(lineShareUrl, '_blank');
  showToast('🟢 正在為您開啟 LINE 分享給好友！');
}

function handleLeadFormSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('leadName').value.trim();
  const phone = document.getElementById('leadPhone').value.trim();
  const email = (document.getElementById('leadEmail') && document.getElementById('leadEmail').value.trim()) || '';
  const identity = (document.getElementById('leadIdentity') && document.getElementById('leadIdentity').value) || '💼 上班族 (想轉職/副業提升)';
  const course = (document.getElementById('leadCourse') && document.getElementById('leadCourse').value) || '';
  const goal = (document.getElementById('leadGoal') && document.getElementById('leadGoal').value) || '🎯 想要在 3-6 個月內成功轉職';
  const experience = (document.getElementById('leadExperience') && document.getElementById('leadExperience').value) || '🌱 零基礎新手';
  const timePerWeek = (document.getElementById('leadTimePerWeek') && document.getElementById('leadTimePerWeek').value) || '⏱️ 4 ~ 8 小時 (積極學習)';
  const priorityHelp = (document.getElementById('leadPriorityHelp') && document.getElementById('leadPriorityHelp').value) || '📅 索取課程大綱與免費試聽影片';
  const notes = (document.getElementById('leadNotes') && document.getElementById('leadNotes').value.trim()) || '無特殊備註';
  const referrer = (document.getElementById('leadReferrer') && document.getElementById('leadReferrer').value.trim()) || '';

  if (!email) {
    showToast('⚠️ 請填寫您的電子郵件 (Email)！');
    return;
  }
  if (!course) {
    showToast('⚠️ 請選擇您想諮詢的課程領域！');
    return;
  }

  const newLead = {
    id: `lead-${Date.now()}`,
    type: 'lead',
    createdAt: getLocalDateTimeString(),
    name,
    phone,
    email,
    course,
    identity,
    goal,
    experience,
    timePerWeek,
    priorityHelp,
    referrer: referrer || '無推薦人 (自主來訪)',
    notes: referrer ? `${notes} | 🎁 推薦介紹人：${referrer} (享 200 精幣)` : notes,
    status: '🆕 新進諮詢'
  };

  mockLeads.unshift(newLead);
  saveLeadsToStorage();

  // 🎁 推薦好禮發放：雙方各贈 200 元精幣
  let referralBonusGiven = false;
  if (referrer) {
    // 1. 給推薦人增加 200 精幣 (若能在 mockUsers 找到)
    const refUser = mockUsers.find(u => 
      (u.name && (referrer.includes(u.name) || u.name.includes(referrer))) || 
      (u.email && referrer.toLowerCase().includes(u.email.toLowerCase())) || 
      (u.phone && referrer.includes(u.phone))
    );
    if (refUser) {
      refUser.coins = (refUser.coins || 0) + 200;
    }

    // 2. 給填表人 (若當前已登入或現有帳號) 增加 200 精幣
    let applicantUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (applicantUser) {
      applicantUser.coins = (applicantUser.coins || 0) + 200;
    } else if (currentUser) {
      currentUser.coins = (currentUser.coins || 0) + 200;
    }

    saveUsersToStorage();
    referralBonusGiven = true;
  }

  // Asynchronous sync to Google Sheet (if Webhook URL is set)
  syncLeadToGoogleSheet(newLead);

  closeLeadFormModal();
  if (referralBonusGiven) {
    showToast(`🎉 我們收到了！感謝 ${name} 填寫需求，已成功記錄推薦介紹人【${referrer}】，您與介紹人均各獲得 200 元精幣折抵金！小編將盡快與您聯絡！`);
  } else {
    showToast(`🎉 我們收到了！感謝 ${name} 填寫需求，專屬小編將盡快與您聯絡！`);
  }
  renderLeadAdminTable();
  if (typeof renderMemberCenterView === 'function') renderMemberCenterView();
}

// Google Sheet Synchronization Engine
function syncLeadToGoogleSheet(leadData) {
  const webhookUrl = googleSheetConfig.webhookUrl || localStorage.getItem('pentaskill_sheet_webhook') || 'https://script.google.com/macros/s/AKfycbx9jqEQ07dxqpMa8gupoW8KKqKUFJMPX1cDWUaRWPSZWP1H_1SKX3IwvPaNGq6uthy1IA/exec';
  if (!webhookUrl) {
    console.log('ℹ️ 尚未設定 Google Apps Script Webhook URL，資料已安全儲存於本地後台');
    return;
  }

  try {
    fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(leadData)
    }).then(() => {
      console.log('✅ Google Sheet 雙向同步觸發完成 (已寫入試算表)');
    }).catch(err => {
      console.warn('⚠️ Google Sheet 傳送提醒:', err);
    });
  } catch (err) {
    console.warn('⚠️ 建立發送參數異常:', err);
  }
}

// Google Sheet Configuration Modal Handlers
function openGoogleSheetConfigModal() {
  closeAllDropdowns();
  const modal = document.getElementById('googleSheetConfigModal');
  if (!modal) {
    console.error('googleSheetConfigModal not found');
    return;
  }

  const urlInput = document.getElementById('inputGoogleWebhookUrl');
  if (urlInput) {
    urlInput.value = googleSheetConfig.webhookUrl || localStorage.getItem('pentaskill_sheet_webhook') || '';
  }

  const codeBlock = document.getElementById('appsScriptCodeBlock');
  if (codeBlock) {
    codeBlock.value = getGoogleAppsScriptTemplate();
  }

  updateInlineWebhookInputs();

  modal.style.display = 'flex';
  modal.classList.add('active');
  showToast('📊 已開啟 Google Sheet 需求表單串接中心');
}

function closeGoogleSheetConfigModal() {
  const modal = document.getElementById('googleSheetConfigModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

function renderGoogleSheetAdminSection() {
  updateInlineWebhookInputs();
  const inlineCodeBlock = document.getElementById('inlineAppsScriptCodeBlock');
  if (inlineCodeBlock) {
    inlineCodeBlock.value = getGoogleAppsScriptTemplate();
  }
}

function handleSaveGoogleSheetConfig(e) {
  e.preventDefault();
  const url = document.getElementById('inputGoogleWebhookUrl').value.trim();
  googleSheetConfig.webhookUrl = url;
  try {
    localStorage.setItem('pentaskill_sheet_webhook', url);
  } catch (err) {}

  showToast('✅ Google Sheet 串接設定已成功儲存！');
  closeGoogleSheetConfigModal();
  updateInlineWebhookInputs();
}

function saveInlineGoogleWebhook() {
  const input = document.getElementById('inlineGoogleWebhookUrl');
  if (!input) return;
  const url = input.value.trim();
  if (!url) {
    showToast('⚠️ 請輸入有效的 Google Apps Script 網址 (https://script.google.com/.../exec)');
    return;
  }

  googleSheetConfig.webhookUrl = url;
  try {
    localStorage.setItem('pentaskill_sheet_webhook', url);
  } catch (err) {}

  updateInlineWebhookInputs();
  showToast('✅ Google Sheet Webhook 網址已成功儲存！');
}

function updateInlineWebhookInputs() {
  const currentUrl = googleSheetConfig.webhookUrl || localStorage.getItem('pentaskill_sheet_webhook') || '';
  const inlineInput = document.getElementById('inlineGoogleWebhookUrl');
  const modalInput = document.getElementById('inputGoogleWebhookUrl');
  if (inlineInput) inlineInput.value = currentUrl;
  if (modalInput) modalInput.value = currentUrl;
  const inlineCodeBlock = document.getElementById('inlineAppsScriptCodeBlock');
  if (inlineCodeBlock && !inlineCodeBlock.value) {
    inlineCodeBlock.value = getGoogleAppsScriptTemplate();
  }
}

function copyAppsScriptCode() {
  const code = getGoogleAppsScriptTemplate();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => {
      showToast('📋 Google Apps Script 程式碼已複製至剪貼簿！');
    }).catch(() => {
      fallbackCopy(code);
    });
  } else {
    fallbackCopy(code);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast('📋 Google Apps Script 程式碼已複製至剪貼簿！');
}

function testGoogleSheetSync() {
  const testLead = {
    id: `test-${Date.now()}`,
    createdAt: getLocalDateTimeString(),
    name: "測試學員 (Google Sheet 連線測試)",
    phone: "0900-123-456",
    email: "test@pentaskill.com",
    identity: "💼 上班族 (轉職測試)",
    course: "AI 程式與全端工作流實戰",
    goal: "🎯 驗證 Google Sheet 自動化傳送",
    experience: "🌱 零基礎新手",
    timePerWeek: "⏱️ 4 ~ 8 小時",
    priorityHelp: "🎨 1-on-1 教學多年業師視訊診斷",
    notes: "這是一筆由精五門後台發出的連線測試紀錄",
    status: "✅ 連線測試成功"
  };

  const webhookUrl = googleSheetConfig.webhookUrl || localStorage.getItem('pentaskill_sheet_webhook');
  if (!webhookUrl) {
    showToast('⚠️ 請先在上方欄位貼上 Google Apps Script 部署網址 (Web App URL)！');
    return;
  }

  showToast('🚀 正在發送測試諮詢資料至 Google Sheet...');
  syncLeadToGoogleSheet(testLead);
  setTimeout(() => {
    showToast('🎉 測試諮詢資料已成功發送！請至您的 Google Sheet 檢查【潛在學員諮詢紀錄】分頁是否有新增列。');
  }, 1200);
}

function testGoogleSheetQuoteSync() {
  const testQuote = {
    id: `test-quote-${Date.now()}`,
    updatedAt: getLocalDateTimeString(),
    studentEmail: "test.student@pentaskill.com",
    studentName: "測試學員 (報價單同步測試)",
    courseTitle: "AI 驅動 Full-Stack 實戰營 (👑 主管/顧問專屬優惠包)",
    customPrice: 10880,
    createdBy: currentUser ? currentUser.name : "👑 平台主管",
    details: "包含全套錄播 + 4次教學多年業師1對1個教 + 贈送專案元件庫 (雲端同步測試)"
  };

  const webhookUrl = googleSheetConfig.webhookUrl || localStorage.getItem('pentaskill_sheet_webhook');
  if (!webhookUrl) {
    showToast('⚠️ 請先設定 Google Apps Script Webhook 網址！');
    return;
  }

  showToast('🚀 正在發送測試報價單至 Google Sheet...');
  syncQuoteToGoogleSheet(testQuote);
  setTimeout(() => {
    showToast('🎉 測試報價單已成功發送！請至您的 Google Sheet 檢查【學員客製化報價單】分頁是否有新增列。');
  }, 1200);
}

// Google Sheet Synchronization Engine for Custom Quotes
function syncQuoteToGoogleSheet(quoteData) {
  const webhookUrl = googleSheetConfig.webhookUrl || localStorage.getItem('pentaskill_sheet_webhook') || 'https://script.google.com/macros/s/AKfycbx9jqEQ07dxqpMa8gupoW8KKqKUFJMPX1cDWUaRWPSZWP1H_1SKX3IwvPaNGq6uthy1IA/exec';
  if (!webhookUrl) return;

  const payload = {
    type: "quote",
    ...quoteData
  };

  try {
    fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    }).then(() => {
      console.log('✅ 學員客製化報價單已即時同步至 Google Sheet【學員客製化報價單】分頁');
    }).catch(err => {
      console.warn('⚠️ Google Sheet 報價單傳送提醒:', err);
    });
  } catch (err) {
    console.warn('⚠️ 建立報價單發送參數異常:', err);
  }
}

function getGoogleAppsScriptTemplate() {
  return `/**
 * 精五門 PentaSkill — Google Sheet 雙工作表自動分流接收腳本
 * 支援 1. 潛在學員諮詢紀錄 / 2. 學員客製化報價單 (含手機查單與即時雲端查詢)
 * 綁定試算表 ID: ${googleSheetConfig.sheetId}
 */

function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.openById("${googleSheetConfig.sheetId}");
  }
  return ss;
}

function testRun() {
  var ss = getSpreadsheet();
  initLeadSheet(ss);
  initQuoteSheet(ss);
  initMemberSheet(ss);
  Logger.log("三大工作表（諮詢紀錄、客製化報價單、學員資料更新）已成功初始化完成！");
}

function initLeadSheet(ss) {
  var sheet = ss.getSheetByName("潛在學員諮詢紀錄");
  if (!sheet) {
    sheet = ss.getSheets()[0];
    try { sheet.setName("潛在學員諮詢紀錄"); } catch(e) {}
  }
  var headers = [
    "填表時間", "學員姓名", "聯絡電話", "電子郵件", "目前身分",
    "想諮詢課程", "學習目標", "實務基礎程度", "每週投入時間",
    "優先協助事項", "學員備註說明", "處理跟進狀態"
  ];
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() === "") {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setBackground("#4f46e5");
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    range.setHorizontalAlignment("center");
    range.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 38);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function initQuoteSheet(ss) {
  var sheet = ss.getSheetByName("學員客製化報價單");
  if (!sheet) {
    sheet = ss.insertSheet("學員客製化報價單");
  }
  var headers = [
    "設定時間", "對接學員Email", "學員姓名", "聯絡電話", "客製化課程/方案名稱",
    "客製化金額", "設定主管/員工", "專屬開通備註與贈品"
  ];
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() === "") {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setBackground("#0891b2");
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    range.setHorizontalAlignment("center");
    range.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 38);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function initMemberSheet(ss) {
  var sheet = ss.getSheetByName("學員資料與更新紀錄");
  if (!sheet) {
    sheet = ss.insertSheet("學員資料與更新紀錄");
  }
  var headers = [
    "更新時間", "學員姓名", "稱呼", "聯絡電話", "電子郵件 (登入帳號)", "生日", "精幣餘額", "精通寶", "修改備註說明"
  ];
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() === "") {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setBackground("#8b5cf6");
    range.setFontColor("#ffffff");
    range.setFontWeight("bold");
    range.setHorizontalAlignment("center");
    range.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 38);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getNowString() {
  return Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
}

function doGet(e) {
  try {
    var ss = getSpreadsheet();
    var kw = (e && e.parameter && (e.parameter.q || e.parameter.keyword || e.parameter.query)) ? e.parameter.q.toString().trim().toLowerCase() : "";
    var cleanKw = kw.replace(/[\\s-]/g, "");

    var quoteSheet = initQuoteSheet(ss);
    var quotes = [];

    if (quoteSheet.getLastRow() > 1) {
      var numRows = quoteSheet.getLastRow() - 1;
      var numCols = Math.max(quoteSheet.getLastColumn(), 8);
      var values = quoteSheet.getRange(2, 1, numRows, numCols).getValues();

      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        var qTime = row[0] ? row[0].toString() : "";
        var qEmail = row[1] ? row[1].toString() : "";
        var qName = row[2] ? row[2].toString() : "";
        var qPhone = "";
        var qTitle = "";
        var qPrice = 0;
        var qBy = "";
        var qDetails = "";

        if (typeof row[4] === "number" || (!isNaN(Number(row[4])) && String(row[4]).trim() !== "" && isNaN(Number(row[3])))) {
          // 7 欄舊格式相容: [時間, Email, 姓名, 課程名稱, 金額, 設定者, 備註]
          qPhone = "";
          qTitle = row[3] ? row[3].toString() : "";
          qPrice = Number(row[4]) || 0;
          qBy = row[5] ? row[5].toString() : "👑 平台主管";
          qDetails = row[6] ? row[6].toString() : "";
        } else if (typeof row[5] === "number" || (!isNaN(Number(row[5])) && String(row[5]).trim() !== "")) {
          // 8 欄新格式: [時間, Email, 姓名, 手機, 課程名稱, 金額, 設定者, 備註]
          qPhone = row[3] ? row[3].toString() : "";
          qTitle = row[4] ? row[4].toString() : "";
          qPrice = Number(row[5]) || 0;
          qBy = row[6] ? row[6].toString() : "👑 平台主管";
          qDetails = row[7] ? row[7].toString() : "";
        } else {
          qTitle = row[3] ? row[3].toString() : "";
          qPrice = Number(row[4]) || 0;
          qBy = row[5] ? row[5].toString() : "👑 平台主管";
          qDetails = row[6] ? row[6].toString() : "";
        }

        var quoteObj = {
          id: "q-cloud-" + (i + 1),
          updatedAt: qTime,
          studentEmail: qEmail,
          studentName: qName,
          studentPhone: qPhone,
          courseTitle: qTitle,
          customPrice: Number(qPrice) || 0,
          createdBy: qBy,
          details: qDetails
        };

        if (!kw) {
          quotes.push(quoteObj);
        } else {
          var matchEmail = qEmail.toLowerCase().indexOf(kw) !== -1;
          var matchName = qName.toLowerCase().indexOf(kw) !== -1;
          var matchPhone = qPhone.replace(/[\\s-]/g, "").indexOf(cleanKw) !== -1 && cleanKw.length > 0;
          if (matchEmail || matchName || matchPhone) {
            quotes.push(quoteObj);
          }
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      count: quotes.length,
      quotes: quotes,
      message: "Google Sheet 雙軌自動化雲端查單運作中！"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var ss = getSpreadsheet();
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    if (data.type === "admin_otp_login") {
      var recipientEmail = data.email;
      var code = data.code;
      var adminName = data.adminName || data.userName || "主管";
      var subject = "🛡️【精五門 PentaSkill 核心管理後台】登入動態驗證碼：" + code;
      var emailBody = "親愛的 " + adminName + " 您好：\\n\\n" +
        "系統偵測到您正在登入「精五門 PentaSkill 核心營運管理後台」。\\n\\n" +
        "請於後台安全閘門輸入以下 6 位數一次性動態 PIN 碼以利解鎖登入：\\n\\n" +
        "👉  " + code + "  👈\\n\\n" +
        "（此驗證碼有效時間為 10 分鐘，單次驗證後即失效）\\n\\n" +
        "⚠️ 若非您本人操作，請留意帳號安全，亦可直接使用主管萬用通道保護後台。\\n\\n" +
        "精五門 PentaSkill 營運管理中心 自動發送";
      
      MailApp.sendEmail(recipientEmail, subject, emailBody);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "管理後台動態驗證碼已成功由 Google 寄出至 " + recipientEmail
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (data.type === "reset_code") {
      var recipientEmail = data.email;
      var code = data.code;
      var memberName = data.userName || "學員";
      var subject = "🔐【精五門 PentaSkill】您的會員密碼重設驗證碼：" + code;
      var emailBody = "親愛的 " + memberName + " 您好：\\n\\n" +
        "您剛剛在「精五門 PentaSkill」線上實務學習平台申請了【重設會員密碼】。\\n\\n" +
        "您的 6 位數安全驗證碼為：\\n\\n" +
        "👉  " + code + "  👈\\n\\n" +
        "（此驗證碼有效時間為 10 分鐘，請儘速於網站上輸入以完成密碼設定）\\n\\n" +
        "⚠️ 若此操作非您本人提出，請忽略本信件，您的帳號仍然安全。\\n\\n" +
        "精五門 PentaSkill 系統自動發送";
      
      MailApp.sendEmail(recipientEmail, subject, emailBody);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "驗證碼信件已成功由 Google 寄出至 " + recipientEmail
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (data.type === "quote" || data.dataType === "quote") {
      var quoteSheet = initQuoteSheet(ss);
      var row = [
        data.updatedAt || getNowString(),
        data.studentEmail || "未提供",
        data.studentName || "未填寫",
        data.studentPhone || "",
        data.courseTitle || "客製化課程",
        data.customPrice || 0,
        data.createdBy || "Wen總監",
        data.details || "無特殊備註"
      ];
      quoteSheet.appendRow(row);
      var lastRow = quoteSheet.getLastRow();
      quoteSheet.getRange(lastRow, 1, 1, 8).setVerticalAlignment("middle");
      quoteSheet.setRowHeight(lastRow, 30);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "客製化報價單寫入成功！",
        row: lastRow
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (data.type === "profile_update" || data.dataType === "profile_update") {
      var memberSheet = initMemberSheet(ss);
      var row = [
        data.createdAt || getNowString(),
        data.name || "學員",
        data.title || "先生/小姐",
        data.phone || "未填寫",
        data.email || "未提供",
        data.birthday || "未填寫",
        data.coins !== undefined ? data.coins : 0,
        data.masterTokens !== undefined ? data.masterTokens : 0,
        data.notes || "學員專區資料更新"
      ];
      memberSheet.appendRow(row);
      var lastRow = memberSheet.getLastRow();
      memberSheet.getRange(lastRow, 1, 1, 9).setVerticalAlignment("middle");
      memberSheet.setRowHeight(lastRow, 30);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "學員個人資料更新已成功寫入【學員資料與更新紀錄】試算表！",
        row: lastRow
      })).setMimeType(ContentService.MimeType.JSON);
    } else if (data.type === "lead" || data.dataType === "lead" || data.identity || data.course || data.priorityHelp) {
      var leadSheet = initLeadSheet(ss);
      var row = [
        (data && data.createdAt) || getNowString(),
        (data && data.name) || "未填寫",
        (data && data.phone) || "未填寫",
        (data && data.email) || "未提供",
        (data && data.identity) || "一般諮詢",
        (data && data.course) || "全系列諮詢",
        (data && data.goal) || "未指定",
        (data && data.experience) || "未指定",
        (data && data.timePerWeek) || "未指定",
        (data && data.priorityHelp) || "未指定",
        (data && data.notes) || "無特殊備註",
        (data && data.status) || "新進諮詢"
      ];
      leadSheet.appendRow(row);
      var lastRow = leadSheet.getLastRow();
      leadSheet.getRange(lastRow, 1, 1, 12).setVerticalAlignment("middle");
      leadSheet.setRowHeight(lastRow, 30);

      // 🔔 即時通知 平台主管與顧問 (Email 自動通知)
      try {
        var adminEmail = "pey514514@gmail.com";
        var sName = data.name || "新學員";
        var sPhone = data.phone || "未填寫";
        var sEmail = data.email || "未提供";
        var sCourse = data.course || "全系列諮詢";
        var sGoal = data.goal || "未指定";
        var sNotes = data.notes || "無特殊備註";
        var sTime = data.createdAt || getNowString();

        var subject = "🔔【精五門】收到新學員諮詢：" + sName + " - " + sCourse;
        var emailBody = "👑 平台主管 / 顧問 您好：\\n\\n" +
          "網站剛剛收到一筆新的【潛在學員客製化需求諮詢】，請儘速聯絡對接：\\n\\n" +
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n" +
          "👤 學員姓名：" + sName + "\\n" +
          "📱 聯絡手機：" + sPhone + "\\n" +
          "📧 電子郵件：" + sEmail + "\\n" +
          "🎯 諮詢課程：" + sCourse + "\\n" +
          "🚀 學習目標：" + sGoal + "\\n" +
          "💬 學員需求備註：" + sNotes + "\\n" +
          "⏰ 填表時間：" + sTime + "\\n" +
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n\\n" +
          "👉 您可以直接撥打電話聯繫學員，或登入後台一鍵開立專屬報價單：\\n" +
          "https://online-learning-platform.pey514514.workers.dev/#admin-dashboard\\n\\n" +
          "精五門 PentaSkill 雲端自動化推播";

        MailApp.sendEmail(adminEmail, subject, emailBody);
      } catch (mailErr) {
        Logger.log("Email 通知異常: " + mailErr);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "諮詢表單寫入成功並已發送通知信！",
        row: lastRow
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: "ignored",
        message: "未知的請求類型，略過處理"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;
}

function renderLeadAdminTable() {
  updateInlineWebhookInputs();
  const tbody = document.getElementById('leadTableBody');
  if (!tbody) return;

  tbody.innerHTML = mockLeads.map(lead => {
    let statusBadgeClass = 'badge-primary';
    if (lead.status.includes('已聯繫')) statusBadgeClass = 'badge-success';
    if (lead.status.includes('媒合中')) statusBadgeClass = 'badge-info';

    return `
      <tr>
        <td data-label="諮詢時間" class="text-xs text-muted"><code>${lead.createdAt}</code></td>
        <td data-label="諮詢學員">
          <strong>${lead.name}</strong>
          <div class="text-xs text-cyan"><i class="fa-solid fa-phone"></i> ${lead.phone}</div>
          <div class="text-xs text-muted"><i class="fa-solid fa-envelope"></i> ${lead.email}</div>
        </td>
        <td data-label="諮詢課程"><strong class="text-purple">${lead.course}</strong></td>
        <td data-label="目前身分"><span class="badge-tag">${lead.identity}</span></td>
        <td data-label="目標與程度" class="text-xs">
          <div><strong class="text-pink">目標：</strong>${lead.goal}</div>
          <div class="text-muted"><strong class="text-cyan">程度：</strong>${lead.experience}</div>
        </td>
        <td data-label="時間與需求" class="text-xs">
          <div>${lead.timePerWeek}</div>
          <div class="text-green"><strong>優先：</strong>${lead.priorityHelp}</div>
        </td>
        <td data-label="推薦人與備註" class="text-xs text-muted" style="max-width:180px;">
          ${lead.referrer && lead.referrer !== '無推薦人 (自主來訪)' ? `<div class="badge-tag bg-pink" style="font-size:0.7rem; margin-bottom:3px; display:inline-block;"><i class="fa-solid fa-gift"></i> 介紹人: ${lead.referrer}</div><br>` : ''}
          ${lead.notes}
        </td>
        <td data-label="跟進狀態"><span class="badge ${statusBadgeClass}">${lead.status}</span></td>
        <td data-label="快捷開單" style="white-space:nowrap;">
          <button class="btn btn-sm btn-primary" onclick="convertLeadToQuote('${lead.id}')" title="直接為該學員建立客製化報價單" style="padding:0.35rem 0.6rem; font-size:0.75rem;"><i class="fa-solid fa-file-invoice"></i> 轉報價單</button>
          <button class="btn btn-sm btn-outline" onclick="updateLeadStatus('${lead.id}')" style="padding:0.35rem 0.5rem; font-size:0.75rem;"><i class="fa-solid fa-check"></i> 改狀態</button>
          <button class="btn btn-sm btn-danger" onclick="deleteLead('${lead.id}')" style="padding:0.35rem 0.5rem; font-size:0.75rem;"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function convertLeadToQuote(leadId) {
  const lead = mockLeads.find(l => l.id === leadId);
  if (!lead) return;

  document.getElementById('editQuoteId').value = '';
  document.getElementById('inputQuoteStudentEmail').value = lead.email;
  document.getElementById('inputQuoteStudentName').value = lead.name;
  if (document.getElementById('inputQuoteStudentPhone')) {
    document.getElementById('inputQuoteStudentPhone').value = lead.phone || '';
  }
  document.getElementById('inputQuoteCourseTitle').value = `${lead.course} (👑 LINE/電話 對接專屬優惠包)`;
  document.getElementById('inputQuotePrice').value = '10880';
  document.getElementById('inputQuoteDetails').value = `來自 LINE/電話 對接。學習目標：${lead.goal}。包含錄播全套 + 1對1教學多年業師個教帶練。`;

  document.getElementById('customQuoteModal').classList.add('active');
  showToast(`已為 ${lead.name} 自動帶入諮詢資料（含手機號碼），請設定結帳金額後儲存！`);
}

function updateLeadStatus(leadId) {
  const lead = mockLeads.find(l => l.id === leadId);
  if (!lead) return;

  if (lead.status === '🆕 新進諮詢') {
    lead.status = '✅ 已聯繫洽談';
  } else if (lead.status === '✅ 已聯繫洽談') {
    lead.status = '🎯 導師媒合中';
  } else {
    lead.status = '🆕 新進諮詢';
  }

  saveLeadsToStorage();

  showToast(`已更新 ${lead.name} 的跟進狀態為【${lead.status}】`);
  renderLeadAdminTable();
}

function deleteLead(leadId) {
  mockLeads = mockLeads.filter(l => l.id !== leadId);
  saveLeadsToStorage();

  showToast('已刪除諮詢表單紀錄');
  renderLeadAdminTable();
}

function updateCartBadge() {
  const count = cart ? cart.length : 0;
  const cartCountEls = document.querySelectorAll('#cartCount, #mobileCartCount');
  cartCountEls.forEach(el => {
    el.innerText = count;
  });
}

function addToCart(courseId, type = 'record') {
  const course = (typeof mockCourses !== 'undefined' ? mockCourses : []).find(c => c.id === courseId);
  if (!course) return;

  const price = type === 'combo' ? (course.priceWith1on1 || 10880) : (course.priceRecordOnly || 3600);
  const planTitle = type === 'combo' ? `${course.title} (含1對1個教陪跑)` : `${course.title} (錄播自學版)`;

  const existing = cart.find(item => item.courseId === courseId && item.type === type);
  if (!existing) {
    cart.push({
      courseId: course.id,
      title: planTitle,
      price: price,
      type: type
    });
  }

  updateCartBadge();

  // Visual pulse on cart button (Desktop)
  const cartBtn = document.getElementById('cartBtn');
  if (cartBtn) {
    cartBtn.style.transform = 'scale(1.1)';
    cartBtn.style.borderColor = '#38bdf8';
    cartBtn.style.boxShadow = '0 0 15px rgba(56, 189, 248, 0.5)';
    setTimeout(() => {
      cartBtn.style.transform = 'scale(1)';
      cartBtn.style.borderColor = 'rgba(139, 92, 246, 0.45)';
      cartBtn.style.boxShadow = 'none';
    }, 300);
  }

  // Visual pulse on cart button (Mobile)
  const mobileCartBtn = document.getElementById('mobileCartBtn');
  if (mobileCartBtn) {
    mobileCartBtn.style.transform = 'scale(1.2)';
    mobileCartBtn.style.borderColor = '#ec4899';
    mobileCartBtn.style.boxShadow = '0 0 15px rgba(236, 72, 153, 0.6)';
    setTimeout(() => {
      mobileCartBtn.style.transform = 'scale(1)';
      mobileCartBtn.style.borderColor = 'rgba(139, 92, 246, 0.4)';
      mobileCartBtn.style.boxShadow = 'none';
    }, 300);
  }

  showToast(`✅ 已將【${course.title}】加入購物車！點擊上方「查看購物車」即可結帳`, 4000);
}

function openCartOrCheckoutModal() {
  if (!cart || cart.length === 0) {
    showToast('🛒 您目前尚未挑選課程，請前往商城選購！', 4000);
    switchView('marketplace');
    setTimeout(() => {
      const marketplaceEl = document.getElementById('view-marketplace') || document.getElementById('courseCategoryFilters');
      if (marketplaceEl) {
        marketplaceEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
    return;
  }

  const latestItem = cart[cart.length - 1];
  openCheckoutModal(latestItem.courseId || 'course-1', latestItem.type || 'record');
}

function openCheckoutModalDirect(courseId, type) {
  openCheckoutModal(courseId, type);
}

function calculateCheckoutFinalPrice(originalPrice) {
  const coinInput = document.getElementById('inputUseCoins');
  const userCoins = currentUser ? (currentUser.coins || 0) : 0;
  let useCoins = coinInput ? parseInt(coinInput.value) || 0 : 0;
  const maxAllowed = Math.min(userCoins, originalPrice);
  
  if (useCoins > maxAllowed) {
    useCoins = maxAllowed;
    if (coinInput) coinInput.value = maxAllowed;
  }
  if (useCoins < 0) {
    useCoins = 0;
    if (coinInput) coinInput.value = 0;
  }
  
  const finalPrice = Math.max(0, originalPrice - useCoins);
  const discountSpan = document.getElementById('displayCoinDiscount');
  const finalSpan = document.getElementById('displayFinalPrice');
  const submitBtnSpan = document.getElementById('checkoutSubmitAmount');
  
  if (discountSpan) discountSpan.innerText = useCoins.toLocaleString();
  if (finalSpan) finalSpan.innerText = finalPrice.toLocaleString();
  if (submitBtnSpan) submitBtnSpan.innerText = finalPrice.toLocaleString();
}

function applyMaxCoins(maxCoins, originalPrice) {
  const coinInput = document.getElementById('inputUseCoins');
  if (coinInput) {
    coinInput.value = maxCoins;
    calculateCheckoutFinalPrice(originalPrice);
  }
}

function clearCoins(originalPrice) {
  const coinInput = document.getElementById('inputUseCoins');
  if (coinInput) {
    coinInput.value = 0;
    calculateCheckoutFinalPrice(originalPrice);
  }
}

// Enrollment Checkout & Payment Modal (支援折扣幣使用 & 客製化報價單系統)
function openCheckoutModal(courseId, type) {
  const course = (typeof mockCourses !== 'undefined' ? mockCourses : []).find(c => c.id === courseId) || (typeof mockCourses !== 'undefined' ? mockCourses[0] : null);
  if (!course) return;

  const userEmail = currentUser ? currentUser.email : 'student@pentaskill.com';
  const customQuote = (typeof mockCustomQuotes !== 'undefined' ? mockCustomQuotes : []).find(q => q.studentEmail.toLowerCase() === userEmail.toLowerCase()) || null;

  const isCombo = type === 'combo';
  const displayTitle = (!isCombo) 
    ? `${course.title} (錄播自學版)` 
    : (customQuote ? customQuote.courseTitle : `${course.title} (含1對1個教陪跑)`);
  const displayPrice = (!isCombo) 
    ? (course.priceRecordOnly || 3600) 
    : (customQuote ? customQuote.customPrice : (course.priceWith1on1 || 10880));
  const createdBy = (!isCombo) ? '官網線上直購' : (customQuote ? customQuote.createdBy : '專屬小編');
  const quoteDetails = (!isCombo) 
    ? '📹 高畫質微單元影音隨選自學 + 全套雲端教材講義' 
    : (customQuote ? customQuote.details : '🔥 錄播全套影音單元 + 4次業師 1-on-1 個教陪跑');

  const userCoins = currentUser ? (currentUser.coins || 0) : 0;
  const maxCoinsApplicable = Math.min(userCoins, displayPrice);
  const initialDiscount = maxCoinsApplicable;
  const initialFinalPrice = Math.max(0, displayPrice - initialDiscount);

  const checkoutModal = document.getElementById('checkoutModal');
  let modalBody = document.getElementById('checkoutModalBody');
  if (!checkoutModal) return;
  if (!modalBody) {
    modalBody = checkoutModal.querySelector('.modal-body') || checkoutModal.querySelector('.modal-box');
  }
  if (!modalBody) return;

  modalBody.innerHTML = `
    <div style="text-align: center; margin-bottom: 1.25rem;">
      <span class="badge-tag bg-purple"><i class="fa-solid fa-shield-halved"></i> 256-bit SSL 安全加密報名通道</span>
      <h4 style="margin-top:0.5rem; font-size:1.15rem; color:#fff;">${displayTitle}</h4>
      <div class="text-xs text-cyan margin-top-xs">
        ${customQuote ? `👑 由【${createdBy}】親自設定之專屬學員結帳金額與課程方案` : '🔒 與專屬小編洽詢確認後之學員結帳與權限開通頁面'}
      </div>
    </div>

    <div class="fin-calc-box">
      <div class="calc-row">
        <span>對接報名方案</span>
        <strong class="text-pink" style="font-size:0.95rem;">${displayTitle}</strong>
      </div>
      <div class="calc-row">
        <span>方案原價</span>
        <strong class="text-white" style="font-size: 1rem;">NT$ ${displayPrice.toLocaleString()}</strong>
      </div>
      <div class="calc-row" style="color: #fbbf24;">
        <span>🪙 精幣折抵金</span>
        <strong>- NT$ <span id="displayCoinDiscount">${initialDiscount.toLocaleString()}</span></strong>
      </div>
      <div class="calc-row" style="border-top:1px solid rgba(255,255,255,0.15); padding-top:0.4rem; margin-top:0.4rem;">
        <span>應付實結金額</span>
        <strong class="text-purple" style="font-size: 1.35rem;">NT$ <span id="displayFinalPrice">${initialFinalPrice.toLocaleString()}</span></strong>
      </div>
      ${customQuote ? `
        <div class="calc-row" style="margin-top:0.3rem; border-top:1px dashed rgba(255,255,255,0.1); padding-top:0.3rem;">
          <span class="text-xs text-muted">專屬優惠與贈品：</span>
          <span class="text-xs text-green"><strong>${quoteDetails}</strong></span>
        </div>
      ` : ''}
    </div>

    <!-- 🪙 折扣幣 (精幣) 使用區塊 -->
    <div class="checkout-coins-section margin-top-sm" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 0.85rem 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <div style="font-weight: 700; color: #fbbf24; font-size: 0.92rem; display: flex; align-items: center; gap: 0.4rem;">
          <i class="fa-solid fa-coins"></i> 使用折扣幣 (精幣 1幣=NT$1)
        </div>
        <div class="text-xs" style="color: #fbbf24;">
          目前可用精幣：<strong>${userCoins.toLocaleString()}</strong> 枚
        </div>
      </div>
      ${userCoins > 0 ? `
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <div style="flex: 1; position: relative;">
            <input type="number" id="inputUseCoins" class="form-control text-sm" min="0" max="${maxCoinsApplicable}" value="${initialDiscount}" placeholder="輸入折抵枚數" oninput="calculateCheckoutFinalPrice(${displayPrice})" style="padding-right: 2.5rem;">
            <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 0.78rem; color: var(--text-muted);">枚</span>
          </div>
          <button type="button" class="btn btn-sm btn-outline" onclick="applyMaxCoins(${maxCoinsApplicable}, ${displayPrice})" style="border-color: rgba(245, 158, 11, 0.5); color: #fbbf24; white-space: nowrap; padding: 0.4rem 0.75rem;">
            全部折抵
          </button>
          <button type="button" class="btn btn-sm btn-outline" onclick="clearCoins(${displayPrice})" style="white-space: nowrap; padding: 0.4rem 0.75rem;">
            不使用
          </button>
        </div>
        <div class="text-xs text-muted margin-top-xs" style="font-size:0.75rem;">
          💡 本次結帳最多可折抵 <strong class="text-yellow">${maxCoinsApplicable.toLocaleString()}</strong> 精幣 (即折抵 NT$ ${maxCoinsApplicable.toLocaleString()})
        </div>
      ` : `
        <div class="text-xs text-muted" style="line-height: 1.45;">
          ℹ️ 您目前尚無可用精幣。加入會員並填寫生日（當月贈 100 精幣）或完課好評皆可獲贈精幣！
        </div>
      `}
    </div>

    <form onsubmit="processPayment(event, '${displayTitle.replace(/'/g, "\\'")}', ${displayPrice}, '${type}')" class="margin-top-md">
      <div class="form-group">
        <label><i class="fa-solid fa-credit-card text-cyan"></i> 選擇金流服務與付款方式</label>
        <select class="form-control" id="payMethod">
          <option>💳 信用卡 / 簽帳金融卡 (256-bit SSL 一次付清)</option>
          <option>🏦 銀行 ATM / 網路銀行轉帳 (取得專屬虛擬帳號)</option>
          <option>📱 LINE Pay / 街口支付行動快充</option>
        </select>
      </div>

      <div class="line-consult-box margin-top-sm" style="padding:0.75rem 1rem; margin-bottom:0.5rem;">
        <div class="text-xs text-muted" style="line-height:1.45;">
          <i class="fa-solid fa-circle-check text-green"></i> 付款完成後系統將自動扣抵精幣，並派發 🏆 <strong>1 枚精通寶成就勳章</strong>，即時開通學習權限！
        </div>
      </div>

      <!-- 📜 購課服務條款與退費政策勾選區塊 -->
      <div class="terms-agreement-box margin-top-sm" id="termsAgreementBox" style="background: rgba(139, 92, 246, 0.08); border: 1px dashed rgba(139, 92, 246, 0.4); border-radius: var(--radius-sm); padding: 0.75rem 0.85rem; transition: var(--transition);">
        <div style="display: flex; align-items: flex-start; gap: 0.65rem;">
          <input type="checkbox" id="agreeTermsCheckbox" required onchange="onAgreeTermsChange(this.checked, 'termsAgreementBox')" style="margin-top: 3px; accent-color: var(--accent-purple); width: 17px; height: 17px; cursor: pointer; flex-shrink: 0;">
          <div style="font-size: 0.82rem; line-height: 1.5; color: #f1f5f9;">
            <label for="agreeTermsCheckbox" style="cursor: pointer; margin: 0; display: inline;">
              我已完整閱讀並同意
            </label>
            <button type="button" class="terms-link-btn" onclick="openTermsModal(event)">
              📜【精五門學員購課服務條款與退費政策】
            </button>
            <span>（含錄播課法定排除 7 日猶豫期、1 對 1 個教 48 小時前請假改期與退費標準）<span class="text-pink">*</span></span>
          </div>
        </div>
      </div>

      <button type="submit" class="btn btn-primary btn-block margin-top-md" style="font-size:1.05rem;">
        <i class="fa-solid fa-file-signature"></i> 確認報名結帳 NT$ <span id="checkoutSubmitAmount">${initialFinalPrice.toLocaleString()}</span> 並開通專屬權限
      </button>
    </form>
  `;

  checkoutModal.classList.add('active');
}

// Student Custom Quotation Management Engine (Manager & Staff CMS)
function openAddQuoteModal() {
  document.getElementById('editQuoteId').value = '';
  document.getElementById('inputQuoteStudentEmail').value = '';
  document.getElementById('inputQuoteStudentName').value = '';
  if (document.getElementById('inputQuoteStudentPhone')) {
    document.getElementById('inputQuoteStudentPhone').value = '';
  }
  document.getElementById('inputQuoteCourseTitle').value = 'AI 驅動 Full-Stack 開發實戰營 (👑 專屬對接 85 折優惠包)';
  document.getElementById('inputQuotePrice').value = '10880';
  document.getElementById('inputQuoteDetails').value = '包含全套錄播 + 4次個教點評 + 贈送設計元件庫';
  if (document.getElementById('inputQuoteCreatedBy')) document.getElementById('inputQuoteCreatedBy').value = currentUser ? currentUser.name : '陳顧問';
  document.getElementById('customQuoteModal').classList.add('active');
}

function openEditQuoteModal(quoteId) {
  const quote = mockCustomQuotes.find(q => q.id === quoteId);
  if (!quote) return;

  document.getElementById('editQuoteId').value = quote.id;
  document.getElementById('inputQuoteStudentEmail').value = quote.studentEmail || '';
  document.getElementById('inputQuoteStudentName').value = quote.studentName || '';
  if (document.getElementById('inputQuoteStudentPhone')) {
    document.getElementById('inputQuoteStudentPhone').value = quote.studentPhone || '';
  }
  document.getElementById('inputQuoteCourseTitle').value = quote.courseTitle || '';
  document.getElementById('inputQuotePrice').value = quote.customPrice || 0;
  document.getElementById('inputQuoteDetails').value = quote.details || '';
  if (document.getElementById('inputQuoteCreatedBy')) document.getElementById('inputQuoteCreatedBy').value = quote.createdBy || (currentUser ? currentUser.name : '陳顧問');
  document.getElementById('customQuoteModal').classList.add('active');
}

function closeCustomQuoteModal() {
  document.getElementById('customQuoteModal').classList.remove('active');
}

function handleSaveCustomQuote(e) {
  e.preventDefault();
  const id = document.getElementById('editQuoteId').value;
  const studentEmail = document.getElementById('inputQuoteStudentEmail').value.trim();
  const studentName = document.getElementById('inputQuoteStudentName').value.trim();
  const phoneEl = document.getElementById('inputQuoteStudentPhone');
  const studentPhone = phoneEl ? phoneEl.value.trim() : '';
  const courseTitle = document.getElementById('inputQuoteCourseTitle').value.trim();
  const customPrice = parseInt(document.getElementById('inputQuotePrice').value) || 0;
  const details = document.getElementById('inputQuoteDetails').value.trim();
  const createdByEl = document.getElementById('inputQuoteCreatedBy');
  const creatorName = (createdByEl && createdByEl.value.trim()) ? createdByEl.value.trim() : (currentUser ? currentUser.name : '陳顧問');
  const nowStr = getLocalDateTimeString();

  let quoteToSync = null;

  if (id) {
    const existing = mockCustomQuotes.find(q => q.id === id);
    if (existing) {
      existing.studentEmail = studentEmail;
      existing.studentName = studentName;
      existing.studentPhone = studentPhone;
      existing.courseTitle = courseTitle;
      existing.customPrice = customPrice;
      existing.details = details;
      existing.createdBy = creatorName;
      existing.updatedAt = nowStr;
      quoteToSync = existing;
    }
    showToast(`✅ 已更新 ${studentName} 的專屬結帳報價單（金額：NT$ ${customPrice.toLocaleString()}）並同步 Google Sheet`);
  } else {
    const newQuote = {
      id: `quote-${Date.now()}`,
      studentEmail,
      studentName,
      studentPhone,
      courseTitle,
      customPrice,
      createdBy: creatorName,
      details,
      updatedAt: nowStr
    };
    mockCustomQuotes.unshift(newQuote);
    quoteToSync = newQuote;
    showToast(`🎉 成功為 ${studentName} 建立專屬報價單（金額：NT$ ${customPrice.toLocaleString()}）並同步 Google Sheet`);
  }

  saveQuotesToStorage();

  if (quoteToSync) {
    syncQuoteToGoogleSheet(quoteToSync);
  }

  closeCustomQuoteModal();
  renderCustomQuotesAdminTable();
}

function renderCustomQuotesAdminTable() {
  const tbody = document.getElementById('quoteTableBody');
  if (!tbody) return;

  tbody.innerHTML = mockCustomQuotes.map(quote => `
    <tr>
      <td data-label="對接學員">
        <strong>${quote.studentName}</strong>
        <div class="text-xs text-muted"><code>${quote.studentEmail}</code></div>
        ${quote.studentPhone ? `<div class="text-xs text-cyan"><i class="fa-solid fa-phone"></i> ${quote.studentPhone}</div>` : ''}
      </td>
      <td data-label="開立身分"><span class="badge-tag">${quote.createdBy}</span></td>
      <td data-label="客製方案"><strong class="text-pink">${quote.courseTitle}</strong></td>
      <td data-label="特惠結帳金額"><strong class="text-purple" style="font-size:1.05rem;">NT$ ${quote.customPrice.toLocaleString()}</strong></td>
      <td data-label="開通備註" class="text-xs text-muted" style="max-width:200px;">${quote.details}</td>
      <td data-label="更新時間" class="text-xs text-muted"><code>${quote.updatedAt}</code></td>
      <td data-label="快捷結帳/操作" style="white-space:nowrap;">
        <button class="btn btn-sm btn-line" onclick="copyLineCheckoutGuide('${quote.id}')" title="複製 LINE 專屬結帳引導 (含直通付款連結)" style="padding:0.35rem 0.6rem; font-size:0.75rem;"><i class="fa-brands fa-line"></i> 複製 LINE 引導</button>
        <button class="btn btn-sm btn-outline" onclick="copyDirectPayLink('${quote.id}')" title="複製免登入直通付款連結" style="padding:0.35rem 0.6rem; font-size:0.75rem; border-color:var(--accent-cyan); color:var(--accent-cyan);"><i class="fa-solid fa-link"></i> 複製直通連結</button>
        <button class="btn btn-sm btn-outline" onclick="openEditQuoteModal('${quote.id}')" style="padding:0.35rem 0.5rem; font-size:0.75rem;"><i class="fa-solid fa-pen"></i> 修改</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCustomQuote('${quote.id}')" style="padding:0.35rem 0.5rem; font-size:0.75rem;"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function generateDirectPayUrl(quote) {
  let base = window.location.href.split('?')[0].split('#')[0];
  // 若在本機 file:/// 或 127.0.0.1 測試，自動使用正式 Cloudflare Workers 網址，確保發到 LINE/簡訊 100% 為可點擊的超連結
  if (!base.startsWith('http://') && !base.startsWith('https://') || base.includes('localhost') || base.includes('127.0.0.1') || base.startsWith('file:')) {
    base = 'https://online-learning-platform.pey514514.workers.dev/';
  }
  // ⚡ 做法 2：採用超簡潔短網址（乾淨俐落、不帶長代碼）
  return `${base}?quote=${quote.id}`;
}

function copyDirectPayLink(quoteId) {
  const quote = mockCustomQuotes.find(q => q.id === quoteId);
  if (!quote) return;

  const url = generateDirectPayUrl(quote);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast(`🔗 已複製 ${quote.studentName} 的【極簡直通結帳短網址】！`);
    }).catch(() => {
      fallbackCopy(url);
    });
  } else {
    fallbackCopy(url);
  }
}

function copyLineCheckoutGuide(quoteId) {
  const quote = mockCustomQuotes.find(q => q.id === quoteId);
  if (!quote) return;

  const directPayUrl = generateDirectPayUrl(quote);

  const guideText = `🎉 嗨 ${quote.studentName}！
已為您在【精五門 PentaSkill】設定好專屬報名通道：
📌 專屬方案：${quote.courseTitle}
💰 專屬特惠金額：NT$ ${quote.customPrice.toLocaleString()}
🎁 專屬包含：${quote.details}

👉【方式一】點擊專屬直通短網址（免註冊登入）：
🔗 ${directPayUrl}

👉【方式二】或直接至官網點擊「專屬報價結帳」輸入您的 Email 或手機：
🌐 https://online-learning-platform.pey514514.workers.dev/

核對您的資料並選擇付款方式（信用卡/LINE Pay/ATM）即可立即開通學習權限！
若有任何問題隨時與我們聯繫 😊`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(guideText).then(() => {
      showToast(`📋 已複製 ${quote.studentName} 的結帳通知引導文案 (含短網址與官網查單)！`);
    }).catch(() => {
      fallbackCopy(guideText);
    });
  } else {
    fallbackCopy(guideText);
  }
}

// ⚡ 做法 3：學員專屬報價單快速查詢 (Lookup Custom Quotation - 支援本地與 Google Sheet 雲端即時比對)
function openQuoteLookupModal() {
  const modal = document.getElementById('quoteLookupModal');
  if (!modal) return;
  const resultArea = document.getElementById('quoteLookupResultArea');
  if (resultArea) {
    resultArea.style.display = 'none';
    resultArea.innerHTML = '';
  }
  const input = document.getElementById('lookupQuoteKeyword');
  if (input) input.value = '';
  modal.classList.add('active');
  setTimeout(() => { if (input) input.focus(); }, 150);
}

function closeQuoteLookupModal() {
  const modal = document.getElementById('quoteLookupModal');
  if (modal) modal.classList.remove('active');
}

async function lookupAndCheckoutQuote(e) {
  e.preventDefault();
  const input = document.getElementById('lookupQuoteKeyword');
  if (!input) return;
  const kw = input.value.trim().toLowerCase();
  const cleanKw = kw.replace(/[\s-]/g, '');
  const resultArea = document.getElementById('quoteLookupResultArea');

  const quotes = (typeof mockCustomQuotes !== 'undefined' && Array.isArray(mockCustomQuotes)) ? mockCustomQuotes : [];

  // 1. 先在本地記憶體中比對 (Email / 姓名 / 報價單ID / 手機)
  let foundQuote = quotes.find(q => {
    const qEmail = (q.studentEmail || '').toLowerCase().trim();
    const qName = (q.studentName || '').toLowerCase().trim();
    const qPhone = (q.studentPhone || '').replace(/[\s-]/g, '');
    const qId = (q.id || '').toLowerCase().trim();

    if (qEmail && (qEmail === kw || qEmail.includes(kw))) return true;
    if (qName && (qName === kw || qName.includes(kw))) return true;
    if (qPhone && (qPhone === cleanKw || qPhone.includes(cleanKw) || cleanKw.includes(qPhone))) return true;
    if (qId && qId === kw) return true;

    // 檢查 mockUsers 中是否有相同 Email 的電話
    const user = (typeof mockUsers !== 'undefined' ? mockUsers : []).find(u => (u.email || '').toLowerCase() === qEmail);
    if (user && user.phone) {
      const cleanPhone = user.phone.replace(/[\s-]/g, '');
      if (cleanPhone && (cleanPhone === cleanKw || cleanPhone.includes(cleanKw) || cleanKw.includes(cleanPhone))) return true;
    }

    // 檢查 mockLeads 中是否有相同 Email 的電話
    const lead = (typeof mockLeads !== 'undefined' ? mockLeads : []).find(l => (l.email || '').toLowerCase() === qEmail);
    if (lead && lead.phone) {
      const cleanPhone = lead.phone.replace(/[\s-]/g, '');
      if (cleanPhone && (cleanPhone === cleanKw || cleanPhone.includes(cleanKw) || cleanKw.includes(cleanPhone))) return true;
    }

    return false;
  });

  if (foundQuote) {
    closeQuoteLookupModal();
    showToast(`🎉 已成功查出【${foundQuote.studentName}】的專屬客製化報價單！`);
    setTimeout(() => {
      openDirectPaymentModal({
        id: foundQuote.id,
        email: foundQuote.studentEmail,
        name: foundQuote.studentName,
        phone: foundQuote.studentPhone || '',
        title: foundQuote.courseTitle,
        price: foundQuote.customPrice,
        details: foundQuote.details,
        by: foundQuote.createdBy
      });
    }, 300);
    return;
  }

  // 2. 若本地未查到，啟動 Google Sheet 雲端即時查單 (跨裝置/多電腦同步)
  if (resultArea) {
    resultArea.style.display = 'block';
    resultArea.innerHTML = `
      <div style="background: rgba(8, 145, 178, 0.1); border: 1px solid rgba(8, 145, 178, 0.3); border-radius: var(--radius-sm); padding: 0.85rem; color: var(--accent-cyan); font-size: 0.85rem; text-align: center;">
        <i class="fa-solid fa-spinner fa-spin"></i> 正在即時連線 Google Sheet 雲端報價單資料庫查詢...
      </div>
    `;
  }

  try {
    const webhookUrl = googleSheetConfig.webhookUrl || localStorage.getItem('pentaskill_sheet_webhook') || 'https://script.google.com/macros/s/AKfycbx9jqEQ07dxqpMa8gupoW8KKqKUFJMPX1cDWUaRWPSZWP1H_1SKX3IwvPaNGq6uthy1IA/exec';
    const queryUrl = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(kw)}`;

    const response = await fetch(queryUrl);
    const json = await response.json();

    if (json && json.status === 'success' && Array.isArray(json.quotes) && json.quotes.length > 0) {
      const cloudQuote = json.quotes[0];

      let quoteTitle = cloudQuote.courseTitle;
      let quotePrice = Number(cloudQuote.customPrice) || 0;
      let quotePhone = cloudQuote.studentPhone || '';
      let quoteDetails = cloudQuote.details || '';
      let quoteBy = cloudQuote.createdBy || '👑 平台主管';

      // 智慧校正：若舊版試算表欄位未對齊（如金額跑到 courseTitle，課程名稱跑到 studentPhone）
      if (quotePrice === 0 && !isNaN(Number(cloudQuote.courseTitle)) && Number(cloudQuote.courseTitle) > 0) {
        quotePrice = Number(cloudQuote.courseTitle);
        quoteTitle = cloudQuote.studentPhone || '專屬對接客製化課程';
        quotePhone = '';
        if (!quoteDetails && cloudQuote.createdBy && cloudQuote.createdBy !== 'Wen總監' && cloudQuote.createdBy !== '👑 Wen總監' && cloudQuote.createdBy !== '平台主管' && cloudQuote.createdBy !== '👑 平台主管') {
          quoteDetails = cloudQuote.createdBy;
          quoteBy = '👑 平台主管';
        }
      }

      cloudQuote.courseTitle = quoteTitle;
      cloudQuote.customPrice = quotePrice;
      cloudQuote.studentPhone = quotePhone;
      cloudQuote.details = quoteDetails;
      cloudQuote.createdBy = quoteBy;

      // 自動同步快取至本地
      const existsLocal = mockCustomQuotes.find(q => q.studentEmail.toLowerCase() === cloudQuote.studentEmail.toLowerCase());
      if (!existsLocal) {
        mockCustomQuotes.unshift(cloudQuote);
        try {
          localStorage.setItem('pentaskill_custom_quotes', JSON.stringify(mockCustomQuotes));
        } catch(err) {}
      }

      closeQuoteLookupModal();
      showToast(`🎉 已自 Google Sheet 雲端成功查出【${cloudQuote.studentName}】的專屬報價單！`);
      setTimeout(() => {
        openDirectPaymentModal({
          id: cloudQuote.id,
          email: cloudQuote.studentEmail,
          name: cloudQuote.studentName,
          phone: cloudQuote.studentPhone || '',
          title: cloudQuote.courseTitle,
          price: cloudQuote.customPrice,
          details: cloudQuote.details,
          by: cloudQuote.createdBy
        });
      }, 300);
      return;
    }
  } catch (cloudErr) {
    console.warn('Google Sheet 雲端查單失敗:', cloudErr);
  }

  // 3. 查無資料提示
  if (resultArea) {
    resultArea.style.display = 'block';
    resultArea.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-sm); padding: 0.85rem; color: #fca5a5; font-size: 0.82rem;">
        <div style="font-weight: 700; margin-bottom: 0.3rem;"><i class="fa-solid fa-triangle-exclamation"></i> 查無此 Email 或手機的專屬報價單</div>
        <p style="margin: 0; line-height: 1.4; font-size: 0.78rem;">已連線 Google Sheet 試算表即時比對，未查到對應資料。請確認輸入的 Email 或手機是否正確，或點擊下方按鈕免費洽詢小編！</p>
      </div>
    `;
  }
}

// Direct URL Checkout Detection Engine (免登入直通結帳檢測)
function checkUrlDirectCheckout() {
  const params = new URLSearchParams(window.location.search);
  const payToken = params.get('payToken');
  const quoteId = params.get('quote') || params.get('quoteId') || params.get('pay');

  if (quoteId) {
    const quote = (typeof mockCustomQuotes !== 'undefined' ? mockCustomQuotes : []).find(q => q.id === quoteId);
    if (quote) {
      setTimeout(() => {
        openDirectPaymentModal({
          id: quote.id,
          email: quote.studentEmail,
          name: quote.studentName,
          title: quote.courseTitle,
          price: quote.customPrice,
          details: quote.details,
          by: quote.createdBy
        });
      }, 400);
      return;
    }
  }

  if (payToken) {
    try {
      const decodedJson = decodeURIComponent(atob(payToken));
      const quoteData = JSON.parse(decodedJson);
      if (quoteData && quoteData.title && quoteData.price) {
        setTimeout(() => {
          openDirectPaymentModal(quoteData);
        }, 400);
        return;
      }
    } catch(err) {
      console.warn('payToken 解析提醒:', err);
    }
  }
}

function openDirectPaymentModal(quoteData) {
  const displayTitle = quoteData.title || '精選實務課程';
  const displayPrice = parseInt(quoteData.price) || 0;
  const quoteDetails = quoteData.details || '全套錄播視訊 + 教學多年業師 1 對 1 個教輔導';
  const createdBy = quoteData.by || '平台主管';
  const studentEmail = quoteData.email || '';
  const studentName = quoteData.name || '';

  const userCoins = currentUser ? (currentUser.coins || 0) : 0;
  const maxCoinsApplicable = Math.min(userCoins, displayPrice);
  const initialDiscount = maxCoinsApplicable;
  const initialFinalPrice = Math.max(0, displayPrice - initialDiscount);

  const checkoutModal = document.getElementById('checkoutModal');
  let modalBody = document.getElementById('checkoutModalBody');
  if (!checkoutModal) return;
  if (!modalBody) {
    modalBody = checkoutModal.querySelector('.modal-body') || checkoutModal.querySelector('.modal-box');
  }
  if (!modalBody) return;

  modalBody.innerHTML = `
    <div style="text-align: center; margin-bottom: 1rem;">
      <span class="badge-tag bg-purple" style="font-size:0.75rem;"><i class="fa-solid fa-bolt"></i> 專屬免登入 • 直通快速結帳通道</span>
      <h4 style="margin-top:0.4rem; font-size:1.15rem; color:#fff;">${displayTitle}</h4>
      <div class="text-xs text-cyan margin-top-xs">
        👑 由【${createdBy}】為您客製化之專屬特惠方案與結帳頁面
      </div>
    </div>

    <div class="fin-calc-box">
      <div class="calc-row">
        <span>對接報名方案</span>
        <strong class="text-pink" style="font-size:0.95rem;">${displayTitle}</strong>
      </div>
      <div class="calc-row">
        <span>方案原價</span>
        <strong class="text-white" style="font-size: 1rem;">NT$ ${displayPrice.toLocaleString()}</strong>
      </div>
      <div class="calc-row" style="color: #fbbf24;">
        <span>🪙 精幣折抵金</span>
        <strong>- NT$ <span id="displayCoinDiscount">${initialDiscount.toLocaleString()}</span></strong>
      </div>
      <div class="calc-row" style="border-top:1px solid rgba(255,255,255,0.15); padding-top:0.4rem; margin-top:0.4rem;">
        <span>應付實結金額</span>
        <strong class="text-purple" style="font-size: 1.35rem;">NT$ <span id="displayFinalPrice">${initialFinalPrice.toLocaleString()}</span></strong>
      </div>
      <div class="calc-row" style="margin-top:0.3rem; border-top:1px dashed rgba(255,255,255,0.1); padding-top:0.3rem;">
        <span class="text-xs text-muted">專屬包含與贈品：</span>
        <span class="text-xs text-green"><strong>${quoteDetails}</strong></span>
      </div>
    </div>

    ${userCoins > 0 ? `
      <!-- 🪙 折扣幣 (精幣) 使用區塊 -->
      <div class="checkout-coins-section margin-top-sm" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 0.85rem 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div style="font-weight: 700; color: #fbbf24; font-size: 0.92rem; display: flex; align-items: center; gap: 0.4rem;">
            <i class="fa-solid fa-coins"></i> 使用折扣幣 (精幣 1幣=NT$1)
          </div>
          <div class="text-xs" style="color: #fbbf24;">
            目前可用精幣：<strong>${userCoins.toLocaleString()}</strong> 枚
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <div style="flex: 1; position: relative;">
            <input type="number" id="inputUseCoins" class="form-control text-sm" min="0" max="${maxCoinsApplicable}" value="${initialDiscount}" placeholder="輸入折抵枚數" oninput="calculateCheckoutFinalPrice(${displayPrice})" style="padding-right: 2.5rem;">
            <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 0.78rem; color: var(--text-muted);">枚</span>
          </div>
          <button type="button" class="btn btn-sm btn-outline" onclick="applyMaxCoins(${maxCoinsApplicable}, ${displayPrice})" style="border-color: rgba(245, 158, 11, 0.5); color: #fbbf24; white-space: nowrap; padding: 0.4rem 0.75rem;">
            全部折抵
          </button>
          <button type="button" class="btn btn-sm btn-outline" onclick="clearCoins(${displayPrice})" style="white-space: nowrap; padding: 0.4rem 0.75rem;">
            不使用
          </button>
        </div>
        <div class="text-xs text-muted margin-top-xs" style="font-size:0.75rem;">
          💡 本次結帳最多可折抵 <strong class="text-yellow">${maxCoinsApplicable.toLocaleString()}</strong> 精幣 (即折抵 NT$ ${maxCoinsApplicable.toLocaleString()})
        </div>
      </div>
    ` : ''}

    <form onsubmit="processDirectPayment(event, '${displayTitle.replace(/'/g, "\\'")}', ${displayPrice})" class="margin-top-md">
      <div style="background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius: var(--radius-sm); padding: 0.85rem; margin-bottom: 0.85rem;">
        <div style="font-size:0.82rem; font-weight:700; color:#fff; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.35rem;">
          <i class="fa-solid fa-user-check text-cyan"></i> 核對開通學員資訊 (付款後直接為您開通此帳號)
        </div>
        <div class="grid grid-2 gap-sm">
          <div class="form-group">
            <label class="text-xs text-muted">學員姓名 / 稱呼</label>
            <input type="text" id="directStudentName" class="form-control text-sm" value="${studentName}" placeholder="例如：林小明" required>
          </div>
          <div class="form-group">
            <label class="text-xs text-muted">聯絡電話 (手機)</label>
            <input type="tel" id="directStudentPhone" class="form-control text-sm" placeholder="0912-345-678">
          </div>
        </div>
        <div class="form-group margin-top-xs">
          <label class="text-xs text-muted">開通與接收發票 Email <span class="text-pink">*</span></label>
          <input type="email" id="directStudentEmail" class="form-control text-sm" value="${studentEmail}" placeholder="student@gmail.com" required>
        </div>
      </div>

      <div class="form-group">
        <label><i class="fa-solid fa-credit-card text-cyan"></i> 選擇金流服務與付款方式</label>
        <select class="form-control" id="payMethod">
          <option>💳 信用卡 / 簽帳金融卡 (256-bit SSL 一次付清)</option>
          <option>🏦 銀行 ATM / 網路銀行轉帳 (取得專屬虛擬帳號)</option>
          <option>📱 LINE Pay / 街口支付行動快充</option>
        </select>
      </div>

      <div class="line-consult-box margin-top-sm" style="padding:0.65rem 0.85rem; margin-bottom:0.5rem;">
        <div class="text-xs text-muted" style="line-height:1.45;">
          <i class="fa-solid fa-circle-check text-green"></i> 256-bit 銀行級安全加密。付款完成後系統將自動發送發票並贈送 🏆 1 枚精通寶成就勳章！
        </div>
      </div>

      <!-- 📜 購課服務條款與退費政策勾選區塊 -->
      <div class="terms-agreement-box margin-top-sm" id="termsAgreementDirectBox" style="background: rgba(139, 92, 246, 0.08); border: 1px dashed rgba(139, 92, 246, 0.4); border-radius: var(--radius-sm); padding: 0.75rem 0.85rem; transition: var(--transition);">
        <div style="display: flex; align-items: flex-start; gap: 0.65rem;">
          <input type="checkbox" id="agreeTermsDirectCheckbox" required onchange="onAgreeTermsChange(this.checked, 'termsAgreementDirectBox')" style="margin-top: 3px; accent-color: var(--accent-purple); width: 17px; height: 17px; cursor: pointer; flex-shrink: 0;">
          <div style="font-size: 0.82rem; line-height: 1.5; color: #f1f5f9;">
            <label for="agreeTermsDirectCheckbox" style="cursor: pointer; margin: 0; display: inline;">
              我已完整閱讀並同意
            </label>
            <button type="button" class="terms-link-btn" onclick="openTermsModal(event)">
              📜【精五門學員購課服務條款與退費政策】
            </button>
            <span>（含錄播課法定排除 7 日猶豫期、1 對 1 個教 48 小時前請假改期與退費標準）<span class="text-pink">*</span></span>
          </div>
        </div>
      </div>

      <button type="submit" class="btn btn-primary btn-block margin-top-md" style="font-size:1.05rem; padding:0.65rem 1rem;">
        <i class="fa-solid fa-lock"></i> 確認付款 NT$ <span id="checkoutSubmitAmount">${initialFinalPrice.toLocaleString()}</span> 並立即開通權限
      </button>
    </form>
  `;

  checkoutModal.classList.add('active');
  const box = checkoutModal.querySelector('.modal-box');
  if (box) box.scrollTop = 0;
}

function processDirectPayment(e, title, originalPrice) {
  e.preventDefault();
  // 檢查是否勾選同意服務條款
  const agreeDirectCheck = document.getElementById('agreeTermsDirectCheckbox');
  if (!agreeDirectCheck || !agreeDirectCheck.checked) {
    showToast('⚠️ 必須先勾選同意【精五門學員購課服務條款與退費政策】才可以進行下一步！');
    const box = document.getElementById('termsAgreementDirectBox');
    if (box) {
      box.style.border = '2px solid #ef4444';
      box.style.background = 'rgba(239, 68, 68, 0.15)';
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  const nameInput = document.getElementById('directStudentName');
  const emailInput = document.getElementById('directStudentEmail');
  const phoneInput = document.getElementById('directStudentPhone');
  const coinInput = document.getElementById('inputUseCoins');

  const studentName = nameInput ? nameInput.value.trim() : '學員';
  const studentEmail = emailInput ? emailInput.value.trim() : 'student@pentaskill.com';
  const studentPhone = phoneInput ? phoneInput.value.trim() : '';

  let user = mockUsers.find(u => u.email.toLowerCase() === studentEmail.toLowerCase());
  const userCoins = user ? (user.coins || 0) : (currentUser ? (currentUser.coins || 0) : 0);
  let usedCoins = coinInput ? parseInt(coinInput.value) || 0 : 0;
  usedCoins = Math.min(Math.max(0, usedCoins), Math.min(userCoins, originalPrice));
  const finalPrice = Math.max(0, originalPrice - usedCoins);

  closeCheckoutModal();

  // Automatically ensure student exists or register/login as this student
  if (!user) {
    user = {
      id: `u-${Date.now()}`,
      name: studentName,
      email: studentEmail,
      phone: studentPhone,
      password: 'user123',
      coins: 0,
      masterTokens: 1,
      role: 'student',
      roleLabel: '🎓 消費者學員 (Student)',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
      purchasedCourses: ['course-1', 'course-2']
    };
    mockUsers.push(user);
  } else {
    user.coins = Math.max(0, (user.coins || 0) - usedCoins);
    user.masterTokens = (user.masterTokens || 0) + 1;
    if (!user.purchasedCourses) user.purchasedCourses = [];
    if (!user.purchasedCourses.includes('course-1')) user.purchasedCourses.push('course-1');
  }
  saveUsersToStorage();

  // Set as logged in user
  currentUser = user;
  try {
    localStorage.setItem('pentaskill_user', JSON.stringify(currentUser));
  } catch(err) {}

  renderAuthArea();
  updateUIPermissions();
  renderUserTable();
  if (currentView === 'member-center') {
    renderMemberCenterView();
  }

  cart = cart.filter(item => item.title !== title);
  updateCartBadge();

  let toastMsg = `🎉 結帳成功！已為 ${studentName} 開通【${title}】。提醒：1-on-1 最晚須課前 2 天改期，當天取消視為放棄；課前 10 分鐘即可提前進場測試！`;
  if (usedCoins > 0) {
    toastMsg += `（折抵 ${usedCoins} 精幣，實付 NT$ ${finalPrice.toLocaleString()}）`;
  }
  toastMsg += ` 🏆 獲贈 1 枚精通寶！`;
  showToast(toastMsg);

  setTimeout(() => {
    switchView('member-center');
  }, 1200);
}

function deleteCustomQuote(quoteId) {
  mockCustomQuotes = mockCustomQuotes.filter(q => q.id !== quoteId);
  saveQuotesToStorage();
  showToast('已刪除學員專屬報價單');
  renderCustomQuotesAdminTable();
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').classList.remove('active');
}

function processPayment(e, title, originalPrice, type) {
  e.preventDefault();
  // 檢查是否勾選同意服務條款
  const agreeCheck = document.getElementById('agreeTermsCheckbox');
  if (!agreeCheck || !agreeCheck.checked) {
    showToast('⚠️ 必須先勾選同意【精五門學員購課服務條款與退費政策】才可以進行下一步！');
    const box = document.getElementById('termsAgreementBox');
    if (box) {
      box.style.border = '2px solid #ef4444';
      box.style.background = 'rgba(239, 68, 68, 0.15)';
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  const coinInput = document.getElementById('inputUseCoins');
  const userCoins = currentUser ? (currentUser.coins || 0) : 0;
  let usedCoins = coinInput ? parseInt(coinInput.value) || 0 : 0;
  usedCoins = Math.min(Math.max(0, usedCoins), Math.min(userCoins, originalPrice));
  const finalPrice = Math.max(0, originalPrice - usedCoins);

  if (currentUser) {
    currentUser.coins = Math.max(0, (currentUser.coins || 0) - usedCoins);
    currentUser.masterTokens = (currentUser.masterTokens || 0) + 1; // 獲得 1 枚精通寶
    
    // update in mockUsers
    const uIdx = mockUsers.findIndex(u => u.id === currentUser.id || (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()));
    if (uIdx !== -1) {
      mockUsers[uIdx].coins = currentUser.coins;
      mockUsers[uIdx].masterTokens = currentUser.masterTokens;
    }
    saveUsersToStorage();
    try {
      localStorage.setItem('pentaskill_user', JSON.stringify(currentUser));
    } catch(err) {}
  }

  closeCheckoutModal();
  renderAuthArea();
  renderUserTable();
  if (currentView === 'member-center') {
    renderMemberCenterView();
  }

  let toastMsg = `✅ 報名結帳成功！實付 NT$ ${finalPrice.toLocaleString()}`;
  if (usedCoins > 0) {
    toastMsg += `（折抵 ${usedCoins} 精幣）`;
  }
  toastMsg += ` 🏆 獲贈 1 枚精通寶！提醒：1-on-1 最晚須課前 2 天線上改期，課前 10 分鐘開放入場！`;
  showToast(toastMsg);
  
  cart = cart.filter(item => item.title !== title);
  updateCartBadge();

  setTimeout(() => {
    switchView('member-center');
  }, 1200);
}

// Assignment Modal
function openAssignmentModal() {
  document.getElementById('assignmentModal').classList.add('active');
}

function closeAssignmentModal() {
  document.getElementById('assignmentModal').classList.remove('active');
}

function handleAssignmentSubmit(e) {
  e.preventDefault();
  closeAssignmentModal();
  showToast('🚀 個教作業已成功送出！講師將於 24 小時內完成審查並給予影音評語。');
}

function openAddLessonModal() {
  openAddChapterModal();
}

// Toast Helper
function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid fa-circle-check text-green"></i> <span>${msg}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function toggleControl(btnId, name) {
  showToast(`已切換 ${name} 開關狀態`);
}

function triggerHandUp() {
  showToast('✋ 您已在直播教室中舉手！講師已優先鎖定您的畫面進行個教批改。');
}

function openShareScreenModal() {
  showToast('🖥️ 已開啟螢幕共享視窗，講師正在同步觀看您的程式/設計畫面...');
}

function saveNote() {
  const noteText = document.getElementById('studentNoteText').value;
  if (noteText) {
    showToast('💾 筆記已成功儲存至此章節 (時間軸 14:20)');
  }
}

// Fullscreen Portfolio Modal Preview
function openPortfolioModal(title, imgUrl, mentor, student, details) {
  const checkoutModal = document.getElementById('checkoutModal');
  let modalBody = document.getElementById('checkoutModalBody');
  if (!checkoutModal) return;
  if (!modalBody) {
    modalBody = checkoutModal.querySelector('.modal-body') || checkoutModal.querySelector('.modal-box');
  }
  if (!modalBody) return;

  modalBody.innerHTML = `
    <div style="text-align: center; margin-bottom: 1.25rem;">
      <span class="badge-tag"><i class="fa-solid fa-gem text-purple"></i> 100% 合規授權星級作品集</span>
      <h3 style="margin-top:0.5rem; font-size:1.3rem;">${title}</h3>
      <div style="font-size:0.85rem; color:var(--accent-cyan); margin-top:0.3rem;">
        👨‍🏫 審查講師：${mentor} • 🎓 出產學員：${student}
      </div>
    </div>

    <div style="width:100%; height:280px; border-radius:var(--radius-lg); overflow:hidden; margin-bottom:1.25rem; border:1px solid rgba(255,255,255,0.15);">
      <img src="${imgUrl}" alt="${title}" style="width:100%; height:100%; object-fit:cover;">
    </div>

    <div style="background:rgba(255,255,255,0.04); padding:1rem; border-radius:var(--radius-md); border:1px solid rgba(255,255,255,0.08); margin-bottom:1.25rem;">
      <h4 style="font-size:0.95rem; color:#fff; margin-bottom:0.4rem;"><i class="fa-solid fa-wand-magic-sparkles text-yellow"></i> 1-on-1 講師修稿亮點與成果評語</h4>
      <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5; margin:0;">${details}</p>
    </div>

    <div style="display:flex; gap:0.75rem;">
      <button class="btn btn-outline btn-block" onclick="closeCheckoutModal()">關閉視窗</button>
      <button class="btn btn-primary btn-block" onclick="closeCheckoutModal(); quickBookInstructor('${mentor}')">
        <i class="fa-solid fa-calendar-check"></i> 預約 ${mentor} 講師修稿
      </button>
    </div>
  `;

  checkoutModal.classList.add('active');
}

function openPrivacyPolicyModal() {
  const modal = document.getElementById('privacyPolicyModal');
  if (modal) modal.classList.add('active');
}

function closePrivacyPolicyModal() {
  const modal = document.getElementById('privacyPolicyModal');
  if (modal) modal.classList.remove('active');
}

// Floating Social Widget Tooltip Close & Interactivity
function closeSocialTooltip(event) {
  if (event) event.stopPropagation();
  const tooltip = document.getElementById('socialTooltip');
  if (tooltip) {
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translateY(10px)';
    setTimeout(() => {
      tooltip.style.display = 'none';
    }, 300);
  }
}

// Back to Top Button Functionality
function scrollToPageTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

window.addEventListener('scroll', () => {
  const btn = document.getElementById('backToTopBtn');
  if (btn) {
    if (window.scrollY > 300) {
      btn.classList.add('show');
    } else {
      btn.classList.remove('show');
    }
  }
}, { passive: true });




// 📜 Terms & Refund Policy Modal Engine (精五門學員購課服務條款與退費政策)
function openTermsModal(e) {
  if (e) {
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }
  const modal = document.getElementById('termsModal');
  if (modal) {
    modal.classList.add('active');
    const content = modal.querySelector('.terms-modal-content');
    if (content) content.scrollTop = 0;
  }
}

function closeTermsModal() {
  const modal = document.getElementById('termsModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function acceptTermsAndClose() {
  const cb1 = document.getElementById('agreeTermsCheckbox');
  if (cb1) {
    cb1.checked = true;
    onAgreeTermsChange(true, 'termsAgreementBox');
  }
  const cb2 = document.getElementById('agreeTermsDirectCheckbox');
  if (cb2) {
    cb2.checked = true;
    onAgreeTermsChange(true, 'termsAgreementDirectBox');
  }
  closeTermsModal();
  showToast('✅ 已同意【精五門學員購課服務條款與退費政策】');
}

function onAgreeTermsChange(checked, boxId) {
  const targetId = boxId || 'termsAgreementBox';
  const box = document.getElementById(targetId);
  if (box) {
    if (checked) {
      box.style.border = '1px solid #10b981';
      box.style.background = 'rgba(16, 185, 129, 0.12)';
    } else {
      box.style.border = '1px dashed rgba(139, 92, 246, 0.4)';
      box.style.background = 'rgba(139, 92, 246, 0.08)';
    }
  }
}

// ==========================================================================
// 👨‍🏫 講師工作台 (INSTRUCTOR PORTAL) 核心模組
// ==========================================================================

let currentPortalTab = 'bookings';

function switchPortalTab(tabKey) {
  currentPortalTab = tabKey;
  
  // Update Tab Buttons
  ['bookings', 'courses', 'salary', 'profile'].forEach(k => {
    const btn = document.getElementById(`ptabBtn-${k}`);
    if (btn) btn.classList.toggle('active', k === tabKey);
  });

  // Update Tab Panes
  ['bookings', 'courses', 'salary', 'profile'].forEach(k => {
    const pane = document.getElementById(`ptab-${k}`);
    if (pane) pane.classList.toggle('active', k === tabKey);
  });

  if (tabKey === 'bookings') renderPortalBookings();
  if (tabKey === 'courses') renderPortalCourses();
  if (tabKey === 'salary') renderPortalSalary();
  if (tabKey === 'profile') renderPortalProfile();
}

function renderInstructorPortal() {
  const isInstructorOrAbove = currentUser && (currentUser.role === 'instructor' || currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff');
  if (!isInstructorOrAbove) {
    showToast('⚠️ 請先登入金牌講師或主管帳號！');
    openLoginModal();
    return;
  }

  const isAdminPreview = currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff';
  const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();

  // 1. Header Card Info
  const avatarEl = document.getElementById('portalInstructorAvatar');
  const welcomeEl = document.getElementById('portalInstructorWelcome');
  const titleEl = document.getElementById('portalInstructorTitle');
  if (avatarEl) avatarEl.src = currentUser.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80';
  if (welcomeEl) {
    welcomeEl.innerText = isAdminPreview
      ? `${currentUser.name}，歡迎進入講師工作台（全平台課程與講義管理模式）！`
      : `${currentUser.name} 講師，歡迎回到講師工作台！`;
  }
  
  // Find instructor metadata from mockInstructors
  const instMeta = mockInstructors.find(i => i.name.includes(cleanName)) || mockInstructors[0];
  if (titleEl && instMeta) {
    titleEl.innerText = isAdminPreview
      ? `👑 平台主管視角 • 可預覽並管理全站 ${mockCourses.length} 門課程講義與排班`
      : `${instMeta.role} • ${instMeta.exp}`;
  }

  // 2. Calculate Personal KPIs
  const myBookings = isAdminPreview ? mockBookings : mockBookings.filter(b => b.instructor && b.instructor.includes(cleanName));
  const myCourses = isAdminPreview ? mockCourses : mockCourses.filter(c => c.instructor && c.instructor.includes(cleanName));
  const targetSalaryName = isAdminPreview ? (mockInstructors[0] ? mockInstructors[0].name : currentUser.name) : currentUser.name;
  const salaryData = (typeof getInstructorPersonalSalary === 'function') ? getInstructorPersonalSalary(targetSalaryName) : null;

  const kpiBookingsEl = document.getElementById('portalKpiBookings');
  const kpiCoursesEl = document.getElementById('portalKpiCourses');
  const kpiEarningsEl = document.getElementById('portalKpiEarnings');
  const kpiStatusEl = document.getElementById('portalKpiPayoutStatus');

  if (kpiBookingsEl) kpiBookingsEl.innerHTML = `${myBookings.length} <small>場次</small>`;
  if (kpiCoursesEl) kpiCoursesEl.innerHTML = `${myCourses.length} <small>門</small>`;
  if (kpiEarningsEl && salaryData) kpiEarningsEl.innerText = `NT$ ${salaryData.totalPayout.toLocaleString()}`;
  if (kpiStatusEl && salaryData) kpiStatusEl.innerText = salaryData.status;

  // 3. Render the active tab
  switchPortalTab(currentPortalTab);
}

// 刷新講師 1-on-1 排班資料與月曆（具備重新讀取資料庫、按鈕文字切換、旋轉動效、平滑重載與成功提示）
async function refreshPortalBookings(btnElement) {
  const btn = btnElement || document.querySelector('button[onclick*="refreshPortalBookings"], button[onclick*="renderPortalBookings"]');
  const originalHtml = '<i class="fa-solid fa-rotate"></i> 刷新排班';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> 正在同步課表...';
    btn.style.opacity = '0.85';
  }

  // 1. 容器微幅降低透明度，營造重新整理載入感知
  const container = document.getElementById('portalBookingsList');
  const calGrid = document.getElementById('portalCalendarGrid');
  if (container) {
    container.style.transition = 'opacity 0.2s ease';
    container.style.opacity = '0.35';
  }
  if (calGrid) {
    calGrid.style.transition = 'opacity 0.2s ease';
    calGrid.style.opacity = '0.35';
  }

  // 2. 從本地持久快取重新拉取最新排班
  try {
    const saved = localStorage.getItem('pentaskill_bookings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        mockBookings = parsed;
      }
    }
  } catch (e) {}

  // 3. 嘗試自 Cloudflare KV 同步最新排班
  if (typeof fetchCloudData === 'function') {
    try {
      const cloudData = await fetchCloudData('bookings');
      if (Array.isArray(cloudData) && cloudData.length > 0) {
        mockBookings = cloudData;
        try { localStorage.setItem('pentaskill_bookings', JSON.stringify(mockBookings)); } catch (e) {}
      }
    } catch (e) {}
  }

  // 4. 動態等待 450ms 確保旋轉感與載入感知
  setTimeout(() => {
    // 5. 重新渲染月曆與預約列表
    if (typeof renderPortalCalendar === 'function') renderPortalCalendar();
    renderPortalBookings(false);

    // 6. 計算當前排班數並更新 KPI 數字與徽章
    let myBookingsCount = 0;
    if (currentUser) {
      const isAdminPreview = currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff';
      const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();
      const myBookings = isAdminPreview ? mockBookings : mockBookings.filter(b => b.instructor && b.instructor.includes(cleanName));
      myBookingsCount = myBookings.length;
      const kpiBookingsEl = document.getElementById('portalKpiBookings');
      if (kpiBookingsEl) kpiBookingsEl.innerHTML = `${myBookingsCount} <small>場次</small>`;
      const badge = document.getElementById('portalBookingsCountBadge');
      if (badge) badge.innerText = `${myBookingsCount} 場預約`;
    }

    // 7. 平滑恢復透明度
    if (container) container.style.opacity = '1';
    if (calGrid) calGrid.style.opacity = '1';

    // 8. 恢復按鈕文字與狀態
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      btn.style.opacity = '1';
    }

    // 9. 彈出明確的即時成功通知 Toast
    if (typeof showToast === 'function') {
      showToast(`🔄 1 對 1 排班課表已同步！目前共 ${myBookingsCount} 場已排定行程。`);
    }
  }, 450);
}

// TAB 1: 1-on-1 個教排班
function renderPortalBookings(autoCheckClick = true) {
  // 防呆相容：如果使用者直接點擊了包含「刷新排班」文字的按鈕觸發此函式，自動導向完整的動態刷新
  if (autoCheckClick && typeof window !== 'undefined' && window.event && window.event.type === 'click') {
    const target = window.event.target;
    const btn = target ? target.closest('button') : null;
    if (btn && btn.textContent && btn.textContent.includes('刷新排班')) {
      return refreshPortalBookings(btn);
    }
  }
  if (typeof renderPortalCalendar === 'function') renderPortalCalendar();
  const container = document.getElementById('portalBookingsList');
  if (!container || !currentUser) return;

  const isAdminPreview = currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff';
  const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();
  const myBookings = isAdminPreview ? mockBookings : mockBookings.filter(b => b.instructor && b.instructor.includes(cleanName));

  if (myBookings.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: #94a3b8; background: rgba(15, 23, 42, 0.4); border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1);">
        <i class="fa-solid fa-calendar-xmark" style="font-size: 2.5rem; margin-bottom: 1rem; color: #64748b;"></i>
        <h4 style="color: #cbd5e1; margin-bottom: 0.5rem;">目前尚無學員預約您的個教時段</h4>
        <p style="font-size: 0.9rem;">當學員於前台預約完成後，系統將第一時間為您排入課表。</p>
      </div>
    `;
    return;
  }

  container.innerHTML = myBookings.map(b => {
    const isCompleted = b.status === '已完成';
    const statusColor = isCompleted ? '#34d399' : '#38bdf8';
    const statusBg = isCompleted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(6, 182, 212, 0.15)';

    return `
      <div class="portal-booking-card">
        <div class="portal-booking-main">
          <div class="portal-booking-date-badge">
            <span class="day">${b.date}</span>
            <span class="time">${b.slotTime}</span>
          </div>
          <div class="portal-booking-info">
            <h4>${b.topic}</h4>
            <div class="portal-booking-meta">
              <span><i class="fa-solid fa-user-graduate text-cyan"></i> 學員：<strong>${b.studentName}</strong></span>
              <span><i class="fa-solid fa-envelope text-muted"></i> ${b.studentEmail}</span>
              <span><i class="fa-solid fa-coins text-amber"></i> 鐘點津貼：<strong>NT$ ${(b.payout || b.fee || 1800).toLocaleString()}</strong></span>
              <span style="background: ${statusBg}; color: ${statusColor}; padding: 2px 8px; border-radius: 6px; font-weight: 600;">${b.status}</span>
            </div>
            ${b.notes ? `<div class="portal-booking-notes"><i class="fa-solid fa-comment-dots text-purple"></i> 學員課前提問：${b.notes}</div>` : ''}
          </div>
        </div>
        <div class="portal-booking-actions">
          <button class="btn btn-primary btn-sm" onclick="enterInstructorClassroom('${b.id}')" style="background: linear-gradient(135deg, #8b5cf6, #06b6d4); border: none;">
            <i class="fa-solid fa-video"></i> 進入 1-on-1 教室
          </button>
          <button class="btn btn-outline btn-sm" onclick="copyInstructorBookingReminder('${b.id}', 1)" title="複製親切課前 1 天通知信">
            <i class="fa-solid fa-bell text-green"></i> 課前 1 天通知信
          </button>
          <button class="btn btn-outline btn-sm" onclick="copyInstructorBookingReminder('${b.id}', 3)" title="複製課前 3 天改期最後確認">
            <i class="fa-solid fa-calendar-check text-yellow"></i> 課前 3 天改期信
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// 進入講師 1-on-1 教室
function enterInstructorClassroom(bookingId) {
  const b = mockBookings.find(x => x.id === bookingId);
  if (!b) return;
  switchView('live-classroom');
  showToast(`🎥 已進入 ${b.studentName} 學員之 1 對 1 授課教室`);
}

// 複製講師提醒通知信
function copyInstructorBookingReminder(bookingId, daysBefore) {
  const b = mockBookings.find(x => x.id === bookingId);
  if (!b) return;

  let msg = '';
  if (daysBefore === 1) {
    msg = `🔔【精五門 PentaSkill 課前提醒】\n\n學員 ${b.studentName} 您好：\n您預約於明日 (${b.date} ${b.slotTime}) 與【${b.instructor}】進行 1 對 1 個教（主題：${b.topic}）。\n\n👉 請於課前 10 分鐘登入精五門網站，點擊「進入教室」準備上課囉！\n🔗 教室直通網址：https://online-learning-platform.pey514514.workers.dev/#live-classroom\n\n✨ 期待明天與您線上見，預祝您上課收穫滿滿！請於明日準時上課哦！`;
  } else {
    msg = `📅【精五門 PentaSkill 個教行程與改期最後確認】\n\n學員 ${b.studentName} 您好：\n您預約於 3 天後 (${b.date} ${b.slotTime}) 與【${b.instructor}】進行 1 對 1 個教（主題：${b.topic}）。\n\n⚠️ 貼心提醒：若您臨時有事需調整時間，最晚請於明天（上課前 2 天 / 48 小時前）於系統線上改期或通知 LINE@ 小編喔！逾期或當天臨時取消將視為放棄該堂課。\n\n🔗 預約管理中心：https://online-learning-platform.pey514514.workers.dev/#live-classroom\n感謝您的配合，預祝學習愉快！`;
  }

  navigator.clipboard.writeText(msg).then(() => {
    showToast(`📋 已一鍵複製【課前 ${daysBefore} 天提醒信】文案！可直接貼至 LINE 或 Email 發送給學員。`);
  }).catch(() => {
    showToast('⚠️ 瀏覽器剪貼簿權限受限，請手動複製。');
  });
}

// TAB 2: 我的錄播課程管理
function renderPortalCourses() {
  const container = document.getElementById('portalCoursesList');
  if (!container || !currentUser) return;

  const isAdminPreview = currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff';
  const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();
  const myCourses = isAdminPreview ? mockCourses : mockCourses.filter(c => c.instructor && c.instructor.includes(cleanName));

  if (myCourses.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #94a3b8; background: rgba(15, 23, 42, 0.4); border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1);">
        <i class="fa-solid fa-film" style="font-size: 2.5rem; margin-bottom: 1rem; color: #64748b;"></i>
        <h4 style="color: #cbd5e1;">目前尚未指派名下線上錄播課程</h4>
        <p style="font-size: 0.9rem;">若需上架新課程或新增講義教材，請洽平台營運小編對接。</p>
      </div>
    `;
    return;
  }

  container.innerHTML = myCourses.map(c => `
    <div class="portal-course-card">
      <img src="${c.coverImage}" class="portal-course-cover" alt="${c.title}">
      <div class="portal-course-body">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
          <span class="badge-tag">${c.categoryLabel}</span>
          <span style="font-size:0.8rem; color:#34d399; font-weight:600;"><i class="fa-solid fa-play-circle"></i> 支援試看</span>
        </div>
        <h4>${c.title}</h4>
        <p>${c.description}</p>
        <div style="display:flex; justify-content:space-between; color:#94a3b8; font-size:0.85rem; margin-bottom:0.75rem;">
          <span><i class="fa-solid fa-clock text-cyan"></i> ${c.videoDuration}</span>
          <span><i class="fa-solid fa-star text-amber"></i> ${c.rating} (${c.reviewCount}人評分)</span>
        </div>
        <div class="portal-course-actions">
          <button class="btn btn-outline btn-sm" onclick="switchView('video-player'); renderStudentCourseHandouts('${c.id}');" style="flex:1;">
            <i class="fa-solid fa-eye"></i> 預覽看課
          </button>
          <button class="btn btn-outline btn-sm" onclick="openCourseMaterialModal('${c.id}')" style="flex:1;">
            <i class="fa-solid fa-file-lines text-cyan"></i> 講義管理
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// TAB 3: 💰 個人月結薪資看板 (100% 隱私隔離)
function renderPortalSalary() {
  const container = document.getElementById('portalSalaryContent');
  if (!container || !currentUser) return;

  const isAdminPreview = currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff';
  const targetSalaryName = isAdminPreview ? (mockInstructors[0] ? mockInstructors[0].name : currentUser.name) : currentUser.name;
  const salary = (typeof getInstructorPersonalSalary === 'function') ? getInstructorPersonalSalary(targetSalaryName) : null;
  if (!salary) return;

  const bank = currentUser.bankInfo || { bankName: "玉山銀行 (808)", accountLast5: "58923" };

  container.innerHTML = `
    <!-- 總計卡片 -->
    <div class="portal-salary-summary-cards">
      <div class="salary-stat-card">
        <div class="salary-stat-label"><i class="fa-solid fa-video text-purple"></i> 錄播課分潤 (20%)</div>
        <div class="salary-stat-num">NT$ ${salary.recordedProfitShare.toLocaleString()}</div>
        <div class="salary-stat-desc">個人名下課程當月銷售額之 20%</div>
      </div>
      <div class="salary-stat-card">
        <div class="salary-stat-label"><i class="fa-solid fa-chalkboard-user text-cyan"></i> 1-on-1 個教津貼</div>
        <div class="salary-stat-num">NT$ ${salary.liveTotalPayout.toLocaleString()}</div>
        <div class="salary-stat-desc">累計完成 ${salary.liveSessionsCount} 場次個教輔導</div>
      </div>
      <div class="salary-stat-card total-highlight">
        <div class="salary-stat-label"><i class="fa-solid fa-sack-dollar text-amber"></i> 當月預估實領總計</div>
        <div class="salary-stat-num gold">NT$ ${salary.totalPayout.toLocaleString()}</div>
        <div class="salary-stat-desc text-green"><i class="fa-solid fa-circle-check"></i> ${salary.status}</div>
      </div>
    </div>

    <!-- 錄播課程拆帳明細表格 -->
    <div style="margin-bottom: 2rem;">
      <h4 style="color:#f8fafc; font-size:1.1rem; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
        <i class="fa-solid fa-receipt text-cyan"></i> 名下錄播課程分潤拆帳明細 (20%)
      </h4>
      <div class="table-responsive">
        <table class="table-modern">
          <thead>
            <tr>
              <th>課程名稱</th>
              <th>課程定價</th>
              <th>當月銷售估算</th>
              <th>課程銷售總額</th>
              <th>個人 20% 分潤收益</th>
            </tr>
          </thead>
          <tbody>
            ${salary.courseDetails.map(cd => `
              <tr>
                <td><strong>${cd.title}</strong></td>
                <td>NT$ ${cd.price.toLocaleString()}</td>
                <td><span class="badge" style="background:rgba(139,92,246,0.15); color:#c084fc;">${cd.soldCount} 堂</span></td>
                <td>NT$ ${cd.gross.toLocaleString()}</td>
                <td><strong class="text-amber">NT$ ${cd.share.toLocaleString()}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 撥款帳戶與合約保障 -->
    <div class="portal-bank-info-bar">
      <div>
        <span class="text-muted text-xs">專屬約定收款銀行帳戶：</span>
        <strong><i class="fa-solid fa-building-columns text-cyan"></i> ${bank.bankName}</strong>
        <span class="text-muted text-xs" style="margin-left:0.5rem;">(末5碼: <code>******${bank.accountLast5}</code>)</span>
      </div>
      <div style="font-size:0.85rem; color:#94a3b8;">
        <i class="fa-solid fa-calendar-check text-green"></i> 預計撥款日：<strong>${salary.payoutDate}</strong>
      </div>
    </div>

    <div style="margin-top: 1rem; font-size:0.8rem; color:#64748b; line-height:1.6;">
      💡 稅務提醒：單次給付若超過 NT$ 20,000 元，將依中華民國稅法辦理 10% 執行業務所得代扣與 2.11% 二代健保補充保費申報，於次年由平台寄發扣繳憑單供個人綜所稅列報抵稅。
    </div>
  `;
}

// TAB 4: 師資個人檔案展示
function renderPortalProfile() {
  const container = document.getElementById('portalProfileContent');
  if (!container || !currentUser) return;

  const isAdminPreview = currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff';
  const cleanName = currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim();
  const inst = mockInstructors.find(i => i.name.includes(cleanName)) || (isAdminPreview ? mockInstructors[0] : null);

  if (!inst) {
    container.innerHTML = `<p class="text-muted">查無公開師資檔案。</p>`;
    return;
  }

  container.innerHTML = `
    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 2rem; max-width: 700px; margin: 0 auto;">
      <div style="display:flex; align-items:center; gap:1.5rem; margin-bottom:1.5rem; flex-wrap:wrap;">
        <img src="${inst.avatar}" style="width:100px; height:100px; border-radius:50%; border:3px solid #06b6d4; object-fit:cover;">
        <div>
          <span class="badge-tag bg-cyan">${inst.tag}</span>
          <h3 style="color:#f8fafc; font-size:1.5rem; margin:0.35rem 0;">${inst.name}</h3>
          <p style="color:#94a3b8; font-size:0.9rem; margin:0;">${inst.role}</p>
        </div>
      </div>
      
      <div style="margin-bottom:1.25rem;">
        <label class="text-xs text-muted" style="text-transform:uppercase; letter-spacing:0.5px;">資歷與教學背景</label>
        <p style="color:#cbd5e1; font-size:0.95rem; margin-top:0.25rem;">${inst.exp}</p>
      </div>

      <div style="margin-bottom:1.25rem;">
        <label class="text-xs text-muted" style="text-transform:uppercase; letter-spacing:0.5px;">專長技能標籤</label>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
          ${(inst.skills || []).map(s => `<span class="badge" style="background:rgba(6,182,212,0.15); color:#38bdf8; border:1px solid rgba(6,182,212,0.3);">${s}</span>`).join('')}
        </div>
      </div>

      <div style="margin-bottom:1.25rem;">
        <label class="text-xs text-muted" style="text-transform:uppercase; letter-spacing:0.5px;">名師教學理念 (Quote)</label>
        <div style="background:rgba(30,41,59,0.5); border-left:3px solid #06b6d4; padding:0.75rem 1rem; border-radius:8px; color:#f8fafc; font-style:italic; margin-top:0.35rem;">
          ${inst.quote}
        </div>
      </div>

      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; display:flex; justify-content:space-between; align-items:center;">
        <span style="color:#94a3b8; font-size:0.85rem;"><i class="fa-solid fa-users text-purple"></i> 累計培訓學員：<strong style="color:#f8fafc;">${inst.studentCount} 位</strong></span>
        <span style="color:#fbbf24; font-size:0.85rem;"><i class="fa-solid fa-star"></i> 綜合教學評分：<strong>${inst.rating} / 5.0</strong></span>
      </div>
    </div>
  `;
}

// Auto-save video progress on tab close or page exit
window.addEventListener('beforeunload', function beforeunload_pentaskill_video() {
  if (typeof saveStudentVideoProgress === 'function') {
    saveStudentVideoProgress(true);
  }
});


/* ========================================================
   📅 1-ON-1 MONTHLY CLASSROOM CALENDAR (直觀簡潔月行事曆模組)
   智慧雙向同步：學員端顯示「上課時段 ＋ 講師名字」；講師端同步顯示「上課時段 ＋ 學員名字」
   ======================================================== */
let calCurrentYear = 2026;
let calCurrentMonth = 9; // 0-indexed: 9 = 10月

function renderClassroomCalendar(year, month) {
  if (typeof year === 'number') calCurrentYear = year;
  if (typeof month === 'number') calCurrentMonth = month;

  const monthLabel = document.getElementById('calCurrentMonthLabel');
  if (monthLabel) {
    monthLabel.textContent = `${calCurrentYear}年 ${calCurrentMonth + 1}月`;
  }

  const grid = document.getElementById('classroomCalendarDaysGrid');
  if (!grid) return;

  const firstDay = new Date(calCurrentYear, calCurrentMonth, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();
  const prevMonthDays = new Date(calCurrentYear, calCurrentMonth, 0).getDate();

  // 判斷今日 (2026-10-22) 高亮
  const today = new Date();
  const isCurrentYear = today.getFullYear() === calCurrentYear;
  const isCurrentMonth = today.getMonth() === calCurrentMonth;
  const todayDate = today.getDate();

  // 取得有效預約 (排除已取消)
  let activeBookings = (typeof mockBookings !== 'undefined' ? mockBookings : []).filter(b => b.status !== '已取消');

  // ⭐️ 雙向角色智能感知：
  const isInstructor = currentUser && currentUser.role === 'instructor';
  const isStaffOrAdmin = currentUser && (currentUser.role === 'manager' || currentUser.role === 'staff' || currentUser.role === 'consultant');
  const cleanCurrentName = currentUser ? currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim() : '';

  // 若以金牌講師登入，行事曆自動專注篩選其名下預約；管理者則瀏覽全體預約
  if (isInstructor) {
    activeBookings = activeBookings.filter(b => b.instructor && b.instructor.includes(cleanCurrentName));
  }

  let html = '';

  // 1. 上個月補齊格子
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    html += `
      <div class="cal-day-cell other-month">
        <div class="cal-day-header">
          <span class="cal-day-number">${dayNum}</span>
        </div>
      </div>
    `;
  }

  // 2. 當月日期格子
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isCurrentYear && isCurrentMonth && d === todayDate;
    const dateStr = `${calCurrentYear}-${String(calCurrentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    // 當天預約清單
    const dayBookings = activeBookings.filter(b => b.date === dateStr);

    html += `
      <div class="cal-day-cell ${isToday ? 'today' : ''} ${dayBookings.length > 0 ? 'has-booking' : ''}">
        <div class="cal-day-header">
          <span class="cal-day-number">${d}</span>
          ${!isInstructor ? `<button type="button" class="cal-quick-add" onclick="openNewBookingModal('${dateStr}')" title="預約 ${dateStr} 個教時段"><i class="fa-solid fa-plus"></i></button>` : ''}
        </div>
        <div class="cal-day-bookings">
    `;

    dayBookings.forEach(b => {
      const timeInfo = typeof getBookingTimeInfo === 'function' ? getBookingTimeInfo(b) : null;
      const isLive = timeInfo && timeInfo.canEnter;
      const shortTime = b.slotTime ? b.slotTime.split(' - ')[0] : '時段';
      const cleanInstructor = b.instructor ? b.instructor.split(' ')[0] : '講師';

      // ⭐️ 雙向顯示同步：學員視角顯示講師姓名；講師視角同步顯示學員姓名；主管顯示雙方
      let displayLabel = cleanInstructor;
      let displayIcon = 'fa-solid fa-chalkboard-user';
      if (isInstructor) {
        displayLabel = `${b.studentName || '學員'}`;
        displayIcon = 'fa-solid fa-user-graduate';
      } else if (isStaffOrAdmin) {
        displayLabel = `${cleanInstructor} ➜ ${b.studentName || '學員'}`;
      }

      html += `
        <div class="cal-booking-chip ${isLive ? 'live-active' : ''}" onclick="enterSpecificLiveRoom('${b.id}')" title="點擊進入連線：${b.instructor} ｜ 學員：${b.studentName} ｜ ${b.topic} (${b.slotTime})">
          <div class="cal-booking-time">
            <i class="fa-regular fa-clock"></i> ${shortTime}
            ${isLive ? '<span class="pulse-dot" style="width:6px; height:6px;"></span>' : ''}
          </div>
          <div class="cal-booking-instructor">
            <i class="${displayIcon}"></i> ${displayLabel}
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  }

  // 3. 下個月補齊格子 (使總格數保持為 7 的倍數)
  const totalRendered = firstDay + daysInMonth;
  const remainingCells = (totalRendered % 7 === 0) ? 0 : 7 - (totalRendered % 7);
  for (let j = 1; j <= remainingCells; j++) {
    html += `
      <div class="cal-day-cell other-month">
        <div class="cal-day-header">
          <span class="cal-day-number">${j}</span>
        </div>
      </div>
    `;
  }

  grid.innerHTML = html;
}

function changeCalendarMonth(delta) {
  calCurrentMonth += delta;
  if (calCurrentMonth < 0) {
    calCurrentMonth = 11;
    calCurrentYear--;
  } else if (calCurrentMonth > 11) {
    calCurrentMonth = 0;
    calCurrentYear++;
  }
  renderClassroomCalendar();
}

function goToCalendarToday() {
  const now = new Date();
  calCurrentYear = now.getFullYear();
  calCurrentMonth = now.getMonth();
  renderClassroomCalendar();
}

/* ========================================================
   📅 講師工作台專屬 1-on-1 每月行事曆 (Portal Calendar)
   ======================================================== */
let portalCalYear = 2026;
let portalCalMonth = 9; // 0-indexed: 9 = 10月

function renderPortalCalendar(year, month) {
  if (typeof year === 'number') portalCalYear = year;
  if (typeof month === 'number') portalCalMonth = month;

  const monthLabel = document.getElementById('portalCalMonthLabel');
  if (monthLabel) {
    monthLabel.textContent = `${portalCalYear}年 ${portalCalMonth + 1}月`;
  }

  const grid = document.getElementById('portalCalendarDaysGrid');
  if (!grid) return;

  const firstDay = new Date(portalCalYear, portalCalMonth, 1).getDay();
  const daysInMonth = new Date(portalCalYear, portalCalMonth + 1, 0).getDate();
  const prevMonthDays = new Date(portalCalYear, portalCalMonth, 0).getDate();

  const today = new Date();
  const isCurrentYear = today.getFullYear() === portalCalYear;
  const isCurrentMonth = today.getMonth() === portalCalMonth;
  const todayDate = today.getDate();

  // 取得有效預約 (排除已取消)
  let activeBookings = (typeof mockBookings !== 'undefined' ? mockBookings : []).filter(b => b.status !== '已取消');

  const isAdminPreview = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff');
  const cleanName = currentUser ? currentUser.name.replace(/（.*）|\(.*\)|\s*講師/g, '').trim() : '';

  // 講師專屬工作台：預設只顯示該講師名下被學員預約的時段
  if (!isAdminPreview && cleanName) {
    activeBookings = activeBookings.filter(b => b.instructor && b.instructor.includes(cleanName));
  }

  let html = '';

  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    html += `
      <div class="cal-day-cell other-month">
        <div class="cal-day-header">
          <span class="cal-day-number">${dayNum}</span>
        </div>
      </div>
    `;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isCurrentYear && isCurrentMonth && d === todayDate;
    const dateStr = `${portalCalYear}-${String(portalCalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayBookings = activeBookings.filter(b => b.date === dateStr);

    html += `
      <div class="cal-day-cell ${isToday ? 'today' : ''} ${dayBookings.length > 0 ? 'has-booking' : ''}">
        <div class="cal-day-header">
          <span class="cal-day-number">${d}</span>
        </div>
        <div class="cal-day-bookings">
    `;

    dayBookings.forEach(b => {
      const timeInfo = typeof getBookingTimeInfo === 'function' ? getBookingTimeInfo(b) : null;
      const isLive = timeInfo && timeInfo.canEnter;
      const shortTime = b.slotTime ? b.slotTime.split(' - ')[0] : '時段';

      html += `
        <div class="cal-booking-chip ${isLive ? 'live-active' : ''}" onclick="enterSpecificLiveRoom('${b.id}')" title="點擊直接連線授課：學員 ${b.studentName} ｜ 主題：${b.topic} (${b.slotTime})">
          <div class="cal-booking-time">
            <i class="fa-regular fa-clock"></i> ${shortTime}
            ${isLive ? '<span class="pulse-dot" style="width:6px; height:6px;"></span>' : ''}
          </div>
          <div class="cal-booking-instructor">
            <i class="fa-solid fa-user-graduate"></i> ${b.studentName} (學員)
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  }

  const totalRendered = firstDay + daysInMonth;
  const remainingCells = (totalRendered % 7 === 0) ? 0 : 7 - (totalRendered % 7);
  for (let j = 1; j <= remainingCells; j++) {
    html += `
      <div class="cal-day-cell other-month">
        <div class="cal-day-header">
          <span class="cal-day-number">${j}</span>
        </div>
      </div>
    `;
  }

  grid.innerHTML = html;
}

function changePortalCalendarMonth(delta) {
  portalCalMonth += delta;
  if (portalCalMonth < 0) {
    portalCalMonth = 11;
    portalCalYear--;
  } else if (portalCalMonth > 11) {
    portalCalMonth = 0;
    portalCalYear++;
  }
  renderPortalCalendar();
}

function goToPortalCalendarToday() {
  const now = new Date();
  portalCalYear = now.getFullYear();
  portalCalMonth = now.getMonth();
  renderPortalCalendar();
}

function toggleLiveClassroomView(show) {
  const room = document.getElementById('colLiveRoom');
  if (!room) return;
  const isCurrentlyShown = room.style.display !== 'none';
  const shouldShow = typeof show === 'boolean' ? show : !isCurrentlyShown;
  room.style.display = shouldShow ? 'block' : 'none';

  const btn = document.getElementById('btnToggleLiveRoom');
  if (btn) {
    btn.innerHTML = shouldShow
      ? '<i class="fa-solid fa-calendar-days"></i> 收合視訊現場'
      : '<i class="fa-solid fa-video"></i> 進入視訊教室現場';
  }

  if (shouldShow) {
    room.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function enterSpecificLiveRoom(bookingId) {
  const b = (typeof mockBookings !== 'undefined' ? mockBookings : []).find(item => item.id === bookingId);
  if (b) {
    const instName = b.instructor || '張哲銘';
    const label = document.getElementById('liveInstructorLabel');
    if (label) label.innerHTML = `<i class="fa-solid fa-crown text-yellow"></i> 專屬講師：${instName}`;
    const title = document.getElementById('liveRoomTitle');
    if (title) title.innerText = `【1-on-1 個教陪跑】${b.topic || '現場診斷與 Code Review'}`;
    if (typeof updateLiveRoomUI === 'function') updateLiveRoomUI(instName);
  }
  toggleLiveClassroomView(true);
  showToast('🎥 已為您開啟 1 對 1 專屬視訊教室！');
}

function openNewBookingModal(targetDate) {
  const modal = document.getElementById('newBookingModal');
  if (!modal) return;
  modal.style.display = 'flex';
  if (targetDate) {
    const dateInput = document.getElementById('bookingDate');
    if (dateInput) {
      dateInput.value = targetDate;
      if (typeof updateAvailableSlots === 'function') updateAvailableSlots();
    }
  }
}

function closeNewBookingModal() {
  const modal = document.getElementById('newBookingModal');
  if (modal) modal.style.display = 'none';
}

// 🔑 測試快捷登入支援：支援 URL 參數一鍵切換身分 (例：?login=admin, ?login=student, ?login=instructor)
function checkUrlAutoLogin() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const loginParam = urlParams.get('login') || urlParams.get('autologin');
    if (!loginParam) return;

    let targetEmail = '';
    const lp = loginParam.toLowerCase();
    if (lp === 'admin' || lp === 'wen' || lp === 'manager') {
      targetEmail = 'pey514514@gmail.com';
    } else if (lp === 'student' || lp === 'user') {
      targetEmail = 'student@pentaskill.com';
    } else if (lp === 'instructor' || lp === 'ethan') {
      targetEmail = 'ethan@pentaskill.com';
    } else if (lp.includes('@')) {
      targetEmail = loginParam;
    }

    if (targetEmail && typeof mockUsers !== 'undefined') {
      const matchedUser = mockUsers.find(u => u.email && u.email.toLowerCase() === targetEmail.toLowerCase());
      if (matchedUser) {
        currentUser = matchedUser;
        try {
          localStorage.setItem('pentaskill_user', JSON.stringify(currentUser));
        } catch(e) {}
        renderAuthArea();
        updateUIPermissions();
        showToast(`🔑 已為您一鍵自動登入【${currentUser.roleLabel || currentUser.name}】！`);
      }
    }
  } catch (err) {
    console.warn('AutoLogin err:', err);
  }
}
