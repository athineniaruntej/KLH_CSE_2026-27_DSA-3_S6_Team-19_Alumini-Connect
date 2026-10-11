/* =========================================================
   Alumni Connect — Student Portal Views (views-student.js)
   ========================================================= */

async function routeStudent(view, page) {
  switch (view) {
    case 'dashboard':
      return renderStudentDashboard(page);
    case 'find-mentors':
      return renderFindMentors(page);
    case 'mentorship':
      return renderStudentMentorship(page);
    case 'sessions':
      return renderBookSession(page);
    case 'opportunities':
      return pageOpportunities(page);
    case 'applications':
      return renderMyApplications(page);
    case 'events':
      return pageEvents(page);
    case 'messages':
      return pageMessages(page);
    case 'leaderboard':
      return pageLeaderboard(page);
    case 'roadmap':
      return renderCareerRoadmap(page);
    case 'profile':
      return pageProfile(page);
    case 'notifications':
      return pageNotifications(page);
    default:
      return renderStudentDashboard(page);
  }
}

// ---- Student Dashboard ----------------------------------------------------
async function renderStudentDashboard(page) {
  page.innerHTML = `
    <div class="hero">
      <div class="hero-content">
        <h1>Welcome back, ${esc(STATE.user.name)} 🎓</h1>
        <p class="subtitle">Connect with alumni mentors, explore internships, and prepare for placement season.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" onclick="STATE.view='find-mentors'; renderShell(); loadView();">Find Mentors 🔍</button>
          <button class="btn btn-ghost" onclick="STATE.view='sessions'; renderShell(); loadView();">Book a Session 📅</button>
          <button class="btn btn-ghost" onclick="STATE.view='roadmap'; renderShell(); loadView();">Career Roadmap 🗺</button>
        </div>
      </div>
      <div class="hero-badge">
        <div class="tag">Student Portal</div>
        <div class="muted mt-4">${esc(STATE.user.department || 'CSE')} · Batch ${esc(STATE.user.batch || '2026')}</div>
      </div>
    </div>

    <div class="stats-grid" id="studentStats">${loadingHTML()}</div>

    <div class="grid g-3-2 gap-16 mt-16">
      <div>
        <div class="card mb-16">
          <div class="card-header">
            <h3>Upcoming 1:1 Sessions</h3>
            <button class="btn btn-ghost btn-xs" onclick="STATE.view='sessions'; renderShell(); loadView();">View All</button>
          </div>
          <div id="upcomingSessionsList">${loadingHTML()}</div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Smart Mentor Recommendations</h3>
            <span class="text-xs text-brand font-medium">DSA Jaccard + Levenshtein</span>
          </div>
          <div id="recommendedMentorsList">${loadingHTML()}</div>
        </div>
      </div>

      <div>
        <div class="card mb-16">
          <div class="card-header">
            <h3>Recent Campus Opportunities</h3>
            <button class="btn btn-ghost btn-xs" onclick="STATE.view='opportunities'; renderShell(); loadView();">Browse</button>
          </div>
          <div id="dashboardPostsList">${loadingHTML()}</div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Upcoming Events</h3>
            <button class="btn btn-ghost btn-xs" onclick="STATE.view='events'; renderShell(); loadView();">All Events</button>
          </div>
          <div id="dashboardEventsList">${loadingHTML()}</div>
        </div>
      </div>
    </div>`;

  try {
    const data = await api('/api/dashboard');
    const s = data.stats || {};

    $('#studentStats').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">🤝</div>
        <div class="stat-value">${s.activeMentors || 0}</div>
        <div class="stat-label">Active Mentors</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📬</div>
        <div class="stat-value">${s.pendingRequests || 0}</div>
        <div class="stat-label">Pending Requests</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-value">${s.upcomingSessions || 0}</div>
        <div class="stat-label">Upcoming Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📄</div>
        <div class="stat-value">${s.applications || 0}</div>
        <div class="stat-label">Applications</div>
      </div>`;

    // Upcoming sessions
    const sess = data.upcomingSessions || [];
    if (!sess.length) {
      $('#upcomingSessionsList').innerHTML = emptyHTML('📅', 'No upcoming sessions', 'Book a 1:1 session with your mentors.',
        `<button class="btn btn-primary btn-sm mt-8" onclick="STATE.view='sessions'; renderShell(); loadView();">Book Session</button>`);
    } else {
      $('#upcomingSessionsList').innerHTML = sess.map(s => `
        <div class="session-item">
          <div class="session-datebox"><div class="day">${fmtDate(s.date).slice(0, 6)}</div><div class="time">${esc(s.time)}</div></div>
          <div class="session-info">
            <h4>${esc(s.topic)}</h4>
            <div class="meta">With <b>${esc(s.mentor ? s.mentor.name : 'Mentor')}</b> · ${esc(s.mode)}</div>
            ${s.meetingLink ? `<a href="${esc(s.meetingLink)}" target="_blank" class="session-link mt-4" style="display:inline-block">🔗 Join Meeting</a>` : ''}
          </div>
          <span class="pill ${esc(s.status)}">${esc(s.status)}</span>
        </div>`).join('');
    }

    // Recommended mentors
    const recs = data.recommendedMentors || [];
    if (!recs.length) {
      $('#recommendedMentorsList').innerHTML = emptyHTML('🔍', 'No matches found', 'Update your skills to get tailored suggestions.');
    } else {
      $('#recommendedMentorsList').innerHTML = recs.map(r => `
        <div class="match-item">
          ${avatarDiv(r.mentor.name, 'alumni')}
          <div class="match-info">
            <div class="match-name">${esc(r.mentor.name)}</div>
            <div class="match-meta">${esc(r.mentor.department || '')} · ${esc(r.mentor.company || r.mentor.industry || '')}</div>
            <div class="match-reasons">${(r.reasons || []).map(re => `<span>✓ ${esc(re)}</span>`).join('')}</div>
          </div>
          <div class="text-right">
            <div class="match-score">${r.matchPercentage}% Match</div>
            <button class="btn btn-primary btn-xs mt-4" onclick="openMentorRequest('${esc(r.mentor.id)}', '${esc(r.mentor.name)}')">Request</button>
          </div>
        </div>`).join('');
    }

    // Recent opportunities
    const posts = data.recentOpportunities || [];
    $('#dashboardPostsList').innerHTML = posts.length
      ? posts.map(p => `
        <div class="mini-post">
          <div class="flex-between"><span class="pill ${esc(p.type)}">${esc(p.type)}</span><small class="muted">${fmtRelative(p.createdAt)}</small></div>
          <h4 style="margin:4px 0 2px">${esc(p.title)}</h4>
          <div class="text-xs muted">${esc(p.company || '')}</div>
        </div>`).join('')
      : emptyHTML('💼', 'No opportunities yet', '');

    // Upcoming events
    const evs = data.upcomingEvents || [];
    $('#dashboardEventsList').innerHTML = evs.length
      ? evs.map(e => `
        <div class="mini-event">
          <div class="date-badge">${esc(e.date)}</div>
          <div>
            <h4 style="margin:0">${esc(e.title)}</h4>
            <div class="text-xs muted">📍 ${esc(e.location || 'Online')} · 🕒 ${esc(e.time || 'TBA')}</div>
          </div>
        </div>`).join('')
      : emptyHTML('🎉', 'No upcoming events', '');

  } catch (e) {
    $('#studentStats').innerHTML = errorHTML(e.message);
  }
}

// ---- Find Mentors ---------------------------------------------------------
async function renderFindMentors(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">Find Alumni Mentors</h1>
        <p class="section-sub">Search our alumni network with typo-tolerant matching or use Smart DSA Match.</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" id="smartMatchToggle">Smart Match (AI/DSA)</button>
        <button class="btn btn-ghost" id="allMentorsToggle">All Mentors</button>
      </div>
    </div>

    <div class="filters">
      <input id="mentorSearch" class="form-input" placeholder="Search mentors, skills ('jva', 'pythn'), company, department…" style="flex:2">
      <select id="deptFilter" class="form-select">
        <option value="">All Departments</option>
        <option value="CSE">CSE</option>
        <option value="ECE">ECE</option>
        <option value="IT">IT</option>
        <option value="Mechanical">Mechanical</option>
        <option value="Civil">Civil</option>
        <option value="Electrical">Electrical</option>
      </select>
      <button class="btn btn-primary" onclick="loadMentorsGrid()">Search</button>
    </div>

    <div id="mentorsGrid" class="grid g-3 mt-16">${loadingHTML('Finding mentors…')}</div>`;

  let mode = 'smart';
  $('#smartMatchToggle').onclick = () => { mode = 'smart'; $('#smartMatchToggle').className = 'btn btn-primary'; $('#allMentorsToggle').className = 'btn btn-ghost'; loadMentorsGrid(); };
  $('#allMentorsToggle').onclick = () => { mode = 'all'; $('#allMentorsToggle').className = 'btn btn-primary'; $('#smartMatchToggle').className = 'btn btn-ghost'; loadMentorsGrid(); };

  window.loadMentorsGrid = async function() {
    const grid = $('#mentorsGrid');
    if (!grid) return;
    grid.innerHTML = loadingHTML();
    const q = $('#mentorSearch')?.value || '';
    const dept = $('#deptFilter')?.value || '';

    try {
      if (mode === 'smart' && !q) {
        const data = await api('/api/match');
        const list = data.results || [];
        if (!list.length) { grid.innerHTML = emptyHTML('🔍', 'No mentors found', 'Try adjusting your search criteria.'); return; }
        grid.innerHTML = list.map(item => mentorCardHTML(item.mentor, item.matchPercentage, item.reasons)).join('');
      } else {
        const url = `/api/alumni?q=${encodeURIComponent(q)}&department=${encodeURIComponent(dept)}&limit=30`;
        const data = await api(url);
        const list = data.results || [];
        if (!list.length) { grid.innerHTML = emptyHTML('🔍', 'No mentors found', 'Try another search term.'); return; }
        grid.innerHTML = list.map(u => mentorCardHTML(u)).join('');
      }
    } catch (e) {
      grid.innerHTML = errorHTML(e.message);
    }
  };

  loadMentorsGrid();
}

function mentorCardHTML(u, matchPct, reasons) {
  return `
    <div class="mentor-card">
      <div class="flex-between">
        ${avatarDiv(u.name, 'alumni', 'lg')}
        ${matchPct ? `<span class="badge-chip" style="background:var(--forest-100);color:var(--forest);font-weight:700">★ ${matchPct}% Match</span>` : (u.verified ? '<span class="pill accepted">✓ Verified</span>' : '')}
      </div>
      <h3 style="margin:12px 0 2px">${esc(u.name)}</h3>
      <div class="company">${esc(u.company || u.industry || 'Tech Professional')} · ${esc(u.department || 'CSE')}</div>
      <p class="bio">${esc((u.bio || 'Passionate about mentoring students and sharing industry experience.').slice(0, 100))}…</p>
      ${reasons && reasons.length ? `<div class="match-reasons-box mb-8">${reasons.slice(0, 2).map(r => `<div>✓ ${esc(r)}</div>`).join('')}</div>` : ''}
      <div class="tags mb-12">${tagsHTML(u.skills)}</div>
      <div class="footer flex-between">
        <button class="btn btn-ghost btn-xs" onclick="openProfileModal('${esc(u.id)}')">Profile</button>
        <button class="btn btn-primary btn-xs" onclick="openMentorRequest('${esc(u.id)}', '${esc(u.name)}')">Request Mentorship</button>
      </div>
    </div>`;
}

// ---- My Mentorship (Student) ----------------------------------------------
async function renderStudentMentorship(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">My Mentorship</h1>
        <p class="section-sub">Track active mentorships, incoming responses, and past sessions.</p>
      </div>
      <button class="btn btn-primary" onclick="STATE.view='find-mentors'; renderShell(); loadView();">+ Find New Mentor</button>
    </div>

    <div class="page-tabs">
      <button class="page-tab active" data-stab="all">All</button>
      <button class="page-tab" data-stab="accepted">Active</button>
      <button class="page-tab" data-stab="pending">Pending</button>
      <button class="page-tab" data-stab="completed">Completed</button>
    </div>

    <div id="studentMentorshipList" class="card mt-16">${loadingHTML()}</div>`;

  let currentTab = 'all';
  $$('[data-stab]').forEach(tab => tab.onclick = () => {
    $$('[data-stab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.stab;
    loadStudentMentorshipList(currentTab);
  });

  loadStudentMentorshipList('all');
}

async function loadStudentMentorshipList(tab = 'all') {
  const container = $('#studentMentorshipList');
  if (!container) return;
  container.innerHTML = loadingHTML();

  try {
    const data = await api('/api/mentorship');
    let reqs = (data.requests || []).filter(r => r.studentId === STATE.user.id);
    if (tab !== 'all') reqs = reqs.filter(r => r.status === tab);

    if (!reqs.length) {
      container.innerHTML = emptyHTML('🤝', 'No mentorship records', 'Browse mentors and send a request to get started.',
        `<button class="btn btn-primary btn-sm mt-12" onclick="STATE.view='find-mentors'; renderShell(); loadView();">Find Mentors</button>`);
      return;
    }

    container.innerHTML = reqs.map(r => `
      <div class="mentorship-row">
        ${avatarDiv(r.alumni ? r.alumni.name : 'Mentor', 'alumni')}
        <div style="flex:1">
          <div class="flex-between">
            <h4 style="margin:0">${esc(r.alumni ? r.alumni.name : 'Mentor')}</h4>
            <span class="pill ${esc(r.status)}">${esc(r.status)}</span>
          </div>
          <div class="text-sm muted mt-4"><b>Topic:</b> ${esc(r.topic)}</div>
          <div class="text-xs muted mt-2">Requested ${fmtRelative(r.createdAt)}</div>
        </div>
        <div class="row-actions">
          ${r.status === 'accepted' ? `
            <button class="btn btn-primary btn-xs" onclick="openBookSessionModal('${esc(r.alumniId)}', '${esc(r.alumni ? r.alumni.name : '')}')">Book Session</button>
            <button class="btn btn-ghost btn-xs" onclick="openThread('${esc(r.alumniId)}', '${esc(r.alumni ? r.alumni.name : '')}'); STATE.view='messages'; renderShell(); loadView();">Message</button>
            <button class="btn btn-ghost btn-xs" onclick="markMentorshipCompleted('${esc(r.id)}')">Complete</button>` : ''}
          ${r.status === 'completed' ? `
            <button class="btn btn-primary btn-xs" onclick="openReviewModal('${esc(r.alumniId)}', '${esc(r.alumni ? r.alumni.name : '')}')">Leave Review ⭐</button>` : ''}
        </div>
      </div>`).join('');
  } catch (e) {
    container.innerHTML = errorHTML(e.message);
  }
}

async function markMentorshipCompleted(id) {
  confirm('Mark this mentorship as completed?', async () => {
    try {
      await api('/api/mentorship/' + id, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
      toast('Mentorship marked completed! You can now leave a review.', 'success');
      loadStudentMentorshipList();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// ---- Book a Session -------------------------------------------------------
async function renderBookSession(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">1:1 Mentorship Sessions</h1>
        <p class="section-sub">Schedule video calls and mock interviews with your accepted mentors.</p>
      </div>
      <button class="btn btn-primary" onclick="openBookSessionModal()">+ Schedule New Session</button>
    </div>

    <div class="grid g-3-2 gap-16">
      <div class="card">
        <div class="card-header"><h3>Your Scheduled Sessions</h3></div>
        <div id="studentSessionsList">${loadingHTML()}</div>
      </div>

      <div class="card">
        <div class="card-header"><h3>How Sessions Work</h3></div>
        <div class="guide-box">
          <div class="guide-step">
            <div class="step-num">1</div>
            <div><b>Select Mentor</b><p class="text-xs muted">Choose from your accepted mentors.</p></div>
          </div>
          <div class="guide-step">
            <div class="step-num">2</div>
            <div><b>Pick Date & Time</b><p class="text-xs muted">Select a slot aligned with their weekly availability.</p></div>
          </div>
          <div class="guide-step">
            <div class="step-num">3</div>
            <div><b>Meet & Learn</b><p class="text-xs muted">Join via Google Meet link and take notes.</p></div>
          </div>
          <div class="guide-step">
            <div class="step-num">4</div>
            <div><b>Review & Rate</b><p class="text-xs muted">Leave star feedback to celebrate your mentor.</p></div>
          </div>
        </div>
      </div>
    </div>`;

  loadStudentSessionsList();
}

async function loadStudentSessionsList() {
  const container = $('#studentSessionsList');
  if (!container) return;
  container.innerHTML = loadingHTML();

  try {
    const data = await api('/api/sessions');
    const sessions = data.sessions || [];
    if (!sessions.length) {
      container.innerHTML = emptyHTML('📅', 'No sessions scheduled', 'Schedule a 1:1 call with your mentor.');
      return;
    }

    container.innerHTML = sessions.map(s => `
      <div class="session-card-full mb-12">
        <div class="flex-between">
          <span class="pill ${esc(s.status)}">${esc(s.status)}</span>
          <span class="text-xs muted">${fmtDate(s.date)} at ${esc(s.time)}</span>
        </div>
        <h3 style="margin:8px 0 4px">${esc(s.topic)}</h3>
        <div class="company mb-8">With <b>${esc(s.mentor ? s.mentor.name : 'Mentor')}</b> (${esc(s.mode)})</div>
        ${s.notes ? `<p class="text-sm muted mb-8">${esc(s.notes)}</p>` : ''}
        <div class="footer flex-between">
          ${s.meetingLink ? `<a href="${esc(s.meetingLink)}" target="_blank" class="session-link">🔗 Join Session</a>` : '<span></span>'}
          <div style="display:flex;gap:6px">
            ${s.status === 'scheduled' ? `<button class="btn btn-ghost btn-xs" onclick="cancelSession('${esc(s.id)}')">Cancel</button>` : ''}
            ${s.status === 'completed' ? `<button class="btn btn-primary btn-xs" onclick="openReviewModal('${esc(s.mentorId)}', '${esc(s.mentor ? s.mentor.name : '')}')">Review ⭐</button>` : ''}
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    container.innerHTML = errorHTML(e.message);
  }
}

async function openBookSessionModal(preselectedMentorId = '', preselectedName = '') {
  openModal(`
    <h2>Book 1:1 Session</h2>
    <p class="subtitle">Set up a session with your mentor.</p>
    <form class="form" id="bookSessionForm">
      <div class="form-group">
        <label class="form-label">Select Mentor *</label>
        <select class="form-select" name="mentorId" id="bsMentorSelect" required>
          <option value="">Loading mentors…</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Session Topic / Goal *</label>
        <input class="form-input" name="topic" placeholder="e.g. Resume Review, Mock DSA Interview, System Design" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Date *</label>
          <input class="form-input" type="date" name="date" required min="${new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label class="form-label">Time *</label>
          <input class="form-input" type="time" name="time" value="18:00" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Meeting Mode</label>
          <select class="form-select" name="mode">
            <option value="Online (Google Meet)">Online (Google Meet)</option>
            <option value="Campus In-Person">Campus In-Person</option>
            <option value="Phone Call">Phone Call</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Meeting Link / Location</label>
          <input class="form-input" name="meetingLink" placeholder="https://meet.google.com/…">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes for Mentor</label>
        <textarea class="form-textarea" name="notes" placeholder="Specific questions you'd like to ask…"></textarea>
      </div>
      <span class="form-error" id="bsErr" style="display:none"></span>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Schedule Session</button>
      </div>
    </form>`);

  // Populate accepted mentors
  try {
    const data = await api('/api/mentorship');
    const accepted = (data.requests || []).filter(r => r.studentId === STATE.user.id && (r.status === 'accepted' || r.status === 'in-progress'));
    const sel = $('#bsMentorSelect');
    if (!sel) return;
    if (!accepted.length) {
      sel.innerHTML = '<option value="">No accepted mentors yet</option>';
    } else {
      sel.innerHTML = accepted.map(r => `
        <option value="${esc(r.alumniId)}" ${r.alumniId === preselectedMentorId ? 'selected' : ''}>
          ${esc(r.alumni ? r.alumni.name : 'Mentor')} (${esc(r.topic)})
        </option>`).join('');
    }
  } catch (e) {}

  $('#bookSessionForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Scheduling…';
    try {
      const body = Object.fromEntries(new FormData(e.target));
      await api('/api/sessions', { method: 'POST', body: JSON.stringify(body) });
      closeModal();
      toast('Session scheduled successfully!', 'success');
      loadStudentSessionsList();
    } catch (err) {
      const el = $('#bsErr'); if (el) { el.textContent = err.message; el.style.display = 'block'; }
      btn.disabled = false; btn.textContent = 'Schedule Session';
    }
  };
}

async function cancelSession(id) {
  confirm('Cancel this session?', async () => {
    try {
      await api('/api/sessions/' + id, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
      toast('Session cancelled', 'success');
      loadStudentSessionsList();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// ---- My Applications ------------------------------------------------------
async function renderMyApplications(page) {
  page.innerHTML = `
    <h1 class="section-title">My Applications</h1>
    <p class="section-sub">Track the status of your submitted job, internship, and workshop applications.</p>
    <div class="card mt-16" id="myAppsList">${loadingHTML()}</div>`;

  try {
    const data = await api('/api/applications/my');
    const apps = data.applications || [];
    if (!apps.length) {
      $('#myAppsList').innerHTML = emptyHTML('📄', 'No applications submitted', 'Explore open campus opportunities and apply.',
        `<button class="btn btn-primary btn-sm mt-12" onclick="STATE.view='opportunities'; renderShell(); loadView();">Browse Opportunities</button>`);
      return;
    }

    $('#myAppsList').innerHTML = apps.map(a => `
      <div class="app-item">
        <div style="flex:1">
          <div class="flex-between">
            <h3 style="margin:0">${esc(a.postTitle)}</h3>
            <span class="pill ${esc(a.status)}">${esc(a.status)}</span>
          </div>
          <div class="company mt-4">🏢 ${esc(a.company || 'Campus Company')}</div>
          ${a.note ? `<p class="text-sm muted mt-4"><b>Note:</b> ${esc(a.note)}</p>` : ''}
          <div class="text-xs muted mt-4">Applied ${fmtRelative(a.createdAt)}</div>
        </div>
      </div>`).join('');
  } catch (e) {
    $('#myAppsList').innerHTML = errorHTML(e.message);
  }
}

// ---- Career Roadmap -------------------------------------------------------
async function renderCareerRoadmap(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">Career Roadmap Generator</h1>
        <p class="section-sub">Select your target engineering role to view recommended steps, skills, mentors, and jobs.</p>
      </div>
      <div class="roadmap-selector">
        <select class="form-select" id="roadmapSelect">
          <option value="backend">Backend Engineer</option>
          <option value="frontend">Full-Stack & Frontend</option>
          <option value="ai">Data Science & AI</option>
          <option value="cloud">Cloud & DevOps</option>
        </select>
      </div>
    </div>

    <div id="roadmapContent">${loadingHTML()}</div>`;

  $('#roadmapSelect').onchange = e => loadRoadmap(e.target.value);
  loadRoadmap('backend');
}

async function loadRoadmap(goal) {
  const container = $('#roadmapContent');
  if (!container) return;
  container.innerHTML = loadingHTML();

  try {
    const data = await api('/api/roadmap?goal=' + encodeURIComponent(goal));
    container.innerHTML = `
      <div class="card mb-16" style="background:var(--forest-100);border-color:var(--forest)">
        <h2 style="font:700 24px 'Playfair Display';color:var(--forest);margin:0 0 4px">${esc(data.title)}</h2>
        <p class="muted text-sm">${esc(data.description)}</p>
        <div class="tags mt-8">${tagsHTML(data.skills.join(', '))}</div>
      </div>

      <div class="grid g-3-2 gap-16">
        <div>
          <div class="card mb-16">
            <div class="card-header"><h3>Milestones & Timeline</h3></div>
            <div class="roadmap-timeline">
              ${(data.milestones || []).map(m => `
                <div class="milestone-item">
                  <div class="milestone-badge">${m.step}</div>
                  <div class="milestone-body">
                    <div class="flex-between">
                      <h4 style="margin:0">${esc(m.title)}</h4>
                      <span class="text-xs muted font-mono">${esc(m.duration)}</span>
                    </div>
                    <ul class="milestone-topics mt-4">
                      ${(m.topics || []).map(t => `<li>${esc(t)}</li>`).join('')}
                    </ul>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </div>

        <div>
          <div class="card mb-16">
            <div class="card-header"><h3>Recommended Mentors in Domain</h3></div>
            <div>
              ${(data.matchingMentors || []).length
                ? (data.matchingMentors || []).map(m => `
                  <div class="person-row">
                    ${avatarDiv(m.name, 'alumni')}
                    <div class="info">
                      <h4>${esc(m.name)}</h4>
                      <p>${esc(m.company || m.industry || '')} · ${esc(m.department || '')}</p>
                    </div>
                    <button class="btn btn-primary btn-xs" onclick="openMentorRequest('${esc(m.id)}', '${esc(m.name)}')">Request</button>
                  </div>`).join('')
                : emptyHTML('👥', 'No domain mentors found', '')}
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3>Relevant Opportunities</h3></div>
            <div>
              ${(data.matchingOpportunities || []).length
                ? (data.matchingOpportunities || []).map(p => `
                  <div class="mini-post">
                    <div class="flex-between"><span class="pill ${esc(p.type)}">${esc(p.type)}</span><small class="muted">${esc(p.company || '')}</small></div>
                    <h4 style="margin:4px 0">${esc(p.title)}</h4>
                    <button class="btn btn-primary btn-xs mt-4" onclick="applyToPost('${esc(p.id)}', '${esc(p.title)}')">Apply</button>
                  </div>`).join('')
                : emptyHTML('💼', 'No active openings in this domain', '')}
            </div>
          </div>
        </div>
      </div>`;
  } catch (e) {
    container.innerHTML = errorHTML(e.message);
  }
}

// ---- Review Modal (Student) ----------------------------------------------
function openReviewModal(mentorId, mentorName) {
  openModal(`
    <h2>Review Your Mentor</h2>
    <p class="subtitle">Leave feedback for <b>${esc(mentorName || 'your mentor')}</b>.</p>
    <form class="form" id="reviewForm">
      <div class="form-group">
        <label class="form-label">Rating (1 to 5 Stars)</label>
        <select class="form-select" name="rating" required>
          <option value="5">⭐⭐⭐⭐⭐ 5 - Exceptional Guidance</option>
          <option value="4">⭐⭐⭐⭐ 4 - Very Helpful</option>
          <option value="3">⭐⭐⭐ 3 - Good Session</option>
          <option value="2">⭐⭐ 2 - Average</option>
          <option value="1">⭐ 1 - Needs Improvement</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Review / Feedback *</label>
        <textarea class="form-textarea" name="comment" required placeholder="Share what was helpful about the session…"></textarea>
      </div>
      <span class="form-error" id="revErr" style="display:none"></span>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Submit Review</button>
      </div>
    </form>`);

  $('#reviewForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      await api('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          mentorId,
          rating: e.target.rating.value,
          comment: e.target.comment.value
        })
      });
      closeModal();
      toast('Review submitted! Thank you.', 'success');
    } catch (err) {
      const el = $('#revErr'); if (el) { el.textContent = err.message; el.style.display = 'block'; }
      btn.disabled = false; btn.textContent = 'Submit Review';
    }
  };
}
