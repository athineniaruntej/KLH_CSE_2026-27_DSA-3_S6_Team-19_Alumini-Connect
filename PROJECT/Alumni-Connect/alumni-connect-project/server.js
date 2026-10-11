/**
 * server.js — Alumni Connect HTTP server.
 *
 * Phase 1 architecture:
 *   - Node's built-in http module only; no npm dependencies
 *   - all data access goes through lib/storage.js (append-only text logs)
 *   - route logic lives in routes/
 *   - index bootstrap + periodic maintenance jobs run at startup
 *
 * Run: npm start   ->  http://localhost:5000
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var PORT = process.env.PORT || 5000;
var ROOT = __dirname;
var PUBLIC = path.join(ROOT, 'public');
var DATA = path.join(ROOT, 'data');
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(PUBLIC)) fs.mkdirSync(PUBLIC, { recursive: true });

var storage = require('./lib/storage');
var sort = require('./lib/sort');
var auth = require('./routes/auth');
var users = require('./routes/users');
var algos = require('./algorithms');
var features = require('./routes/features');

var MAX_BODY_BYTES = 256 * 1024;

// ---- Response helpers ----------------------------------------------------
function sendJson(res, status, data) {
  var body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () {
      var raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

// ---- Maintenance ---------------------------------------------------------

/**
 * Rebuild any missing or stale index. seed.js and migrate.js write .txt files
 * directly, so a fresh clone has no .idx until this runs.
 */
function bootstrapIndexes() {
  var report = storage.ensureIndexes();
  if (report.length) {
    console.log('[storage] index bootstrap:');
    for (var i = 0; i < report.length; i++) console.log('  ' + JSON.stringify(report[i]));
  }
}

var COMPACT_INTERVAL_MS = 5 * 60 * 1000;
var SESSION_SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Periodic compaction. Only touches collections whose log has accumulated
 * superseded versions or tombstones, so an idle server does no disk work.
 */
function compactIfNeeded() {
  var names = storage.knownCollections();
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    if (name === auth.SESSIONS_COLL) continue;
    var versions = storage.countVersions(name);
    var live = storage.count(name);
    if (versions <= live) continue; // nothing stale
    storage.compact(name).then(function (r) {
      console.log('[compact] ' + r.collection + ': ' + r.versionsRemoved + ' stale version(s) removed');
    }).catch(function (e) {
      console.error('[compact] failed:', e.message);
    });
  }
}

function sweepSessions() {
  auth.pruneRateBuckets();
  auth.cleanupExpiredSessions().then(function (removed) {
    if (removed) console.log('[sessions] removed ' + removed + ' expired session(s)');
  }).catch(function (e) {
    console.error('[sessions] sweep failed:', e.message);
  });
}

// ---- Algorithm Lab catalogue --------------------------------------------
var algorithmList = [
  ['naive','Naive Pattern Search','String'],['kmp','KMP / Failure Function','String'],['z','Z-Function Search','String'],['rabinKarp','Rabin-Karp / Rolling Hash','String'],['ahoCorasick','Aho-Corasick Multi-Pattern','String'],['suffix','Suffix Array + Kasai LCP','String'],['suffixAutomaton','Suffix Automaton','String'],
  ['levenshtein','Levenshtein / Wagner-Fischer','Dynamic Programming'],['damerau','Damerau-Levenshtein','Dynamic Programming'],['needlemanWunsch','Needleman-Wunsch','Dynamic Programming'],['smithWaterman','Smith-Waterman','Dynamic Programming'],['matrixChain','Matrix-Chain DP','Dynamic Programming'],['optimalBST','Optimal BST DP','Dynamic Programming'],['tsp','Bitmask DP / TSP','Dynamic Programming'],['subsetSum','Subset Sum DP','Dynamic Programming'],['knapsack','0/1 Knapsack DP','Dynamic Programming'],['hamiltonian','Hamiltonian Path','Dynamic Programming / Search'],['treeDP','Tree/Subset DP','Dynamic Programming'],['treeDiameter','Tree Diameter DP/Traversal','Dynamic Programming'],['sosDP','SOS / Sum-over-Subsets DP','Dynamic Programming'],
  ['fordFulkerson','Ford-Fulkerson Max Flow','Network Flow'],['minCut','Min-Cut from Residual Graph','Network Flow'],['edmondsKarp','Edmonds-Karp','Network Flow'],['dinic','Dinic Blocking Flow','Network Flow'],['matching','Bipartite Matching','Network Flow'],['minCost','Min-Cost Max-Flow','Network Flow'],
  ['vertexCover','Vertex Cover 2-Approximation','Approximation'],['quickSort','Randomized QuickSort','Randomized'],['millerRabin','Miller-Rabin Primality','Randomized'],['universalHash','Universal-Style Hashing','Randomized'],['reservoir','Reservoir Sampling','Randomized'],['parallelReduce','Parallel Reduce (simulation)','Parallel'],['parallelPrefix','Parallel Prefix Sum (simulation)','Parallel'],['parallelSort','Parallel Sort (simulation)','Parallel']
];

var demos = {
  naive:{text:'alumni mentorship and alumni careers',pattern:'alumni'},kmp:{text:'alumni connect platform connects alumni',pattern:'alumni'},z:{text:'career mentorship alumni career',pattern:'career'},rabinKarp:{text:'Java DSA JavaScript DSA',pattern:'DSA'},ahoCorasick:{text:'java python data science web development',patterns:['java','python','data']},suffix:{text:'banana'},suffixAutomaton:{text:'alumni'},levenshtein:{a:'mentorship',b:'mentors'},damerau:{a:'alumni',b:'almuni'},needlemanWunsch:{a:'MENTOR',b:'MENTEE'},smithWaterman:{a:'CAREER',b:'CARE'},matrixChain:{dimensions:[10,20,30,40,30]},optimalBST:{keys:['A','B','C','D'],freq:[3,2,6,4]},tsp:{dist:[[0,10,15,20],[10,0,35,25],[15,35,0,30],[20,25,30,0]]},subsetSum:{values:[3,4,7,2,9],target:13},knapsack:{weights:[2,3,4,5],values:[3,4,5,8],capacity:8},hamiltonian:{adj:[[0,1,1,0],[1,0,1,1],[1,1,0,1],[0,1,1,0]]},treeDP:{values:[3,4,7,2,9],target:13},sosDP:{array:[1,2,3,4]},fordFulkerson:{capacity:[[0,8,5,0],[0,0,3,7],[0,0,0,4],[0,0,0,0]],source:0,sink:3},edmondsKarp:{capacity:[[0,8,5,0],[0,0,3,7],[0,0,0,4],[0,0,0,0]],source:0,sink:3},dinic:{capacity:[[0,8,5,0],[0,0,3,7],[0,0,0,4],[0,0,0,0]],source:0,sink:3},minCut:{capacity:[[0,8,5,0],[0,0,3,7],[0,0,0,4],[0,0,0,0]],source:0,sink:3},matching:{left:['CSE student','ECE student','IT student'],right:['Java mentor','IoT mentor','AI mentor'],edges:[[0,2],[1,1],[2,2]]},minCost:{graph:[[{to:1,cap:1,cost:2,rev:0},{to:2,cap:1,cost:5,rev:0}],[{to:3,cap:1,cost:3,rev:0}],[{to:3,cap:1,cost:1,rev:0}],[]],source:0,sink:3},vertexCover:{n:6,edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[0,5]]},quickSort:{array:[9,3,7,1,8,2,6,5,4]},millerRabin:{number:104729},universalHash:{key:'alumni-connect'},reservoir:{array:['Java','Python','Cloud','AI','DSA','IoT','SQL'],k:3},parallelReduce:{array:[4,7,2,8,3,6]},parallelPrefix:{array:[1,2,3,4,5]},parallelSort:{array:[9,1,5,2,8,3]}
};

// ---- Route handlers ------------------------------------------------------

function handleApi(req, res, url) {
  var p = url.pathname;
  var q = req.query;
  var method = req.method;
  var user = auth.currentUser(req); // null when signed out

  // ---- Public endpoints ----
  if (method === 'GET' && p === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'Alumni Connect', port: PORT, signedIn: !!user });
  }

  if (method === 'POST' && p === '/api/register') {
    return auth.register(req).then(function (out) {
      if (out.status !== 201) return sendJson(res, out.status, out.data);
      // The dashboard is returned with the login payload so the SPA can render
      // immediately instead of issuing a second request on first paint.
      out.data.dashboard = users.dashboard(out.data.user.id, out.data.user);
      sendJson(res, out.status, out.data);
    });
  }

  if (method === 'POST' && p === '/api/login') {
    return auth.login(req).then(function (out) {
      if (out.status !== 200) return sendJson(res, out.status, out.data);
      out.data.dashboard = users.dashboard(out.data.user.id, out.data.user);
      sendJson(res, out.status, out.data);
    });
  }

  if (method === 'POST' && p === '/api/logout') {
    return auth.logout(req).then(function (out) { sendJson(res, out.status, out.data); });
  }

  if (method === 'GET' && p === '/api/me') {
    return auth.me(req).then(function (out) { sendJson(res, out.status, out.data); });
  }

  // ---- Everything below requires a session ----
  if (!user) return sendJson(res, 401, { error: 'Sign in to use this endpoint.' });

  if (method === 'GET' && p === '/api/dashboard') {
    return sendJson(res, 200, features.dashboard(user));
  }

  if (method === 'GET' && p === '/api/alumni') {
    if (q.q) return sendJson(res, 200, { results: features.typoSearchAlumni(q.q, q), matched: 1 });
    return sendJson(res, 200, users.alumniDirectory(q));
  }

  if (method === 'GET' && p === '/api/profile') {
    var targetId = q.userId || user.id;
    var prof = users.profile(user.id, targetId);
    return sendJson(res, prof ? 200 : 404, prof || { error: 'Profile not found' });
  }

  if (method === 'PUT' && p === '/api/profile') {
    var b = req.body || {};
    var patch = {};
    ['name','experience','department','industry','company','skills','interests','bio','linkedin'].forEach(function(k){
      if (b[k] !== undefined) patch[k] = auth.clean(b[k], 1000);
    });
    patch.updatedAt = new Date().toISOString();
    return storage.updateRecord('users', user.id, patch).then(function(updated){
      sendJson(res, 200, { user: auth.userPublic(updated || Object.assign({}, user, patch)) });
    });
  }

  if (method === 'GET' && p === '/api/notifications') {
    return sendJson(res, 200, users.notificationsFor(user.id, q.limit));
  }

  if (method === 'PUT' && p.indexOf('/api/notifications/') === 0) {
    var nid = decodeURIComponent(p.slice('/api/notifications/'.length));
    return users.markNotificationRead(user.id, nid).then(function (ok) {
      sendJson(res, ok ? 200 : 404, { ok: ok });
    });
  }

  if (method === 'POST' && p === '/api/notifications/read-all') {
    return users.markAllNotificationsRead(user.id).then(function (n) {
      sendJson(res, 200, { ok: true, marked: n });
    });
  }

  // ---- Mentorship ----
  if (method === 'GET' && p === '/api/mentorship') {
    var mine = storage.readAll('mentorship');
    var relevant = [];
    for (var i = 0; i < mine.length; i++) {
      if (mine[i].studentId === user.id || mine[i].alumniId === user.id) relevant.push(mine[i]);
    }
    var enriched = [];
    for (var j = 0; j < relevant.length; j++) {
      var rec = relevant[j];
      var studentUser = storage.readAlive('users', rec.studentId);
      var mentorUser = storage.readAlive('users', rec.alumniId);
      if (!studentUser || !mentorUser) continue;
      enriched.push({
        id: rec.id,
        studentId: rec.studentId,
        alumniId: rec.alumniId,
        status: rec.status,
        topic: rec.topic,
        createdAt: rec.createdAt,
        student: auth.userPublic(studentUser),
        alumni: auth.userPublic(mentorUser),
        canDecide: (rec.alumniId === user.id || user.role === 'admin') && rec.status === 'pending'
      });
    }
    var ordered = enriched.slice().reverse();
    return sendJson(res, 200, { requests: ordered });
  }

  if (method === 'POST' && p === '/api/mentorship') {
    if (user.role !== 'student' && user.role !== 'admin') {
      return sendJson(res, 403, { error: 'Only students can send mentorship requests.' });
    }
    var mentorId = auth.clean(q.alumniId || (req.body && req.body.alumniId), 40);
    var topic = auth.clean(req.body && req.body.topic, 160);
    if (!mentorId) return sendJson(res, 400, { error: 'A mentor must be selected.' });

    var mentor = storage.readAlive('users', mentorId);
    if (!mentor) return sendJson(res, 404, { error: 'Mentor not found.' });
    if (mentor.role !== 'alumni' && mentor.role !== 'admin') {
      return sendJson(res, 400, { error: 'That profile is not a mentor.' });
    }

    var studentId = user.id;
    var existing = storage.readAll('mentorship');
    for (var e = 0; e < existing.length; e++) {
      if (existing[e].studentId === studentId && existing[e].alumniId === mentorId && existing[e].status !== 'rejected') {
        var current = existing[e].status;
        var article = /^[aeiou]/i.test(current) ? 'an' : 'a';
        return sendJson(res, 409, { error: 'You already have ' + article + ' ' + current + ' request with this mentor.' });
      }
    }

    var newRec = {
      id: auth.newId('M'),
      studentId: studentId,
      alumniId: mentorId,
      status: 'pending',
      topic: topic || 'General mentorship',
      createdAt: new Date().toISOString()
    };
    var notif = {
      id: auth.newId('N'),
      userId: mentorId,
      audience: 'alumni',
      title: 'New mentorship request',
      message: user.name + ' asked to connect about ' + newRec.topic + '.',
      read: false,
      createdAt: new Date().toISOString()
    };
    return storage.appendRecord('mentorship', newRec)
      .then(function () { return storage.appendRecord('notifications', notif); })
      .then(function () { sendJson(res, 201, newRec); });
  }

  if (method === 'PUT' && p.indexOf('/api/mentorship/') === 0) {
    var mid = decodeURIComponent(p.slice('/api/mentorship/'.length));
    var target = storage.readOne('mentorship', mid);
    if (!target) return sendJson(res, 404, { error: 'Request not found.' });

    var nextStatus = auth.clean(req.body && req.body.status, 20);
    var allowed = ['accepted', 'rejected', 'in-progress', 'completed', 'cancelled'];
    if (allowed.indexOf(nextStatus) === -1) {
      return sendJson(res, 400, { error: 'Status must be one of: ' + allowed.join(', ') + '.' });
    }

    var decides = target.alumniId === user.id || user.role === 'admin';
    var owns = target.studentId === user.id;
    if (nextStatus === 'cancelled' || nextStatus === 'completed') {
      if (!decides && !owns) return sendJson(res, 403, { error: 'You cannot update this request.' });
    } else if (!decides) {
      return sendJson(res, 403, { error: 'Only the mentor can respond to this request.' });
    }

    var studentUser = storage.readAlive('users', target.studentId);
    var mentorUser = storage.readAlive('users', target.alumniId);
    var patch = { status: nextStatus, updatedAt: new Date().toISOString() };
    if (nextStatus === 'accepted') patch.acceptedAt = patch.updatedAt;

    var notice = {
      id: auth.newId('N'),
      userId: target.studentId,
      audience: 'student',
      title: 'Mentorship ' + nextStatus,
      message: (mentorUser ? mentorUser.name : 'Your mentor') + ' marked your mentorship as ' + nextStatus + '.',
      read: false,
      createdAt: patch.updatedAt
    };
    void studentUser;

    return storage.updateRecord('mentorship', mid, patch)
      .then(function () { return storage.appendRecord('notifications', notice); })
      .then(function () { sendJson(res, 200, { ok: true, id: mid, status: nextStatus }); });
  }

  // ---- Sessions ----
  if (method === 'GET' && p === '/api/sessions') {
    return sendJson(res, 200, { sessions: features.getSessions(user) });
  }
  if (method === 'POST' && p === '/api/sessions') {
    return features.createSession(user, req.body).then(function (s) { sendJson(res, 201, s); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }
  if (method === 'PUT' && p.indexOf('/api/sessions/') === 0) {
    var sid = decodeURIComponent(p.slice('/api/sessions/'.length));
    return features.updateSession(user, sid, req.body).then(function (s) { sendJson(res, 200, s); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }

  // ---- Availability ----
  if (method === 'GET' && p === '/api/availability') {
    return sendJson(res, 200, features.getAvailability(user, q.userId));
  }
  if (method === 'PUT' && p === '/api/availability') {
    return features.updateAvailability(user, req.body).then(function (a) { sendJson(res, 200, a); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }

  // ---- Mentees & Notes ----
  if (method === 'GET' && p === '/api/mentees') {
    return features.getMentees(user).then(function (m) { sendJson(res, 200, { mentees: m }); }).catch(function (err) { sendJson(res, err.status || 403, { error: err.message }); });
  }
  if (method === 'PUT' && p.indexOf('/api/mentees/') === 0) {
    var midNotes = decodeURIComponent(p.slice('/api/mentees/'.length).replace(/\/notes$/, ''));
    return features.updateMenteeNotes(user, midNotes, req.body).then(function () { sendJson(res, 200, { ok: true }); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }

  // ---- Messages ----
  if (method === 'GET' && p === '/api/messages/unread-count') {
    return sendJson(res, 200, { count: features.getUnreadMessagesCount(user) });
  }
  if (method === 'GET' && p === '/api/messages/threads') {
    return sendJson(res, 200, { threads: features.getMessageThreads(user) });
  }
  if (method === 'GET' && p.indexOf('/api/messages/') === 0) {
    var wid = decodeURIComponent(p.slice('/api/messages/'.length));
    return sendJson(res, 200, { messages: features.getThreadMessages(user, wid) });
  }
  if (method === 'POST' && p === '/api/messages') {
    return features.sendMessage(user, req.body).then(function (m) { sendJson(res, 201, m); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }

  // ---- Applications ----
  if (method === 'POST' && p === '/api/applications') {
    return features.applyToPost(user, req.body).then(function (a) { sendJson(res, 201, a); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }
  if (method === 'GET' && p === '/api/applications/my') {
    return sendJson(res, 200, { applications: features.getMyApplications(user) });
  }
  if (method === 'GET' && p === '/api/applications') {
    return features.getPostApplications(user, q.postId).then(function (apps) { sendJson(res, 200, { applications: apps }); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }
  if (method === 'PUT' && p.indexOf('/api/applications/') === 0) {
    var aid = decodeURIComponent(p.slice('/api/applications/'.length));
    return features.updateApplicationStatus(user, aid, req.body).then(function (a) { sendJson(res, 200, a); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }

  // ---- Saved Opportunities ----
  if (method === 'POST' && p === '/api/saved') {
    return features.saveOpportunity(user, req.body && req.body.postId).then(function (s) { sendJson(res, 200, s); });
  }
  if (method === 'GET' && p === '/api/saved') {
    return sendJson(res, 200, { saved: features.getSavedOpportunities(user) });
  }
  if (method === 'DELETE' && p.indexOf('/api/saved/') === 0) {
    var spid = decodeURIComponent(p.slice('/api/saved/'.length));
    return features.removeSavedOpportunity(user, spid).then(function (r) { sendJson(res, 200, r); });
  }

  // ---- Referrals ----
  if (method === 'POST' && p === '/api/referrals') {
    return features.createReferral(user, req.body).then(function (ref) { sendJson(res, 201, ref); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }
  if (method === 'GET' && p === '/api/referrals') {
    return sendJson(res, 200, { referrals: features.getReferrals(user) });
  }

  // ---- Reviews & Leaderboard ----
  if (method === 'POST' && p === '/api/reviews') {
    return features.createReview(user, req.body).then(function (rev) { sendJson(res, 201, rev); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }
  if (method === 'GET' && p === '/api/reviews') {
    return sendJson(res, 200, features.getReviews(q.mentorId || user.id));
  }
  if (method === 'GET' && p === '/api/leaderboard') {
    return sendJson(res, 200, { mentors: features.getLeaderboard() });
  }

  // ---- Smart Match, Roadmap, Activity ----
  if (method === 'GET' && p === '/api/match') {
    return sendJson(res, 200, features.smartMatch(user, q));
  }
  if (method === 'GET' && p === '/api/roadmap') {
    return sendJson(res, 200, features.getRoadmap(q.goal));
  }
  if (method === 'GET' && p === '/api/activity') {
    return sendJson(res, 200, { items: features.getActivity(user) });
  }

  // ---- Campaigns (Simulated giving) ----
  if (method === 'GET' && p === '/api/campaigns') {
    return sendJson(res, 200, { campaigns: features.getCampaigns() });
  }
  if (method === 'POST' && p === '/api/campaigns/donate') {
    return sendJson(res, 200, features.donateToCampaign(user, req.body));
  }

  // ---- Posts (opportunities) ----
  if (method === 'GET' && p === '/api/posts') {
    var allPosts = storage.readAll('posts');
    if (q.my && (user.role === 'alumni' || user.role === 'admin')) {
      allPosts = allPosts.filter(function (x) { return x.authorId === user.id; });
    }
    if (q.type) {
      allPosts = allPosts.filter(function (x) { return x.type === q.type; });
    }
    if (q.q) {
      var pq = q.q.toLowerCase();
      allPosts = allPosts.filter(function (x) {
        return (x.title + ' ' + x.content + ' ' + x.tags + ' ' + x.company).toLowerCase().indexOf(pq) !== -1;
      });
    }
    var newest = sort.mergeSortBy(allPosts, function (x) { return String(x.createdAt || ''); });
    newest.reverse();
    return sendJson(res, 200, { posts: newest });
  }

  if (method === 'POST' && p === '/api/posts') {
    var body = req.body || {};
    var title = auth.clean(body.title, 160);
    var content = auth.clean(body.content, 4000);
    if (!title || !content) return sendJson(res, 400, { error: 'Title and content are required.' });
    var postTypes = ['job', 'internship', 'referral', 'workshop', 'scholarship', 'resource'];
    var postType = auth.clean(body.type, 30);
    if (postTypes.indexOf(postType) === -1) postType = 'opportunity';
    var post = {
      id: auth.newId('P'),
      authorId: user.id,
      title: auth.esc(title),
      type: postType,
      company: auth.esc(auth.clean(body.company, 120)),
      content: auth.esc(content),
      tags: auth.esc(auth.clean(body.tags, 300)),
      deadline: auth.clean(body.deadline, 30) || null,
      createdAt: new Date().toISOString()
    };
    return storage.appendRecord('posts', post).then(function () { sendJson(res, 201, post); });
  }

  if (method === 'DELETE' && p.indexOf('/api/posts/') === 0) {
    var delPostId = decodeURIComponent(p.slice('/api/posts/'.length));
    var postToDel = storage.readAlive('posts', delPostId);
    if (!postToDel) return sendJson(res, 404, { error: 'Opportunity not found' });
    if (postToDel.authorId !== user.id && user.role !== 'admin') {
      return sendJson(res, 403, { error: 'You cannot delete this opportunity' });
    }
    return storage.deleteRecord('posts', delPostId).then(function () { sendJson(res, 200, { ok: true }); });
  }

  // ---- Events ----
  if (method === 'GET' && p === '/api/events') {
    var allEvents = storage.readAll('events');
    var todayStr = new Date().toISOString().slice(0, 10);
    if (q.tab === 'past') {
      allEvents = allEvents.filter(function (e) { return String(e.date || '') < todayStr; });
    } else if (q.tab === 'upcoming') {
      allEvents = allEvents.filter(function (e) { return String(e.date || '') >= todayStr; });
    }
    var byDate = sort.mergeSortBy(allEvents, function (e) { return String(e.date || '9999-99-99'); });
    return sendJson(res, 200, { events: byDate });
  }

  if (method === 'POST' && p === '/api/events') {
    if (user.role !== 'admin' && user.role !== 'alumni') {
      return sendJson(res, 403, { error: 'Only mentors and admins can create events.' });
    }
    var eb = req.body || {};
    var evTitle = auth.clean(eb.title, 160);
    var evDate = auth.clean(eb.date, 30);
    if (!evTitle || !/^\d{4}-\d{2}-\d{2}$/.test(evDate)) {
      return sendJson(res, 400, { error: 'A title and a YYYY-MM-DD date are required.' });
    }
    var capacity = parseInt(eb.capacity, 10);
    if (isNaN(capacity) || capacity < 1) capacity = 50;
    var ev = {
      id: auth.newId('E'),
      title: auth.esc(evTitle),
      date: evDate,
      time: auth.clean(eb.time, 10),
      location: auth.esc(auth.clean(eb.location, 160)),
      description: auth.esc(auth.clean(eb.description, 2000)),
      capacity: capacity,
      hostId: user.id,
      createdAt: new Date().toISOString()
    };
    return storage.appendRecord('events', ev).then(function () { sendJson(res, 201, ev); });
  }

  if (method === 'POST' && p === '/api/events/rsvp') {
    return features.rsvpEvent(user, req.body).then(function (r) { sendJson(res, 200, r); }).catch(function (err) { sendJson(res, err.status || 400, { error: err.message }); });
  }

  if (method === 'GET' && p.indexOf('/api/events/') === 0 && p.indexOf('/rsvps') !== -1) {
    var evRsvpId = decodeURIComponent(p.slice('/api/events/'.length).replace(/\/rsvps$/, ''));
    return features.getEventRsvps(user, evRsvpId).then(function (r) { sendJson(res, 200, r); });
  }

  if (method === 'DELETE' && p.indexOf('/api/events/') === 0) {
    var delEvId = decodeURIComponent(p.slice('/api/events/'.length));
    var evToDel = storage.readAlive('events', delEvId);
    if (!evToDel) return sendJson(res, 404, { error: 'Event not found' });
    if (evToDel.hostId !== user.id && user.role !== 'admin') {
      return sendJson(res, 403, { error: 'You cannot delete this event' });
    }
    return storage.deleteRecord('events', delEvId).then(function () { sendJson(res, 200, { ok: true }); });
  }

  // ---- Algorithm Lab ----
  if (method === 'GET' && p === '/api/algorithms') {
    return sendJson(res, 200, { algorithms: algorithmList });
  }

  if (method === 'POST' && p === '/api/algorithms/run') {
    var ab = req.body || {};
    var algoId = auth.clean(ab.algorithm, 40);
    var known = false;
    for (var ai = 0; ai < algorithmList.length; ai++) if (algorithmList[ai][0] === algoId) known = true;
    if (!known) return sendJson(res, 400, { error: 'Unknown algorithm: ' + algoId });

    var provided = ab.input && typeof ab.input === 'object' ? ab.input : null;
    var hasProvided = provided && Object.keys(provided).length > 0;
    if (!hasProvided && !demos[algoId]) {
      return sendJson(res, 400, { error: 'No demo input available for ' + algoId });
    }
    var input = hasProvided ? provided : demos[algoId];
    var started = Date.now();
    try {
      var result = algos.runAlgorithm(algoId, input);
      return sendJson(res, 200, {
        algorithm: algoId,
        input: input,
        result: result,
        elapsedMs: Date.now() - started
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // ---- Admin: storage introspection and maintenance ----
  if (p.indexOf('/api/admin/') === 0) {
    if (user.role !== 'admin') return sendJson(res, 403, { error: 'Admin access required.' });

    if (method === 'GET' && p === '/api/admin/users') {
      return features.adminGetUsers(user, q).then(function (u) { sendJson(res, 200, { users: u }); }).catch(function (err) { sendJson(res, err.status || 403, { error: err.message }); });
    }

    if (method === 'PUT' && p === '/api/admin/verify-mentor') {
      return features.adminVerifyMentor(user, req.body).then(function (r) { sendJson(res, 200, r); }).catch(function (err) { sendJson(res, err.status || 403, { error: err.message }); });
    }

    if (method === 'PUT' && p.indexOf('/api/admin/users/') === 0) {
      var auid = decodeURIComponent(p.slice('/api/admin/users/'.length));
      return features.adminUpdateUserRole(user, auid, req.body).then(function (r) { sendJson(res, 200, r); }).catch(function (err) { sendJson(res, err.status || 403, { error: err.message }); });
    }

    if (method === 'GET' && p === '/api/admin/analytics') {
      return features.adminGetAnalytics(user).then(function (a) { sendJson(res, 200, a); }).catch(function (err) { sendJson(res, err.status || 403, { error: err.message }); });
    }

    if (method === 'GET' && p === '/api/admin/storage') {
      var names = storage.knownCollections();
      var rows = [];
      for (var ci = 0; ci < names.length; ci++) rows.push(storage.stats(names[ci]));
      return sendJson(res, 200, { collections: rows });
    }

    if (method === 'POST' && p === '/api/admin/compact') {
      var target = auth.clean(q.collection || (req.body && req.body.collection), 40);
      if (!target) {
        var all = storage.knownCollections();
        return Promise.all(all.map(function (n) { return storage.compact(n); }))
          .then(function (results) { sendJson(res, 200, { results: results }); });
      }
      return storage.compact(target).then(function (r) { sendJson(res, 200, r); });
    }

    if (method === 'POST' && p === '/api/admin/reindex') {
      return sendJson(res, 200, { report: storage.ensureIndexes() });
    }

    if (method === 'POST' && p === '/api/admin/archive') {
      var cname = auth.clean(q.collection || (req.body && req.body.collection), 40);
      var days = parseInt(q.days, 10) || 30;
      return Promise.resolve(storage.archiveOldLogs(cname, days * 86400000))
        .then(function (freed) { sendJson(res, 200, { collection: cname, bytesFreed: freed }); });
    }

    if (method === 'POST' && p === '/api/admin/restore') {
      var rname = auth.clean(q.collection || (req.body && req.body.collection), 40);
      return Promise.resolve(storage.restoreFromArchive(rname))
        .then(function (n) { sendJson(res, 200, { collection: rname, restored: n }); });
    }

    return sendJson(res, 404, { error: 'Unknown admin route.' });
  }

  return sendJson(res, 404, { error: 'API route not found' });
}

// ---- Static files --------------------------------------------------------
function serveStatic(req, res, url) {
  var requested = url.pathname === '/' ? '/index.html' : url.pathname;
  var decoded;
  try { decoded = decodeURIComponent(requested); } catch (e) { decoded = requested; }

  // Reject traversal, then re-check containment with a separator so that
  // "/publicity" cannot pass a naive startsWith(PUBLIC) test.
  if (decoded.indexOf('\u0000') !== -1) return sendJson(res, 400, { error: 'Bad request' });
  var target = path.normalize(path.join(PUBLIC, decoded));
  if (target !== PUBLIC && target.indexOf(PUBLIC + path.sep) !== 0) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  fs.readFile(target, function (err, data) {
    if (err) return sendJson(res, 404, { error: 'Page not found' });
    var ext = path.extname(target).toLowerCase();
    var types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain; charset=utf-8'
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- Entry point ---------------------------------------------------------
function router(req, res) {
  var host = req.headers.host || 'localhost';
  var url;
  try {
    url = new URL(req.url, 'http://' + host);
  } catch (e) {
    return sendJson(res, 400, { error: 'Bad request URL' });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Session-Token'
    });
    return res.end();
  }

  // req.url is a string on the raw request, so expose the parsed query once
  // here rather than each route trying to re-parse it.
  req.query = {};
  url.searchParams.forEach(function (value, key) { req.query[key] = value; });

  if (url.pathname.indexOf('/api/') !== 0) {
    return serveStatic(req, res, url);
  }

  var needsBody = req.method === 'POST' || req.method === 'PUT';
  if (!needsBody) {
    // handleApi returns a promise on async paths and undefined where it
    // answered synchronously, so normalise before attaching a catch.
    return Promise.resolve(handleApi(req, res, url)).catch(reportError);
  }

  parseBody(req)
    .then(function (body) { req.body = body; })
    .then(function () { return handleApi(req, res, url); })
    .catch(function (err) {
      if (res.headersSent) return;
      if (err && /too large|Invalid JSON/i.test(err.message)) {
        return sendJson(res, 400, { error: err.message });
      }
      reportError(err, res);
    });
}

function reportError(err, res) {
  console.error('[error]', err && err.stack ? err.stack : err);
  if (res && !res.headersSent) sendJson(res, 500, { error: (err && err.message) || 'Server error' });
}

bootstrapIndexes();
sweepSessions();
var compactTimer = setInterval(compactIfNeeded, COMPACT_INTERVAL_MS);
var sessionTimer = setInterval(sweepSessions, SESSION_SWEEP_INTERVAL_MS);
compactTimer.unref();
sessionTimer.unref();

var server = http.createServer(function (req, res) {
  try {
    router(req, res);
  } catch (e) {
    reportError(e, res);
  }
});

server.on('error', function (e) {
  console.error('[server]', e.message);
  process.exit(1);
});

server.listen(PORT, function () {
  console.log('Alumni Connect running at http://localhost:' + PORT);
});

process.on('SIGINT', function () {
  console.log('\nShutting down...');
  server.close(function () { process.exit(0); });
});

module.exports = { server: server, router: router };