/**
 * tests/smoke.js — Comprehensive API Smoke Test Suite for Alumni Connect.
 *
 * Requirements:
 *   - Plain Node.js (zero external dependencies)
 *   - Tests student, mentor, and admin logins
 *   - Calls every endpoint checking status codes and response shapes
 *   - Includes negative tests:
 *       * unauthenticated requests -> 401
 *       * student on mentor-only routes -> 403
 *       * mentor on student-only routes -> 403
 *       * non-admin on admin routes -> 403
 *       * duplicate requests -> 409
 *   - Prints a formatted summary table and exits 0 on complete pass.
 */

var http = require('http');
var path = require('path');
var fs = require('fs');

var PORT = process.env.TEST_PORT || 5001;
process.env.PORT = PORT;

// Start server in-process
var serverModule = require('../server');
var server = serverModule.server;

function request(method, pathUrl, token, body) {
  return new Promise(function (resolve, reject) {
    var dataStr = body ? JSON.stringify(body) : '';
    var headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    if (dataStr) {
      headers['Content-Length'] = Buffer.byteLength(dataStr);
    }

    var req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: pathUrl,
      method: method,
      headers: headers
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString('utf8');
        var data = {};
        try { data = JSON.parse(raw); } catch (e) { data = { raw: raw }; }
        resolve({ status: res.statusCode, data: data });
      });
    });

    req.on('error', reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

var tests = [];
var passed = 0;
var failed = 0;

function assert(desc, condition, details) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + desc);
  } else {
    failed++;
    console.error('  ✗ FAIL: ' + desc + (details ? ' (' + details + ')' : ''));
  }
}

async function runSmokeTests() {
  console.log('\n========================================================');
  console.log('  Alumni Connect — API Smoke & Security Test Suite');
  console.log('========================================================\n');

  var studentToken = '';
  var mentorToken = '';
  var adminToken = '';
  var studentUser = null;
  var mentorUser = null;

  // 1. Health
  console.log('--> Section 1: Public & Unauthenticated Endpoints');
  var health = await request('GET', '/api/health');
  assert('GET /api/health returns 200', health.status === 200 && health.data.ok === true);

  // 2. Negative Tests - Authentication required (401)
  var noAuthDash = await request('GET', '/api/dashboard');
  assert('GET /api/dashboard without token returns 401', noAuthDash.status === 401);

  var noAuthSess = await request('GET', '/api/sessions');
  assert('GET /api/sessions without token returns 401', noAuthSess.status === 401);

  // 3. Logins
  console.log('\n--> Section 2: Role Authentication');
  var sLogin = await request('POST', '/api/login', null, {
    email: 'student@alumniconnect.local',
    password: 'student123',
    role: 'student'
  });
  assert('Student login returns 200 & session token', sLogin.status === 200 && !!sLogin.data.session);
  studentToken = sLogin.data.session;
  studentUser = sLogin.data.user;

  var mLogin = await request('POST', '/api/login', null, {
    email: 'alumni@alumniconnect.local',
    password: 'alumni123',
    role: 'mentor'
  });
  assert('Mentor login returns 200 & session token', mLogin.status === 200 && !!mLogin.data.session);
  mentorToken = mLogin.data.session;
  mentorUser = mLogin.data.user;

  var aLogin = await request('POST', '/api/login', null, {
    email: 'admin@alumniconnect.local',
    password: 'admin123'
  });
  assert('Admin login returns 200 & session token', aLogin.status === 200 && !!aLogin.data.session);
  adminToken = aLogin.data.session;

  // 4. Student Portal Endpoints
  console.log('\n--> Section 3: Student Portal Features & Navigation');
  var sDash = await request('GET', '/api/dashboard', studentToken);
  assert('Student dashboard returns role="student" stats', sDash.status === 200 && sDash.data.role === 'student' && sDash.data.stats.activeMentors !== undefined);

  var alumniDir = await request('GET', '/api/alumni', studentToken);
  assert('GET /api/alumni returns directory list', alumniDir.status === 200 && Array.isArray(alumniDir.data.results));

  // DSA Typo-tolerant search
  var typoSearch = await request('GET', '/api/alumni?q=jva', studentToken);
  assert('Typo search "jva" finds Java mentors via Levenshtein', typoSearch.status === 200 && typoSearch.data.results.length > 0);

  // DSA Smart Mentor Match
  var match = await request('GET', '/api/match', studentToken);
  assert('GET /api/match returns ranked mentors with reasons', match.status === 200 && Array.isArray(match.data.results) && match.data.results[0].matchPercentage > 0);

  // Career Roadmap
  var roadmap = await request('GET', '/api/roadmap?goal=backend', studentToken);
  assert('GET /api/roadmap returns backend milestones & mentors', roadmap.status === 200 && roadmap.data.milestones.length > 0);

  // Sessions
  var sSessions = await request('GET', '/api/sessions', studentToken);
  assert('GET /api/sessions returns student session list', sSessions.status === 200 && Array.isArray(sSessions.data.sessions));

  // Opportunities
  var posts = await request('GET', '/api/posts', studentToken);
  assert('GET /api/posts returns opportunities', posts.status === 200 && Array.isArray(posts.data.posts));

  var targetPostId = posts.data.posts[0] ? posts.data.posts[0].id : '';

  // Apply to opportunity
  var appResult = await request('POST', '/api/applications', studentToken, {
    postId: targetPostId,
    note: 'Smoke test application with strong credentials.'
  });
  assert('POST /api/applications returns 201 or 409', appResult.status === 201 || appResult.status === 409);

  // Negative test: Duplicate application -> 409
  var dupApp = await request('POST', '/api/applications', studentToken, {
    postId: targetPostId,
    note: 'Duplicate application'
  });
  assert('POST duplicate application returns 409 Conflict', dupApp.status === 409);

  var myApps = await request('GET', '/api/applications/my', studentToken);
  assert('GET /api/applications/my lists applied jobs', myApps.status === 200 && Array.isArray(myApps.data.applications));

  // Saved opportunity
  var savePost = await request('POST', '/api/saved', studentToken, { postId: targetPostId });
  assert('POST /api/saved saves opportunity for student', savePost.status === 200);

  var getSaved = await request('GET', '/api/saved', studentToken);
  assert('GET /api/saved retrieves saved opportunities', getSaved.status === 200 && Array.isArray(getSaved.data.saved));

  // Event RSVP
  var events = await request('GET', '/api/events', studentToken);
  assert('GET /api/events returns event list', events.status === 200 && Array.isArray(events.data.events));
  if (events.data.events[0]) {
    var rsvp = await request('POST', '/api/events/rsvp', studentToken, { eventId: events.data.events[0].id });
    assert('POST /api/events/rsvp confirms attendance', rsvp.status === 200);
  }

  // Messaging: Student to Mentor
  var sendMsg = await request('POST', '/api/messages', studentToken, {
    toId: mentorUser.id,
    text: 'Smoke test message from student'
  });
  assert('POST /api/messages sends message to mentor', sendMsg.status === 201);

  var threads = await request('GET', '/api/messages/threads', studentToken);
  assert('GET /api/messages/threads lists active conversation', threads.status === 200 && Array.isArray(threads.data.threads));

  // Reviews: Student reviews mentor
  var reviewRes = await request('POST', '/api/reviews', studentToken, {
    mentorId: mentorUser.id,
    rating: 5,
    comment: 'Exceptional mock interview prep from smoke test suite!'
  });
  assert('POST /api/reviews submits 5-star review', reviewRes.status === 201);

  // Leaderboard
  var lb = await request('GET', '/api/leaderboard', studentToken);
  assert('GET /api/leaderboard ranks mentors with points', lb.status === 200 && Array.isArray(lb.data.mentors));

  // Activity Timeline
  var activity = await request('GET', '/api/activity', studentToken);
  assert('GET /api/activity returns student actions', activity.status === 200 && Array.isArray(activity.data.items));

  // Giving Campaign
  var camps = await request('GET', '/api/campaigns', studentToken);
  assert('GET /api/campaigns returns donation drives', camps.status === 200 && Array.isArray(camps.data.campaigns));

  // Negative security tests for Student role
  console.log('\n--> Section 4: Security Role Enforcement — Student Role Forbidden Paths');
  var sForbiddenAvail = await request('PUT', '/api/availability', studentToken, { maxMentees: 10 });
  assert('Student cannot update mentor availability (403)', sForbiddenAvail.status === 403);

  var sForbiddenMentees = await request('GET', '/api/mentees', studentToken);
  assert('Student cannot view mentees list (403)', sForbiddenMentees.status === 403);

  var sForbiddenReferral = await request('POST', '/api/referrals', studentToken, { studentId: studentUser.id });
  assert('Student cannot create job referral (403)', sForbiddenReferral.status === 403);

  var sForbiddenAdminUsers = await request('GET', '/api/admin/users', studentToken);
  assert('Student cannot access admin users endpoint (403)', sForbiddenAdminUsers.status === 403);

  var sForbiddenAdminAnalytics = await request('GET', '/api/admin/analytics', studentToken);
  assert('Student cannot access admin analytics endpoint (403)', sForbiddenAdminAnalytics.status === 403);

  // 5. Mentor Portal Endpoints
  console.log('\n--> Section 5: Mentor Portal Features & Navigation');
  var mDash = await request('GET', '/api/dashboard', mentorToken);
  assert('Mentor dashboard returns role="alumni" stats (pendingRequests, activeMentees)',
    mDash.status === 200 && mDash.data.role === 'alumni' && mDash.data.stats.pendingRequests !== undefined && mDash.data.stats.activeMentees !== undefined);

  var mMentees = await request('GET', '/api/mentees', mentorToken);
  assert('GET /api/mentees returns accepted student mentees', mMentees.status === 200 && Array.isArray(mMentees.data.mentees));

  var mAvail = await request('PUT', '/api/availability', mentorToken, {
    isOpen: true,
    maxMentees: 8,
    slots: 'Weekday evenings (6pm-8pm); Saturday mornings (10am-12pm)'
  });
  assert('PUT /api/availability updates weekly schedule & capacity', mAvail.status === 200);

  // Mentor publishes opportunity
  var mPost = await request('POST', '/api/posts', mentorToken, {
    title: 'Senior Software Engineer Referral opening',
    type: 'referral',
    company: 'Google Cloud',
    content: 'Looking for talented graduates with strong DSA and systems knowledge.',
    tags: 'Java, DSA, Cloud, Kubernetes'
  });
  assert('POST /api/posts by mentor publishes opportunity', mPost.status === 201);

  var mOwnPosts = await request('GET', '/api/posts?my=1', mentorToken);
  assert('GET /api/posts?my=1 filters mentor published posts', mOwnPosts.status === 200 && mOwnPosts.data.posts.length > 0);

  // Mentor reviews
  var mReviews = await request('GET', '/api/reviews', mentorToken);
  assert('GET /api/reviews returns ratings, average, and badges', mReviews.status === 200 && Array.isArray(mReviews.data.reviews));

  // Mentor referrals
  var mRef = await request('POST', '/api/referrals', mentorToken, {
    studentId: studentUser.id,
    company: 'Microsoft',
    role: 'Software Development Engineer',
    notes: 'Strong candidate with exceptional academic consistency.'
  });
  assert('POST /api/referrals creates referral for mentee', mRef.status === 201);

  var mGetRefs = await request('GET', '/api/referrals', mentorToken);
  assert('GET /api/referrals lists created referrals', mGetRefs.status === 200 && Array.isArray(mGetRefs.data.referrals));

  // Mentor messaging
  var mReply = await request('POST', '/api/messages', mentorToken, {
    toId: studentUser.id,
    text: 'Smoke test response from mentor: great progress on system design!'
  });
  assert('POST /api/messages mentor replies to student', mReply.status === 201);

  var mUnread = await request('GET', '/api/messages/unread-count', mentorToken);
  assert('GET /api/messages/unread-count returns integer count', mUnread.status === 200 && typeof mUnread.data.count === 'number');

  // Negative security tests for Mentor role
  console.log('\n--> Section 6: Security Role Enforcement — Mentor Role Forbidden Paths');
  var mForbiddenApply = await request('POST', '/api/applications', mentorToken, { postId: targetPostId });
  assert('Mentor cannot apply to job opportunities (403)', mForbiddenApply.status === 403);

  var mForbiddenReview = await request('POST', '/api/reviews', mentorToken, { mentorId: mentorUser.id, comment: 'Self review' });
  assert('Mentor cannot submit student reviews (403)', mForbiddenReview.status === 403);

  var mForbiddenStorage = await request('GET', '/api/admin/storage', mentorToken);
  assert('Mentor cannot access admin storage endpoint (403)', mForbiddenStorage.status === 403);

  // 6. Admin Portal Endpoints
  console.log('\n--> Section 7: Admin Portal & Academic Algorithm Lab');
  var aDash = await request('GET', '/api/dashboard', adminToken);
  assert('Admin dashboard returns full system metrics', aDash.status === 200 && aDash.data.role === 'admin' && aDash.data.stats.totalUsers > 0);

  var aUsers = await request('GET', '/api/admin/users', adminToken);
  assert('GET /api/admin/users returns user roster', aUsers.status === 200 && Array.isArray(aUsers.data.users));

  var aVerify = await request('PUT', '/api/admin/verify-mentor', adminToken, { userId: mentorUser.id, verified: true });
  assert('PUT /api/admin/verify-mentor updates verified badge', aVerify.status === 200 && aVerify.data.verified === true);

  var aAnalytics = await request('GET', '/api/admin/analytics', adminToken);
  assert('GET /api/admin/analytics returns mentorship funnel & skills breakdown',
    aAnalytics.status === 200 && aAnalytics.data.funnel.requested !== undefined && Array.isArray(aAnalytics.data.topSkills));

  var aStorage = await request('GET', '/api/admin/storage', adminToken);
  assert('GET /api/admin/storage returns collection sizes & records', aStorage.status === 200 && Array.isArray(aStorage.data.collections));

  // DSA Algorithm Lab
  var algoList = await request('GET', '/api/algorithms', adminToken);
  assert('GET /api/algorithms returns all 34 DSA algorithms', algoList.status === 200 && algoList.data.algorithms.length === 34);

  var runKmp = await request('POST', '/api/algorithms/run', adminToken, { algorithm: 'kmp' });
  assert('POST /api/algorithms/run executes KMP pattern search', runKmp.status === 200 && runKmp.data.result.length > 0);

  var runLev = await request('POST', '/api/algorithms/run', adminToken, {
    algorithm: 'levenshtein',
    input: { a: 'alumni', b: 'almuni' }
  });
  assert('POST /api/algorithms/run executes Levenshtein distance (=2)', runLev.status === 200 && runLev.data.result === 2);

  // Profile update
  var updateProf = await request('PUT', '/api/profile', studentToken, {
    bio: 'Updated bio from automated test suite.'
  });
  assert('PUT /api/profile updates user bio', updateProf.status === 200 && updateProf.data.user.bio.indexOf('Updated bio') !== -1);

  // Notifications
  var notifs = await request('GET', '/api/notifications', studentToken);
  assert('GET /api/notifications returns student notifications', notifs.status === 200 && Array.isArray(notifs.data.notifications));

  var readAllNotifs = await request('POST', '/api/notifications/read-all', studentToken);
  assert('POST /api/notifications/read-all clears unread count', readAllNotifs.status === 200);

  // Summary
  console.log('\n========================================================');
  console.log('  TEST SUMMARY');
  console.log('  Total tests: ' + (passed + failed));
  console.log('  Passed:      ' + passed);
  console.log('  Failed:      ' + failed);
  console.log('========================================================\n');

  // Close server cleanly
  server.close(function () {
    process.exit(failed > 0 ? 1 : 0);
  });
}

runSmokeTests().catch(function (err) {
  console.error('[SMOKE ERROR]', err);
  process.exit(1);
});
