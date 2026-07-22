// SkillSync Application Logic & Secure Account Auth Engine

let currentView = 'home';
let cart = [];
let currentUser = mockUsers[2]; // Default Student for initial public view
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
  renderChapters();
  setupFilterEvents();
  setupTabEvents();
  initCarousel();
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
        <i class="fa-solid fa-calendar-check"></i> 立即預約 ${inst.name} 導師個教
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
    closeLoginModal();
    renderAuthArea();
    updateUIPermissions();

    showToast(`🎉 歡迎回來，${currentUser.name}！已載入【${currentUser.roleLabel}】專屬介面`);

    if (currentUser.role === 'manager' || currentUser.role === 'staff') {
      switchView('admin-dashboard');
    } else {
      switchView('marketplace');
    }
  } else {
    showToast('⚠️ 登入失敗：帳號或密碼不正確，請重新檢查！');
  }
}

function handleLogout() {
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

  // 2. Admin Dashboard Link (Manager & Staff)
  const adminLink = document.getElementById('navAdminLink');
  if (adminLink) {
    adminLink.style.display = (role === 'manager' || role === 'staff') ? 'flex' : 'none';
  }

  // 3. Staff & Manager Video / Course Edit Buttons
  document.querySelectorAll('.staff-manager-btn').forEach(btn => {
    btn.style.display = (role === 'manager' || role === 'staff') ? 'inline-flex' : 'none';
  });

  // 4. Admin Dashboard Tabs
  const userTabBtn = document.querySelector('.manager-only-tab');
  if (userTabBtn) {
    userTabBtn.style.display = role === 'manager' ? 'inline-block' : 'none';
  }
  
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
      adminBadge.innerText = '🧑‍💼 營運員工權限 (課程/導師/影片增修編輯)';
    } else {
      adminBadge.className = 'badge-tag badge-student';
      adminBadge.innerText = '🎓 消費者學員';
    }
  }

  if (currentView === 'admin-dashboard') {
    renderAdminTables();
  }
}

// Navigation View Switcher with Permission Guards
function switchView(viewId) {
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
          ${user.role === 'manager' ? '全權限 + 帳號密碼 + 創業規劃' : user.role === 'staff' ? '課程 / 導師 / 影片 增修' : '官網瀏覽與課程購買'}
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
        <button class="btn btn-sm btn-outline" onclick="openInstructorModal('${inst.id}')"><i class="fa-solid fa-eye"></i> 預覽名師</button>
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
      instructorTitle: '近10年資深名師導師',
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

function openAddInstructorModal() {
  showToast('👨‍🏫 新增導師表單已載入，可自由新增師資頭銜與鐘點費');
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
        <i class="fa-solid fa-calendar-check"></i> 預約導師個教
      </button>
    </div>
  `).join('');
}

function quickBookInstructor(name) {
  switchView('live-classroom');
  const select = document.getElementById('bookingInstructor');
  if (select) {
    select.value = name;
  }
  showToast(`已為您切換至 ${name} 導師的預約時段`);
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
    
    let botReply = "這個問題太棒了！導師在影片中講到的核心在於 async/await 搭配 state 異步更新。如果不確定寫法，可以隨時預約本堂課的 1-on-1 個教批改喔！";
    if (userText.includes("作業") || userText.includes("繳交")) {
      botReply = "您可以點擊影片下方「繳交個教作業」按鈕，上傳您的 GitHub Repo。上傳後導師會收到通知並於一對一時間為您進行線上 Code Review！";
    }

    botMsgDiv.innerHTML = botReply;
    chatBody.appendChild(botMsgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 700);
}

// 1-on-1 Booking System
function handleBooking(e) {
  e.preventDefault();
  const inst = document.getElementById('bookingInstructor').value;
  const topic = document.getElementById('bookingTopic').options[document.getElementById('bookingTopic').selectedIndex].text;
  const date = document.getElementById('bookingDate').value;
  
  showToast(`🎉 預約成功！您已預約 ${inst} 導師於 ${date} 進行【${topic}】`);

  const upcomingBox = document.querySelector('.upcoming-bookings');
  if (upcomingBox) {
    const newItem = document.createElement('div');
    newItem.className = 'booking-item';
    newItem.innerHTML = `
      <div class="b-info">
        <div class="b-title">${inst} 導師 • ${topic.substring(0, 15)}...</div>
        <div class="b-time"><i class="fa-regular fa-clock"></i> ${date} (時段已鎖定)</div>
      </div>
      <button class="btn btn-sm btn-outline" onclick="joinUpcomingRoom()">進入教室</button>
    `;
    upcomingBox.appendChild(newItem);
  }
}

function joinUpcomingRoom() {
  switchView('live-classroom');
  showToast('進入 1-on-1 直播教室中...已連線導師音訊與共享畫布！');
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
  showToast('🚀 個教作業已成功送出！導師將於 24 小時內完成審查並給予影音評語。');
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
  showToast('✋ 您已在直播教室中舉手！導師已優先鎖定您的畫面進行個教批改。');
}

function openShareScreenModal() {
  showToast('🖥️ 已開啟螢幕共享視窗，導師正在同步觀看您的程式/設計畫面...');
}

function saveNote() {
  const noteText = document.getElementById('studentNoteText').value;
  if (noteText) {
    showToast('💾 筆記已成功儲存至此章節 (時間軸 14:20)');
  }
}
