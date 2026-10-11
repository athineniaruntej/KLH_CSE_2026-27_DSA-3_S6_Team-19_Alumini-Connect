/* =========================================================
   Alumni Connect — Admin Portal Views (views-admin.js)
   ========================================================= */

async function routeAdmin(view, page) {
  switch (view) {
    case 'dashboard':
      return renderAdminDashboard(page);
    case 'users':
      return renderAdminUsers(page);
    case 'analytics':
      return renderAdminAnalytics(page);
    case 'opportunities':
      return pageOpportunities(page, true);
    case 'events':
      return pageEvents(page);
    case 'algo-lab':
      return renderAlgorithmLab(page);
    case 'admin-storage':
      return renderAdminStorage(page);
    default:
      return renderAdminDashboard(page);
  }
}

// ---- Admin Dashboard ------------------------------------------------------
async function renderAdminDashboard(page) {
  page.innerHTML = `
    <div class="hero">
      <div class="hero-content">
        <h1>Platform Administration ⚙️</h1>
        <p class="subtitle">Platform-wide governance: verify alumni mentors, track analytics, run academic DSA algorithms, and maintain storage.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" onclick="STATE.view='users'; renderShell(); loadView();">Manage Users 👥</button>
          <button class="btn btn-ghost" onclick="STATE.view='analytics'; renderShell(); loadView();">Analytics Charts 📊</button>
          <button class="btn btn-ghost" onclick="STATE.view='algo-lab'; renderShell(); loadView();">Algorithm Lab 🧪</button>
        </div>
      </div>
      <div class="hero-badge">
        <div class="tag">Administrator Portal</div>
        <div class="muted mt-4">Full Access · System Level</div>
      </div>
    </div>

    <div class="stats-grid" id="adminStats">${loadingHTML()}</div>

    <div class="grid g-2 gap-16 mt-16">
      <div class="card">
        <div class="card-header">
          <h3>Quick Administration Controls</h3>
        </div>
        <div class="quick-admin-grid">
          <div class="p-8 border rounded mb-8 flex-between">
            <div><b>Verify Pending Mentors</b><div class="text-xs muted">Review unverified alumni accounts</div></div>
            <button class="btn btn-primary btn-xs" onclick="STATE.view='users'; renderShell(); loadView();">Verify</button>
          </div>
          <div class="p-8 border rounded mb-8 flex-between">
            <div><b>Broadcast Announcement</b><div class="text-xs muted">Post campus-wide notice</div></div>
            <button class="btn btn-ghost btn-xs" onclick="openPostOpportunityModal()">Post</button>
          </div>
          <div class="p-8 border rounded mb-8 flex-between">
            <div><b>Create Campus Event</b><div class="text-xs muted">Alumni reunions and webinars</div></div>
            <button class="btn btn-ghost btn-xs" onclick="openEventModal()">Create</button>
          </div>
          <div class="p-8 border rounded flex-between">
            <div><b>Run Academic Algorithm Test</b><div class="text-xs muted">Verify hand-built DSA suite</div></div>
            <button class="btn btn-ghost btn-xs" onclick="STATE.view='algo-lab'; renderShell(); loadView();">Run</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Database & System Health</h3>
          <button class="btn btn-ghost btn-xs" onclick="STATE.view='admin-storage'; renderShell(); loadView();">Storage</button>
        </div>
        <div id="systemHealthBody">${loadingHTML()}</div>
      </div>
    </div>`;

  try {
    const data = await api('/api/dashboard');
    const s = data.stats || {};

    $('#adminStats').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-value">${s.totalUsers || 0}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🧑‍🏫</div>
        <div class="stat-value">${s.totalMentors || 0}</div>
        <div class="stat-label">Alumni Mentors</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🎓</div>
        <div class="stat-value">${s.totalStudents || 0}</div>
        <div class="stat-label">Students</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🤝</div>
        <div class="stat-value">${s.activeMentorships || 0}</div>
        <div class="stat-label">Active Mentorships</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-value">${s.totalSessions || 0}</div>
        <div class="stat-label">Total Sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💼</div>
        <div class="stat-value">${s.totalOpportunities || 0}</div>
        <div class="stat-label">Opportunities</div>
      </div>`;

    $('#systemHealthBody').innerHTML = `
      <div style="font-size:13px;line-height:1.8">
        <div><b>Node Engine:</b> Node.js (Zero npm dependencies)</div>
        <div><b>Storage Engine:</b> Append-only text logs with hash index</div>
        <div><b>Unverified Mentors:</b> <span class="pill ${s.unverifiedMentors > 0 ? 'pending' : 'accepted'}">${s.unverifiedMentors || 0} pending</span></div>
        <div><b>Academic DSA Algorithms:</b> 34 hand-built algorithms loaded ✓</div>
      </div>`;
  } catch (e) {
    $('#adminStats').innerHTML = errorHTML(e.message);
  }
}

// ---- Manage Users ---------------------------------------------------------
async function renderAdminUsers(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">Manage Users</h1>
        <p class="section-sub">Search, verify mentors, manage roles, and govern accounts.</p>
      </div>
    </div>

    <div class="filters">
      <input id="adminUserSearch" class="form-input" placeholder="Search by name, email, department…" style="flex:2">
      <select id="adminRoleFilter" class="form-select">
        <option value="">All Roles</option>
        <option value="student">Student</option>
        <option value="alumni">Mentor (Alumni)</option>
        <option value="admin">Admin</option>
      </select>
      <button class="btn btn-primary" onclick="loadAdminUsers()">Filter</button>
    </div>

    <div class="card mt-16" style="padding:0;overflow:hidden">
      <div id="adminUsersTableWrap">${loadingHTML()}</div>
    </div>`;

  window.loadAdminUsers = async function() {
    const wrap = $('#adminUsersTableWrap');
    if (!wrap) return;
    wrap.innerHTML = loadingHTML();
    const q = $('#adminUserSearch')?.value || '';
    const role = $('#adminRoleFilter')?.value || '';

    try {
      const data = await api(`/api/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(role)}`);
      const users = data.users || [];
      if (!users.length) { wrap.innerHTML = emptyHTML('👥', 'No users found', ''); return; }

      wrap.innerHTML = `
        <div style="overflow-x:auto">
          <table class="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Batch</th>
                <th>Verified</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      ${avatarDiv(u.name, u.role)}
                      <div>
                        <div style="font-weight:600">${esc(u.name)}</div>
                        <div class="text-xs muted font-mono">${esc(u.email)}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="pill ${esc(u.role)}">${esc(u.role === 'alumni' ? 'Mentor' : u.role)}</span></td>
                  <td>${esc(u.department || 'N/A')}</td>
                  <td>${esc(u.batch || 'N/A')}</td>
                  <td>
                    <span class="pill ${u.verified ? 'accepted' : 'pending'}">${u.verified ? '✓ Verified' : 'Unverified'}</span>
                  </td>
                  <td>
                    <div style="display:flex;gap:6px">
                      ${u.role === 'alumni' ? `
                        <button class="btn btn-ghost btn-xs" onclick="toggleVerifyMentor('${esc(u.id)}', ${!u.verified})">
                          ${u.verified ? 'Unverify' : 'Verify ✓'}
                        </button>` : ''}
                      <button class="btn btn-ghost btn-xs" onclick="openChangeRoleModal('${esc(u.id)}', '${esc(u.name)}', '${esc(u.role)}')">Role</button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (e) {
      wrap.innerHTML = errorHTML(e.message);
    }
  };

  loadAdminUsers();
}

async function toggleVerifyMentor(userId, verified) {
  try {
    await api('/api/admin/verify-mentor', { method: 'PUT', body: JSON.stringify({ userId, verified }) });
    toast(`Mentor verified status updated!`, 'success');
    loadAdminUsers();
  } catch (e) { toast(e.message, 'error'); }
}

function openChangeRoleModal(userId, name, currentRole) {
  openModal(`
    <h2>Change Role — ${esc(name)}</h2>
    <form class="form" id="changeRoleForm">
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-select" name="role">
          <option value="student" ${currentRole==='student'?'selected':''}>Student</option>
          <option value="alumni" ${currentRole==='alumni'?'selected':''}>Mentor (Alumni)</option>
          <option value="admin" ${currentRole==='admin'?'selected':''}>Admin</option>
        </select>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Role</button>
      </div>
    </form>`);

  $('#changeRoleForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/api/admin/users/' + userId, { method: 'PUT', body: JSON.stringify({ role: e.target.role.value }) });
      closeModal();
      toast('User role updated!', 'success');
      loadAdminUsers();
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ---- Analytics (Pure CSS/SVG Charts, Zero Libraries) ----------------------
async function renderAdminAnalytics(page) {
  page.innerHTML = `
    <h1 class="section-title">Platform Analytics</h1>
    <p class="section-sub">Academic insights and metrics (pure SVG/CSS visualizations, zero npm dependencies).</p>
    <div id="analyticsBody" class="mt-16">${loadingHTML()}</div>`;

  try {
    const data = await api('/api/admin/analytics');
    const f = data.funnel || {};
    const skills = data.topSkills || [];
    const depts = data.deptCounts || {};

    const maxSkill = Math.max(...skills.map(s => s.count), 1);
    const maxDept = Math.max(...Object.values(depts), 1);

    $('#analyticsBody').innerHTML = `
      <div class="grid g-2 gap-16 mb-16">
        <div class="card">
          <div class="card-header">
            <h3>Mentorship Funnel</h3>
            <span class="text-xs muted">Request to Graduation</span>
          </div>
          <div class="chart-box">
            <svg viewBox="0 0 400 180" class="svg-funnel" style="width:100%;height:180px">
              <polygon points="20,10 380,10 330,50 70,50" fill="var(--forest)" opacity="0.9" />
              <text x="200" y="32" fill="#fff" text-anchor="middle" font-size="12" font-weight="bold">Requests Sent (${f.requested || 0})</text>

              <polygon points="70,55 330,55 290,95 110,95" fill="var(--forest)" opacity="0.75" />
              <text x="200" y="77" fill="#fff" text-anchor="middle" font-size="12" font-weight="bold">Accepted Mentorships (${f.accepted || 0})</text>

              <polygon points="110,100 290,100 250,140 150,140" fill="var(--gold)" opacity="0.85" />
              <text x="200" y="122" fill="#fff" text-anchor="middle" font-size="12" font-weight="bold">Sessions Conducted (${f.sessionsConducted || 0})</text>

              <polygon points="150,145 250,145 230,175 170,175" fill="var(--forest)" opacity="0.6" />
              <text x="200" y="163" fill="#fff" text-anchor="middle" font-size="11" font-weight="bold">Completed (${f.graduated || 0})</text>
            </svg>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Top Skills in Demand (From Postings)</h3>
          </div>
          <div class="bar-chart-list mt-8">
            ${skills.map(s => {
              const pct = Math.round((s.count / maxSkill) * 100);
              return `
                <div class="bar-row mb-8">
                  <div class="flex-between text-xs mb-2">
                    <b>${esc(s.skill)}</b>
                    <span class="muted">${s.count} mentions</span>
                  </div>
                  <div class="progress-bar-wrap">
                    <div class="progress-bar-fill" style="width:${pct}%;background:var(--forest)"></div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Users Distribution by Department</h3>
        </div>
        <div class="dept-bars-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px">
          ${Object.keys(depts).map(d => {
            const count = depts[d];
            const pct = Math.round((count / maxDept) * 100);
            return `
              <div class="dept-stat-box p-8 border rounded">
                <div class="flex-between text-xs mb-4">
                  <b>${esc(d)}</b>
                  <span>${count} users</span>
                </div>
                <div class="progress-bar-wrap">
                  <div class="progress-bar-fill" style="width:${pct}%;background:var(--gold)"></div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  } catch (e) {
    $('#analyticsBody').innerHTML = errorHTML(e.message);
  }
}

// ---- Algorithm Lab --------------------------------------------------------
async function renderAlgorithmLab(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">Academic Algorithm Lab 🧪</h1>
        <p class="section-sub">Live executor for all 34 hand-built DSA-3 algorithms (String, Dynamic Programming, Network Flow, Randomized, Parallel, Approximation).</p>
      </div>
    </div>

    <div class="grid g-3-2 gap-16">
      <div class="card">
        <div class="card-header"><h3>Algorithm Runner</h3></div>
        <form class="form" id="algoForm">
          <div class="form-group">
            <label class="form-label">Select Algorithm</label>
            <select class="form-select" id="algoSelect" name="algorithm">
              <option value="">Loading catalogue…</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Algorithm Category</label>
            <div id="algoCategoryBadge"><span class="tag">String</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">JSON Input Parameters (or leave blank to run demo input)</label>
            <textarea class="form-textarea font-mono" id="algoInput" name="input" rows="6" placeholder="{}"></textarea>
          </div>
          <button type="submit" class="btn btn-primary" id="algoRunBtn">Run Algorithm ⚡</button>
        </form>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Execution Result</h3>
          <span class="text-xs font-mono text-brand" id="algoElapsed"></span>
        </div>
        <div id="algoResultArea" class="font-mono text-sm" style="background:var(--paper-light);padding:14px;border-radius:var(--radius);overflow:auto;max-height:360px">
          Select an algorithm and click Run to inspect output.
        </div>
      </div>
    </div>`;

  let algosList = [];
  try {
    const data = await api('/api/algorithms');
    algosList = data.algorithms || [];
    const sel = $('#algoSelect');
    if (sel && algosList.length) {
      sel.innerHTML = algosList.map(([id, name, cat]) => `
        <option value="${esc(id)}" data-cat="${esc(cat)}">${esc(name)} (${esc(cat)})</option>`).join('');
      sel.onchange = () => {
        const opt = sel.options[sel.selectedIndex];
        const cat = opt?.dataset?.cat || 'General';
        $('#algoCategoryBadge').innerHTML = `<span class="tag">${esc(cat)}</span>`;
      };
      if (sel.options[0]) sel.options[0].selected = true;
    }
  } catch (e) {}

  $('#algoForm').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#algoRunBtn');
    btn.disabled = true; btn.textContent = 'Running…';
    const algo = $('#algoSelect').value;
    const rawInput = $('#algoInput').value.trim();
    let parsedInput = null;
    if (rawInput) {
      try { parsedInput = JSON.parse(rawInput); }
      catch (err) { toast('Invalid JSON in input box', 'error'); btn.disabled = false; btn.textContent = 'Run Algorithm ⚡'; return; }
    }

    try {
      const res = await api('/api/algorithms/run', {
        method: 'POST',
        body: JSON.stringify({ algorithm: algo, input: parsedInput })
      });
      $('#algoElapsed').textContent = `Elapsed: ${res.elapsedMs || 0} ms`;
      $('#algoResultArea').innerHTML = `
        <div style="color:var(--forest);font-weight:700;margin-bottom:8px">✓ Algorithm: ${esc(res.algorithm)}</div>
        <div style="color:var(--ink2);margin-bottom:6px"><b>Input:</b> ${esc(JSON.stringify(res.input, null, 2))}</div>
        <div style="color:var(--ink);margin-top:10px"><b>Output Result:</b><br><pre style="white-space:pre-wrap">${esc(JSON.stringify(res.result, null, 2))}</pre></div>`;
      btn.disabled = false; btn.textContent = 'Run Algorithm ⚡';
    } catch (err) {
      $('#algoResultArea').innerHTML = errorHTML(err.message);
      btn.disabled = false; btn.textContent = 'Run Algorithm ⚡';
    }
  };
}

// ---- Storage Management ---------------------------------------------------
async function renderAdminStorage(page) {
  page.innerHTML = `
    <div class="flex-between mb-16">
      <div>
        <h1 class="section-title">Database & Storage Management</h1>
        <p class="section-sub">Text-file storage engine inspection, hash index rebuilds, and compaction.</p>
      </div>
      <div class="btn-group">
        <button class="btn btn-ghost" onclick="reindexAll()">Reindex All</button>
        <button class="btn btn-primary" onclick="compactAll()">Compact Database</button>
      </div>
    </div>

    <div class="card mt-16" style="padding:0;overflow:hidden">
      <div id="storageTableWrap">${loadingHTML()}</div>
    </div>`;

  window.loadStorageStats = async function() {
    const wrap = $('#storageTableWrap');
    if (!wrap) return;
    wrap.innerHTML = loadingHTML();
    try {
      const data = await api('/api/admin/storage');
      const colls = data.collections || [];
      wrap.innerHTML = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>Collection</th>
              <th>Live Records</th>
              <th>Total Versions</th>
              <th>File Size</th>
              <th>Indexed</th>
            </tr>
          </thead>
          <tbody>
            ${colls.map(c => `
              <tr>
                <td><b>${esc(c.name)}</b></td>
                <td>${c.liveRecords || c.live || 0}</td>
                <td>${c.versions || 0}</td>
                <td class="font-mono text-xs">${(c.bytes || c.size || 0)} B</td>
                <td><span class="pill accepted">✓ Active</span></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (e) {
      wrap.innerHTML = errorHTML(e.message);
    }
  };

  window.compactAll = async function() {
    confirm('Compact all database collections? This removes old versions and tombstones.', async () => {
      try {
        await api('/api/admin/compact', { method: 'POST' });
        toast('Database compacted successfully!', 'success');
        loadStorageStats();
      } catch (e) { toast(e.message, 'error'); }
    });
  };

  window.reindexAll = async function() {
    try {
      await api('/api/admin/reindex', { method: 'POST' });
      toast('Indexes verified and rebuilt!', 'success');
      loadStorageStats();
    } catch (e) { toast(e.message, 'error'); }
  };

  loadStorageStats();
}
