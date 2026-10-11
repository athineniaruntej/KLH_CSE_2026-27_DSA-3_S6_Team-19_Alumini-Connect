/* =========================================================
   Alumni Connect — Core SPA Engine  (app.js)
   Role-specific views are in views-student.js, views-mentor.js,
   views-admin.js (loaded before this file).
   ========================================================= */

// ---- Global State -------------------------------------------------------
const STATE = {
  user: null,
  token: null,
  view: 'dashboard',
  navOpen: true,
  loginRole: 'student',
  cache: {},
  msgPollTimer: null,
  notifPollTimer: null,
  unreadMsgs: 0,
  unreadNotifs: 0
};

// ---- Utilities -----------------------------------------------------------
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const initials = n => String(n||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
const fmtDate = d => { try { return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); } catch { return d||''; }};
const fmtTime = d => { try { return new Date(d).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); } catch { return ''; }};
const fmtRelative = d => {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000)+'m ago';
  if (diff < 86400000) return Math.floor(diff/3600000)+'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000)+'d ago';
  return fmtDate(d);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function avatarDiv(name, role, cls='') {
  const roleClass = (role==='alumni'||role==='mentor') ? 'mentor' : role==='admin' ? 'admin' : 'student';
  return `<div class="avatar ${roleClass} ${cls}">${esc(initials(name))}</div>`;
}

function pillHTML(status) {
  return `<span class="pill ${esc(status)}">${esc(status)}</span>`;
}

function tagsHTML(tags) {
  if (!tags) return '';
  return String(tags).split(',').filter(Boolean).map(t=>`<span class="tag">${esc(t.trim())}</span>`).join('');
}

function loadingHTML(msg='Loading...') {
  return `<div class="loading-state"><div class="spinner"></div><span class="muted">${msg}</span></div>`;
}

function emptyHTML(icon, title, sub, action='') {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-sub">${sub}</div>${action}</div>`;
}

function errorHTML(msg) {
  return `<div class="error-state">⚠ ${esc(msg)}</div>`;
}

// ---- Toast ---------------------------------------------------------------
let toastTimer = null;
function toast(msg, type='') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' '+type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ---- API -----------------------------------------------------------------
async function api(url, opts={}) {
  const token = STATE.token || localStorage.getItem('alumniSession') || '';
  const headers = { 'Content-Type': 'application/json', ...(token ? {'X-Session-Token': token} : {}), ...(opts.headers||{}) };
  const r = await fetch(url, { ...opts, headers });
  const ct = r.headers.get('content-type')||'';
  const data = ct.includes('json') ? await r.json().catch(()=>({})) : {};
  if (!r.ok) throw Object.assign(new Error(data.error || 'Request failed'), {status: r.status});
  return data;
}

// ---- Session persistence ------------------------------------------------
function saveSession(user, token) {
  STATE.user = user;
  STATE.token = token;
  localStorage.setItem('alumniUser', JSON.stringify(user));
  if (token) localStorage.setItem('alumniSession', token);
}
function clearSession() {
  STATE.user = null;
  STATE.token = null;
  STATE.cache = {};
  clearInterval(STATE.msgPollTimer);
  clearInterval(STATE.notifPollTimer);
  localStorage.removeItem('alumniUser');
  localStorage.removeItem('alumniSession');
}

// ---- Modal helpers -------------------------------------------------------
function openModal(html, cls='') {
  closeModal();
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop' + (cls ? ' '+cls : '');
  bd.id = 'activeModal';
  bd.innerHTML = `<div class="modal-box">${html}</div>`;
  bd.addEventListener('click', e => { if (e.target === bd) closeModal(); });
  document.body.appendChild(bd);
  return bd;
}
function closeModal() {
  const m = $('#activeModal');
  if (m) m.remove();
}

// ---- Confirm dialog ------------------------------------------------------
function confirm(msg, onConfirm) {
  openModal(`
    <h2>⚠ Confirm</h2>
    <p class="muted" style="margin:12px 0 24px">${esc(msg)}</p>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" id="confirmOk">Confirm</button>
    </div>`, 'confirm-dialog');
  $('#confirmOk').onclick = () => { closeModal(); onConfirm(); };
}

// ---- Nav config (role → menu items) ----------------------------------------
const NAV = {
  student: [
    { view:'dashboard',      icon:'⌂',  label:'Dashboard' },
    { view:'find-mentors',   icon:'🔍', label:'Find Mentors' },
    { view:'mentorship',     icon:'🤝', label:'My Mentorship' },
    { view:'sessions',       icon:'📅', label:'Book a Session' },
    { view:'opportunities',  icon:'💼', label:'Opportunities' },
    { view:'applications',   icon:'📄', label:'My Applications' },
    { view:'events',         icon:'🎉', label:'Events' },
    { view:'messages',       icon:'✉',  label:'Messages' },
    { view:'leaderboard',    icon:'🏆', label:'Leaderboard' },
    { view:'roadmap',        icon:'🗺',  label:'Career Roadmap' },
    { view:'profile',        icon:'👤', label:'My Profile' },
    { view:'notifications',  icon:'🔔', label:'Notifications' }
  ],
  alumni: [
    { view:'dashboard',          icon:'⌂',  label:'Dashboard' },
    { view:'requests',           icon:'📬', label:'Mentorship Requests' },
    { view:'mentees',            icon:'👥', label:'My Mentees' },
    { view:'mentor-sessions',    icon:'📅', label:'Sessions' },
    { view:'availability',       icon:'🕒', label:'Availability' },
    { view:'opportunities',      icon:'💼', label:'Opportunities' },
    { view:'referrals',          icon:'🔗', label:'Referrals' },
    { view:'events',             icon:'🎉', label:'Events' },
    { view:'messages',           icon:'✉',  label:'Messages' },
    { view:'reviews',            icon:'⭐', label:'Reviews & Impact' },
    { view:'profile',            icon:'👤', label:'My Profile' }
  ],
  admin: [
    { view:'dashboard',    icon:'⌂',  label:'Dashboard' },
    { view:'users',        icon:'👥', label:'Manage Users' },
    { view:'analytics',    icon:'📊', label:'Analytics' },
    { view:'opportunities',icon:'💼', label:'Opportunities' },
    { view:'events',       icon:'🎉', label:'Events' },
    { view:'algo-lab',     icon:'🧪', label:'Algorithm Lab' },
    { view:'admin-storage',icon:'🗄',  label:'Storage' }
  ]
};

// ---- App Shell -----------------------------------------------------------
function renderShell() {
  const u = STATE.user;
  const role = u.role;
  const menuItems = NAV[role] || NAV.student;
  const roleLabel = role === 'alumni' ? 'Mentor' : role === 'admin' ? 'Admin' : 'Student';

  const navItemsHTML = menuItems.map(item => {
    const badge = (item.view==='messages' && STATE.unreadMsgs > 0)
      ? `<span class="nav-badge">${STATE.unreadMsgs}</span>`
      : (item.view==='notifications' && STATE.unreadNotifs > 0)
      ? `<span class="nav-badge">${STATE.unreadNotifs}</span>`
      : '';
    return `<button class="nav-item ${STATE.view===item.view?'active':''}" data-view="${item.view}" title="${esc(item.label)}">`
      + `<span class="nav-icon">${item.icon}</span>`
      + `<span class="nav-label">${esc(item.label)}</span>`
      + badge
      + `</button>`;
  }).join('');

  const html = `
    <div class="app ${STATE.navOpen?'nav-open':''}" id="appRoot">
      <div class="nav-overlay"></div>
      <aside class="rail">
        <div class="brand-row">
          <div class="brand-logo">AC</div>
          <span class="brand-text">Alumni Connect</span>
          <button class="nav-toggle" id="navToggle" title="Toggle sidebar">☰</button>
        </div>
        <div class="nav-list">${navItemsHTML}</div>
        <div class="bottom">
          <button class="nav-item" id="logoutBtn" title="Logout">
            <span class="nav-icon">↪</span>
            <span class="nav-label">Logout</span>
          </button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="mobile-nav-toggle" id="mobileNavToggle" title="Open menu">☰</button>
          <div class="search-wrap">
            <input id="globalSearch" placeholder="Search mentors, skills, opportunities…" autocomplete="off">
            <span class="search-icon">⌕</span>
            <div class="search-dropdown" id="searchDropdown" style="display:none"></div>
          </div>
          <div class="topbar-actions">
            <button class="icon-btn" id="notifBtn" title="Notifications">
              🔔${STATE.unreadNotifs>0?`<span class="badge">${STATE.unreadNotifs}</span>`:''}
            </button>
            <button class="icon-btn" id="msgBtn" title="Messages">
              ✉${STATE.unreadMsgs>0?`<span class="badge">${STATE.unreadMsgs}</span>`:''}
            </button>
            <div class="user-chip" id="userChip">
              ${avatarDiv(u.name, role)}
              <div>
                <div class="name">${esc(u.name)}</div>
                <div class="role-tag">${esc(roleLabel)}</div>
              </div>
            </div>
          </div>
        </header>
        <div class="page" id="page">
          <div class="loading-state"><div class="spinner"></div></div>
        </div>
      </div>
    </div>`;

  document.getElementById('app').innerHTML = html;
  bindShell();
}

function bindShell() {
  // Nav toggle
  const toggle = () => {
    STATE.navOpen = !STATE.navOpen;
    const root = document.getElementById('appRoot');
    if (root) root.classList.toggle('nav-open', STATE.navOpen);
  };
  const navToggle = $('#navToggle');
  if (navToggle) navToggle.onclick = toggle;

  const mobileToggle = $('#mobileNavToggle');
  if (mobileToggle) mobileToggle.onclick = () => {
    STATE.navOpen = true;
    const root = document.getElementById('appRoot');
    if (root) root.classList.add('nav-open');
  };

  // Nav overlay closes sidebar on mobile
  $$('.nav-overlay').forEach(el => el.onclick = () => {
    STATE.navOpen = false;
    const root = document.getElementById('appRoot');
    if (root) root.classList.remove('nav-open');
  });

  // Nav items
  $$('[data-view]').forEach(btn => btn.onclick = () => {
    STATE.view = btn.dataset.view;
    renderShell();
    loadView();
  });

  // Logout
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.onclick = async () => {
    try { await api('/api/logout', {method:'POST'}); } catch(e) {}
    clearSession();
    renderAuth();
  };

  // Notification button
  const notifBtn = $('#notifBtn');
  if (notifBtn) notifBtn.onclick = () => { STATE.view='notifications'; renderShell(); loadView(); };

  // Messages button
  const msgBtn = $('#msgBtn');
  if (msgBtn) msgBtn.onclick = () => { STATE.view='messages'; renderShell(); loadView(); };

  // User chip → profile
  const userChip = $('#userChip');
  if (userChip) userChip.onclick = () => { STATE.view='profile'; renderShell(); loadView(); };

  // Global search with autocomplete
  const searchInput = $('#globalSearch');
  const searchDrop = $('#searchDropdown');
  if (searchInput) {
    let searchTimer = null;
    searchInput.oninput = () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      if (!q) { if(searchDrop) searchDrop.style.display='none'; return; }
      searchTimer = setTimeout(() => doGlobalSearch(q), 300);
    };
    searchInput.onkeydown = e => {
      if (e.key==='Escape') { if(searchDrop) searchDrop.style.display='none'; }
      if (e.key==='Enter') {
        e.preventDefault();
        const q = searchInput.value.trim();
        if (!q) return;
        if (searchDrop) searchDrop.style.display='none';
        if (STATE.user.role === 'student') { STATE.view='find-mentors'; }
        else { STATE.view='opportunities'; }
        STATE.cache.searchQuery = q;
        renderShell(); loadView();
      }
    };
    document.addEventListener('click', e => {
      if (!searchInput.contains(e.target) && searchDrop && !searchDrop.contains(e.target)) {
        searchDrop.style.display='none';
      }
    });
  }
}

async function doGlobalSearch(q) {
  const drop = $('#searchDropdown');
  if (!drop) return;
  drop.style.display='block';
  drop.innerHTML = loadingHTML('Searching…');
  try {
    const data = await api(`/api/alumni?q=${encodeURIComponent(q)}&limit=6`);
    const results = (data.results||[]).slice(0,6);
    if (!results.length) { drop.innerHTML = '<div style="padding:12px 14px;color:var(--ink2);font-size:13px">No results</div>'; return; }
    drop.innerHTML = results.map(u => `
      <div class="search-result-item" data-uid="${esc(u.id)}">
        ${avatarDiv(u.name, u.role)}
        <div>
          <div>${esc(u.name)}</div>
          <div class="label">${esc(u.department||'')} · ${esc(u.skills||'').split(',').slice(0,2).join(', ')}</div>
        </div>
      </div>`).join('');
    $$('.search-result-item').forEach(item => {
      item.onclick = () => {
        drop.style.display='none';
        const uid = item.dataset.uid;
        openProfileModal(uid);
      };
    });
  } catch(e) {
    drop.innerHTML = '<div style="padding:12px 14px;color:var(--red);font-size:13px">Search failed</div>';
  }
}

// ---- View Routing --------------------------------------------------------
async function loadView() {
  const page = $('#page');
  if (!page) return;
  page.innerHTML = loadingHTML();

  const role = STATE.user.role;
  const view = STATE.view;

  try {
    // Role-specific routers defined in views-student.js, views-mentor.js, views-admin.js
    if (role === 'student') {
      await routeStudent(view, page);
    } else if (role === 'alumni') {
      await routeMentor(view, page);
    } else if (role === 'admin') {
      await routeAdmin(view, page);
    } else {
      page.innerHTML = errorHTML('Unknown role.');
    }
  } catch(err) {
    console.error('View error:', err);
    page.innerHTML = errorHTML(err.message || 'Failed to load page.');
  }
}

// ---- Auth ---------------------------------------------------------------
function renderAuth() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="auth-logo-icon">AC</div>
          <div class="auth-logo-text">Alumni Connect</div>
        </div>
        <h1>Welcome back</h1>
        <p class="sub">Sign in to your account or create a new one.</p>
        <div class="auth-tabs">
          <button class="auth-tab active" id="loginTab">Sign In</button>
          <button class="auth-tab" id="registerTab">Register</button>
        </div>
        <div id="authFormWrap"></div>
        <div class="auth-footer">
          Demo: student@alumniconnect.local / student123 &nbsp;|&nbsp;
          alumni@alumniconnect.local / alumni123 &nbsp;|&nbsp;
          <span class="admin-link" id="adminHint">Admin</span>
        </div>
      </div>
    </div>`;

  const formWrap = $('#authFormWrap');
  function showLogin() {
    $('#loginTab').classList.add('active');
    $('#registerTab').classList.remove('active');
    formWrap.innerHTML = loginFormHTML();
    bindLoginForm();
  }
  function showRegister() {
    $('#registerTab').classList.add('active');
    $('#loginTab').classList.remove('active');
    formWrap.innerHTML = registerFormHTML();
    bindRegisterForm();
  }

  $('#loginTab').onclick = showLogin;
  $('#registerTab').onclick = showRegister;
  $('#adminHint').onclick = () => {
    const email = formWrap.querySelector('#loginEmail');
    if (email) { email.value = 'admin@alumniconnect.local'; formWrap.querySelector('#loginPassword').value='admin123'; }
  };
  showLogin();
}

function loginFormHTML() {
  const isStudent = STATE.loginRole === 'student';
  const isMentor = STATE.loginRole === 'mentor';
  const emailVal = isStudent ? 'student@alumniconnect.local' : isMentor ? 'alumni@alumniconnect.local' : '';
  const passVal = isStudent ? 'student123' : isMentor ? 'alumni123' : '';
  return `
    <div class="role-picker">
      <button type="button" class="role-card ${STATE.loginRole==='student'?'selected':''}" data-loginrole="student">
        <div class="role-icon">🎓</div>
        <div class="role-info"><b>Student</b><small>Find mentors and internships</small></div>
        ${STATE.loginRole==='student'?'<span class="role-check">✓</span>':''}
      </button>
      <button type="button" class="role-card ${STATE.loginRole==='mentor'?'selected':''}" data-loginrole="mentor">
        <div class="role-icon">🧑‍🏫</div>
        <div class="role-info"><b>Mentor</b><small>Guide students and share experience</small></div>
        ${STATE.loginRole==='mentor'?'<span class="role-check">✓</span>':''}
      </button>
    </div>
    <form class="form" id="loginForm">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="loginEmail" type="email" name="email" value="${esc(emailVal)}" required>
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" id="loginPassword" type="password" name="password" value="${esc(passVal)}" required>
        <span class="form-error" id="loginErr" style="display:none"></span>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:4px">
        Sign in as ${isStudent?'Student':'Mentor'} →
      </button>
    </form>`;
}

function bindLoginForm() {
  $$('[data-loginrole]').forEach(btn => btn.onclick = () => {
    STATE.loginRole = btn.dataset.loginrole;
    const wrap = $('#authFormWrap');
    wrap.innerHTML = loginFormHTML();
    bindLoginForm();
  });
  const form = $('#loginForm');
  if (!form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const errEl = $('#loginErr');
    const submitBtn = form.querySelector('[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';
    try {
      const body = { email: form.email.value, password: form.password.value, role: STATE.loginRole };
      const data = await api('/api/login', { method:'POST', body:JSON.stringify(body) });
      saveSession(data.user, data.session);
      STATE.view = 'dashboard';
      await startApp();
    } catch(err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display='block'; }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in →';
    }
  };
}

function registerFormHTML() {
  return `
    <form class="form" id="regForm">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-input" name="name" required>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" type="email" name="email" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Account Type</label>
          <select class="form-select" name="role">
            <option value="student">Student</option>
            <option value="mentor">Mentor (Alumni)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" type="password" name="password" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Department</label>
          <input class="form-input" name="department" placeholder="CSE">
        </div>
        <div class="form-group">
          <label class="form-label">Batch / Year</label>
          <input class="form-input" name="batch" placeholder="2026">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Skills (comma-separated)</label>
        <input class="form-input" name="skills" placeholder="Java, DSA, Python">
      </div>
      <span class="form-error" id="regErr" style="display:none"></span>
      <button type="submit" class="btn btn-primary">Create Account →</button>
    </form>`;
}

function bindRegisterForm() {
  const form = $('#regForm');
  if (!form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const errEl = $('#regErr');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const body = Object.fromEntries(new FormData(form));
      const data = await api('/api/register', { method:'POST', body:JSON.stringify(body) });
      saveSession(data.user, data.session);
      STATE.view = 'dashboard';
      await startApp();
    } catch(err) {
      if (errEl) { errEl.textContent = err.message; errEl.style.display='block'; }
      btn.disabled = false; btn.textContent = 'Create Account →';
    }
  };
}

// ---- Profile modal (shared) -----------------------------------------------
async function openProfileModal(userId) {
  openModal(`<div id="profileModalBody">${loadingHTML()}</div>`);
  try {
    const data = await api(`/api/profile?userId=${encodeURIComponent(userId)}`);
    const u = data;
    const roleLabel = u.role==='alumni'?'Mentor':u.role==='admin'?'Admin':'Student';
    document.getElementById('profileModalBody').innerHTML = `
      <div style="display:flex;gap:16px;align-items:flex-start">
        ${avatarDiv(u.name, u.role, 'xl')}
        <div style="flex:1">
          <h2 style="margin:0 0 4px">${esc(u.name)}</h2>
          <div class="muted text-sm">${esc(roleLabel)} · ${esc(u.department||'')} · Batch ${esc(u.batch||'')}</div>
          ${u.verified ? '<span class="pill accepted mt-8">✓ Verified</span>' : ''}
        </div>
      </div>
      <div class="tags mt-12">${tagsHTML(u.skills)}</div>
      <p class="muted mt-8" style="font-size:13px">${esc(u.bio||'No bio yet.')}</p>
      <div class="divider"></div>
      <div class="grid g-2" style="gap:8px;font-size:12px;color:var(--ink2)">
        <span>🏢 ${esc(u.industry||'Not set')}</span>
        <span>💼 ${esc(u.experience||'Not set')}</span>
        <span>🎓 ${esc(u.department||'Not set')}</span>
        <span>📅 Batch ${esc(u.batch||'N/A')}</span>
      </div>
      ${STATE.user.role==='student' && u.role==='alumni' ? `
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="openMentorRequest('${esc(u.id)}','${esc(u.name)}')">Request Mentorship</button>
      </div>` : `
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>`}`;
  } catch(e) {
    document.getElementById('profileModalBody').innerHTML = errorHTML(e.message);
  }
}

// ---- Mentorship request modal (student) ------------------------------------
function openMentorRequest(alumniId, name) {
  closeModal();
  openModal(`
    <h2>Request Mentorship</h2>
    <p class="subtitle">Send a focused request to <b>${esc(name)}</b>.</p>
    <form class="form" id="mentorReqForm">
      <div class="form-group">
        <label class="form-label">Topic / Goal</label>
        <input class="form-input" name="topic" placeholder="Placement prep, backend roadmap…" required>
      </div>
      <div class="form-group">
        <label class="form-label">Brief message (optional)</label>
        <textarea class="form-textarea" name="message" placeholder="Tell them a bit about yourself…"></textarea>
      </div>
      <span class="form-error" id="mrErr" style="display:none"></span>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Send Request</button>
      </div>
    </form>`);
  $('#mentorReqForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await api('/api/mentorship', { method:'POST', body:JSON.stringify({ alumniId, topic: e.target.topic.value, message: e.target.message.value }) });
      closeModal(); toast('Mentorship request sent!', 'success');
    } catch(err) {
      const errEl = $('#mrErr'); if(errEl){ errEl.textContent=err.message; errEl.style.display='block'; }
      btn.disabled=false; btn.textContent='Send Request';
    }
  };
}

// ---- Notification & Message polling ------------------------------------
async function pollNotifications() {
  try {
    const data = await api('/api/notifications?limit=5');
    const prev = STATE.unreadNotifs;
    STATE.unreadNotifs = data.unread || 0;
    if (STATE.unreadNotifs !== prev) updateBadges();
  } catch(e) {}
}
async function pollMessages() {
  try {
    const data = await api('/api/messages/unread-count');
    const prev = STATE.unreadMsgs;
    STATE.unreadMsgs = data.count || 0;
    if (STATE.unreadMsgs !== prev) updateBadges();
  } catch(e) {}
}
function updateBadges() {
  const notifBadge = $('#notifBtn .badge');
  if (notifBadge) { if (STATE.unreadNotifs > 0) { notifBadge.textContent = STATE.unreadNotifs; notifBadge.style.display='grid'; } else { notifBadge.remove(); } }
  const msgBadge = $('#msgBtn .badge');
  if (msgBadge) { if (STATE.unreadMsgs > 0) { msgBadge.textContent = STATE.unreadMsgs; msgBadge.style.display='grid'; } else { msgBadge.remove(); } }
  // Nav badges
  $$('[data-view="notifications"] .nav-badge').forEach(el => { el.textContent = STATE.unreadNotifs; el.style.display = STATE.unreadNotifs > 0 ? 'block' : 'none'; });
  $$('[data-view="messages"] .nav-badge').forEach(el => { el.textContent = STATE.unreadMsgs; el.style.display = STATE.unreadMsgs > 0 ? 'block' : 'none'; });
}

// ---- App entry point ----------------------------------------------------
async function startApp() {
  // Fetch initial notif/msg counts
  await Promise.allSettled([pollNotifications(), pollMessages()]);
  renderShell();
  await loadView();
  // Poll every 30s
  clearInterval(STATE.notifPollTimer);
  clearInterval(STATE.msgPollTimer);
  STATE.notifPollTimer = setInterval(pollNotifications, 30000);
  STATE.msgPollTimer   = setInterval(pollMessages, 30000);
}

async function restoreSession() {
  const saved = localStorage.getItem('alumniUser');
  const token = localStorage.getItem('alumniSession');
  if (!saved || !token) { renderAuth(); return; }
  try {
    STATE.token = token;
    STATE.user = JSON.parse(saved);
    const data = await api('/api/me');
    STATE.user = data.user;
    localStorage.setItem('alumniUser', JSON.stringify(data.user));
    await startApp();
  } catch(e) {
    clearSession();
    renderAuth();
  }
}

// ---- Shared page: Notifications ----------------------------------------
async function pageNotifications(page) {
  page.innerHTML = `
    <h1 class="section-title">Notifications</h1>
    <p class="section-sub">Stay up to date with all activity on your account.</p>
    <div class="card" id="notifList">${loadingHTML()}</div>`;
  try {
    const data = await api('/api/notifications?limit=50');
    const notifs = data.notifications || [];
    if (!notifs.length) { $('#notifList').innerHTML = emptyHTML('🔔','All caught up','No notifications yet.'); return; }
    const html = notifs.map(n => `
      <div class="notif-item ${!n.read?'unread':''}">
        ${!n.read ? '<div class="notif-dot"></div>' : '<div style="width:8px;min-width:8px"></div>'}
        <div>
          <div class="notif-title">${esc(n.title)}</div>
          <div class="notif-msg">${esc(n.message)}</div>
          <div class="notif-time">${fmtRelative(n.createdAt)}</div>
        </div>
        ${!n.read ? `<button class="btn btn-ghost btn-xs" onclick="markNotifRead('${esc(n.id)}',this)">Mark read</button>` : ''}
      </div>`).join('');
    $('#notifList').innerHTML = `
      <div class="flex-between mb-12">
        <h3 style="font:700 16px 'Playfair Display'">All Notifications</h3>
        <button class="btn btn-ghost btn-sm" onclick="markAllNotifRead()">Mark all read</button>
      </div>
      ${html}`;
  } catch(e) { $('#notifList').innerHTML = errorHTML(e.message); }
}
async function markNotifRead(id, btn) {
  try { await api(`/api/notifications/${encodeURIComponent(id)}`, {method:'PUT'}); if(btn)btn.remove(); STATE.unreadNotifs = Math.max(0, STATE.unreadNotifs-1); updateBadges(); } catch(e) { toast(e.message,'error'); }
}
async function markAllNotifRead() {
  try { await api('/api/notifications/read-all', {method:'POST'}); STATE.unreadNotifs=0; updateBadges(); STATE.view='notifications'; renderShell(); loadView(); toast('All notifications marked read','success'); } catch(e) { toast(e.message,'error'); }
}

// ---- Shared page: Messages ---------------------------------------------
async function pageMessages(page) {
  page.innerHTML = `
    <h1 class="section-title">Messages</h1>
    <p class="section-sub">1:1 chat with your ${STATE.user.role==='alumni'?'mentees':'mentors and connections'}.</p>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="messages-layout">
        <div class="msg-list" id="msgList">${loadingHTML()}</div>
        <div class="msg-area" id="msgArea">
          <div class="empty-state" style="margin:auto">
            <div class="empty-icon">✉</div>
            <div class="empty-title">Select a conversation</div>
          </div>
        </div>
      </div>
    </div>`;
  try {
    const data = await api('/api/messages/threads');
    const threads = data.threads || [];
    if (!threads.length) {
      $('#msgList').innerHTML = emptyHTML('💬','No messages yet','Start a conversation from a mentorship or mentee page.');
      return;
    }
    STATE._msgThreads = threads;
    $('#msgList').innerHTML = threads.map(t => `
      <div class="msg-preview ${t.unread?'unread':''}" data-thread="${esc(t.withId)}" onclick="openThread('${esc(t.withId)}','${esc(t.withName)}')">
        ${avatarDiv(t.withName, t.withRole)}
        <div style="flex:1;min-width:0">
          <div class="msg-name">${esc(t.withName)}</div>
          <div class="msg-snippet">${esc(t.lastMessage||'')}</div>
        </div>
        <div class="msg-time">${fmtRelative(t.lastAt)}</div>
      </div>`).join('');
    if (threads.length) openThread(threads[0].withId, threads[0].withName);
  } catch(e) { $('#msgList').innerHTML = errorHTML(e.message); }
}

let _currentThread = null;
async function openThread(withId, withName) {
  _currentThread = withId;
  const area = $('#msgArea');
  if (!area) return;
  area.innerHTML = `
    <div class="msg-header">
      ${avatarDiv(withName, '')}
      <div>
        <div style="font-weight:600;font-size:14px">${esc(withName)}</div>
      </div>
    </div>
    <div class="msg-body" id="msgBody">${loadingHTML()}</div>
    <div class="msg-input-row">
      <textarea class="msg-input" id="msgInput" placeholder="Type a message…" rows="1"></textarea>
      <button class="btn btn-primary btn-icon" onclick="sendMessage('${esc(withId)}')">➤</button>
    </div>`;
  const input = $('#msgInput');
  if (input) {
    input.onkeydown = e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendMessage(withId); } };
  }
  await loadThread(withId);
}

async function loadThread(withId) {
  const body = $('#msgBody');
  if (!body) return;
  try {
    const data = await api(`/api/messages/${encodeURIComponent(withId)}`);
    const msgs = data.messages || [];
    body.innerHTML = msgs.length ? msgs.map(m => `
      <div class="msg-bubble ${m.senderId===STATE.user.id?'mine':'theirs'}">
        <div>${esc(m.text)}</div>
        <div class="time">${fmtTime(m.createdAt)}</div>
      </div>`).join('') : '<div class="empty-state" style="margin:auto"><div class="empty-icon">💬</div><div class="empty-sub">No messages yet</div></div>';
    body.scrollTop = body.scrollHeight;
    STATE.unreadMsgs = Math.max(0, STATE.unreadMsgs - 1);
    updateBadges();
  } catch(e) { if(body) body.innerHTML = errorHTML(e.message); }
}

async function sendMessage(withId) {
  const input = $('#msgInput');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  try {
    await api('/api/messages', { method:'POST', body:JSON.stringify({ toId: withId, text }) });
    await loadThread(withId);
  } catch(e) { toast(e.message,'error'); }
}

// ---- Shared page: Profile (edit) ----------------------------------------
async function pageProfile(page) {
  const u = STATE.user;
  const roleLabel = u.role==='alumni'?'Mentor':u.role==='admin'?'Admin':'Student';
  page.innerHTML = `
    <h1 class="section-title">My Profile</h1>
    <p class="section-sub">Your public profile used for discovery and mentorship matching.</p>
    <div class="grid g-3-2 gap-16">
      <div>
        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:16px">
            ${avatarDiv(u.name, u.role, 'xl')}
            <div>
              <h2 style="font:700 22px 'Playfair Display';margin:0 0 4px">${esc(u.name)}</h2>
              <div class="muted text-sm">${esc(roleLabel)} · ${esc(u.department||'')} · Batch ${esc(u.batch||'')}</div>
              ${u.verified?'<span class="pill accepted mt-4">✓ Verified</span>':''}
            </div>
          </div>
          <div class="tags">${tagsHTML(u.skills)}</div>
          <p class="muted text-sm mt-8">${esc(u.bio||'No bio set.')}</p>
        </div>
        <div class="card">
          <div class="card-header"><h3>Activity Timeline</h3></div>
          <div id="activityTimeline">${loadingHTML()}</div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Edit Profile</h3></div>
        <form class="form" id="profileEditForm">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input class="form-input" name="name" value="${esc(u.name)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Headline / Experience</label>
            <input class="form-input" name="experience" value="${esc(u.experience||'')}" placeholder="5 years, Software Engineer at Google">
          </div>
          <div class="form-group">
            <label class="form-label">Department</label>
            <input class="form-input" name="department" value="${esc(u.department||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Industry</label>
            <input class="form-input" name="industry" value="${esc(u.industry||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Company</label>
            <input class="form-input" name="company" value="${esc(u.company||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Skills (comma-separated)</label>
            <input class="form-input" name="skills" value="${esc(u.skills||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Interests</label>
            <input class="form-input" name="interests" value="${esc(u.interests||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Bio</label>
            <textarea class="form-textarea" name="bio">${esc(u.bio||'')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">LinkedIn URL</label>
            <input class="form-input" name="linkedin" value="${esc(u.linkedin||'')}" placeholder="https://linkedin.com/in/…">
          </div>
          <span class="form-error" id="profileErr" style="display:none"></span>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </form>
      </div>
    </div>`;

  loadActivityTimeline();

  $('#profileEditForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled=true; btn.textContent='Saving…';
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const data = await api('/api/profile', { method:'PUT', body:JSON.stringify(body) });
      STATE.user = { ...STATE.user, ...data.user };
      localStorage.setItem('alumniUser', JSON.stringify(STATE.user));
      toast('Profile updated!','success');
      btn.textContent='Saved ✓';
      setTimeout(()=>{ btn.disabled=false; btn.textContent='Save Changes'; },2000);
    } catch(err) {
      const errEl = $('#profileErr'); if(errEl){errEl.textContent=err.message;errEl.style.display='block';}
      btn.disabled=false; btn.textContent='Save Changes';
    }
  };
}

async function loadActivityTimeline() {
  const el = $('#activityTimeline');
  if (!el) return;
  try {
    const data = await api('/api/activity');
    const items = data.items || [];
    if (!items.length) { el.innerHTML = emptyHTML('📋','No activity yet','Actions you take will appear here.'); return; }
    el.innerHTML = items.slice(0,8).map(a => `
      <div class="timeline-item">
        <div class="timeline-dot">${a.icon||'•'}</div>
        <div class="timeline-body">
          <p>${esc(a.text)}</p>
          <small>${fmtRelative(a.createdAt)}</small>
        </div>
      </div>`).join('');
  } catch(e) { el.innerHTML = emptyHTML('📋','No activity',''); }
}

// ---- Shared: Opportunities page (view/apply) --------------------------
async function pageOpportunities(page, isAuthor=false) {
  const canPost = STATE.user.role !== 'student';
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">Opportunities</h1>
        <p class="section-sub">Jobs, internships, workshops and referrals.</p>
      </div>
      ${canPost ? `<button class="btn btn-primary" onclick="openPostOpportunityModal()">+ Publish</button>` : ''}
    </div>
    <div class="filters">
      <input id="postQ" class="form-input" placeholder="Search opportunities…" style="flex:1">
      <select id="postType" class="form-select">
        <option value="">All types</option>
        <option value="job">Job</option>
        <option value="internship">Internship</option>
        <option value="workshop">Workshop</option>
        <option value="referral">Referral</option>
        <option value="scholarship">Scholarship</option>
      </select>
      <button class="btn btn-ghost" onclick="loadOpportunities()">Search</button>
    </div>
    <div id="postGrid" class="grid g-3">${loadingHTML()}</div>`;
  loadOpportunities();
}

async function loadOpportunities() {
  const q = $('#postQ')?.value||'';
  const type = $('#postType')?.value||'';
  const grid = $('#postGrid');
  if (!grid) return;
  grid.innerHTML = loadingHTML();
  try {
    const data = await api(`/api/posts?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`);
    const posts = data.posts || [];
    if (!posts.length) { grid.innerHTML = emptyHTML('💼','No opportunities found','Try changing your filters.'); return; }
    grid.innerHTML = posts.map(p => postCardHTML(p)).join('');
  } catch(e) { grid.innerHTML = errorHTML(e.message); }
}

function postCardHTML(p) {
  const canEdit = STATE.user.id === p.authorId || STATE.user.role === 'admin';
  const canApply = STATE.user.role === 'student';
  return `<div class="post-card">
    <div class="flex-between"><span class="pill ${esc(p.type)}">${esc(p.type)}</span>${p.deadline?`<span class="text-xs muted">Due ${esc(p.deadline)}</span>`:''}</div>
    <h3>${esc(p.title)}</h3>
    <div class="company">🏢 ${esc(p.company||'Not specified')}</div>
    <p>${esc((p.content||'').slice(0,120))}${p.content&&p.content.length>120?'…':''}</p>
    <div class="tags">${tagsHTML(p.tags)}</div>
    <div class="footer">
      <span class="text-xs muted">${fmtRelative(p.createdAt)}</span>
      <div style="display:flex;gap:6px">
        ${canApply ? `<button class="btn btn-primary btn-xs" onclick="applyToPost('${esc(p.id)}','${esc(p.title)}')">Apply</button>` : ''}
        ${canEdit ? `<button class="btn btn-ghost btn-xs" onclick="deletePost('${esc(p.id)}')">Delete</button>` : ''}
      </div>
    </div>
  </div>`;
}

async function applyToPost(postId, title) {
  openModal(`
    <h2>Apply to Opportunity</h2>
    <p class="subtitle">Applying for: <b>${esc(title)}</b></p>
    <form class="form" id="applyForm">
      <div class="form-group">
        <label class="form-label">Cover Note</label>
        <textarea class="form-textarea" name="note" placeholder="Briefly explain why you're a good fit…"></textarea>
      </div>
      <span class="form-error" id="applyErr" style="display:none"></span>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Submit Application</button>
      </div>
    </form>`);
  $('#applyForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled=true; btn.textContent='Submitting…';
    try {
      await api('/api/applications', { method:'POST', body:JSON.stringify({ postId, note: e.target.note.value }) });
      closeModal(); toast('Application submitted!','success');
    } catch(err) {
      const el=$('#applyErr');if(el){el.textContent=err.message;el.style.display='block';}
      btn.disabled=false;btn.textContent='Submit Application';
    }
  };
}

function openPostOpportunityModal() {
  openModal(`
    <h2>Publish Opportunity</h2>
    <p class="subtitle">Share a job, internship or workshop with students.</p>
    <form class="form" id="postForm">
      <div class="form-group">
        <label class="form-label">Title *</label>
        <input class="form-input" name="title" required placeholder="Software Engineer Intern">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" name="type">
            <option value="internship">Internship</option>
            <option value="job">Job</option>
            <option value="workshop">Workshop</option>
            <option value="referral">Referral</option>
            <option value="scholarship">Scholarship</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Company / Organizer</label>
          <input class="form-input" name="company" placeholder="Google">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description *</label>
        <textarea class="form-textarea" name="content" required placeholder="Role details, requirements…"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Tags (comma-separated)</label>
          <input class="form-input" name="tags" placeholder="Java, DSA, Python">
        </div>
        <div class="form-group">
          <label class="form-label">Deadline (optional)</label>
          <input class="form-input" type="date" name="deadline">
        </div>
      </div>
      <span class="form-error" id="postErr" style="display:none"></span>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Publish</button>
      </div>
    </form>`);
  $('#postForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled=true; btn.textContent='Publishing…';
    try {
      await api('/api/posts', { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(e.target))) });
      closeModal(); toast('Opportunity published!','success');
      if ($('#postGrid')) loadOpportunities();
    } catch(err) {
      const el=$('#postErr');if(el){el.textContent=err.message;el.style.display='block';}
      btn.disabled=false;btn.textContent='Publish';
    }
  };
}

async function deletePost(id) {
  confirm('Delete this opportunity? This cannot be undone.', async () => {
    try {
      await api('/api/posts/'+id, {method:'DELETE'});
      toast('Deleted','success');
      if ($('#postGrid')) loadOpportunities();
    } catch(e) { toast(e.message,'error'); }
  });
}

// ---- Shared: Events page -----------------------------------------------
async function pageEvents(page) {
  const canCreate = STATE.user.role !== 'student';
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">Events</h1>
        <p class="section-sub">Reunions, seminars and networking events.</p>
      </div>
      ${canCreate ? `<button class="btn btn-primary" onclick="openEventModal()">+ Create Event</button>` : ''}
    </div>
    <div class="page-tabs">
      <button class="page-tab active" data-tab="upcoming">Upcoming</button>
      <button class="page-tab" data-tab="past">Past</button>
    </div>
    <div id="eventsGrid" class="grid g-3">${loadingHTML()}</div>`;
  $$('.page-tab').forEach(t => t.onclick = () => {
    $$('.page-tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    loadEvents(t.dataset.tab);
  });
  loadEvents('upcoming');
}

async function loadEvents(tab='upcoming') {
  const grid = $('#eventsGrid');
  if (!grid) return;
  grid.innerHTML = loadingHTML();
  try {
    const data = await api('/api/events?tab='+tab);
    const events = data.events || [];
    if (!events.length) { grid.innerHTML = emptyHTML('🎉','No '+tab+' events','Check back later for new events.'); return; }
    grid.innerHTML = events.map(ev => eventCardHTML(ev)).join('');
  } catch(e) { grid.innerHTML = errorHTML(e.message); }
}

function eventCardHTML(ev) {
  const parts = String(ev.date||'').split('-');
  const day = parts[2]||'--';
  const mon = parts.length>=2 ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(parts[1],10)-1]||'' : '';
  const canManage = STATE.user.id===ev.hostId || STATE.user.role==='admin';
  return `<div class="event-card">
    <div class="datebox"><div class="day">${esc(day)}</div><div class="mon">${esc(mon)}</div></div>
    <div class="event-info" style="flex:1">
      <h3>${esc(ev.title)}</h3>
      <p>${esc(ev.description||'').slice(0,80)}${(ev.description||'').length>80?'…':''}</p>
      <div class="meta"><span>🕒 ${esc(ev.time||'TBA')}</span><span>📍 ${esc(ev.location||'Online')}</span><span>👥 Cap: ${esc(String(ev.capacity||0))}</span></div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn btn-primary btn-xs" onclick="rsvpEvent('${esc(ev.id)}')">RSVP</button>
        <button class="btn btn-ghost btn-xs" onclick="viewRsvpList('${esc(ev.id)}','${esc(ev.title)}')">View RSVPs</button>
        ${canManage?`<button class="btn btn-danger btn-xs" onclick="deleteEvent('${esc(ev.id)}')">Delete</button>`:''}
      </div>
    </div>
  </div>`;
}

async function rsvpEvent(eventId) {
  try {
    await api('/api/events/rsvp', { method:'POST', body:JSON.stringify({ eventId }) });
    toast('RSVP confirmed!','success');
  } catch(e) { toast(e.message,'error'); }
}

async function viewRsvpList(eventId, title) {
  openModal(`<h2>RSVPs — ${esc(title)}</h2><div id="rsvpListBody">${loadingHTML()}</div>`);
  try {
    const data = await api(`/api/events/${encodeURIComponent(eventId)}/rsvps`);
    const rsvps = data.rsvps || [];
    document.getElementById('rsvpListBody').innerHTML = rsvps.length
      ? rsvps.map(r => `<div class="person-row">${avatarDiv(r.name,r.role)}<div class="info"><h4>${esc(r.name)}</h4><p>${esc(r.department||'')}</p></div></div>`).join('')
      : emptyHTML('👥','No RSVPs yet','');
  } catch(e) { document.getElementById('rsvpListBody').innerHTML = errorHTML(e.message); }
}

function openEventModal() {
  openModal(`
    <h2>Create Event</h2>
    <form class="form" id="eventForm">
      <div class="form-group">
        <label class="form-label">Title *</label>
        <input class="form-input" name="title" required placeholder="Annual Alumni Meet">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Date *</label>
          <input class="form-input" type="date" name="date" required>
        </div>
        <div class="form-group">
          <label class="form-label">Time</label>
          <input class="form-input" type="time" name="time">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Location</label>
          <input class="form-input" name="location" placeholder="Campus Auditorium / Online">
        </div>
        <div class="form-group">
          <label class="form-label">Capacity</label>
          <input class="form-input" type="number" name="capacity" value="50" min="1">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" name="description"></textarea>
      </div>
      <span class="form-error" id="evErr" style="display:none"></span>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Event</button>
      </div>
    </form>`);
  $('#eventForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled=true; btn.textContent='Creating…';
    try {
      await api('/api/events', { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(e.target))) });
      closeModal(); toast('Event created!','success');
      if ($('#eventsGrid')) loadEvents('upcoming');
    } catch(err) {
      const el=$('#evErr');if(el){el.textContent=err.message;el.style.display='block';}
      btn.disabled=false;btn.textContent='Create Event';
    }
  };
}

async function deleteEvent(id) {
  confirm('Delete this event? This cannot be undone.', async () => {
    try { await api('/api/events/'+id,{method:'DELETE'}); toast('Deleted','success'); if($('#eventsGrid'))loadEvents('upcoming'); } catch(e){toast(e.message,'error');}
  });
}

// ---- Leaderboard (shared) ----------------------------------------------
async function pageLeaderboard(page) {
  page.innerHTML = `
    <h1 class="section-title">Mentor Leaderboard</h1>
    <p class="section-sub">Top mentors ranked by sessions, ratings and student feedback.</p>
    <div class="grid g-3-2 gap-16">
      <div class="card" id="lbList">${loadingHTML()}</div>
      <div class="card">
        <div class="card-header"><h3>Badge System</h3></div>
        ${[['🏆','Top Mentor','Most sessions & highest rating'],['⚡','Quick Responder','Responds within 24h'],['🌟','10 Sessions','Completed 10+ mentorship sessions'],['💎','Verified Expert','Verified by admin'],['🎯','Career Guide','Career roadmap expert']].map(([icon,name,desc])=>`
          <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:22px">${icon}</span>
            <div><div style="font-weight:600;font-size:13px">${name}</div><div class="text-xs muted">${desc}</div></div>
          </div>`).join('')}
      </div>
    </div>`;
  try {
    const data = await api('/api/leaderboard');
    const mentors = data.mentors || [];
    if (!mentors.length) { $('#lbList').innerHTML = emptyHTML('🏆','No leaderboard yet',''); return; }
    $('#lbList').innerHTML = `<div class="card-header"><h3>Top Mentors</h3></div>` +
      mentors.slice(0,10).map((m,i) => `
        <div class="lb-row">
          <div class="lb-rank ${i<3?'top':''}">${i<3?['🥇','🥈','🥉'][i]:i+1}</div>
          ${avatarDiv(m.name,'alumni')}
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px">${esc(m.name)}</div>
            <div class="text-xs muted">${esc(m.department||'')} · ${m.sessions||0} sessions</div>
            <div style="margin-top:4px">${(m.badges||[]).map(b=>`<span class="badge-chip">${b}</span>`).join(' ')}</div>
          </div>
          <div class="lb-points">⭐ ${(m.rating||0).toFixed(1)}</div>
        </div>`).join('');
  } catch(e) { $('#lbList').innerHTML = errorHTML(e.message); }
}

// ---- Boot ---------------------------------------------------------------
restoreSession();

