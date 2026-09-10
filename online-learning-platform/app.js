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
      platform_expenses: mockPlatformExpenses
    };

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
    const [cloudUsers, cloudQuotes, cloudLeads, cloudBookings, cloudSalaries, cloudStaff, cloudExpenses, cloudCourses] = await Promise.all([
      fetchCloudData('users'),
      fetchCloudData('custom_quotes'),
      fetchCloudData('leads'),
      fetchCloudData('bookings'),
      fetchCloudData('mentor_salaries'),
      fetchCloudData('staff_salaries'),
      fetchCloudData('platform_expenses'),
      fetchCloudData('courses')
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
      renderCourseAdminTable();
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
  renderInstructors();
  renderPortfolios();
  renderStudentBookings();
  renderChapters();
  
  // 預約日期初始化 (今日起，不能選過去日期)
  const todayStr = getLocalDateString();
  const dateInput = document.getElementById('bookingDate');
  if (dateInput) {
    dateInput.min = todayStr;
    if (!dateInput.value || dateInput.value < todayStr) {
      dateInput.value = todayStr;
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
  checkUrlReferralParam(); // 🎁 檢查好友推薦邀請碼/推薦人 URL 參數自動帶入
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
            <i class="fa-solid fa-gem text-yellow"></i> 會員專區 (點數與課程)
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

          ${(currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff' || currentUser.role === 'instructor') ? `
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

  // 顯示寄送目標與模擬驗證碼
  const sentDisplay = document.getElementById('forgotSentEmailDisplay');
  if (sentDisplay) sentDisplay.innerText = matched.email;

  const simCode = document.getElementById('simulatedCodeText');
  if (simCode) simCode.innerText = verificationCode;

  // ⚡ 自動觸發雲端 Webhook 發送真實 Email 驗證信
  sendResetEmailViaWebhook(matched.email, verificationCode, matched.name);

  // 切換至步驟 2
  const step1 = document.getElementById('forgotStep1');
  const step2 = document.getElementById('forgotStep2');
  if (step1) step1.style.display = 'none';
  if (step2) step2.style.display = 'block';

  showToast(`📧 6 位數安全驗證碼已自動發送至【${matched.email}】！請查收信件！`);
}

function resendResetCode() {
  if (!currentResetSession.email) {
    showToast('⚠️ 請先輸入電子郵件發送驗證碼');
    return;
  }
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  currentResetSession.code = verificationCode;
  currentResetSession.expiresAt = Date.now() + 10 * 60 * 1000;

  const simCode = document.getElementById('simulatedCodeText');
  if (simCode) simCode.innerText = verificationCode;

  const matched = mockUsers.find(u => u.email && u.email.toLowerCase() === currentResetSession.email.toLowerCase());
  sendResetEmailViaWebhook(currentResetSession.email, verificationCode, matched ? matched.name : '學員');

  showToast(`📧 新的 6 位數驗證碼已重新寄送至【${currentResetSession.email}】！`);
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

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
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
      showToast(`🎉 歡迎回來，${currentUser.name}！已成功驗證帳密並登入學員專區`);
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
  try {
    localStorage.setItem('pentaskill_leads', JSON.stringify(mockLeads));
  } catch (err) {}

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

  // 2. Admin Dropdown Link
  const adminDropdown = document.getElementById('navAdminDropdown');
  if (adminDropdown) {
    adminDropdown.style.display = isInstructorOrAbove ? 'block' : 'none';
  }
  const adminLink = document.getElementById('navAdminLink');
  if (adminLink) {
    adminLink.style.display = isInstructorOrAbove ? 'flex' : 'none';
  }

  document.querySelectorAll('.staff-manager-btn').forEach(btn => {
    btn.style.display = isInstructorOrAbove ? 'inline-flex' : 'none';
  });

  document.querySelectorAll('.manager-only-tab').forEach(tab => {
    tab.style.display = isManagerOrConsultant ? 'inline-block' : 'none';
  });
  
  if (role === 'staff' && activeAdminTab === 'users') {
    switchAdminTab('courses');
  }

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
      adminBadge.className = 'badge-tag badge-student';
      adminBadge.innerText = `🎓 ${currentUser.name} (學員)`;
    } else {
      adminBadge.className = 'badge-tag';
      adminBadge.innerText = '訪客模式 (未登入)';
    }
  }

  // 6. Update Member Center Link
  const navMemberLink = document.getElementById('navMemberCenterLink');
  if (navMemberLink) {
    navMemberLink.style.display = currentUser ? 'inline-flex' : 'none';
  }

  if (currentView === 'admin-dashboard') {
    renderAdminTables();
  }
  if (currentView === 'member-center') {
    renderMemberCenterView();
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

  if (viewId === 'business-plan' && !isManagerOrConsultant) {
    showToast('⚠️ 權限不足：【創業完整規劃書】僅供 👑 平台主管與 💼 顧問 查閱');
    return;
  }
  if (viewId === 'admin-dashboard' && !isInstructorOrAbove) {
    showToast('⚠️ 權限不足：【後台管理中心】僅供 👑 主管、💼 顧問 與 🧑‍💼 員工/講師 存取');
    return;
  }
  if (viewId === 'member-center' && !currentUser) {
    showToast('💡 請先登入學員帳號以查看會員專區與精幣餘額！');
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

  if (viewId === 'admin-dashboard') {
    renderAdminTables();
  }
  if (viewId === 'member-center') {
    renderMemberCenterView();
  }
  if (viewId === 'video-player') {
    loadCloudflareStreamLesson(currentActiveLessonId);
  }
  if (viewId === 'live-classroom') {
    const dateInput = document.getElementById('bookingDate');
    if (dateInput) {
      const todayStr = getLocalDateString();
      dateInput.min = todayStr;
      if (!dateInput.value || dateInput.value < todayStr) {
        dateInput.value = todayStr;
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
      nameEl.innerText = `${currentUser.name} 您好`;
    }
  }
  if (roleEl) roleEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${currentUser.roleLabel || '精五門認證學員'}`;
  if (emailEl) {
    emailEl.innerHTML = `<i class="fa-solid fa-envelope"></i> ${currentUser.email} &nbsp;|&nbsp; <i class="fa-solid fa-cake-candles text-pink"></i> 生日：<span id="memberCenterBirthday">${birthday}</span>`;
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
    const purchased = currentUser.purchasedCourses || ['course-1'];
    const courses = (typeof mockCourses !== 'undefined' ? mockCourses : []).filter(c => purchased.includes(c.id));
    if (courses.length === 0 && typeof mockCourses !== 'undefined' && mockCourses.length > 0) {
      courses.push(mockCourses[0]);
    }
    enrolledGrid.innerHTML = courses.map(course => `
      <div class="course-card" style="border: 1px solid rgba(255,255,255,0.08);">
        <div class="course-thumb">
          <img src="${course.coverImage}" alt="${course.title}">
          <span class="course-tag">${course.categoryLabel}</span>
          <span class="course-badge" style="background: var(--accent-green);">已開通權限</span>
        </div>
        <div class="course-body">
          <h4 class="course-title">${course.title}</h4>
          <div class="instructor-info">
            <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80" alt="${course.instructor}">
            <div>
              <span class="inst-name">${course.instructor}</span>
              <span class="inst-title">金牌講師</span>
            </div>
          </div>
          <div style="margin-top:0.75rem; display:flex; gap:0.5rem;">
            <button class="btn btn-primary btn-sm btn-block" onclick="switchView('video-player')">
              <i class="fa-solid fa-circle-play"></i> 立即上課
            </button>
            <button class="btn btn-outline btn-sm" onclick="switchView('live-classroom')">
              <i class="fa-solid fa-calendar-check"></i> 預約個教
            </button>
          </div>
        </div>
      </div>
    `).join('');
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

        <div class="course-actions">
          <button class="btn btn-line btn-block" onclick="openConsultLineModal('${course.id}', 'combo')">
            <i class="fa-brands fa-line"></i> 洽小編諮詢專屬方案 (加 Line / 網頁留訊)
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
  if (tabKey === 'users' && !isManagerOrConsultant) {
    showToast('⚠️ 帳號密碼與權限管理僅供 👑 平台主管與 💼 顧問 操作');
    return;
  }
  if (tabKey === 'finance' && !isManagerOrConsultant) {
    showToast('⚠️ 營運統計與薪資結算僅供 👑 平台主管與 💼 顧問 操作');
    return;
  }

  activeAdminTab = tabKey;
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-atab') === tabKey);
  });

  document.querySelectorAll('.admin-content-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `atab-${tabKey}`);
  });

  renderAdminTables();
}

function renderAdminTables() {
  renderUserTable();
  renderCourseAdminTable();
  renderInstructorAdminTable();
  renderChapterAdminList();
  renderBookingAdminTable();
  renderMentorSalaryTable();
  renderStaffSalaryTable();
  renderPlatformExpensesTable();
  renderFinanceDashboardKPIs();
  renderLeadAdminTable();
  renderCustomQuotesAdminTable();
  renderGoogleSheetAdminSection();
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

  const isManagerOrConsultant = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant');

  tbody.innerHTML = mockCourses.map(c => `
    <tr>
      <td data-label="課程名稱"><strong>${c.title}</strong></td>
      <td data-label="分類標籤"><span class="badge-tag">${c.categoryLabel}</span></td>
      <td data-label="主講業師">${c.instructor}</td>
      <td data-label="純錄播價格"><strong class="text-cyan">NT$ ${(c.priceRecordOnly || 0).toLocaleString()}</strong></td>
      <td data-label="含1對1個教"><span class="text-pink">NT$ ${(c.priceWith1on1 || 0).toLocaleString()}</span> <small class="text-muted" style="display:block; font-size:0.72rem;">(前台顯示 ????)</small></td>
      <td data-label="上架狀態"><span class="badge badge-success">已上架</span></td>
      <td data-label="操作管理">
        <button class="btn btn-sm btn-outline" onclick="openEditCourseModal('${c.id}')"><i class="fa-solid fa-pen"></i> 編輯價格/內容</button>
        ${isManagerOrConsultant ? `<button class="btn btn-sm btn-danger" onclick="deleteCourse('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
      </td>
    </tr>
  `).join('');
}

// Instructor Admin Table
function renderInstructorAdminTable() {
  const tbody = document.getElementById('instructorTableBody');
  if (!tbody) return;

  tbody.innerHTML = mockInstructors.map(inst => `
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
        <button class="btn btn-sm btn-outline" onclick="openInstructorModal('${inst.id}')"><i class="fa-solid fa-eye"></i> 預覽</button>
        <button class="btn btn-sm btn-primary staff-manager-btn" onclick="openEditInstructorModal('${inst.id}')"><i class="fa-solid fa-pen"></i> 編輯資料與照片</button>
      </td>
    </tr>
  `).join('');
}

// Chapter Admin List
function renderChapterAdminList() {
  const container = document.getElementById('chapterAdminList');
  if (!container) return;

  container.innerHTML = mockChapters.map(chap => `
    <div class="file-item margin-top-xs" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: var(--radius-md);">
      <div>
        <h4><i class="fa-solid fa-folder text-purple"></i> ${chap.title} (${chap.duration})</h4>
        <div class="margin-top-xs">
          ${chap.lessons.map(l => `
            <div class="text-sm text-muted" style="margin-left:1.5rem; margin-top:0.2rem;">
              <i class="fa-solid fa-play-circle text-cyan"></i> ${l.title}
            </div>
          `).join('')}
        </div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline" onclick="openAddChapterModal()"><i class="fa-solid fa-plus"></i> 新增單元</button>
      </div>
    </div>
  `).join('');
}

// 複製課前 1 天親切上課提醒文案 (簡約、親切、無改期負擔)
function copyClassReminderMsg(bookingId) {
  const b = mockBookings.find(item => item.id === bookingId);
  if (!b) return;

  const msg = `🔔【精五門 PentaSkill 課前提醒】\n\n學員 ${b.studentName} 您好：\n您預約於明日 (${b.date} ${b.slotTime}) 與【${b.instructor} 講師】進行 1 對 1 個教（主題：${b.topic}）。\n\n👉 請於課前 10 分鐘登入精五門網站，點擊「進入教室」準備上課囉！\n🔗 教室直通網址：https://online-class.pey514514.workers.dev/#live-classroom\n\n✨ 期待明天與您線上見，預祝您上課收穫滿滿！請於明日準時上課哦！`;

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

  const msg = `📅【精五門 PentaSkill 個教行程與改期最後確認】\n\n學員 ${b.studentName} 您好：\n您預約於 3 天後 (${b.date} ${b.slotTime}) 與【${b.instructor} 講師】進行 1 對 1 個教（主題：${b.topic}）。\n\n⚠️ 貼心提醒：若您臨時有事需調整時間，最晚請於明天（上課前 2 天 / 48 小時前）於系統線上改期或通知 LINE@ 小編喔！逾期或當天臨時取消將視為放棄該堂課。\n\n🔗 預約管理中心：https://online-class.pey514514.workers.dev/#live-classroom\n感謝您的配合，預祝學習愉快！`;

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

// 頭像與照片上傳處理器 (支援本機選擇檔案並轉為 Base64 DataURL 即時預覽)
function handleUserAvatarUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const dataUrl = evt.target.result;
    const preview = document.getElementById('userAvatarPreview');
    const input = document.getElementById('inputUserAvatar');
    if (preview) preview.src = dataUrl;
    if (input) input.value = dataUrl;
    showToast('📷 成員頭像照片載入成功！');
  };
  reader.readAsDataURL(file);
}

function handleInstAvatarUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const dataUrl = evt.target.result;
    const preview = document.getElementById('instAvatarPreview');
    const input = document.getElementById('inputInstAvatar');
    if (preview) preview.src = dataUrl;
    if (input) input.value = dataUrl;
    showToast('📷 講師照片載入成功！');
  };
  reader.readAsDataURL(file);
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
  document.getElementById('editCourseId').value = '';
  document.getElementById('inputCourseTitle').value = '';
  document.getElementById('inputCourseInstructor').value = '';
  document.getElementById('inputPriceRecord').value = '3600';
  document.getElementById('inputPriceCombo').value = '12800';
  document.getElementById('inputCourseDesc').value = '';
  document.getElementById('addCourseModal').classList.add('active');
}

function openEditCourseModal(courseId) {
  const c = mockCourses.find(course => course.id === courseId);
  if (!c) return;

  document.getElementById('editCourseId').value = c.id;
  document.getElementById('inputCourseTitle').value = c.title;
  document.getElementById('inputCourseCategory').value = c.category;
  document.getElementById('inputCourseInstructor').value = c.instructor;
  document.getElementById('inputPriceRecord').value = c.priceRecordOnly;
  document.getElementById('inputPriceCombo').value = c.priceWith1on1;
  document.getElementById('inputCourseDesc').value = c.description;
  document.getElementById('addCourseModal').classList.add('active');
}

function closeAddCourseModal() {
  document.getElementById('addCourseModal').classList.remove('active');
}

function handleSaveCourse(e) {
  e.preventDefault();
  const id = document.getElementById('editCourseId').value;
  const title = document.getElementById('inputCourseTitle').value;
  const category = document.getElementById('inputCourseCategory').value;
  const instructor = document.getElementById('inputCourseInstructor').value;
  const priceRecordOnly = parseInt(document.getElementById('inputPriceRecord').value) || 3600;
  const priceWith1on1 = parseInt(document.getElementById('inputPriceCombo').value) || 12800;
  const description = document.getElementById('inputCourseDesc').value;

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
      badge: '✨ 最新上架'
    };
    mockCourses.push(newCourse);
    showToast(`🎉 成功上架新課程：${title}`);
  }

  saveCoursesToStorage(true);
  closeAddCourseModal();
  renderCourseGrid('all');
  renderCourseAdminTable();
}

function deleteCourse(courseId) {
  if (confirm('確定要下架刪除此課程嗎？')) {
    const idx = mockCourses.findIndex(c => c.id === courseId);
    if (idx !== -1) {
      mockCourses.splice(idx, 1);
      saveCoursesToStorage(true);
      renderCourseGrid('all');
      renderCourseAdminTable();
      showToast('課程已下架');
    }
  }
}

// Chapter Modals
function openAddChapterModal() {
  document.getElementById('inputChapterTitle').value = '';
  document.getElementById('inputLessonTitle').value = '';
  document.getElementById('addChapterModal').classList.add('active');
}

function closeAddChapterModal() {
  document.getElementById('addChapterModal').classList.remove('active');
}

function handleSaveChapter(e) {
  e.preventDefault();
  const cTitle = document.getElementById('inputChapterTitle').value;
  const lTitle = document.getElementById('inputLessonTitle').value;

  mockChapters.push({
    id: mockChapters.length + 1,
    title: cTitle,
    duration: "40 分鐘",
    lessons: [{ id: `${mockChapters.length + 1}-1`, title: lTitle, completed: false }]
  });

  closeAddChapterModal();
  renderChapters();
  renderChapterAdminList();
  showToast(`🎬 成功新增章節與影片單元：${lTitle}`);
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

// Material Upload Handlers
function openUploadMaterialModal() {
  document.getElementById('uploadMaterialModal').classList.add('active');
}

function closeUploadMaterialModal() {
  document.getElementById('uploadMaterialModal').classList.remove('active');
}

function handleSaveMaterial(e) {
  e.preventDefault();
  const title = document.getElementById('inputMaterialTitle').value;
  const course = document.getElementById('inputMaterialCourse').value;
  const url = document.getElementById('inputMaterialUrl').value;

  mockMaterials.push({
    id: `mat-${Date.now().toString().slice(-4)}`,
    title: title,
    instructor: currentUser ? currentUser.name : "張哲銘 (Ethan)",
    course: course,
    url: url
  });

  showToast(`📄 講義與隨課教材上架成功：${title}`);
  closeUploadMaterialModal();
}

// Video Player Playback Simulator & Cloudflare Stream DRM Engine
let isVideoPlaying = false;
let videoProgressPercent = 38; // Initial demo timestamp (38% ~ 14:26)
let videoTimer = null;
const videoTotalDurationSeconds = 2280; // 38 minutes

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
    showToast('📺 已切換為 4K 高畫質視訊播放器');
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
function loadCloudflareStreamLesson(lessonId) {
  currentActiveLessonId = lessonId;
  
  let targetLesson = null;
  let targetChapTitle = '';

  for (const chap of mockChapters) {
    const found = chap.lessons.find(l => l.id === lessonId);
    if (found) {
      targetLesson = found;
      targetChapTitle = chap.title;
      break;
    }
  }

  if (!targetLesson) return;

  // Update Active State in mockChapters
  mockChapters.forEach(chap => {
    chap.lessons.forEach(l => {
      l.active = (l.id === lessonId);
    });
  });

  renderChapters();

  const currentTitleElem = document.getElementById('currentChapterTitle');
  if (currentTitleElem) currentTitleElem.innerText = targetLesson.title;

  const overlay = document.getElementById('videoTrialOverlay');

  // Check student entitlement: Manager, Consultant, Staff, Instructor OR Student with purchased course OR trial allowed
  const isUserVIP = currentUser && (currentUser.role === 'manager' || currentUser.role === 'consultant' || currentUser.role === 'staff' || currentUser.role === 'instructor');
  const isPaidStudent = currentUser && currentUser.purchasedCourses && currentUser.purchasedCourses.includes('course-1');
  const isUnlocked = isUserVIP || isPaidStudent;

  if (isUnlocked || targetLesson.isTrialAllowed) {
    if (overlay) overlay.style.display = 'none';

    // Generate Cloudflare Stream Signed Token
    const signedToken = cloudflareStreamConfig.requireSignedTokens 
      ? generateCloudflareSignedToken(targetLesson.streamId, currentUser)
      : targetLesson.streamId;

    const iframe = document.getElementById('cfStreamIframe');
    if (iframe) {
      const posterUrl = encodeURIComponent("https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80");
      iframe.src = `https://${cloudflareStreamConfig.customerSubdomain}/${signedToken}/iframe?poster=${posterUrl}&autoplay=false&preload=true&primaryColor=%238b5cf6`;
    }

    if (isUnlocked) {
      showToast(`▶️ 已解鎖觀看單元：${targetLesson.title}`);
    } else {
      showToast(`▶️ 正在觀看免費試看單元：${targetLesson.title}`);
    }
  } else {
    // Unpaid student clicked locked chapter
    if (overlay) overlay.style.display = 'flex';
    triggerTrialEndModal();
    showToast(`🔒 本單元為付費限定！請完成報名解鎖觀看。`);
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
}

function updateVideoUI() {
  const filledBar = document.getElementById('progressFilled');
  const timeDisplay = document.getElementById('videoTimeDisplay');
  
  if (filledBar) filledBar.style.width = `${videoProgressPercent}%`;
  
  const currentSeconds = Math.round((videoProgressPercent / 100) * videoTotalDurationSeconds);
  const currentMin = Math.floor(currentSeconds / 60);
  const currentSec = currentSeconds % 60;
  const formattedTime = `${currentMin.toString().padStart(2, '0')}:${currentSec.toString().padStart(2, '0')} / 38:00`;
  
  if (timeDisplay) timeDisplay.innerText = formattedTime;
}

function seekVideo(deltaSeconds) {
  const deltaPercent = (deltaSeconds / videoTotalDurationSeconds) * 100;
  videoProgressPercent = Math.max(0, Math.min(100, videoProgressPercent + deltaPercent));
  updateVideoUI();
  if (videoProgressPercent >= 100) {
    pauseVideo();
    triggerTrialEndModal();
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

  container.innerHTML = mockChapters.map(chap => `
    <div class="chapter-group">
      <div class="chapter-title-bar">${chap.title} (${chap.duration})</div>
      <div class="lessons-list">
        ${chap.lessons.map(l => `
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
    designContent: "Premiere / AE 4K 短影音剪輯與文案批修區 (Hannah 講師即時連線中)"
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

  for (let i = 0; i < 14; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dateStr = getLocalDateString(d);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const w = weekdayNames[d.getDay()];

    let label = `${m}/${day} (${w})`;
    if (i === 0) label = `今日 ${m}/${day}`;
    else if (i === 1) label = `明日 ${m}/${day}`;
    else if (i === 2) label = `後天 ${m}/${day}`;

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

  const todayStr = getLocalDateString();
  dateInput.min = todayStr;
  if (!dateInput.value || dateInput.value < todayStr) {
    dateInput.value = todayStr;
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

  // 1. 二次安全性與付費權限驗證 (避免未付費強碰或爭議)
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
  
  const siteUrl = `https://online-class.pey514514.workers.dev/?ref=${encodeURIComponent(senderTag)}#consult`;

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
  try {
    localStorage.setItem('pentaskill_leads', JSON.stringify(mockLeads));
  } catch (err) {}

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
  Logger.log("雙工作表已成功初始化完成！");
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

    if (data.type === "reset_code") {
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
    } else {
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
          "https://online-class.pey514514.workers.dev/#admin-dashboard\\n\\n" +
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

  try {
    localStorage.setItem('pentaskill_leads', JSON.stringify(mockLeads));
  } catch (err) {}

  showToast(`已更新 ${lead.name} 的跟進狀態為【${lead.status}】`);
  renderLeadAdminTable();
}

function deleteLead(leadId) {
  mockLeads = mockLeads.filter(l => l.id !== leadId);
  try {
    localStorage.setItem('pentaskill_leads', JSON.stringify(mockLeads));
  } catch (err) {}

  showToast('已刪除諮詢表單紀錄');
  renderLeadAdminTable();
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
  const displayTitle = customQuote ? customQuote.courseTitle : course.title;
  const displayPrice = customQuote ? customQuote.customPrice : (isCombo ? course.priceWith1on1 : course.priceRecordOnly);
  const createdBy = customQuote ? customQuote.createdBy : '專屬小編';
  const quoteDetails = customQuote ? customQuote.details : (isCombo ? '🔥 錄播全套 + 4次教學多年業師 1-on-1 個教陪跑' : '📹 純錄播自主學習全套講義');

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
        <label style="display: flex; align-items: flex-start; gap: 0.65rem; cursor: pointer; margin: 0; font-size: 0.82rem; line-height: 1.45; color: #f1f5f9;">
          <input type="checkbox" id="agreeTermsCheckbox" required onchange="onAgreeTermsChange(this.checked, 'termsAgreementBox')" style="margin-top: 3px; accent-color: var(--accent-purple); width: 16px; height: 16px; cursor: pointer;">
          <span>
            我已完整閱讀並同意
            <a href="javascript:void(0)" onclick="openTermsModal(event)" style="color: var(--accent-purple); font-weight: 700; text-decoration: underline;">
              📜【精五門學員購課服務條款與退費政策】
            </a>
            （含錄播課法定排除 7 日猶豫期、1 對 1 個教 48 小時前請假改期與退費標準）<span class="text-pink">*</span>
          </span>
        </label>
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

  try {
    localStorage.setItem('pentaskill_custom_quotes', JSON.stringify(mockCustomQuotes));
  } catch(err) {}
  saveCloudData('custom_quotes', mockCustomQuotes);

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
    base = 'https://online-class.pey514514.workers.dev/';
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
🌐 https://online-class.pey514514.workers.dev/

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
        <label style="display: flex; align-items: flex-start; gap: 0.65rem; cursor: pointer; margin: 0; font-size: 0.82rem; line-height: 1.45; color: #f1f5f9;">
          <input type="checkbox" id="agreeTermsDirectCheckbox" required onchange="onAgreeTermsChange(this.checked, 'termsAgreementDirectBox')" style="margin-top: 3px; accent-color: var(--accent-purple); width: 16px; height: 16px; cursor: pointer;">
          <span>
            我已完整閱讀並同意
            <a href="javascript:void(0)" onclick="openTermsModal(event)" style="color: var(--accent-purple); font-weight: 700; text-decoration: underline;">
              📜【精五門學員購課服務條款與退費政策】
            </a>
            （含錄播課法定排除 7 日猶豫期、1 對 1 個教 48 小時前請假改期與退費標準）<span class="text-pink">*</span>
          </span>
        </label>
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

  cart.push({ title, price: finalPrice });
  const cartCountEl = document.getElementById('cartCount');
  if (cartCountEl) cartCountEl.innerText = cart.length;

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
  
  cart.push({ title, price: finalPrice });
  const cartCountEl = document.getElementById('cartCount');
  if (cartCountEl) cartCountEl.innerText = cart.length;

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
  if (e && e.stopPropagation) e.stopPropagation();
  const modal = document.getElementById('termsModal');
  if (modal) {
    modal.classList.add('active');
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
