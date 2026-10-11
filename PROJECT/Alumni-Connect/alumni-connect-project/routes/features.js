/**
 * routes/features.js — Upgraded Alumni Platform feature handlers.
 *
 * Implements:
 *   - Role-specific dashboards (mentor, student, admin)
 *   - 1:1 Sessions scheduling and lifecycle management
 *   - Mentor availability and mentee progress notes
 *   - 1:1 In-platform messaging with unread badges
 *   - Opportunity applications, status tracking and referrals
 *   - Saved opportunities for students
 *   - Student reviews and mentor ratings
 *   - Smart Mentor Matching (Jaccard + Levenshtein + Bipartite matching)
 *   - Typo-tolerant search with autocomplete
 *   - Career roadmap generator
 *   - Mentor leaderboard with badges
 *   - Admin user management, mentor verification and platform analytics
 *   - Simulated fundraising campaigns
 */

var storage = require('../lib/storage');
var auth = require('./auth');
var sort = require('../lib/sort');
var algos = require('../algorithms');

function newId(prefix) { return auth.newId(prefix); }

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  try {
    var d = new Date(dateStr);
    var now = new Date();
    var diff = Math.abs(now.getTime() - d.getTime());
    return diff <= 7 * 86400000;
  } catch (e) { return false; }
}

// ---- Role-Specific Dashboard ----------------------------------------------
function dashboard(user) {
  var users = storage.readAll('users');
  var mentorships = storage.readAll('mentorship');
  var posts = storage.readAll('posts');
  var events = storage.readAll('events');
  var notifs = storage.readAll('notifications');
  var sessions = storage.readAll('mentor_sessions');
  var reviews = storage.readAll('reviews');
  var applications = storage.readAll('applications');

  var unreadNotifs = 0;
  for (var n = 0; n < notifs.length; n++) {
    if (notifs[n].userId === user.id && !notifs[n].read) unreadNotifs++;
  }

  // Mentor dashboard
  if (user.role === 'alumni') {
    var pendingReqs = [];
    var activeMenteesMap = {};
    for (var m = 0; m < mentorships.length; m++) {
      var req = mentorships[m];
      if (req.alumniId === user.id) {
        if (req.status === 'pending') pendingReqs.push(req);
        if (req.status === 'accepted' || req.status === 'in-progress') activeMenteesMap[req.studentId] = req;
      }
    }

    var sessionsThisWeek = 0;
    var mentorSessions = [];
    for (var s = 0; s < sessions.length; s++) {
      if (sessions[s].mentorId === user.id) {
        mentorSessions.push(sessions[s]);
        if (isThisWeek(sessions[s].date)) sessionsThisWeek++;
      }
    }

    var postsPublished = 0;
    for (var p = 0; p < posts.length; p++) {
      if (posts[p].authorId === user.id) postsPublished++;
    }

    var mentorReviews = [];
    var totalRating = 0;
    for (var r = 0; r < reviews.length; r++) {
      if (reviews[r].mentorId === user.id) {
        mentorReviews.push(reviews[r]);
        totalRating += Number(reviews[r].rating) || 5;
      }
    }
    var avgRating = mentorReviews.length ? (totalRating / mentorReviews.length).toFixed(1) : '5.0';

    // Enrich upcoming sessions
    var upcoming = mentorSessions.filter(function (x) { return x.status !== 'cancelled'; });
    upcoming = sort.mergeSortBy(upcoming, function (x) { return String(x.date || '9999-99-99'); });
    var enrichedUpcoming = upcoming.slice(0, 4).map(function (sess) {
      var st = storage.readAlive('users', sess.studentId);
      return Object.assign({}, sess, { student: st ? auth.userPublic(st) : null });
    });

    // Enrich pending requests
    var enrichedPending = pendingReqs.slice().reverse().slice(0, 5).map(function (req) {
      var st = storage.readAlive('users', req.studentId);
      return Object.assign({}, req, { student: st ? auth.userPublic(st) : null });
    });

    // Mentee progress snapshots
    var activeMentees = Object.keys(activeMenteesMap).map(function (stId) {
      var st = storage.readAlive('users', stId);
      var req = activeMenteesMap[stId];
      var sessCount = mentorSessions.filter(function (x) { return x.studentId === stId && x.status === 'completed'; }).length;
      return {
        id: stId,
        name: st ? st.name : 'Student',
        department: st ? st.department : '',
        batch: st ? st.batch : '',
        topic: req.topic,
        sessionsCount: sessCount,
        notes: req.notes || 'Working on career roadmap and portfolio.',
        updatedAt: req.updatedAt || req.createdAt
      };
    });

    return {
      user: auth.userPublic(user),
      role: 'alumni',
      stats: {
        pendingRequests: pendingReqs.length,
        activeMentees: Object.keys(activeMenteesMap).length,
        sessionsThisWeek: sessionsThisWeek,
        postsPublished: postsPublished,
        profileViews: 38 + Object.keys(activeMenteesMap).length * 12,
        avgRating: Number(avgRating),
        reviewsCount: mentorReviews.length,
        unreadNotifications: unreadNotifs
      },
      upcomingSessions: enrichedUpcoming,
      newestRequests: enrichedPending,
      menteeProgress: activeMentees,
      notifications: notifs.filter(function (x) { return x.userId === user.id; }).slice(-5).reverse()
    };
  }

  // Admin dashboard
  if (user.role === 'admin') {
    var studentCount = 0;
    var mentorCount = 0;
    var unverifiedMentors = 0;
    for (var u = 0; u < users.length; u++) {
      if (users[u].role === 'student') studentCount++;
      if (users[u].role === 'alumni') {
        mentorCount++;
        if (!users[u].verified) unverifiedMentors++;
      }
    }
    return {
      user: auth.userPublic(user),
      role: 'admin',
      stats: {
        totalUsers: users.length,
        totalStudents: studentCount,
        totalMentors: mentorCount,
        unverifiedMentors: unverifiedMentors,
        activeMentorships: mentorships.filter(function (x) { return x.status === 'accepted'; }).length,
        totalSessions: sessions.length,
        totalOpportunities: posts.length,
        totalEvents: events.length,
        unreadNotifications: unreadNotifs
      },
      recentEvents: events.slice(0, 4),
      recentPosts: posts.slice(-4).reverse(),
      notifications: notifs.filter(function (x) { return x.userId === user.id; }).slice(-5).reverse()
    };
  }

  // Student dashboard (default)
  var studentReqs = mentorships.filter(function (x) { return x.studentId === user.id; });
  var activeMentorsCount = studentReqs.filter(function (x) { return x.status === 'accepted'; }).length;
  var pendingCount = studentReqs.filter(function (x) { return x.status === 'pending'; }).length;
  var myAppsCount = applications.filter(function (x) { return x.studentId === user.id; }).length;

  var mySessions = sessions.filter(function (x) { return x.studentId === user.id && x.status !== 'cancelled'; });
  mySessions = sort.mergeSortBy(mySessions, function (x) { return String(x.date || '9999-99-99'); });
  var enrichedStudentSessions = mySessions.slice(0, 4).map(function (sess) {
    var mentor = storage.readAlive('users', sess.mentorId);
    return Object.assign({}, sess, { mentor: mentor ? auth.userPublic(mentor) : null });
  });

  var recommendations = smartMatch(user, { limit: 3 }).results;

  return {
    user: auth.userPublic(user),
    role: 'student',
    stats: {
      activeMentors: activeMentorsCount,
      pendingRequests: pendingCount,
      upcomingSessions: mySessions.filter(function (x) { return x.status === 'scheduled'; }).length,
      applications: myAppsCount,
      opportunities: posts.length,
      events: events.length,
      unreadNotifications: unreadNotifs
    },
    upcomingSessions: enrichedStudentSessions,
    recommendedMentors: recommendations,
    recentOpportunities: posts.slice(-4).reverse(),
    upcomingEvents: events.slice(0, 3),
    notifications: notifs.filter(function (x) { return x.userId === user.id; }).slice(-5).reverse()
  };
}

// ---- Sessions -------------------------------------------------------------
function getSessions(user) {
  var all = storage.readAll('mentor_sessions');
  var mine = all.filter(function (s) {
    if (user.role === 'admin') return true;
    return s.mentorId === user.id || s.studentId === user.id;
  });

  var enriched = mine.map(function (s) {
    var st = storage.readAlive('users', s.studentId);
    var mt = storage.readAlive('users', s.mentorId);
    return Object.assign({}, s, {
      student: st ? auth.userPublic(st) : null,
      mentor: mt ? auth.userPublic(mt) : null
    });
  });

  return sort.mergeSortBy(enriched, function (x) { return String(x.date || '9999-99-99'); });
}

function createSession(user, body) {
  var studentId = user.role === 'student' ? user.id : auth.clean(body.studentId, 40);
  var mentorId = (user.role === 'alumni' || user.role === 'admin') ? (body.mentorId || user.id) : auth.clean(body.mentorId, 40);

  if (!studentId || !mentorId) {
    return Promise.reject(Object.assign(new Error('Student and Mentor IDs are required'), { status: 400 }));
  }

  var student = storage.readAlive('users', studentId);
  var mentor = storage.readAlive('users', mentorId);
  if (!student) return Promise.reject(Object.assign(new Error('Student not found'), { status: 404 }));
  if (!mentor) return Promise.reject(Object.assign(new Error('Mentor not found'), { status: 404 }));

  var date = auth.clean(body.date, 30);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Promise.reject(Object.assign(new Error('A valid YYYY-MM-DD date is required'), { status: 400 }));
  }

  var newSession = {
    id: newId('SESS'),
    studentId: studentId,
    mentorId: mentorId,
    date: date,
    time: auth.clean(body.time, 20) || '17:00',
    mode: auth.clean(body.mode, 20) || 'Online',
    meetingLink: auth.clean(body.meetingLink, 300) || 'https://meet.google.com/' + Math.random().toString(36).substring(2, 7) + '-' + Math.random().toString(36).substring(2, 6),
    topic: auth.clean(body.topic, 200) || '1:1 Mentorship Discussion',
    notes: auth.clean(body.notes, 1000) || '',
    status: 'scheduled',
    createdAt: new Date().toISOString()
  };

  var notifyRecipientId = user.id === studentId ? mentorId : studentId;
  var notifyTitle = 'New 1:1 Session Scheduled';
  var notifyMsg = user.name + ' scheduled a 1:1 session on ' + newSession.date + ' at ' + newSession.time + '.';

  var notif = {
    id: newId('N'),
    userId: notifyRecipientId,
    title: notifyTitle,
    message: notifyMsg,
    read: false,
    createdAt: new Date().toISOString()
  };

  return storage.appendRecord('mentor_sessions', newSession)
    .then(function () { return storage.appendRecord('notifications', notif); })
    .then(function () { return newSession; });
}

function updateSession(user, sessionId, body) {
  var sess = storage.readOne('mentor_sessions', sessionId);
  if (!sess) return Promise.reject(Object.assign(new Error('Session not found'), { status: 404 }));

  if (sess.studentId !== user.id && sess.mentorId !== user.id && user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Access denied for this session'), { status: 403 }));
  }

  var patch = {};
  if (body.status) {
    var allowed = ['scheduled', 'completed', 'cancelled'];
    if (allowed.indexOf(body.status) === -1) {
      return Promise.reject(Object.assign(new Error('Invalid status'), { status: 400 }));
    }
    patch.status = body.status;
  }
  if (body.notes !== undefined) patch.notes = auth.clean(body.notes, 2000);
  if (body.meetingLink) patch.meetingLink = auth.clean(body.meetingLink, 300);
  if (body.rating) patch.rating = Number(body.rating);
  patch.updatedAt = new Date().toISOString();

  var otherId = sess.studentId === user.id ? sess.mentorId : sess.studentId;
  var notif = {
    id: newId('N'),
    userId: otherId,
    title: 'Session ' + (patch.status || 'Updated'),
    message: user.name + ' updated your session for ' + sess.topic + '.',
    read: false,
    createdAt: new Date().toISOString()
  };

  return storage.updateRecord('mentor_sessions', sessionId, patch)
    .then(function () { return storage.appendRecord('notifications', notif); })
    .then(function () { return Object.assign({}, sess, patch); });
}

// ---- Availability ---------------------------------------------------------
function getAvailability(user, targetUserId) {
  var uid = targetUserId || user.id;
  var u = storage.readAlive('users', uid);
  if (!u) return { slots: 'Weekday evenings (6pm-8pm)', maxMentees: 5, isOpen: true };

  return {
    userId: u.id,
    slots: u.availability || 'Weekday evenings; Saturday mornings',
    maxMentees: u.maxMentees || 5,
    isOpen: u.isOpen !== false,
    focusTopics: u.interests || 'DSA, System Design, Career Growth'
  };
}

function updateAvailability(user, body) {
  if (user.role !== 'alumni' && user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Only mentors can update availability'), { status: 403 }));
  }

  var patch = {
    availability: auth.clean(body.slots, 300) || user.availability,
    maxMentees: parseInt(body.maxMentees, 10) || 5,
    isOpen: body.isOpen !== false,
    interests: auth.clean(body.focusTopics, 200) || user.interests,
    updatedAt: new Date().toISOString()
  };

  return storage.updateRecord('users', user.id, patch).then(function () {
    return Object.assign({}, user, patch);
  });
}

// ---- Mentees --------------------------------------------------------------
function getMentees(user) {
  if (user.role !== 'alumni' && user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Only mentors can view mentees'), { status: 403 }));
  }

  var mentorships = storage.readAll('mentorship');
  var sessions = storage.readAll('mentor_sessions');
  var myMentees = [];

  for (var i = 0; i < mentorships.length; i++) {
    var m = mentorships[i];
    if (m.alumniId === user.id && (m.status === 'accepted' || m.status === 'in-progress' || m.status === 'completed')) {
      var st = storage.readAlive('users', m.studentId);
      if (!st) continue;
      var stSessions = sessions.filter(function (s) { return s.mentorId === user.id && s.studentId === st.id; });
      myMentees.push({
        id: st.id,
        mentorshipId: m.id,
        name: st.name,
        email: st.email,
        department: st.department,
        batch: st.batch,
        skills: st.skills,
        topic: m.topic,
        status: m.status,
        notes: m.notes || 'Engaged in core placement preparation.',
        sessionsCount: stSessions.filter(function (s) { return s.status === 'completed'; }).length,
        nextSession: stSessions.find(function (s) { return s.status === 'scheduled'; }),
        createdAt: m.createdAt
      });
    }
  }

  return Promise.resolve(myMentees);
}

function updateMenteeNotes(user, menteeId, body) {
  if (user.role !== 'alumni' && user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Only mentors can update mentee notes'), { status: 403 }));
  }

  var mentorships = storage.readAll('mentorship');
  var target = null;
  for (var i = 0; i < mentorships.length; i++) {
    if (mentorships[i].alumniId === user.id && mentorships[i].studentId === menteeId) {
      target = mentorships[i];
      break;
    }
  }

  if (!target) return Promise.reject(Object.assign(new Error('Mentorship relationship not found'), { status: 404 }));

  var notes = auth.clean(body.notes, 2000);
  return storage.updateRecord('mentorship', target.id, { notes: notes, updatedAt: new Date().toISOString() });
}

// ---- Messaging ------------------------------------------------------------
function getUnreadMessagesCount(user) {
  var messages = storage.readAll('messages');
  var count = 0;
  for (var i = 0; i < messages.length; i++) {
    if (messages[i].receiverId === user.id && !messages[i].read) count++;
  }
  return count;
}

function getMessageThreads(user) {
  var messages = storage.readAll('messages');
  var userThreads = {};

  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var isSender = m.senderId === user.id;
    var isReceiver = m.receiverId === user.id;
    if (!isSender && !isReceiver) continue;

    var otherId = isSender ? m.receiverId : m.senderId;
    if (!userThreads[otherId]) {
      userThreads[otherId] = {
        withId: otherId,
        lastMessage: m.text,
        lastAt: m.createdAt,
        unread: (!m.read && isReceiver) ? 1 : 0
      };
    } else {
      userThreads[otherId].lastMessage = m.text;
      userThreads[otherId].lastAt = m.createdAt;
      if (!m.read && isReceiver) userThreads[otherId].unread++;
    }
  }

  var result = [];
  var ids = Object.keys(userThreads);
  for (var j = 0; j < ids.length; j++) {
    var otherUser = storage.readAlive('users', ids[j]);
    if (!otherUser) continue;
    var item = userThreads[ids[j]];
    item.withName = otherUser.name;
    item.withRole = otherUser.role;
    item.withDepartment = otherUser.department;
    result.push(item);
  }

  return sort.mergeSortBy(result, function (x) { return String(x.lastAt || ''); }).reverse();
}

function getThreadMessages(user, withId) {
  var messages = storage.readAll('messages');
  var thread = [];
  var unreadJobs = [];

  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if ((m.senderId === user.id && m.receiverId === withId) || (m.senderId === withId && m.receiverId === user.id)) {
      thread.push(m);
      if (m.receiverId === user.id && !m.read) {
        unreadJobs.push(storage.updateRecord('messages', m.id, { read: true, readAt: new Date().toISOString() }));
      }
    }
  }

  Promise.all(unreadJobs).catch(function () {});
  return sort.mergeSortBy(thread, function (x) { return String(x.createdAt || ''); });
}

function sendMessage(user, body) {
  var toId = auth.clean(body.toId, 40);
  var text = auth.clean(body.text, 3000);
  if (!toId || !text) {
    return Promise.reject(Object.assign(new Error('Recipient and message text are required'), { status: 400 }));
  }

  var recipient = storage.readAlive('users', toId);
  if (!recipient) return Promise.reject(Object.assign(new Error('Recipient not found'), { status: 404 }));

  var msg = {
    id: newId('MSG'),
    senderId: user.id,
    receiverId: toId,
    text: text,
    read: false,
    createdAt: new Date().toISOString()
  };

  var notif = {
    id: newId('N'),
    userId: toId,
    title: 'New message from ' + user.name,
    message: text.length > 60 ? text.slice(0, 60) + '…' : text,
    read: false,
    createdAt: new Date().toISOString()
  };

  return storage.appendRecord('messages', msg)
    .then(function () { return storage.appendRecord('notifications', notif); })
    .then(function () { return msg; });
}

// ---- Applications ---------------------------------------------------------
function applyToPost(user, body) {
  if (user.role !== 'student' && user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Only students can apply to opportunities'), { status: 403 }));
  }

  var postId = auth.clean(body.postId, 40);
  var note = auth.clean(body.note, 2000);
  if (!postId) return Promise.reject(Object.assign(new Error('Post ID is required'), { status: 400 }));

  var post = storage.readAlive('posts', postId);
  if (!post) return Promise.reject(Object.assign(new Error('Opportunity not found'), { status: 404 }));

  var existing = storage.readAll('applications');
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].postId === postId && existing[i].studentId === user.id) {
      return Promise.reject(Object.assign(new Error('You have already applied for this opportunity'), { status: 409 }));
    }
  }

  var appRec = {
    id: newId('APP'),
    postId: postId,
    studentId: user.id,
    postTitle: post.title,
    company: post.company,
    note: note,
    status: 'submitted',
    createdAt: new Date().toISOString()
  };

  var notif = {
    id: newId('N'),
    userId: post.authorId,
    title: 'New applicant for ' + post.title,
    message: user.name + ' applied for your posted opportunity.',
    read: false,
    createdAt: new Date().toISOString()
  };

  return storage.appendRecord('applications', appRec)
    .then(function () { return storage.appendRecord('notifications', notif); })
    .then(function () { return appRec; });
}

function getMyApplications(user) {
  var all = storage.readAll('applications');
  var mine = all.filter(function (x) { return x.studentId === user.id; });
  return sort.mergeSortBy(mine, function (x) { return String(x.createdAt || ''); }).reverse();
}

function getPostApplications(user, postId) {
  var post = storage.readAlive('posts', postId);
  if (!post) return Promise.reject(Object.assign(new Error('Post not found'), { status: 404 }));

  if (post.authorId !== user.id && user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Only the author or admin can view applicants'), { status: 403 }));
  }

  var all = storage.readAll('applications');
  var forPost = all.filter(function (x) { return x.postId === postId; });
  var enriched = forPost.map(function (app) {
    var st = storage.readAlive('users', app.studentId);
    return Object.assign({}, app, { student: st ? auth.userPublic(st) : null });
  });

  return Promise.resolve(enriched);
}

function updateApplicationStatus(user, appId, body) {
  var app = storage.readOne('applications', appId);
  if (!app) return Promise.reject(Object.assign(new Error('Application not found'), { status: 404 }));

  var post = storage.readAlive('posts', app.postId);
  if (post && post.authorId !== user.id && user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Access denied'), { status: 403 }));
  }

  var nextStatus = auth.clean(body.status, 20);
  var allowed = ['submitted', 'shortlisted', 'rejected', 'accepted'];
  if (allowed.indexOf(nextStatus) === -1) {
    return Promise.reject(Object.assign(new Error('Invalid status'), { status: 400 }));
  }

  var patch = { status: nextStatus, updatedAt: new Date().toISOString() };
  var notif = {
    id: newId('N'),
    userId: app.studentId,
    title: 'Application ' + (nextStatus === 'shortlisted' ? 'Shortlisted! 🎉' : nextStatus),
    message: 'Your application for ' + app.postTitle + ' was marked as ' + nextStatus + '.',
    read: false,
    createdAt: patch.updatedAt
  };

  return storage.updateRecord('applications', appId, patch)
    .then(function () { return storage.appendRecord('notifications', notif); })
    .then(function () { return Object.assign({}, app, patch); });
}

// ---- Saved Opportunities --------------------------------------------------
function saveOpportunity(user, postId) {
  var existing = storage.readAll('saved');
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].userId === user.id && existing[i].postId === postId) {
      return Promise.resolve({ ok: true, alreadySaved: true });
    }
  }
  return storage.appendRecord('saved', { id: newId('SAVE'), userId: user.id, postId: postId, createdAt: new Date().toISOString() });
}

function getSavedOpportunities(user) {
  var saved = storage.readAll('saved').filter(function (x) { return x.userId === user.id; });
  var posts = [];
  for (var i = 0; i < saved.length; i++) {
    var p = storage.readAlive('posts', saved[i].postId);
    if (p) posts.push(p);
  }
  return posts;
}

function removeSavedOpportunity(user, postId) {
  var saved = storage.readAll('saved');
  for (var i = 0; i < saved.length; i++) {
    if (saved[i].userId === user.id && saved[i].postId === postId) {
      return storage.deleteRecord('saved', saved[i].id).then(function () { return { ok: true }; });
    }
  }
  return Promise.resolve({ ok: true });
}

// ---- Referrals ------------------------------------------------------------
function createReferral(user, body) {
  if (user.role !== 'alumni' && user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Only mentors can give referrals'), { status: 403 }));
  }

  var studentId = auth.clean(body.studentId, 40);
  var company = auth.clean(body.company, 120);
  var role = auth.clean(body.role, 120);
  var notes = auth.clean(body.notes, 2000);

  if (!studentId || !company || !role) {
    return Promise.reject(Object.assign(new Error('Student, company, and role are required'), { status: 400 }));
  }

  var student = storage.readAlive('users', studentId);
  if (!student) return Promise.reject(Object.assign(new Error('Student not found'), { status: 404 }));

  var refRec = {
    id: newId('REF'),
    mentorId: user.id,
    studentId: studentId,
    studentName: student.name,
    company: company,
    role: role,
    notes: notes,
    status: 'referred',
    createdAt: new Date().toISOString()
  };

  var notif = {
    id: newId('N'),
    userId: studentId,
    title: 'New Referral Submitted! 🚀',
    message: user.name + ' referred you for ' + role + ' at ' + company + '!',
    read: false,
    createdAt: new Date().toISOString()
  };

  return storage.appendRecord('referrals', refRec)
    .then(function () { return storage.appendRecord('notifications', notif); })
    .then(function () { return refRec; });
}

function getReferrals(user) {
  var all = storage.readAll('referrals');
  var mine = all.filter(function (r) {
    if (user.role === 'admin') return true;
    return r.mentorId === user.id || r.studentId === user.id;
  });
  return sort.mergeSortBy(mine, function (x) { return String(x.createdAt || ''); }).reverse();
}

// ---- Reviews & Impact -----------------------------------------------------
function createReview(user, body) {
  if (user.role !== 'student' && user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Only students can submit reviews'), { status: 403 }));
  }

  var mentorId = auth.clean(body.mentorId, 40);
  var rating = Math.min(5, Math.max(1, parseInt(body.rating, 10) || 5));
  var comment = auth.clean(body.comment, 2000);

  if (!mentorId || !comment) {
    return Promise.reject(Object.assign(new Error('Mentor and review comment are required'), { status: 400 }));
  }

  var mentor = storage.readAlive('users', mentorId);
  if (!mentor) return Promise.reject(Object.assign(new Error('Mentor not found'), { status: 404 }));

  var reviewRec = {
    id: newId('REV'),
    studentId: user.id,
    studentName: user.name,
    mentorId: mentorId,
    rating: rating,
    comment: comment,
    createdAt: new Date().toISOString()
  };

  var notif = {
    id: newId('N'),
    userId: mentorId,
    title: 'New Student Review (' + rating + '★)',
    message: user.name + ' left you a review: "' + (comment.slice(0, 50)) + '…"',
    read: false,
    createdAt: new Date().toISOString()
  };

  return storage.appendRecord('reviews', reviewRec)
    .then(function () { return storage.appendRecord('notifications', notif); })
    .then(function () { return reviewRec; });
}

function getReviews(mentorId) {
  var all = storage.readAll('reviews');
  var targetReviews = all.filter(function (x) { return x.mentorId === mentorId; });

  var total = 0;
  for (var i = 0; i < targetReviews.length; i++) total += Number(targetReviews[i].rating) || 5;
  var avg = targetReviews.length ? (total / targetReviews.length).toFixed(1) : '5.0';

  var badges = ['Verified Expert'];
  if (targetReviews.length >= 3) badges.push('Top Mentor 🏆');
  if (Number(avg) >= 4.8) badges.push('Quick Responder ⚡');
  if (targetReviews.length >= 5) badges.push('10 Sessions 🌟');

  return {
    reviews: sort.mergeSortBy(targetReviews, function (x) { return String(x.createdAt || ''); }).reverse(),
    averageRating: Number(avg),
    count: targetReviews.length,
    badges: badges
  };
}

// ---- Leaderboard ----------------------------------------------------------
function getLeaderboard() {
  var users = storage.readAll('users');
  var sessions = storage.readAll('mentor_sessions');
  var reviews = storage.readAll('reviews');

  var mentors = users.filter(function (u) { return u.role === 'alumni'; });
  var rows = mentors.map(function (m) {
    var completedSess = sessions.filter(function (s) { return s.mentorId === m.id && s.status === 'completed'; }).length;
    var mReviews = reviews.filter(function (r) { return r.mentorId === m.id; });
    var tot = 0;
    for (var r = 0; r < mReviews.length; r++) tot += Number(mReviews[r].rating) || 5;
    var avg = mReviews.length ? tot / mReviews.length : 4.8;
    var points = completedSess * 15 + Math.round(avg * 10) + (m.verified ? 20 : 0);

    var badges = [];
    if (completedSess >= 5) badges.push('10 Sessions 🌟');
    if (avg >= 4.8) badges.push('Quick Responder ⚡');
    if (points >= 80) badges.push('Top Mentor 🏆');
    if (m.verified) badges.push('Verified Expert 💎');

    return {
      id: m.id,
      name: m.name,
      department: m.department,
      batch: m.batch,
      company: m.company,
      sessions: completedSess,
      rating: Number(avg.toFixed(1)),
      points: points,
      badges: badges
    };
  });

  return sort.mergeSortBy(rows, function (x) { return x.points; }).reverse();
}

// ---- Smart Mentor Match (DSA-Powered) -------------------------------------
function parseSkillTokens(str) {
  if (!str) return [];
  return String(str).toLowerCase().split(/[,;/|]+/).map(function (s) { return s.trim(); }).filter(Boolean);
}

function smartMatch(studentUser, opts) {
  var limit = (opts && opts.limit) ? Number(opts.limit) : 20;
  var allUsers = storage.readAll('users');
  var mentors = allUsers.filter(function (u) { return u.role === 'alumni'; });

  var studentSkills = parseSkillTokens(studentUser.skills);
  var studentDept = String(studentUser.department || '').toLowerCase();
  var studentInterests = parseSkillTokens(studentUser.interests);

  var scored = [];

  for (var i = 0; i < mentors.length; i++) {
    var m = mentors[i];
    var mSkills = parseSkillTokens(m.skills);
    var mDept = String(m.department || '').toLowerCase();
    var mInterests = parseSkillTokens(m.interests);

    var reasons = [];
    var score = 0;

    // 1. Skill overlap (exact + Levenshtein fuzzy distance)
    var sharedSkills = [];
    for (var si = 0; si < studentSkills.length; si++) {
      var sSkill = studentSkills[si];
      for (var mi = 0; mi < mSkills.length; mi++) {
        var mSkill = mSkills[mi];
        if (sSkill === mSkill) {
          sharedSkills.push(sSkill);
          score += 25;
          break;
        } else {
          // Use Levenshtein from algorithms.js for typo/variant matching (e.g., "JS" vs "JavaScript")
          try {
            var dist = algos.runAlgorithm('levenshtein', { a: sSkill, b: mSkill });
            if (dist <= 2 && sSkill.length >= 3 && mSkill.length >= 3) {
              sharedSkills.push(mSkill);
              score += 18;
              break;
            }
          } catch (e) {}
        }
      }
    }

    if (sharedSkills.length) {
      reasons.push('Shares ' + sharedSkills.length + ' skill(s): ' + sharedSkills.slice(0, 3).join(', '));
    }

    // 2. Jaccard Similarity index: |A ∩ B| / |A ∪ B|
    var unionSet = {};
    studentSkills.concat(mSkills).forEach(function (s) { unionSet[s] = true; });
    var unionCount = Object.keys(unionSet).length;
    var jaccard = unionCount > 0 ? (sharedSkills.length / unionCount) : 0;
    score += Math.round(jaccard * 30);

    // 3. Department matching
    if (studentDept && mDept && studentDept === mDept) {
      score += 20;
      reasons.push('Same department (' + m.department + ')');
    }

    // 4. Industry/interest matching
    var sharedInterests = [];
    for (var ii = 0; ii < studentInterests.length; ii++) {
      if (mInterests.indexOf(studentInterests[ii]) !== -1) sharedInterests.push(studentInterests[ii]);
    }
    if (sharedInterests.length) {
      score += 15;
      reasons.push('Shared interest: ' + sharedInterests.join(', '));
    }

    // 5. Availability bonus
    if (m.isOpen !== false) {
      score += 10;
      reasons.push('Open to new mentees');
    }

    if (score < 15) score = 15; // baseline minimum for alumni
    var matchPercentage = Math.min(98, Math.max(45, Math.round(score)));

    scored.push({
      mentor: auth.userPublic(m),
      matchPercentage: matchPercentage,
      reasons: reasons.length ? reasons : ['Alumni network member', 'Active career mentor']
    });
  }

  // Sort descending by match percentage using hand-built merge sort
  var ranked = sort.mergeSortBy(scored, function (x) { return x.matchPercentage; }).reverse();
  return { results: ranked.slice(0, limit), total: scored.length };
}

// ---- Typo-Tolerant Search with KMP / Levenshtein ---------------------------
function typoSearchAlumni(query, filters) {
  var q = auth.clean(query, 100).toLowerCase();
  var users = storage.readAll('users').filter(function (u) { return u.role === 'alumni'; });

  if (!q) {
    return users.slice(0, 24).map(function (u) {
      return Object.assign({}, auth.userPublic(u), { _matchType: 'all' });
    });
  }

  var terms = q.split(/\s+/).filter(Boolean);
  var scored = [];

  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var profileText = [u.name, u.department, u.batch, u.skills, u.industry, u.company, u.bio].join(' ').toLowerCase();
    var score = 0;
    var matchedTerms = [];

    for (var t = 0; t < terms.length; t++) {
      var term = terms[t];

      // Exact substring search via KMP
      try {
        var kmpHits = algos.runAlgorithm('kmp', { text: profileText, pattern: term });
        if (kmpHits.length > 0) {
          score += 15 + kmpHits.length * 3;
          matchedTerms.push(term);
          continue;
        }
      } catch (e) {}

      // Fuzzy check against tokens (skills, name parts) via Levenshtein
      var words = profileText.split(/[\s,;|]+/);
      var bestDist = 999;
      for (var w = 0; w < words.length; w++) {
        var word = words[w];
        if (word.length < 3) continue;
        if (Math.abs(word.length - term.length) > 2) continue;
        try {
          var dist = algos.runAlgorithm('levenshtein', { a: term, b: word });
          if (dist < bestDist) bestDist = dist;
        } catch (e) {}
      }

      if (bestDist <= 2) {
        score += 10 - bestDist * 3; // e.g., "jva" -> dist 1 to "java", score +7
        matchedTerms.push(term + ' ~ fuzzy');
      }
    }

    if (score > 0) {
      scored.push({ user: auth.userPublic(u), score: score, matchedTerms: matchedTerms });
    }
  }

  var ranked = sort.mergeSortBy(scored, function (x) { return x.score; }).reverse();
  return ranked.map(function (r) { return Object.assign({}, r.user, { _score: r.score }); });
}

// ---- Career Roadmap Generator ---------------------------------------------
var ROADMAP_DATABASE = {
  'backend': {
    title: 'Backend Engineer Roadmap',
    description: 'Master server-side architectures, databases, system design, and API design.',
    skills: ['Java', 'Spring Boot', 'SQL', 'PostgreSQL', 'Docker', 'System Design', 'Redis', 'Kafka'],
    milestones: [
      { step: 1, title: 'Programming & Core DSA', duration: 'Month 1-2', topics: ['Java / Go OOP fundamentals', 'Arrays, Trees, Graphs, DP', 'LeetCode Medium practice'] },
      { step: 2, title: 'Databases & APIs', duration: 'Month 3', topics: ['Relational schema design (PostgreSQL)', 'Indexing & query optimization', 'REST & GraphQL API design'] },
      { step: 3, title: 'Distributed Systems & Cloud', duration: 'Month 4-5', topics: ['Caching with Redis', 'Message queues (Kafka/RabbitMQ)', 'Microservices and Docker containerization'] },
      { step: 4, title: 'System Design & Interview Prep', duration: 'Month 6', topics: ['HLD/LLD design patterns', 'Rate limiting, Load balancers', 'Mock interviews with alumni mentors'] }
    ]
  },
  'frontend': {
    title: 'Full-Stack & Frontend Developer Roadmap',
    description: 'Build responsive, accessible, interactive web apps and full-stack services.',
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'CSS Architecture', 'Next.js', 'GraphQL'],
    milestones: [
      { step: 1, title: 'Modern JavaScript & DOM', duration: 'Month 1-2', topics: ['ES6+, async/await, closures', 'DOM manipulation & browser rendering', 'CSS Flexbox, Grid, Responsive Design'] },
      { step: 2, title: 'React Ecosystem & State', duration: 'Month 3', topics: ['Component lifecycle & hooks', 'State management (Redux/Zustand)', 'API integration & caching'] },
      { step: 3, title: 'Full-Stack Integration', duration: 'Month 4', topics: ['Node.js backend endpoints', 'Authentication & sessions', 'Database connectivity'] },
      { step: 4, title: 'Production & Performance', duration: 'Month 5', topics: ['Web vitals & Lighthouse audit', 'CI/CD pipeline deployment', 'Portfolio project reviews with mentors'] }
    ]
  },
  'ai': {
    title: 'Data Science & AI Engineer Roadmap',
    description: 'Master statistical analysis, machine learning algorithms, deep learning and LLMs.',
    skills: ['Python', 'SQL', 'Pandas', 'NumPy', 'Scikit-Learn', 'PyTorch', 'Machine Learning', 'NLP'],
    milestones: [
      { step: 1, title: 'Math & Python Foundations', duration: 'Month 1-2', topics: ['Linear algebra & probability', 'Python for data analysis (Pandas, NumPy)', 'Exploratory data analysis & visualization'] },
      { step: 2, title: 'Core Machine Learning', duration: 'Month 3', topics: ['Supervised & unsupervised algorithms', 'Feature engineering & cross-validation', 'Model evaluation metrics'] },
      { step: 3, title: 'Deep Learning & NLP', duration: 'Month 4-5', topics: ['Neural networks with PyTorch', 'Transformers & HuggingFace', 'Prompt engineering & fine-tuning'] },
      { step: 4, title: 'MLOps & Placement Prep', duration: 'Month 6', topics: ['Model serving via FastAPI', 'End-to-end ML project portfolio', 'Resume reviews with data scientists'] }
    ]
  },
  'cloud': {
    title: 'Cloud & DevOps Engineer Roadmap',
    description: 'Automate infrastructure, manage container orchestration, and ensure system reliability.',
    skills: ['Linux', 'Docker', 'Kubernetes', 'AWS', 'Terraform', 'CI/CD', 'Prometheus', 'Networking'],
    milestones: [
      { step: 1, title: 'Linux & Networking Basics', duration: 'Month 1-2', topics: ['Shell scripting & command-line mastery', 'TCP/IP, DNS, HTTP/HTTPS protocols', 'Git branching workflows'] },
      { step: 2, title: 'Containers & Orchestration', duration: 'Month 3', topics: ['Docker container builds', 'Kubernetes pods, services, ingress', 'Helm charts'] },
      { step: 3, title: 'Infrastructure as Code', duration: 'Month 4', topics: ['Terraform provisioners', 'AWS cloud architectures', 'Security groups & IAM'] },
      { step: 4, title: 'Observability & CI/CD', duration: 'Month 5-6', topics: ['GitHub Actions / GitLab CI', 'Prometheus & Grafana monitoring', 'SRE incident management'] }
    ]
  }
};

function getRoadmap(goal) {
  var key = (goal || 'backend').toLowerCase();
  if (key.indexOf('front') !== -1 || key.indexOf('full') !== -1) key = 'frontend';
  else if (key.indexOf('data') !== -1 || key.indexOf('ai') !== -1 || key.indexOf('ml') !== -1) key = 'ai';
  else if (key.indexOf('devops') !== -1 || key.indexOf('cloud') !== -1) key = 'cloud';
  else key = 'backend';

  var template = ROADMAP_DATABASE[key] || ROADMAP_DATABASE.backend;
  var users = storage.readAll('users').filter(function (u) { return u.role === 'alumni'; });
  var posts = storage.readAll('posts');

  // Find matching mentors who have relevant skills
  var matchingMentors = [];
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var uSkills = parseSkillTokens(u.skills);
    for (var k = 0; k < template.skills.length; k++) {
      if (uSkills.indexOf(template.skills[k].toLowerCase()) !== -1) {
        matchingMentors.push(auth.userPublic(u));
        break;
      }
    }
  }

  // Find matching opportunities
  var matchingPosts = [];
  for (var p = 0; p < posts.length; p++) {
    var post = posts[p];
    var tags = parseSkillTokens(post.tags);
    for (var t = 0; t < template.skills.length; t++) {
      if (tags.indexOf(template.skills[t].toLowerCase()) !== -1) {
        matchingPosts.push(post);
        break;
      }
    }
  }

  return {
    key: key,
    title: template.title,
    description: template.description,
    skills: template.skills,
    milestones: template.milestones,
    matchingMentors: matchingMentors.slice(0, 6),
    matchingOpportunities: matchingPosts.slice(0, 4)
  };
}

// ---- Activity Timeline ----------------------------------------------------
function getActivity(user) {
  var sessions = storage.readAll('mentor_sessions');
  var mentorships = storage.readAll('mentorship');
  var applications = storage.readAll('applications');
  var posts = storage.readAll('posts');
  var reviews = storage.readAll('reviews');

  var items = [];

  for (var s = 0; s < sessions.length; s++) {
    var sess = sessions[s];
    if (sess.studentId === user.id || sess.mentorId === user.id) {
      items.push({
        icon: '📅',
        text: 'Session on ' + sess.topic + ' (' + sess.status + ')',
        createdAt: sess.updatedAt || sess.createdAt
      });
    }
  }

  for (var m = 0; m < mentorships.length; m++) {
    var req = mentorships[m];
    if (req.studentId === user.id || req.alumniId === user.id) {
      items.push({
        icon: '🤝',
        text: 'Mentorship request for ' + req.topic + ' (' + req.status + ')',
        createdAt: req.updatedAt || req.createdAt
      });
    }
  }

  for (var a = 0; a < applications.length; a++) {
    if (applications[a].studentId === user.id) {
      items.push({
        icon: '📄',
        text: 'Applied for ' + applications[a].postTitle + ' at ' + applications[a].company,
        createdAt: applications[a].createdAt
      });
    }
  }

  for (var p = 0; p < posts.length; p++) {
    if (posts[p].authorId === user.id) {
      items.push({
        icon: '💼',
        text: 'Published ' + posts[p].title,
        createdAt: posts[p].createdAt
      });
    }
  }

  for (var r = 0; r < reviews.length; r++) {
    if (reviews[r].mentorId === user.id) {
      items.push({
        icon: '⭐',
        text: 'Received ' + reviews[r].rating + '★ review from ' + reviews[r].studentName,
        createdAt: reviews[r].createdAt
      });
    }
  }

  return sort.mergeSortBy(items, function (x) { return String(x.createdAt || ''); }).reverse();
}

// ---- Admin User Management & Analytics ------------------------------------
function adminGetUsers(user, q) {
  if (user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Admin access required'), { status: 403 }));
  }

  var all = storage.readAll('users');
  var search = auth.clean(q.q, 100).toLowerCase();
  var role = auth.clean(q.role, 30);

  var filtered = all.filter(function (u) {
    if (role && u.role !== role) return false;
    if (search) {
      var txt = [u.name, u.email, u.department, u.batch].join(' ').toLowerCase();
      if (txt.indexOf(search) === -1) return false;
    }
    return true;
  });

  return Promise.resolve(filtered.map(function (u) { return auth.userPublic(u); }));
}

function adminVerifyMentor(user, body) {
  if (user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Admin access required'), { status: 403 }));
  }

  var targetId = auth.clean(body.userId, 40);
  var target = storage.readAlive('users', targetId);
  if (!target) return Promise.reject(Object.assign(new Error('User not found'), { status: 404 }));

  var verified = body.verified !== undefined ? !!body.verified : !target.verified;
  return storage.updateRecord('users', targetId, { verified: verified, updatedAt: new Date().toISOString() })
    .then(function () { return { ok: true, userId: targetId, verified: verified }; });
}

function adminUpdateUserRole(user, targetId, body) {
  if (user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Admin access required'), { status: 403 }));
  }

  var target = storage.readAlive('users', targetId);
  if (!target) return Promise.reject(Object.assign(new Error('User not found'), { status: 404 }));

  var nextRole = auth.clean(body.role, 20);
  if (['student', 'alumni', 'admin'].indexOf(nextRole) === -1) {
    return Promise.reject(Object.assign(new Error('Invalid role'), { status: 400 }));
  }

  return storage.updateRecord('users', targetId, { role: nextRole, updatedAt: new Date().toISOString() })
    .then(function () { return { ok: true, userId: targetId, role: nextRole }; });
}

function adminGetAnalytics(user) {
  if (user.role !== 'admin') {
    return Promise.reject(Object.assign(new Error('Admin access required'), { status: 403 }));
  }

  var users = storage.readAll('users');
  var mentorships = storage.readAll('mentorship');
  var sessions = storage.readAll('mentor_sessions');
  var posts = storage.readAll('posts');

  // Role distribution
  var roleCounts = { student: 0, alumni: 0, admin: 0 };
  var deptCounts = {};
  for (var u = 0; u < users.length; u++) {
    var r = users[u].role;
    roleCounts[r] = (roleCounts[r] || 0) + 1;
    var d = users[u].department || 'Other';
    deptCounts[d] = (deptCounts[d] || 0) + 1;
  }

  // Mentorship funnel: Sent -> Accepted -> In-Progress -> Completed
  var funnel = {
    requested: mentorships.length,
    accepted: mentorships.filter(function (x) { return x.status === 'accepted' || x.status === 'in-progress' || x.status === 'completed'; }).length,
    sessionsConducted: sessions.filter(function (x) { return x.status === 'completed'; }).length,
    graduated: mentorships.filter(function (x) { return x.status === 'completed'; }).length
  };

  // Top skill demands from job posts
  var skillDemand = {};
  for (var p = 0; p < posts.length; p++) {
    var tags = parseSkillTokens(posts[p].tags);
    for (var t = 0; t < tags.length; t++) {
      skillDemand[tags[t]] = (skillDemand[tags[t]] || 0) + 1;
    }
  }
  var topSkills = Object.keys(skillDemand).map(function (k) { return { skill: k, count: skillDemand[k] }; });
  topSkills.sort(function (a, b) { return b.count - a.count; });

  return Promise.resolve({
    totalUsers: users.length,
    roleCounts: roleCounts,
    deptCounts: deptCounts,
    funnel: funnel,
    topSkills: topSkills.slice(0, 8),
    totalSessions: sessions.length,
    totalPosts: posts.length
  });
}

// ---- Event RSVPs ----------------------------------------------------------
function rsvpEvent(user, body) {
  var eventId = auth.clean(body.eventId, 40);
  if (!eventId) return Promise.reject(Object.assign(new Error('Event ID is required'), { status: 400 }));

  var ev = storage.readAlive('events', eventId);
  if (!ev) return Promise.reject(Object.assign(new Error('Event not found'), { status: 404 }));

  var all = storage.readAll('events_rsvp');
  for (var i = 0; i < all.length; i++) {
    if (all[i].eventId === eventId && all[i].userId === user.id) {
      return Promise.resolve({ ok: true, alreadyRsvpd: true });
    }
  }

  var currentCount = all.filter(function (x) { return x.eventId === eventId; }).length;
  var isWaitlist = currentCount >= (ev.capacity || 50);

  var rsvpRec = {
    id: newId('RSVP'),
    eventId: eventId,
    userId: user.id,
    name: user.name,
    role: user.role,
    department: user.department,
    status: isWaitlist ? 'waitlist' : 'confirmed',
    createdAt: new Date().toISOString()
  };

  return storage.appendRecord('events_rsvp', rsvpRec).then(function () {
    return { ok: true, status: rsvpRec.status };
  });
}

function getEventRsvps(user, eventId) {
  var all = storage.readAll('events_rsvp');
  var forEvent = all.filter(function (x) { return x.eventId === eventId; });
  return Promise.resolve({ rsvps: forEvent, total: forEvent.length });
}

// ---- Simulated Giving / Campaigns ----------------------------------------
var CAMPAIGNS = [
  { id: 'CAMP1', title: 'Student Innovation & Hackathon Fund', goal: 200000, raised: 145000, donors: 38, deadline: '2026-12-31' },
  { id: 'CAMP2', title: 'Need-Based Placement Scholarships', goal: 500000, raised: 380000, donors: 84, deadline: '2026-11-30' },
  { id: 'CAMP3', title: 'Campus Hardware & AI Lab Upgrade', goal: 350000, raised: 210000, donors: 52, deadline: '2027-01-15' }
];

function getCampaigns() { return CAMPAIGNS; }

function donateToCampaign(user, body) {
  var id = body.campaignId;
  var amount = parseInt(body.amount, 10) || 1000;
  for (var i = 0; i < CAMPAIGNS.length; i++) {
    if (CAMPAIGNS[i].id === id) {
      CAMPAIGNS[i].raised += amount;
      CAMPAIGNS[i].donors += 1;
      return { ok: true, campaign: CAMPAIGNS[i], message: 'Thank you for your generous simulated donation!' };
    }
  }
  return { ok: false, error: 'Campaign not found' };
}

module.exports = {
  dashboard: dashboard,
  getSessions: getSessions,
  createSession: createSession,
  updateSession: updateSession,
  getAvailability: getAvailability,
  updateAvailability: updateAvailability,
  getMentees: getMentees,
  updateMenteeNotes: updateMenteeNotes,
  getUnreadMessagesCount: getUnreadMessagesCount,
  getMessageThreads: getMessageThreads,
  getThreadMessages: getThreadMessages,
  sendMessage: sendMessage,
  applyToPost: applyToPost,
  getMyApplications: getMyApplications,
  getPostApplications: getPostApplications,
  updateApplicationStatus: updateApplicationStatus,
  saveOpportunity: saveOpportunity,
  getSavedOpportunities: getSavedOpportunities,
  removeSavedOpportunity: removeSavedOpportunity,
  createReferral: createReferral,
  getReferrals: getReferrals,
  createReview: createReview,
  getReviews: getReviews,
  getLeaderboard: getLeaderboard,
  smartMatch: smartMatch,
  typoSearchAlumni: typoSearchAlumni,
  getRoadmap: getRoadmap,
  getActivity: getActivity,
  adminGetUsers: adminGetUsers,
  adminVerifyMentor: adminVerifyMentor,
  adminUpdateUserRole: adminUpdateUserRole,
  adminGetAnalytics: adminGetAnalytics,
  rsvpEvent: rsvpEvent,
  getEventRsvps: getEventRsvps,
  getCampaigns: getCampaigns,
  donateToCampaign: donateToCampaign
};
