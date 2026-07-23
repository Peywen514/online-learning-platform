// SkillSync Application Logic & Secure Account Auth Engine

// Init Session from LocalStorage if available so refreshing page maintains login state
let savedUserJson = null;
try {
  savedUserJson = localStorage.getItem('skillsync_user');
} catch (err) {}

let currentUser = mockUsers[0]; // Default to Wen總監
if (savedUserJson) {
  try {
    const parsed = JSON.parse(savedUserJson);
    const existing = mockUsers.find(u => u.id === parsed.id || u.email.toLowerCase() === parsed.email.toLowerCase());
    if (existing) {
      currentUser = existing;
    } else {
      currentUser = parsed;
    }
  } catch (err) {}
}

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
  setupFilterEvents();
  setupTabEvents();
  initCarousel();

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
      <h3 class="margin-top-sm">${inst.name} <span class="tag-badge bg-purple">${inst.tag || '名師'}</span></h3>
      <div class="text-sm text-cyan margin-top-xs"><strong>${inst.role}</strong></div>
      <div class="text-xs text-muted margin-top-xs">${inst.exp}</div>

      <div class="skills-tags margin-top-md" style="justify-content:center;">
        ${inst.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
      </div>

      <div class="fin-calc-box margin-top-md" style="text-align:left;">
        <div class="calc-row">
          <span>1-on-1 個教費率</span>
          <strong class="text-purple">${inst.rate1on1}</strong>
        </div>
        <div class="calc-row">
          <span>累積學生評鑑</span>
          <strong class="text-yellow">⭐ ${inst.rating} (${inst.studentCount} 位學員)</strong>
        </div>
      </div>

      <p class="text-sm text-muted margin-top-md" style="font-style: italic;">${inst.quote}</p>

      <button class="btn btn-primary btn-block margin-top-md" onclick="quickBookInstructor('${inst.name}'); closeInstructorBioModal();">
        <i class="fa-solid fa-calendar-check"></i> 立即預約 ${inst.name} 講師個教
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
    if (currentUser.role === 'staff') roleBadgeClass = 'badge-staff';

    container.innerHTML = `
      <div class="user-profile-menu">
        <div class="user-profile-btn" onclick="toggleUserDropdown()">
          <img src="${currentUser.avatar}" class="avatar-img" alt="${currentUser.name}">
          <div class="user-info-text mobile-hide">
            <span class="user-name">${currentUser.name}</span>
            <span class="badge-role ${roleBadgeClass}">${currentUser.roleLabel}</span>
          </div>
          <i class="fa-solid fa-chevron-down text-muted" style="font-size:0.75rem;"></i>
        </div>

        <div class="user-dropdown-menu" id="userDropdownMenu">
          <div class="dropdown-header">
            <strong>${currentUser.name}</strong>
            <div class="text-xs text-muted">帳號: ${currentUser.email}</div>
          </div>
          <hr class="dropdown-divider">
          ${(currentUser.role === 'manager' || currentUser.role === 'staff') ? `
            <button class="dropdown-item" onclick="switchView('admin-dashboard'); toggleUserDropdown();">
              <i class="fa-solid fa-sliders text-pink"></i> 後台管理中心
            </button>
          ` : ''}
          ${currentUser.role === 'manager' ? `
            <button class="dropdown-item" onclick="switchView('business-plan'); toggleUserDropdown();">
              <i class="fa-solid fa-chart-line text-purple"></i> 創業完整規劃書
            </button>
          ` : ''}
          <button class="dropdown-item" onclick="openLoginModal(); toggleUserDropdown();">
            <i class="fa-solid fa-users text-cyan"></i> 切換 / 重新登入帳號
          </button>
          <hr class="dropdown-divider">
          <button class="dropdown-item text-danger" onclick="handleLogout()">
            <i class="fa-solid fa-right-from-bracket"></i> 登出系統
          </button>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="openLoginModal()">
        <i class="fa-solid fa-right-to-bracket"></i> 登入 / 帳號驗證
      </button>
    `;
  }
}

function toggleUserDropdown() {
  const menu = document.getElementById('userDropdownMenu');
  if (menu) {
    menu.classList.toggle('active');
  }
}

// Login Modal & Authentication Logic
function openLoginModal() {
  document.getElementById('loginModal').classList.add('active');
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('active');
}

function fillLoginCredentials(email, password) {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = password;
}

function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  // Search accounts in database (mockUsers)
  const matchedUser = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

  if (matchedUser) {
    currentUser = matchedUser;
    try {
      localStorage.setItem('skillsync_user', JSON.stringify(currentUser));
    } catch(err) {}
    closeLoginModal();
    renderAuthArea();
    updateUIPermissions();

    showToast(`🎉 歡迎回來，${currentUser.name}！已載入【${currentUser.roleLabel}】專屬介面`);

    if (currentUser.role === 'manager' || currentUser.role === 'staff' || currentUser.role === 'instructor') {
      switchView('admin-dashboard');
      if (currentUser.role === 'instructor') {
        switchAdminTab('bookings');
      }
    } else {
      switchView('marketplace');
    }
  } else {
    showToast('⚠️ 登入失敗：帳號或密碼不正確，請重新檢查！');
  }
}

function handleLogout() {
  try {
    localStorage.removeItem('skillsync_user');
  } catch(err) {}
  currentUser = mockUsers[2]; // Reset to student
  renderAuthArea();
  updateUIPermissions();
  switchView('home');
  showToast('已安全登出系統');
}

// UI Permissions Control Engine
function updateUIPermissions() {
  if (!currentUser) return;
  const role = currentUser.role;

  // 1. Business Plan Link & Button (Manager ONLY)
  const busLink = document.getElementById('navBusinessPlanLink');
  if (busLink) {
    busLink.style.display = role === 'manager' ? 'flex' : 'none';
  }
  document.querySelectorAll('.manager-only-btn').forEach(btn => {
    btn.style.display = role === 'manager' ? 'inline-flex' : 'none';
  });

  const adminLink = document.getElementById('navAdminLink');
  if (adminLink) {
    adminLink.style.display = (role === 'manager' || role === 'staff' || role === 'instructor') ? 'flex' : 'none';
  }

  document.querySelectorAll('.staff-manager-btn').forEach(btn => {
    btn.style.display = (role === 'manager' || role === 'staff' || role === 'instructor') ? 'inline-flex' : 'none';
  });

  document.querySelectorAll('.manager-only-tab').forEach(tab => {
    tab.style.display = role === 'manager' ? 'inline-block' : 'none';
  });
  
  if (role === 'staff' && activeAdminTab === 'users') {
    switchAdminTab('courses');
  }

  // 5. Update Admin Badge
  const adminBadge = document.getElementById('adminRoleBadge');
  if (adminBadge) {
    if (role === 'manager') {
      adminBadge.className = 'badge-tag badge-manager';
      adminBadge.innerText = '👑 Wen總監 最高權限 (包含帳號/密碼/課程/創業規劃)';
    } else if (role === 'staff') {
      adminBadge.className = 'badge-tag badge-staff';
      adminBadge.innerText = '🧑‍💼 營運員工權限 (課程/講師/影片增修編輯)';
    } else {
      adminBadge.className = 'badge-tag badge-student';
      adminBadge.innerText = '🎓 消費者學員';
    }
  }

  if (currentView === 'admin-dashboard') {
    renderAdminTables();
  }
}

// Navigation View Switcher with Permission Guards & Browser History Support
function switchView(viewId, pushHistory = true) {
  if (viewId === 'business-plan' && currentUser.role !== 'manager') {
    showToast('⚠️ 權限不足：【創業完整規劃書】僅供 👑 Wen總監 查閱');
    return;
  }
  if (viewId === 'admin-dashboard' && currentUser.role === 'student') {
    showToast('⚠️ 權限不足：【後台管理中心】僅供 👑 主管 與 🧑‍💼 員工 存取');
    return;
  }

  currentView = viewId;
  closeMobileMenu();

  if (pushHistory && history.pushState && location.hash !== `#${viewId}`) {
    history.pushState({ viewId: viewId }, '', `#${viewId}`);
  }

  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('data-target') === viewId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

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
}

function initNavbar() {
  document.querySelectorAll('.nav-link').forEach(button => {
    button.addEventListener('click', (e) => {
      const target = e.currentTarget.getAttribute('data-target');
      if (target) switchView(target);
    });
  });

  document.getElementById('logoBtn').addEventListener('click', () => switchView('home'));
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
            <span>純錄播自學包：</span>
            <span class="price-val">NT$ ${course.priceRecordOnly.toLocaleString()}</span>
          </div>
          <div class="price-option">
            <span><strong>錄播 + 名師 1-on-1 個教：</strong></span>
            <span class="price-val highlight">NT$ ${course.priceWith1on1.toLocaleString()}</span>
          </div>
        </div>

        <div class="course-actions">
          <button class="btn btn-outline btn-block" onclick="openCheckoutModal('${course.id}', 'record')">
            購買純錄播
          </button>
          <button class="btn btn-primary btn-block" onclick="openCheckoutModal('${course.id}', 'combo')">
            <i class="fa-solid fa-bolt"></i> 購買個教陪跑包
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
  if (tabKey === 'users' && currentUser.role !== 'manager') {
    showToast('⚠️ 帳號密碼與權限管理僅供 👑 Wen總監 操作');
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
}

// User Accounts Table (Manager Only)
function renderUserTable() {
  const tbody = document.getElementById('userTableBody');
  const userCountSpan = document.getElementById('userTotalCount');
  if (!tbody) return;

  if (userCountSpan) userCountSpan.innerText = mockUsers.length;

  tbody.innerHTML = mockUsers.map(user => {
    let roleBadgeClass = 'badge-student';
    if (user.role === 'manager') roleBadgeClass = 'badge-manager';
    if (user.role === 'staff') roleBadgeClass = 'badge-staff';

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <img src="${user.avatar}" style="width:30px;height:30px;border-radius:50%;">
            <strong>${user.name}</strong>
          </div>
        </td>
        <td><code>${user.email}</code></td>
        <td><code>${user.password}</code></td>
        <td><span class="badge-role ${roleBadgeClass}">${user.roleLabel}</span></td>
        <td class="text-sm text-muted">
          ${user.role === 'manager' ? '全權限 + 帳號密碼 + 創業規劃' : user.role === 'staff' ? '課程 / 講師 / 影片 增修' : '官網瀏覽與課程購買'}
        </td>
        <td>
          ${currentUser.role === 'manager' ? `
            <button class="btn btn-sm btn-outline" onclick="openEditUserModal('${user.id}')"><i class="fa-solid fa-pen"></i> 密碼/權限</button>
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

  tbody.innerHTML = mockCourses.map(c => `
    <tr>
      <td><strong>${c.title}</strong></td>
      <td><span class="badge-tag">${c.categoryLabel}</span></td>
      <td>${c.instructor}</td>
      <td>NT$ ${c.priceRecordOnly.toLocaleString()}</td>
      <td class="text-pink">NT$ ${c.priceWith1on1.toLocaleString()}</td>
      <td><span class="badge badge-success">已上架</span></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="openEditCourseModal('${c.id}')"><i class="fa-solid fa-pen"></i> 編輯</button>
        ${currentUser.role === 'manager' ? `<button class="btn btn-sm btn-danger" onclick="deleteCourse('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
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
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <img src="${inst.avatar}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">
          <div>
            <strong>${inst.name}</strong>
            <div class="text-xs text-muted">${inst.tag || ''}</div>
          </div>
        </div>
      </td>
      <td>${inst.role}</td>
      <td class="text-sm text-muted">${inst.exp}</td>
      <td class="text-purple"><strong>${inst.rate1on1}</strong></td>
      <td>⭐ ${inst.rating} (${inst.studentCount}學員)</td>
      <td>
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
      <td><code>${b.id}</code></td>
      <td><strong class="text-purple">${b.instructor}</strong></td>
      <td>
        <div><strong>${b.studentName}</strong></div>
        <div class="text-xs text-muted">${b.studentEmail}</div>
      </td>
      <td><span class="badge-tag">${b.date}</span> <br><small class="text-cyan">${b.slotTime}</small></td>
      <td style="max-width:220px;">
        <div class="text-sm"><strong>${b.topic}</strong></div>
        <div class="text-xs text-muted" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">需求: ${b.notes}</div>
      </td>
      <td class="text-purple">NT$ ${b.fee.toLocaleString()}</td>
      <td>
        <span class="badge ${b.status==='已完成'?'badge-success':'badge-warning'}">${b.status}</span>
      </td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="quickBookInstructor('${b.instructor}')"><i class="fa-solid fa-video"></i> 進入帶課教室</button>
      </td>
    </tr>
  `).join('');
}

// Mentor Monthly Salary Settlement Table for Manager (Wen總監)
function renderMentorSalaryTable() {
  const tbody = document.getElementById('mentorSalaryTableBody');
  if (!tbody) return;

  const salaryData = [
    { name: "張哲銘 (Ethan)", role: "Full-Stack & AI 技術專家", rate: 1800, completed: 56, split: "60%" },
    { name: "陳婷俐 (Tina)", role: "UI/UX 與 Figma 系統總監", rate: 2000, completed: 47, split: "60%" },
    { name: "歐陽翔 (Shawn)", role: "Python 數據分析與 AI 顧問", rate: 1600, completed: 27, split: "60%" },
    { name: "林雅涵 (Hannah)", role: "短影音與數位整合行銷總監", rate: 1800, completed: 18, split: "60%" }
  ];

  tbody.innerHTML = salaryData.map(s => {
    const grossRevenue = s.rate * s.completed;
    const mentorPayout = Math.round(grossRevenue * 0.6);

    return `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td><span class="badge-tag">${s.role}</span></td>
        <td>NT$ ${s.rate.toLocaleString()} / 1hr</td>
        <td><strong class="text-cyan">${s.completed} 場</strong></td>
        <td>NT$ ${grossRevenue.toLocaleString()}</td>
        <td><span class="badge badge-purple">${s.split}</span></td>
        <td class="text-green"><strong style="font-size:1.05rem;">NT$ ${mentorPayout.toLocaleString()}</strong></td>
        <td><span class="badge badge-warning">已審核待撥款</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="showToast('已開啟 ${s.name} 本月 1-on-1 明細與簽到單')"><i class="fa-solid fa-list-check"></i> 明細</button>
          <button class="btn btn-sm btn-primary" onclick="showToast('✅ 已撥款 NT$ ${mentorPayout.toLocaleString()} 至 ${s.name} 指定帳戶')"><i class="fa-solid fa-dollar-sign"></i> 撥款</button>
        </td>
      </tr>
    `;
  }).join('');
}

function processMonthlyPayout() {
  showToast('🎉 2026年7月份 講師團隊月結薪資總額 (NT$ 171,840) 已審核通過並全數撥款發放！');
}

function exportFinanceReport() {
  const csvContent = "data:text/csv;charset=utf-8," 
    + "講師姓名,專業頭銜,單場費率,本月完成場次,產生總營收,拆帳率,本月應發月薪\n"
    + "張哲銘 (Ethan),Full-Stack & AI,1800,56,100800,60%,60480\n"
    + "陳婷俐 (Tina),UI/UX 設計,2000,47,94000,60%,56400\n"
    + "歐陽翔 (Shawn),Python 數據,1600,27,43200,60%,25920\n"
    + "林雅涵 (Hannah),短影音行銷,1800,18,32400,60%,19440\n";
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "SkillSync_202607_Mentor_Salary_Report.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("📥 已成功匯出 2026年7月份 講師月結薪資與營收報表 (CSV)");
}

// Account Creation / Password Edit
function openAddUserModal() {
  if (currentUser.role !== 'manager') {
    showToast('⚠️ 僅有 👑 Wen總監 可以新增帳號密碼');
    return;
  }
  document.getElementById('editUserId').value = '';
  document.getElementById('inputUserName').value = '';
  document.getElementById('inputUserEmail').value = '';
  document.getElementById('inputUserPassword').value = '';
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
  document.getElementById('addUserModal').classList.add('active');
}

function closeAddUserModal() {
  document.getElementById('addUserModal').classList.remove('active');
}

function handleSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById('editUserId').value;
  const name = document.getElementById('inputUserName').value;
  const email = document.getElementById('inputUserEmail').value;
  const password = document.getElementById('inputUserPassword').value;
  const role = document.getElementById('inputUserRole').value;

  let roleLabel = '🎓 消費者學員 (Student)';
  let avatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80';
  if (role === 'manager') {
    roleLabel = '👑 平台主管 (Manager)';
    avatar = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80';
  } else if (role === 'staff') {
    roleLabel = '🧑‍💼 營運員工 (Staff)';
    avatar = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80';
  }

  if (id) {
    const existing = mockUsers.find(u => u.id === id);
    if (existing) {
      existing.name = name;
      existing.email = email;
      existing.password = password;
      existing.role = role;
      existing.roleLabel = roleLabel;
    }
    showToast(`✅ 已更新帳號：${name} 的密碼與權限`);
  } else {
    const newUser = {
      id: `u-${Date.now()}`,
      name, email, password, role, roleLabel, avatar
    };
    mockUsers.push(newUser);
    showToast(`✅ 成功新增帳號：${name} (密碼: ${password})`);
  }

  closeAddUserModal();
  renderUserTable();
}

function deleteUser(userId) {
  if (confirm('確定要刪除此帳號與登入權限嗎？')) {
    const idx = mockUsers.findIndex(u => u.id === userId);
    if (idx !== -1) {
      mockUsers.splice(idx, 1);
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
      instructorTitle: '近10年資深名師講師',
      instructorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      coverImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
      priceRecordOnly, priceWith1on1,
      rating: 5.0, reviewCount: 1,
      videoDuration: '20 小時錄播視訊',
      liveSlotsCount: '4 次 1-on-1 個教',
      description,
      badge: '✨ 最新上架'
    };
    mockCourses.push(newCourse);
    showToast(`🎉 成功上架新課程：${title}`);
  }

  closeAddCourseModal();
  renderCourseGrid('all');
  renderCourseAdminTable();
}

function deleteCourse(courseId) {
  if (confirm('確定要下架刪除此課程嗎？')) {
    const idx = mockCourses.findIndex(c => c.id === courseId);
    if (idx !== -1) {
      mockCourses.splice(idx, 1);
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

// Instructor CMS Modals
function openAddInstructorModal() {
  document.getElementById('editInstId').value = '';
  document.getElementById('inputInstName').value = '';
  document.getElementById('inputInstRole').value = '';
  document.getElementById('inputInstTag').value = '金牌資深講師';
  document.getElementById('inputInstExp').value = '';
  document.getElementById('inputInstAvatar').value = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80';
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
  document.getElementById('inputInstAvatar').value = inst.avatar;
  document.getElementById('inputInstRate').value = inst.rate1on1;
  document.getElementById('inputInstSkills').value = inst.skills ? inst.skills.join(', ') : '';
  document.getElementById('inputInstQuote').value = inst.quote || '';
  document.getElementById('addInstructorModal').classList.add('active');
}

function closeAddInstructorModal() {
  document.getElementById('addInstructorModal').classList.remove('active');
}

function handleSaveInstructor(e) {
  e.preventDefault();
  const id = document.getElementById('editInstId').value;
  const name = document.getElementById('inputInstName').value;
  const role = document.getElementById('inputInstRole').value;
  const tag = document.getElementById('inputInstTag').value;
  const exp = document.getElementById('inputInstExp').value;
  const avatar = document.getElementById('inputInstAvatar').value;
  const rate = document.getElementById('inputInstRate').value;
  const skillsRaw = document.getElementById('inputInstSkills').value;
  const quote = document.getElementById('inputInstQuote').value;

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

// Video Player & Chapter Logic
function renderChapters() {
  const container = document.getElementById('chapterList');
  if (!container) return;

  container.innerHTML = mockChapters.map(chap => `
    <div class="chapter-group">
      <div class="chapter-title-bar">${chap.title} (${chap.duration})</div>
      <div class="lessons-list">
        ${chap.lessons.map(l => `
          <div class="lesson-item ${l.active ? 'active' : ''}" onclick="selectLesson('${chap.title}', '${l.title}')">
            <span>
              <i class="fa-regular ${l.completed ? 'fa-circle-check text-green' : 'fa-circle-play'}"></i> 
              ${l.title}
            </span>
            <span class="text-sm">${l.active ? '播放中' : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function selectLesson(chapTitle, lessonTitle) {
  document.getElementById('currentChapterTitle').innerText = lessonTitle;
  showToast(`切換至播放單元：${lessonTitle}`);
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
      <div class="inst-name">${inst.name} <span class="tag-badge bg-purple">${inst.tag || '名師'}</span></div>
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
}

function quickBookInstructor(name) {
  switchView('live-classroom');
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
    
    let botReply = "這個問題太棒了！講師在影片中講到的核心在於 async/await 搭配 state 異步更新。如果不確定寫法，可以隨時預約本堂課的 1-on-1 個教批改喔！";
    if (userText.includes("作業") || userText.includes("繳交")) {
      botReply = "您可以點擊影片下方「繳交個教作業」按鈕，上傳您的 GitHub Repo。上傳後講師會收到通知並於一對一時間為您進行線上 Code Review！";
    }

    botMsgDiv.innerHTML = botReply;
    chatBody.appendChild(botMsgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 700);
}

// Dynamic Slot Availability & Conflict Prevention
function updateAvailableSlots() {
  const dateInput = document.getElementById('bookingDate');
  const instSelect = document.getElementById('bookingInstructor');
  const slotsContainer = document.getElementById('slotsGrid');
  if (!dateInput || !instSelect || !slotsContainer) return;

  const selectedDate = dateInput.value;
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
    studentEmail: currentUser ? currentUser.email : "student@skillsync.com",
    date: date,
    slotTime: slotTimeText,
    topic: topic,
    notes: notes || "無特殊備註",
    status: "已預約",
    fee: fee,
    payout: Math.round(fee * 0.6)
  };

  mockBookings.push(newBooking);

  showToast(`🎉 預約成功！已防重疊鎖定 ${inst} 講師於 ${date} (${slotTimeText}) 的 1 小時個教！`);

  updateAvailableSlots();
  renderStudentBookings();
  renderBookingAdminTable();
  renderMentorSalaryTable();
}

function joinUpcomingRoom() {
  switchView('live-classroom');
  showToast('進入 1-on-1 直播教室中...已連線講師音訊與共享畫布！');
}

// Student Bookings Management & Real-time Reschedule System
function renderStudentBookings() {
  const container = document.getElementById('studentUpcomingList');
  if (!container) return;

  const studentBookings = mockBookings.filter(b => b.status !== '已取消');

  if (studentBookings.length === 0) {
    container.innerHTML = `<div class="text-sm text-muted" style="padding:0.75rem 0;">您目前尚無預約的個教行程</div>`;
    return;
  }

  container.innerHTML = studentBookings.map(b => `
    <div class="booking-item">
      <div class="b-info">
        <div class="b-title">${b.instructor} 講師 • ${b.topic.substring(0, 14)}... ${b.status==='已改期'?'<span class="badge badge-cyan" style="font-size:0.68rem; padding:2px 6px;">已改期</span>':''}</div>
        <div class="b-time"><i class="fa-regular fa-clock"></i> ${b.date} (${b.slotTime})</div>
      </div>
      <div class="flex-center gap-xs">
        <button class="btn btn-sm btn-outline" onclick="joinUpcomingRoom()">進入教室</button>
        <button class="btn btn-sm btn-outline" onclick="openRescheduleModal('${b.id}')" title="改期時段"><i class="fa-solid fa-calendar-pen text-purple"></i> 改期</button>
        <button class="btn btn-sm btn-danger" onclick="cancelBooking('${b.id}')" title="取消預約"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>
  `).join('');
}

let activeRescheduleBookingId = null;

function openRescheduleModal(bookingId) {
  const booking = mockBookings.find(b => b.id === bookingId);
  if (!booking) return;

  activeRescheduleBookingId = bookingId;
  document.getElementById('rescheduleBookingId').value = booking.id;
  document.getElementById('rescheduleInstName').innerText = booking.instructor;
  document.getElementById('rescheduleOldTime').innerText = `${booking.date} (${booking.slotTime})`;
  document.getElementById('rescheduleNewDate').value = '2026-07-28';
  
  updateRescheduleSlots();
  document.getElementById('rescheduleBookingModal').classList.add('active');
}

function closeRescheduleModal() {
  document.getElementById('rescheduleBookingModal').classList.remove('active');
}

function updateRescheduleSlots() {
  const booking = mockBookings.find(b => b.id === activeRescheduleBookingId);
  const newDate = document.getElementById('rescheduleNewDate').value;
  const slotsContainer = document.getElementById('rescheduleSlotsGrid');
  if (!slotsContainer || !booking) return;

  const standardSlots = [
    "14:00 - 15:00",
    "15:30 - 16:30",
    "19:00 - 20:00",
    "20:30 - 21:30"
  ];

  const bookedTimes = mockBookings
    .filter(b => b.id !== booking.id && (b.instructor === booking.instructor || booking.instructor.includes(b.instructor.split(' ')[0])) && b.date === newDate && b.status !== '已取消')
    .map(b => b.slotTime);

  let firstAvailableSet = false;

  slotsContainer.innerHTML = standardSlots.map(slot => {
    const isBooked = bookedTimes.includes(slot);
    if (isBooked) {
      return `<div class="slot-chip disabled"><i class="fa-solid fa-lock text-danger"></i> ${slot} (已滿額)</div>`;
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

  const oldDate = booking.date;
  const oldSlot = booking.slotTime;

  // Double check conflict
  const conflict = mockBookings.find(b => b.id !== bookingId && (b.instructor === booking.instructor || booking.instructor.includes(b.instructor.split(' ')[0])) && b.date === newDate && b.slotTime === newSlotTime && b.status !== '已取消');

  if (conflict) {
    showToast(`⚠️ 抱歉！${booking.instructor} 講師於 ${newDate} ${newSlotTime} 已被搶先預約！`);
    updateRescheduleSlots();
    return;
  }

  booking.date = newDate;
  booking.slotTime = newSlotTime;
  booking.notes = `${booking.notes} (改期備註: ${reason})`;
  booking.status = "已改期";

  showToast(`🎉 改期成功！已將 ${booking.instructor} 講師個教改期至 ${newDate} (${newSlotTime})，已即時同步講師與後台！`);

  closeRescheduleModal();
  updateAvailableSlots();
  renderStudentBookings();
  renderBookingAdminTable();
}

function cancelBooking(bookingId) {
  if (confirm('確定要取消此 1-on-1 個教預約嗎？取消後該時段將重新釋放給其他學員。')) {
    const booking = mockBookings.find(b => b.id === bookingId);
    if (booking) {
      booking.status = "已取消";
      showToast(`已成功取消 ${booking.instructor} 講師的預約，原時段已即時釋出。`);
      updateAvailableSlots();
      renderStudentBookings();
      renderBookingAdminTable();
    }
  }
}

// Checkout Modal
function openCheckoutModal(courseId, type) {
  const course = mockCourses.find(c => c.id === courseId);
  if (!course) return;

  const isCombo = type === 'combo';
  const price = isCombo ? course.priceWith1on1 : course.priceRecordOnly;

  const modalBody = document.getElementById('checkoutModalBody');
  modalBody.innerHTML = `
    <div style="text-align: center; margin-bottom: 1.5rem;">
      <h4>${course.title}</h4>
      <div class="badge-tag margin-top-xs">${isCombo ? '🔥 錄播 + 1-on-1 名師個教陪跑方案' : '📹 純錄播自主學習方案'}</div>
    </div>

    <div class="fin-calc-box">
      <div class="calc-row">
        <span>購買方案</span>
        <strong>${isCombo ? '錄播全套 + 4次個教批改' : '錄播全套視訊與教材'}</strong>
      </div>
      <div class="calc-row">
        <span>應付金額</span>
        <strong class="text-purple" font-size="1.2rem">NT$ ${price.toLocaleString()}</strong>
      </div>
    </div>

    <form onsubmit="processPayment(event, '${course.title}', ${price}, '${type}')" class="margin-top-md">
      <div class="form-group">
        <label>選擇付款方式</label>
        <select class="form-control" id="payMethod">
          <option>信用卡 / 簽帳金融卡 (一次付清)</option>
          <option>無卡分期 (每月 NT$ ${(price / 3).toFixed(0)} x 3期)</option>
          <option>LINE Pay / 街口支付</option>
          <option>ATM 轉帳開通</option>
        </select>
      </div>

      <button type="submit" class="btn btn-primary btn-block margin-top-md">
        <i class="fa-solid fa-credit-card"></i> 立即付款 NT$ ${price.toLocaleString()} 並開通權限
      </button>
    </form>
  `;

  document.getElementById('checkoutModal').classList.add('active');
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').classList.remove('active');
}

function processPayment(e, title, price, type) {
  e.preventDefault();
  closeCheckoutModal();
  showToast(`✅ 成功購買【${title}】！已立即開通錄播學習中心與個教預約額度！`);
  
  cart.push({ title, price });
  document.getElementById('cartCount').innerText = cart.length;

  setTimeout(() => {
    switchView('video-player');
  }, 1000);
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
  const modalBody = document.getElementById('checkoutModalBody');
  if (!checkoutModal || !modalBody) return;

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
