/* =========================================================
   Alumni Connect — Mentor Portal Views (views-mentor.js)
   ========================================================= */

async function routeMentor(view, page) {
  switch (view) {
    case 'dashboard':
      return renderMentorDashboard(page);
    case 'requests':
      return renderMentorRequests(page);
    case 'mentees':
      return renderMyMentees(page);
    case 'mentor-sessions':
      return renderMentorSessions(page);
    case 'availability':
      return renderMentorAvailability(page);
    case 'opportunities':
      return renderMentorOpportunities(page);
    case 'referrals':
      return renderMentorReferrals(page);
    case 'events':
      return pageEvents(page);
    case 'messages':
      return pageMessages(page);
    case 'reviews':
      return renderMentorReviews(page);
    case 'profile':
      return pageProfile(page);
    default:
      return renderMentorDashboard(page);
  }
}

// ---- Mentor Dashboard -----------------------------------------------------
async function renderMentorDashboard(page) {
  page.innerHTML = `
    <div class="hero">
      <div class="hero-content">
        <h1>Welcome, Mentor ${esc(STATE.user.name)} 🧑‍🏫</h1>
        <p class="subtitle">Guide aspiring students, review mentorship requests, schedule 1:1 sessions, and post opportunities.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" onclick="STATE.view='requests'; renderShell(); loadView();">Review Requests 📬</button>
          <button class="btn btn-ghost" onclick="STATE.view='mentor-sessions'; renderShell(); loadView();">Schedule Session 📅</button>
          <button class="btn btn-ghost" onclick="STATE.view='opportunities'; renderShell(); loadView();">Post Opportunity 💼</button>
        </div>
      </div>
      <div class="hero-badge">
        <div class="tag">Mentor Portal</div>
        <div class="muted mt-4">${esc(STATE.user.company || STATE.user.industry || 'Technology')} · Batch ${esc(STATE.user.batch || 'Alumni')}</div>
      </div>
    </div>

    <div class="stats-grid" id="mentorStats">${loadingHTML()}</div>

    <div class="grid g-3-2 gap-16 mt-16">
      <div>
        <div class="card mb-16">
          <div class="card-header">
            <h3>New Mentorship Requests</h3>
            <button class="btn btn-ghost btn-xs" onclick="STATE.view='requests'; renderShell(); loadView();">View All</button>
          </div>
          <div id="newRequestsList">${loadingHTML()}</div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Active Mentees Progress Snapshot</h3>
            <button class="btn btn-ghost btn-xs" onclick="STATE.view='mentees'; renderShell(); loadView();">My Mentees</button>
          </div>
          <div id="menteeSnapshotList">${loadingHTML()}</div>
        </div>
      </div>

      <div>
        <div class="card mb-16">
          <div class="card-header">
            <h3>Upcoming 1:1 Sessions</h3>
            <button class="btn btn-ghost btn-xs" onclick="STATE.view='mentor-sessions'; renderShell(); loadView();">All Sessions</button>
          </div>
          <div id="mentorUpcomingSessions">${loadingHTML()}</div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Quick Actions</h3>
          </div>
          <div class="quick-actions-box">
            <button class="btn btn-ghost w-full text-left mb-8" onclick="STATE.view='availability'; renderShell(); loadView();">🕒 Set Weekly Availability & Capacity</button>
            <button class="btn btn-ghost w-full text-left mb-8" onclick="STATE.view='referrals'; renderShell(); loadView();">🔗 Refer a Mentee for a Job</button>
            <button class="btn btn-ghost w-full text-left mb-8" onclick="openEventModal()">🎉 Host an Alumni Webinar / Meet</button>
            <button class="btn btn-ghost w-full text-left" onclick="STATE.view='reviews'; renderShell(); loadView();">⭐ View Feedback & Badges</button>
          </div>
        </div>
      </div>
    </div>`;

  try {
    const data = await api('/api/dashboard');
    const s = data.stats || {};

    $('#mentorStats').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">📬</div>
        <div class="stat-value">${s.pendingRequests || 0}</div>
        <div class="stat-label">Pending Requests</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-value">${s.activeMentees || 0}</div>
        <div class="stat-label">Active Mentees</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-value">${s.sessionsThisWeek || 0}</div>
        <div class="stat-label">Sessions This Week</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💼</div>
        <div class="stat-value">${s.postsPublished || 0}</div>
        <div class="stat-label">Opportunities Published</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👁</div>
        <div class="stat-value">${s.profileViews || 42}</div>
        <div class="stat-label">Profile Views</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⭐</div>
        <div class="stat-value">${(s.avgRating || 5.0).toFixed(1)}</div>
        <div class="stat-label">Average Rating</div>
      </div>`;

    // Newest requests
    const reqs = data.newestRequests || [];
    if (!reqs.length) {
      $('#newRequestsList').innerHTML = emptyHTML('📬', 'No pending requests', 'You are all caught up with mentorship requests.');
    } else {
      $('#newRequestsList').innerHTML = reqs.map(r => `
        <div class="mentorship-row">
          ${avatarDiv(r.student ? r.student.name : 'Student', 'student')}
          <div style="flex:1">
            <div class="flex-between">
              <h4 style="margin:0">${esc(r.student ? r.student.name : 'Student')}</h4>
              <span class="pill pending">pending</span>
            </div>
            <div class="text-sm muted mt-2"><b>Goal:</b> ${esc(r.topic)}</div>
            <div class="text-xs muted mt-2">${esc(r.student ? r.student.department : '')} · Batch ${esc(r.student ? r.student.batch : '')}</div>
          </div>
          <div class="row-actions">
            <button class="btn btn-primary btn-xs" onclick="handleMentorReq('${esc(r.id)}', 'accepted')">Accept</button>
            <button class="btn btn-danger btn-xs" onclick="handleMentorReq('${esc(r.id)}', 'rejected')">Reject</button>
          </div>
        </div>`).join('');
    }

    // Active mentees snapshot
    const mentees = data.menteeProgress || [];
    if (!mentees.length) {
      $('#menteeSnapshotList').innerHTML = emptyHTML('👥', 'No active mentees yet', 'Accept pending requests to begin mentoring.');
    } else {
      $('#menteeSnapshotList').innerHTML = mentees.slice(0, 4).map(m => `
        <div class="person-row">
          ${avatarDiv(m.name, 'student')}
          <div class="info" style="flex:1">
            <div class="flex-between">
              <h4 style="margin:0">${esc(m.name)}</h4>
              <span class="text-xs muted">${m.sessionsCount} session(s)</span>
            </div>
            <p style="margin:2px 0 0">${esc(m.topic)}</p>
            <small class="muted">Notes: ${esc(m.notes || 'In progress')}</small>
          </div>
          <button class="btn btn-ghost btn-xs" onclick="openScheduleSessionModal('${esc(m.id)}', '${esc(m.name)}')">Schedule</button>
        </div>`).join('');
    }

    // Upcoming sessions
    const sess = data.upcomingSessions || [];
    if (!sess.length) {
      $('#mentorUpcomingSessions').innerHTML = emptyHTML('📅', 'No sessions this week', 'Schedule a 1:1 call with your mentees.');
    } else {
      $('#mentorUpcomingSessions').innerHTML = sess.map(s => `
        <div class="session-item">
          <div class="session-datebox"><div class="day">${fmtDate(s.date).slice(0, 6)}</div><div class="time">${esc(s.time)}</div></div>
          <div class="session-info">
            <h4>${esc(s.topic)}</h4>
            <div class="meta">Mentee: <b>${esc(s.student ? s.student.name : 'Student')}</b> (${esc(s.mode)})</div>
            ${s.meetingLink ? `<a href="${esc(s.meetingLink)}" target="_blank" class="session-link mt-4" style="display:inline-block">🔗 Start Call</a>` : ''}
          </div>
          <div class="row-actions">
            <button class="btn btn-ghost btn-xs" onclick="markSessionDone('${esc(s.id)}')">Complete ✓</button>
          </div>
        </div>`).join('');
    }

  } catch (e) {
    $('#mentorStats').innerHTML = errorHTML(e.message);
  }
}

async function handleMentorReq(id, status) {
  try {
    await api('/api/mentorship/' + id, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(`Request ${status}!`, 'success');
    renderMentorDashboard($('#page'));
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function markSessionDone(id) {
  try {
    await api('/api/sessions/' + id, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) });
    toast('Session marked completed!', 'success');
    loadMentorSessions();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---- Mentorship Requests --------------------------------------------------
async function renderMentorRequests(page) {
  page.innerHTML = `
    <h1 class="section-title">Mentorship Requests</h1>
    <p class="section-sub">Incoming guidance requests from students with topics and background.</p>

    <div class="page-tabs mt-16">
      <button class="page-tab active" data-reqtab="all">All</button>
      <button class="page-tab" data-reqtab="pending">Pending</button>
      <button class="page-tab" data-reqtab="accepted">Accepted</button>
      <button class="page-tab" data-reqtab="rejected">Rejected</button>
    </div>

    <div class="card mt-16" id="mentorRequestsList">${loadingHTML()}</div>`;

  let currentTab = 'all';
  $$('[data-reqtab]').forEach(tab => tab.onclick = () => {
    $$('[data-reqtab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.reqtab;
    loadMentorRequestsList(currentTab);
  });

  loadMentorRequestsList('all');
}

async function loadMentorRequestsList(tab = 'all') {
  const container = $('#mentorRequestsList');
  if (!container) return;
  container.innerHTML = loadingHTML();

  try {
    const data = await api('/api/mentorship');
    let reqs = (data.requests || []).filter(r => r.alumniId === STATE.user.id);
    if (tab !== 'all') reqs = reqs.filter(r => r.status === tab);

    if (!reqs.length) {
      container.innerHTML = emptyHTML('📬', 'No requests found', `No ${tab === 'all' ? '' : tab} mentorship requests.`);
      return;
    }

    container.innerHTML = reqs.map(r => `
      <div class="mentorship-row">
        ${avatarDiv(r.student ? r.student.name : 'Student', 'student')}
        <div style="flex:1">
          <div class="flex-between">
            <h4 style="margin:0">${esc(r.student ? r.student.name : 'Student')}</h4>
            <span class="pill ${esc(r.status)}">${esc(r.status)}</span>
          </div>
          <div class="text-sm muted mt-4"><b>Topic:</b> ${esc(r.topic)}</div>
          <div class="text-xs muted mt-2">
            ${esc(r.student ? r.student.department : '')} · Batch ${esc(r.student ? r.student.batch : '')} · Requested ${fmtRelative(r.createdAt)}
          </div>
        </div>
        <div class="row-actions">
          ${r.status === 'pending' ? `
            <button class="btn btn-primary btn-xs" onclick="handleMentorReq('${esc(r.id)}', 'accepted'); loadMentorRequestsList('${tab}');">Accept</button>
            <button class="btn btn-danger btn-xs" onclick="handleMentorReq('${esc(r.id)}', 'rejected'); loadMentorRequestsList('${tab}');">Reject</button>` : ''}
          ${r.status === 'accepted' ? `
            <button class="btn btn-primary btn-xs" onclick="openScheduleSessionModal('${esc(r.studentId)}', '${esc(r.student ? r.student.name : '')}')">Schedule Call</button>
            <button class="btn btn-ghost btn-xs" onclick="openThread('${esc(r.studentId)}', '${esc(r.student ? r.student.name : '')}'); STATE.view='messages'; renderShell(); loadView();">Message</button>` : ''}
        </div>
      </div>`).join('');
  } catch (e) {
    container.innerHTML = errorHTML(e.message);
  }
}

// ---- My Mentees -----------------------------------------------------------
async function renderMyMentees(page) {
  page.innerHTML = `
    <h1 class="section-title">My Mentees</h1>
    <p class="section-sub">Active students under your mentorship, their career goals, and progress notes.</p>
    <div class="card mt-16" id="myMenteesList">${loadingHTML()}</div>`;

  try {
    const data = await api('/api/mentees');
    const mentees = data.mentees || [];
    if (!mentees.length) {
      $('#myMenteesList').innerHTML = emptyHTML('👥', 'No active mentees yet', 'Accept mentorship requests to start guiding students.');
      return;
    }

    $('#myMenteesList').innerHTML = mentees.map(m => `
      <div class="mentorship-row">
        ${avatarDiv(m.name, 'student', 'lg')}
        <div style="flex:1">
          <div class="flex-between">
            <h3 style="margin:0">${esc(m.name)}</h3>
            <span class="pill accepted">${esc(m.status)}</span>
          </div>
          <div class="text-sm muted mt-4"><b>Mentoring Goal:</b> ${esc(m.topic)}</div>
          <div class="tags mt-4">${tagsHTML(m.skills)}</div>
          <div class="progress-note-box mt-8">
            <small><b>Progress Notes:</b> ${esc(m.notes)}</small>
          </div>
          <div class="text-xs muted mt-4">Completed ${m.sessionsCount} session(s)</div>
        </div>
        <div class="row-actions flex-col">
          <button class="btn btn-primary btn-xs" onclick="openScheduleSessionModal('${esc(m.id)}', '${esc(m.name)}')">Schedule 1:1</button>
          <button class="btn btn-ghost btn-xs mt-4" onclick="openProgressNotesModal('${esc(m.id)}', '${esc(m.name)}', '${esc(m.notes)}')">Edit Notes</button>
          <button class="btn btn-ghost btn-xs mt-4" onclick="openThread('${esc(m.id)}', '${esc(m.name)}'); STATE.view='messages'; renderShell(); loadView();">Message</button>
        </div>
      </div>`).join('');
  } catch (e) {
    $('#myMenteesList').innerHTML = errorHTML(e.message);
  }
}

function openProgressNotesModal(menteeId, menteeName, currentNotes) {
  openModal(`
    <h2>Mentee Progress Notes</h2>
    <p class="subtitle">Record roadmap notes and action items for <b>${esc(menteeName)}</b>.</p>
    <form class="form" id="notesForm">
      <div class="form-group">
        <label class="form-label">Notes & Next Steps</label>
        <textarea class="form-textarea" name="notes" rows="5" required>${esc(currentNotes || '')}</textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Notes</button>
      </div>
    </form>`);

  $('#notesForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/mentees/' + menteeId + '/notes', {
        method: 'PUT',
        body: JSON.stringify({ notes: e.target.notes.value })
      });
      closeModal();
      toast('Notes updated!', 'success');
      renderMyMentees($('#page'));
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// ---- Sessions (Mentor) ----------------------------------------------------
async function renderMentorSessions(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">1:1 Mentorship Sessions</h1>
        <p class="section-sub">Schedule, manage, and complete sessions with your mentees.</p>
      </div>
      <button class="btn btn-primary" onclick="openScheduleSessionModal()">+ Schedule Session</button>
    </div>

    <div class="page-tabs">
      <button class="page-tab active" data-sesstab="upcoming">Upcoming</button>
      <button class="page-tab" data-sesstab="completed">Completed</button>
      <button class="page-tab" data-sesstab="cancelled">Cancelled</button>
    </div>

    <div class="card mt-16" id="mentorSessionsGrid">${loadingHTML()}</div>`;

  let currentTab = 'upcoming';
  $$('[data-sesstab]').forEach(tab => tab.onclick = () => {
    $$('[data-sesstab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.sesstab;
    loadMentorSessions(currentTab);
  });

  loadMentorSessions('upcoming');
}

async function loadMentorSessions(tab = 'upcoming') {
  const container = $('#mentorSessionsGrid');
  if (!container) return;
  container.innerHTML = loadingHTML();

  try {
    const data = await api('/api/sessions');
    let sessions = data.sessions || [];
    if (tab === 'upcoming') sessions = sessions.filter(s => s.status === 'scheduled');
    else if (tab === 'completed') sessions = sessions.filter(s => s.status === 'completed');
    else if (tab === 'cancelled') sessions = sessions.filter(s => s.status === 'cancelled');

    if (!sessions.length) {
      container.innerHTML = emptyHTML('📅', 'No ' + tab + ' sessions', 'Click "Schedule Session" to set up a new meeting.');
      return;
    }

    container.innerHTML = sessions.map(s => `
      <div class="session-card-full mb-12">
        <div class="flex-between">
          <span class="pill ${esc(s.status)}">${esc(s.status)}</span>
          <span class="text-xs muted font-mono">${fmtDate(s.date)} at ${esc(s.time)}</span>
        </div>
        <h3 style="margin:8px 0 4px">${esc(s.topic)}</h3>
        <div class="company mb-4">Mentee: <b>${esc(s.student ? s.student.name : 'Student')}</b> (${esc(s.mode)})</div>
        ${s.notes ? `<p class="text-sm muted mb-8">${esc(s.notes)}</p>` : ''}
        <div class="footer flex-between">
          ${s.meetingLink ? `<a href="${esc(s.meetingLink)}" target="_blank" class="session-link">🔗 Meeting Link</a>` : '<span></span>'}
          <div style="display:flex;gap:6px">
            ${s.status === 'scheduled' ? `
              <button class="btn btn-primary btn-xs" onclick="markSessionDone('${esc(s.id)}')">Mark Completed ✓</button>
              <button class="btn btn-danger btn-xs" onclick="cancelSession('${esc(s.id)}')">Cancel</button>` : ''}
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    container.innerHTML = errorHTML(e.message);
  }
}

function openScheduleSessionModal(preselectedStudentId = '', preselectedName = '') {
  openModal(`
    <h2>Schedule 1:1 Session</h2>
    <p class="subtitle">Set up a session with one of your mentees.</p>
    <form class="form" id="scheduleSessForm">
      <div class="form-group">
        <label class="form-label">Select Mentee *</label>
        <select class="form-select" name="studentId" id="mentorStudentSelect" required>
          <option value="">Loading mentees…</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Session Topic *</label>
        <input class="form-input" name="topic" placeholder="e.g. Resume Deep-Dive, Placement Mock Interview" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Date *</label>
          <input class="form-input" type="date" name="date" required min="${new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label class="form-label">Time *</label>
          <input class="form-input" type="time" name="time" value="18:30" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Mode</label>
          <select class="form-select" name="mode">
            <option value="Online (Google Meet)">Online (Google Meet)</option>
            <option value="Campus In-Person">Campus In-Person</option>
            <option value="Phone Call">Phone Call</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Meeting Link / Location</label>
          <input class="form-input" name="meetingLink" value="https://meet.google.com/ac-${Math.random().toString(36).substring(2, 6)}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Preparation Notes</label>
        <textarea class="form-textarea" name="notes" placeholder="Notes or agenda for the mentee…"></textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Schedule Session</button>
      </div>
    </form>`);

  // Populate mentees
  api('/api/mentees').then(data => {
    const mentees = data.mentees || [];
    const sel = $('#mentorStudentSelect');
    if (!sel) return;
    if (!mentees.length) {
      sel.innerHTML = '<option value="">No active mentees</option>';
    } else {
      sel.innerHTML = mentees.map(m => `
        <option value="${esc(m.id)}" ${m.id === preselectedStudentId ? 'selected' : ''}>
          ${esc(m.name)} (${esc(m.department || '')})
        </option>`).join('');
    }
  }).catch(() => {});

  $('#scheduleSessForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      await api('/api/sessions', { method: 'POST', body: JSON.stringify(body) });
      closeModal();
      toast('Session scheduled successfully!', 'success');
      loadMentorSessions();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// ---- Availability & Capacity ----------------------------------------------
async function renderMentorAvailability(page) {
  page.innerHTML = `
    <h1 class="section-title">Availability & Mentee Capacity</h1>
    <p class="section-sub">Configure when students can book sessions with you and manage your mentoring capacity.</p>

    <div class="grid g-3-2 gap-16 mt-16">
      <div class="card">
        <div class="card-header"><h3>Settings</h3></div>
        <form class="form" id="availForm">
          <div class="form-group">
            <label class="flex-between" style="cursor:pointer">
              <span><b>Open to New Mentees</b><br><small class="muted">Toggle whether students can submit new requests</small></span>
              <input type="checkbox" name="isOpen" id="availIsOpen" style="transform:scale(1.4)">
            </label>
          </div>
          <div class="divider"></div>
          <div class="form-group">
            <label class="form-label">Max Mentee Capacity</label>
            <input class="form-input" type="number" name="maxMentees" id="availMax" min="1" max="25" value="5">
            <small class="muted">Prevents taking more students than you can comfortably guide.</small>
          </div>
          <div class="form-group">
            <label class="form-label">Weekly Availability Schedule</label>
            <textarea class="form-textarea" name="slots" id="availSlots" rows="3" placeholder="e.g. Weekday evenings (6pm-8pm); Saturday mornings (10am-12pm)"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Mentoring Topics & Expertise</label>
            <input class="form-input" name="focusTopics" id="availFocus" placeholder="DSA, System Design, Career Growth, Cloud">
          </div>
          <button type="submit" class="btn btn-primary">Save Availability</button>
        </form>
      </div>

      <div class="card">
        <div class="card-header"><h3>Capacity Guidelines</h3></div>
        <p class="text-sm muted">Keeping your capacity updated ensures you are paired with the most aligned students through our <b>DSA Bipartite Matching</b> algorithm.</p>
        <div class="mt-16">
          <div class="stat-card" style="border:1px solid var(--border)">
            <div class="stat-value" id="currentCapacityDisplay">5</div>
            <div class="stat-label">Maximum Concurrent Mentees</div>
          </div>
        </div>
      </div>
    </div>`;

  try {
    const data = await api('/api/availability');
    if ($('#availIsOpen')) $('#availIsOpen').checked = data.isOpen !== false;
    if ($('#availMax')) $('#availMax').value = data.maxMentees || 5;
    if ($('#availSlots')) $('#availSlots').value = data.slots || '';
    if ($('#availFocus')) $('#availFocus').value = data.focusTopics || '';
    if ($('#currentCapacityDisplay')) $('#currentCapacityDisplay').textContent = data.maxMentees || 5;
  } catch (e) {}

  $('#availForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const body = {
        isOpen: $('#availIsOpen').checked,
        maxMentees: parseInt($('#availMax').value, 10),
        slots: $('#availSlots').value,
        focusTopics: $('#availFocus').value
      };
      await api('/api/availability', { method: 'PUT', body: JSON.stringify(body) });
      toast('Availability updated!', 'success');
      btn.disabled = false; btn.textContent = 'Saved ✓';
      setTimeout(() => { btn.textContent = 'Save Availability'; }, 2000);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Save Availability';
    }
  };
}

// ---- Opportunities (Mentor) -----------------------------------------------
async function renderMentorOpportunities(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">Opportunities & Applicants</h1>
        <p class="section-sub">Publish jobs, internships, workshops and referrals. Review and shortlist applicants.</p>
      </div>
      <button class="btn btn-primary" onclick="openPostOpportunityModal()">+ Publish New</button>
    </div>

    <div class="page-tabs">
      <button class="page-tab active" data-opttab="mine">Published by Me</button>
      <button class="page-tab" data-opttab="all">All Campus Openings</button>
    </div>

    <div class="grid g-3 mt-16" id="mentorOppGrid">${loadingHTML()}</div>`;

  let currentTab = 'mine';
  $$('[data-opttab]').forEach(tab => tab.onclick = () => {
    $$('[data-opttab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.opttab;
    loadMentorOppGrid(currentTab);
  });

  loadMentorOppGrid('mine');
}

async function loadMentorOppGrid(tab = 'mine') {
  const grid = $('#mentorOppGrid');
  if (!grid) return;
  grid.innerHTML = loadingHTML();

  try {
    const url = tab === 'mine' ? '/api/posts?my=1' : '/api/posts';
    const data = await api(url);
    const posts = data.posts || [];
    if (!posts.length) {
      grid.innerHTML = emptyHTML('💼', 'No opportunities found', tab === 'mine' ? 'You have not published any opportunities yet.' : 'Check back later.');
      return;
    }

    grid.innerHTML = posts.map(p => `
      <div class="post-card">
        <div class="flex-between">
          <span class="pill ${esc(p.type)}">${esc(p.type)}</span>
          ${p.deadline ? `<span class="text-xs muted">Due ${esc(p.deadline)}</span>` : ''}
        </div>
        <h3 style="margin:10px 0 4px">${esc(p.title)}</h3>
        <div class="company mb-4">🏢 ${esc(p.company || 'Not specified')}</div>
        <p class="text-sm muted mb-8">${esc((p.content || '').slice(0, 110))}…</p>
        <div class="tags mb-12">${tagsHTML(p.tags)}</div>
        <div class="footer flex-between">
          <button class="btn btn-primary btn-xs" onclick="viewApplicantsModal('${esc(p.id)}', '${esc(p.title)}')">View Applicants 📄</button>
          ${p.authorId === STATE.user.id || STATE.user.role === 'admin' ? `
            <button class="btn btn-ghost btn-xs text-danger" onclick="deletePost('${esc(p.id)}')">Delete</button>` : ''}
        </div>
      </div>`).join('');
  } catch (e) {
    grid.innerHTML = errorHTML(e.message);
  }
}

async function viewApplicantsModal(postId, postTitle) {
  openModal(`
    <h2>Applicants — ${esc(postTitle)}</h2>
    <p class="subtitle">Review students who applied for this opportunity.</p>
    <div id="applicantsModalBody">${loadingHTML()}</div>`);

  try {
    const data = await api('/api/applications?postId=' + encodeURIComponent(postId));
    const apps = data.applications || [];
    const body = document.getElementById('applicantsModalBody');
    if (!body) return;

    if (!apps.length) {
      body.innerHTML = emptyHTML('📄', 'No applicants yet', 'Students will appear here once they apply.');
      return;
    }

    body.innerHTML = apps.map(a => `
      <div class="mentorship-row mb-8">
        ${avatarDiv(a.student ? a.student.name : 'Student', 'student')}
        <div style="flex:1">
          <div class="flex-between">
            <h4 style="margin:0">${esc(a.student ? a.student.name : 'Student')}</h4>
            <span class="pill ${esc(a.status)}">${esc(a.status)}</span>
          </div>
          <div class="text-xs muted mt-2">${esc(a.student ? a.student.department : '')} · Batch ${esc(a.student ? a.student.batch : '')}</div>
          ${a.note ? `<p class="text-sm muted mt-4"><b>Cover note:</b> ${esc(a.note)}</p>` : ''}
          <div class="text-xs muted mt-2">Applied ${fmtRelative(a.createdAt)}</div>
        </div>
        <div class="row-actions flex-col">
          <button class="btn btn-primary btn-xs" onclick="updateAppStatus('${esc(a.id)}', 'shortlisted', '${esc(postId)}', '${esc(postTitle)}')">Shortlist ✓</button>
          <button class="btn btn-danger btn-xs mt-4" onclick="updateAppStatus('${esc(a.id)}', 'rejected', '${esc(postId)}', '${esc(postTitle)}')">Reject ✗</button>
        </div>
      </div>`).join('');
  } catch (e) {
    document.getElementById('applicantsModalBody').innerHTML = errorHTML(e.message);
  }
}

async function updateAppStatus(appId, status, postId, postTitle) {
  try {
    await api('/api/applications/' + appId, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(`Applicant marked as ${status}!`, 'success');
    viewApplicantsModal(postId, postTitle);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---- Referrals ------------------------------------------------------------
async function renderMentorReferrals(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">Student Referrals</h1>
        <p class="section-sub">Refer your top mentees for company job openings and interviews.</p>
      </div>
      <button class="btn btn-primary" onclick="openReferralModal()">+ Create Referral</button>
    </div>

    <div class="card mt-16" id="referralsList">${loadingHTML()}</div>`;

  try {
    const data = await api('/api/referrals');
    const refs = data.referrals || [];
    if (!refs.length) {
      $('#referralsList').innerHTML = emptyHTML('🔗', 'No referrals yet', 'Refer a mentee to an opening at your company.');
      return;
    }

    $('#referralsList').innerHTML = refs.map(r => `
      <div class="mentorship-row">
        ${avatarDiv(r.studentName, 'student')}
        <div style="flex:1">
          <div class="flex-between">
            <h4 style="margin:0">Referred: ${esc(r.studentName)}</h4>
            <span class="pill accepted">Referred</span>
          </div>
          <div class="company mt-4">🏢 ${esc(r.company)} — ${esc(r.role)}</div>
          ${r.notes ? `<p class="text-sm muted mt-4">${esc(r.notes)}</p>` : ''}
          <div class="text-xs muted mt-2">${fmtRelative(r.createdAt)}</div>
        </div>
      </div>`).join('');
  } catch (e) {
    $('#referralsList').innerHTML = errorHTML(e.message);
  }
}

function openReferralModal() {
  openModal(`
    <h2>Refer a Student</h2>
    <p class="subtitle">Submit an official referral recommendation for your mentee.</p>
    <form class="form" id="referralForm">
      <div class="form-group">
        <label class="form-label">Select Mentee *</label>
        <select class="form-select" name="studentId" id="refStudentSelect" required>
          <option value="">Loading mentees…</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Company Name *</label>
          <input class="form-input" name="company" placeholder="e.g. Google, Microsoft, Startup" required>
        </div>
        <div class="form-group">
          <label class="form-label">Role Title *</label>
          <input class="form-input" name="role" placeholder="e.g. Software Engineer 1" required>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Recommendation Note *</label>
        <textarea class="form-textarea" name="notes" placeholder="Strong analytical foundation, completed 4 DSA mock interviews with me…" required></textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Submit Referral</button>
      </div>
    </form>`);

  api('/api/mentees').then(data => {
    const mentees = data.mentees || [];
    const sel = $('#refStudentSelect');
    if (!sel) return;
    sel.innerHTML = mentees.length
      ? mentees.map(m => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.department)})</option>`).join('')
      : '<option value="">No active mentees</option>';
  }).catch(() => {});

  $('#referralForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      await api('/api/referrals', { method: 'POST', body: JSON.stringify(body) });
      closeModal();
      toast('Referral created and sent to student!', 'success');
      renderMentorReferrals($('#page'));
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// ---- Reviews & Impact -----------------------------------------------------
async function renderMentorReviews(page) {
  page.innerHTML = `
    <h1 class="section-title">Reviews & Impact</h1>
    <p class="section-sub">Feedback received from students, average star rating, and badges earned.</p>
    <div class="grid g-3-2 gap-16 mt-16">
      <div class="card" id="reviewsList">${loadingHTML()}</div>
      <div>
        <div class="card mb-16" id="ratingSummaryCard">${loadingHTML()}</div>
        <div class="card" id="badgesCard">${loadingHTML()}</div>
      </div>
    </div>`;

  try {
    const data = await api('/api/reviews');
    const revs = data.reviews || [];

    $('#ratingSummaryCard').innerHTML = `
      <div class="card-header"><h3>Rating Summary</h3></div>
      <div class="rating-hero text-center" style="padding:16px 0">
        <div style="font:700 48px 'Playfair Display';color:var(--gold)">${(data.averageRating || 5.0).toFixed(1)}</div>
        <div style="font-size:20px;letter-spacing:2px">⭐⭐⭐⭐⭐</div>
        <div class="text-sm muted mt-8">Based on ${data.count || 0} student reviews</div>
      </div>`;

    $('#badgesCard').innerHTML = `
      <div class="card-header"><h3>Badges Earned</h3></div>
      <div class="badges-showcase">
        ${(data.badges || []).map(b => `
          <div class="badge-item">
            <span class="badge-icon">🏅</span>
            <div><div style="font-weight:600">${esc(b)}</div><small class="muted">Recognized for mentorship excellence</small></div>
          </div>`).join('')}
      </div>`;

    if (!revs.length) {
      $('#reviewsList').innerHTML = emptyHTML('⭐', 'No reviews yet', 'Students can leave reviews after completing sessions.');
    } else {
      $('#reviewsList').innerHTML = `
        <div class="card-header"><h3>Student Feedback</h3></div>
        ${revs.map(r => `
          <div class="review-item mb-12">
            <div class="flex-between">
              <b>${esc(r.studentName || 'Student')}</b>
              <span class="text-gold font-mono">${'★'.repeat(r.rating || 5)}</span>
            </div>
            <p class="text-sm mt-4">${esc(r.comment)}</p>
            <div class="text-xs muted mt-2">${fmtRelative(r.createdAt)}</div>
          </div>`).join('')}`;
    }
  } catch (e) {
    $('#reviewsList').innerHTML = errorHTML(e.message);
  }
}
