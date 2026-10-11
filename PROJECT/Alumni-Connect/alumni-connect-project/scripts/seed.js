/**
 * scripts/seed.js — Generate realistic demo data for Alumni Connect.
 *
 * Produces: 60+ users, 40 posts, 15 events, 80 connections, 30 mentorship
 * records and 50 per-user notifications.
 *
 * Usage: node scripts/seed.js   (from the project root)
 *
 * Each collection is written straight to its .txt log for speed, then the
 * storage engine rebuilds the .idx hash index and the sorted name/batch
 * indexes. Running it again is safe: it overwrites the demo collections.
 */

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

var SALT_LEN = 16;
var KEY_LEN = 64;
var COST = 16384;

function hashPassword(plain) {
  var salt = crypto.randomBytes(SALT_LEN).toString('hex');
  var hash = crypto.scryptSync(plain, salt, KEY_LEN, { N: COST });
  return salt + ':' + hash.toString('hex');
}

function uid(prefix) { return prefix + crypto.randomBytes(4).toString('hex').toUpperCase(); }

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }
function daysAhead(n) { return new Date(Date.now() + n * 86400000); }

var AVAILABILITY = [
  'Weekday evenings; Saturday mornings',
  'Weekends only',
  'Tuesday and Thursday evenings',
  'Flexible - mornings preferred',
  'After 6pm on weekdays'
];

function writeLog(name, records) {
  var lines = [];
  for (var i = 0; i < records.length; i++) lines.push(JSON.stringify(records[i]));
  fs.writeFileSync(path.join(DATA_DIR, name + '.txt'), lines.length ? lines.join('\n') + '\n' : '', 'utf8');
  console.log('Seeded ' + records.length + ' ' + name + '.');
  return records.length;
}

// ---- Seed data ----

var firstNames = ['Aarav','Ananya','Advait','Diya','Ishaan','Kiara','Mira','Ved','Anika','Reyansh','Aadhya','Isha','Kiaan','Myra','Vihaan','Saanvi','Ayaan','Navya','Rudra','Zara','Kabir','Anvita','Dhruv','Esha','Parth','Riya','Yash','Sara','Aryan','Naina','Arjun','Priya','Rahul','Sneha','Kiran','Meera','Vikram','Anjali','Rohit','Pooja','Amit','Neha','Surya','Lakshmi','Ravi','Divya','Karan','Shreya','Arjun','Tanvi','Alok','Shivani','Rajeev','Pooja','Manoj','Geeta','Sunil','Rekha','Mohan','Lata'];
var lastNames = ['Sharma','Patel','Verma','Gupta','Reddy','Kumar','Singh','Joshi','Das','Nair','Iyer','Rao','Khan','Patil','Shetty','Menon','Bose','Chatterjee','Desai','Mehta','Jain','Roy','Bhatt','Pillai','Rajan','Sastry','Warrier','Menon','Chopra','Bajaj'];
var departments = ['CSE','ECE','IT','Mechanical','Civil','Electrical','Chemistry','Physics','Math','Biology','Business','Economics'];
var batches = ['2018','2019','2020','2021','2022','2023','2024','2025','2026'];
var skillsList = ['Java','Python','C++','JavaScript','React','Node.js','DSA','System Design','Cloud','AWS','ML','Data Science','SQL','NoSQL','DevOps','Docker','Kubernetes','Go','Rust','TypeScript','Vue','Angular','Spring Boot','Django','Flask','Swift','Kotlin','R','MATLAB','CAD','IoT','Embedded','Cybersecurity','Networking','Blockchain','UI/UX','Figma','Product Management','Agile','Scrum'];
var industries = ['Technology','Finance','Healthcare','Education','Manufacturing','Consulting','E-commerce','Media','Telecom','Energy','Government','Nonprofit','Startups','Research'];
var experiences = ['Student','1 year','2 years','3 years','4 years','5 years','7 years','10 years','15+ years'];
var bioTemplates = ['Experienced professional passionate about mentoring students.','Industry veteran with deep expertise in software engineering.','Passionate about helping the next generation succeed.','Tech lead with 10+ years in the industry.','Recent graduate eager to share knowledge.','Entrepreneur with a track record of startup success.','Research scientist focused on AI and machine learning.'];

var existingUsers = [];
var usedEmails = {};
['student@alumniconnect.local','alumni@alumniconnect.local','admin@alumniconnect.local'].forEach(function (e) { usedEmails[e] = true; });

// Ensure demo accounts exist
function ensureDemoAccount(email, password, name, role, dept, batch, skills, industry, exp) {
  var existing = null;
  for (var i = 0; i < existingUsers.length; i++) {
    if (existingUsers[i].email === email) { existing = existingUsers[i]; break; }
  }
  if (existing) return existing;
  var u = {
    id: uid('U'),
    name: name,
    email: email,
    password: hashPassword(password),
    role: role,
    department: dept,
    batch: batch,
    skills: skills,
    interests: 'Mentoring, career growth',
    industry: industry,
    experience: exp,
    bio: bioTemplates[Math.floor(Math.random() * bioTemplates.length)],
    availability: AVAILABILITY[0],
    verified: true,
    createdAt: daysAgo(120)
  };
  existingUsers.push(u);
  return u;
}

console.log('Seeding demo data...');

// Create demo accounts first
var student = ensureDemoAccount('student@alumniconnect.local', 'student123', 'Test Student', 'student', 'CSE', '2026', 'Java, DSA', 'Technology', 'Student');
var alumni = ensureDemoAccount('alumni@alumniconnect.local', 'alumni123', 'Test Mentor', 'alumni', 'CSE', '2021', 'Java, Spring Boot, System Design', 'Technology', '5 years');
var admin = ensureDemoAccount('admin@alumniconnect.local', 'admin123', 'Admin User', 'admin', 'CSE', '2015', 'Administration', 'Education', '10 years');

// Generate more users
for (var i = 0; i < 60; i++) {
  var fn = firstNames[Math.floor(Math.random() * firstNames.length)];
  var ln = lastNames[Math.floor(Math.random() * lastNames.length)];
  var name = fn + ' ' + ln;
  var role = Math.random() < 0.4 ? 'alumni' : 'student';
  var dept = departments[Math.floor(Math.random() * departments.length)];
  var batch = batches[Math.floor(Math.random() * batches.length)];
  var numSkills = 2 + Math.floor(Math.random() * 4);
  var skills = [];
  for (var s = 0; s < numSkills; s++) {
    var sk = skillsList[Math.floor(Math.random() * skillsList.length)];
    if (skills.indexOf(sk) === -1) skills.push(sk);
  }
  var industry = industries[Math.floor(Math.random() * industries.length)];
  var exp = role === 'alumni' ? experiences[Math.floor(Math.random() * experiences.length)] : 'Student';
  var bio = bioTemplates[Math.floor(Math.random() * bioTemplates.length)];

  // first/last name pairs repeat, so disambiguate the email to keep every
  // seeded account individually loggable.
  var email = fn.toLowerCase() + '.' + ln.toLowerCase();
  var suffix = 2;
  while (usedEmails[email + '@alumniconnect.local']) { email = fn.toLowerCase() + '.' + ln.toLowerCase() + suffix; suffix++; }
  email = email + '@alumniconnect.local';
  usedEmails[email] = true;

  var u = {
    id: uid('U'),
    name: name,
    email: email,
    password: hashPassword('pass123'),
    role: role,
    department: dept,
    batch: batch,
    skills: skills.join(', '),
    interests: skills[0] || 'Technology',
    industry: industry,
    experience: exp,
    bio: bio,
    availability: AVAILABILITY[Math.floor(Math.random() * AVAILABILITY.length)],
    verified: Math.random() < 0.9,
    createdAt: daysAgo(Math.floor(Math.random() * 900) + 30)
  };
  existingUsers.push(u);
  usedEmails[email] = true;
}

// Write users.txt
writeLog('users', existingUsers);

// Generate posts (40)
var postTypes = ['internship','job','workshop','resource','referral','scholarship'];
var postTitles = ['Software Engineer Intern','Senior Backend Developer','Web Development Workshop','DSA Bootcamp','React Masterclass','Cloud Architecture Talk','Machine Learning Meetup','Startup Hiring Drive','Campus Placement Prep','Open Source Contribution Drive'];
var companies = ['Google','Microsoft','Amazon','Flipkart','Paytm','Swiggy','Zomato','Byjus','Unacademy','Infosys','TCS','Wipro','Tech Startup','HealthTech Co'];
var postBlurbs = {
  internship: 'Paid internship with mentorship and a fast track to a full-time offer.',
  job: 'Full-time role with competitive compensation and a hybrid working model.',
  workshop: 'Hands-on workshop with industry experts. Bring a laptop.',
  resource: 'Curated learning material shared with the alumni community.',
  referral: 'Happy to refer a strong candidate — send me your resume.',
  scholarship: 'Scholarship application open to final-year students.'
};
var posts = [];
for (var p = 0; p < 40; p++) {
  var author = existingUsers[Math.floor(Math.random() * existingUsers.length)];
  var type = postTypes[Math.floor(Math.random() * postTypes.length)];
  var company = companies[Math.floor(Math.random() * companies.length)];
  var tagCount = 2 + Math.floor(Math.random() * 3);
  var tags = [];
  for (var tg = 0; tg < tagCount; tg++) {
    var candidate = skillsList[Math.floor(Math.random() * skillsList.length)];
    if (tags.indexOf(candidate) === -1) tags.push(candidate);
  }
  posts.push({
    id: uid('P'),
    authorId: author.id,
    title: postTitles[Math.floor(Math.random() * postTitles.length)] + ' #' + (p + 1),
    type: type,
    company: company,
    content: 'Join us at ' + company + '. ' + (postBlurbs[type] || postBlurbs.job),
    tags: tags.join(', '),
    deadline: daysAhead(Math.floor(Math.random() * 45) + 5).toISOString().slice(0, 10),
    createdAt: daysAgo(Math.floor(Math.random() * 60))
  });
}
writeLog('posts', posts);

// Generate events (15)
var eventTitles = ['Annual Alumni Meet','Tech Talk: AI Trends','Career Fair 2026','Mentorship Mixer','Startup Pitch Night','Workshop: System Design','Panel: Women in Tech','Hackathon 2026','Networking Dinner','Guest Lecture: Product Management','Resume Review Session','Mock Interview Day','Industry Roundtable','Alumni Reunion','Coding Competition'];
var locations = ['Campus Auditorium','Online','Tech Hub','Innovation Center','Conference Room A','Main Hall','Library','Cafeteria','Park Venue'];
var events = [];
for (var e = 0; e < 15; e++) {
  var host = existingUsers[Math.floor(Math.random() * existingUsers.length)];
  events.push({
    id: uid('E'),
    title: eventTitles[e],
    date: daysAhead(Math.floor(Math.random() * 90) + 1).toISOString().slice(0, 10),
    time: String(10 + Math.floor(Math.random() * 10)).padStart(2, '0') + ':00',
    location: locations[Math.floor(Math.random() * locations.length)],
    description: 'Join fellow alumni for ' + eventTitles[e].toLowerCase() + '.',
    capacity: 20 + Math.floor(Math.random() * 80),
    hostId: host.id,
    createdAt: daysAgo(Math.floor(Math.random() * 60))
  });
}
writeLog('events', events);

// Generate connections (80)
var connections = [];
var seenPairs = {};
for (var c = 0; c < 80; c++) {
  var from = existingUsers[Math.floor(Math.random() * existingUsers.length)];
  var to = existingUsers[Math.floor(Math.random() * existingUsers.length)];
  if (from.id === to.id) continue;
  var pairKey = from.id < to.id ? from.id + '|' + to.id : to.id + '|' + from.id;
  if (seenPairs[pairKey]) continue;
  seenPairs[pairKey] = true;
  connections.push({
    id: uid('C'),
    fromUserId: from.id,
    toUserId: to.id,
    status: Math.random() < 0.7 ? 'accepted' : 'pending',
    createdAt: daysAgo(Math.floor(Math.random() * 90))
  });
}
writeLog('connections', connections);

// Generate mentorship records (30)
var mentorships = [];
for (var m = 0; m < 30; m++) {
  var learner = existingUsers[Math.floor(Math.random() * existingUsers.length)];
  var guide = existingUsers[Math.floor(Math.random() * existingUsers.length)];
  if (learner.id === guide.id) continue;
  var statuses = ['pending','accepted','in-progress','completed'];
  var status = statuses[Math.floor(Math.random() * statuses.length)];
  mentorships.push({
    id: uid('M'),
    studentId: learner.id,
    alumniId: guide.id,
    status: status,
    topic: 'Career guidance in ' + (skillsList[Math.floor(Math.random() * skillsList.length)]),
    createdAt: daysAgo(Math.floor(Math.random() * 120)),
    updatedAt: daysAgo(Math.floor(Math.random() * 60))
  });
}
// Ensure guaranteed mentorship records for demo accounts
var demoMentorship1 = {
  id: 'MDEMO1',
  studentId: student.id,
  alumniId: alumni.id,
  status: 'accepted',
  topic: 'Full-Stack & Backend Systems Architecture',
  notes: 'Reviewing DSA problems and preparing portfolio projects for placements.',
  createdAt: daysAgo(20),
  updatedAt: daysAgo(5)
};

// Find another student to give mentor a pending request
var otherStudent = existingUsers.find(function(u){ return u.role === 'student' && u.id !== student.id; }) || student;
var demoMentorship2 = {
  id: 'MDEMO2',
  studentId: otherStudent.id,
  alumniId: alumni.id,
  status: 'pending',
  topic: 'Machine Learning & Cloud Deployment Roadmap',
  createdAt: daysAgo(2)
};
mentorships.push(demoMentorship1, demoMentorship2);
writeLog('mentorship', mentorships);

// Generate mentor_sessions (1:1 sessions)
var sessions = [
  {
    id: 'SESS1',
    studentId: student.id,
    mentorId: alumni.id,
    date: daysAhead(2).toISOString().slice(0, 10),
    time: '18:00',
    mode: 'Online (Google Meet)',
    meetingLink: 'https://meet.google.com/ac-demo-session',
    topic: 'System Design: Rate Limiter & Caching',
    notes: 'Review sliding window rate limiter implementation and Redis patterns.',
    status: 'scheduled',
    createdAt: daysAgo(3)
  },
  {
    id: 'SESS2',
    studentId: student.id,
    mentorId: alumni.id,
    date: daysAgo(7).slice(0, 10),
    time: '17:30',
    mode: 'Campus In-Person',
    meetingLink: '',
    topic: 'Resume & Portfolio Review',
    notes: 'Highlighted DSA projects and quantified bullet points.',
    status: 'completed',
    createdAt: daysAgo(10)
  }
];
writeLog('mentor_sessions', sessions);

// Generate messages
var messages = [
  {
    id: 'MSG1',
    senderId: student.id,
    receiverId: alumni.id,
    text: 'Hello mentor, thank you for accepting my request! Looking forward to our 1:1 call.',
    read: true,
    createdAt: daysAgo(4)
  },
  {
    id: 'MSG2',
    senderId: alumni.id,
    receiverId: student.id,
    text: 'Great to connect! Bring any questions on system design and your latest DSA code.',
    read: true,
    createdAt: daysAgo(3)
  },
  {
    id: 'MSG3',
    senderId: student.id,
    receiverId: alumni.id,
    text: 'Will do! I have prepared questions about Redis caching and LeetCode graph patterns.',
    read: false,
    createdAt: daysAgo(1)
  }
];
writeLog('messages', messages);

// Generate reviews
var reviews = [
  {
    id: 'REV1',
    studentId: student.id,
    studentName: student.name,
    mentorId: alumni.id,
    rating: 5,
    comment: 'Exceptional mentor! Explained system design and DP concepts with extraordinary clarity.',
    createdAt: daysAgo(6)
  },
  {
    id: 'REV2',
    studentId: otherStudent.id,
    studentName: otherStudent.name,
    mentorId: alumni.id,
    rating: 5,
    comment: 'Provided insightful resume feedback that immediately got me shortlisted for interviews.',
    createdAt: daysAgo(14)
  }
];
writeLog('reviews', reviews);

// Generate applications
var applications = [
  {
    id: 'APP1',
    postId: posts[0].id,
    studentId: student.id,
    postTitle: posts[0].title,
    company: posts[0].company,
    note: 'Strong experience in Java and DSA. Looking forward to contributing to the engineering team.',
    status: 'shortlisted',
    createdAt: daysAgo(5)
  }
];
writeLog('applications', applications);

// Generate events_rsvp
var rsvps = [
  {
    id: 'RSVP1',
    eventId: events[0].id,
    userId: student.id,
    name: student.name,
    role: 'student',
    department: student.department,
    status: 'confirmed',
    createdAt: daysAgo(8)
  },
  {
    id: 'RSVP2',
    eventId: events[0].id,
    userId: alumni.id,
    name: alumni.name,
    role: 'alumni',
    department: alumni.department,
    status: 'confirmed',
    createdAt: daysAgo(8)
  }
];
writeLog('events_rsvp', rsvps);

// Generate referrals
var referrals = [
  {
    id: 'REF1',
    mentorId: alumni.id,
    studentId: student.id,
    studentName: student.name,
    company: 'Google',
    role: 'Software Engineer Intern',
    notes: 'Exceptional algorithmic thinking and problem-solving skills demonstrated in mentorship.',
    status: 'referred',
    createdAt: daysAgo(4)
  }
];
writeLog('referrals', referrals);

// Generate saved opportunities
var saved = [
  {
    id: 'SAVE1',
    userId: student.id,
    postId: posts[1].id,
    createdAt: daysAgo(3)
  }
];
writeLog('saved', saved);

// Generate notifications, addressed to a specific user (per-user, not per-role)
var notifKinds = ['mentorship','connection','opportunity','event'];
var notifTitles = {
  mentorship: 'Mentorship update',
  connection: 'New connection request',
  opportunity: 'New opportunity matching your skills',
  event: 'Event reminder'
};
var notifications = [];
for (var n = 0; n < 50; n++) {
  var targetUser = existingUsers[Math.floor(Math.random() * existingUsers.length)];
  var kind = notifKinds[Math.floor(Math.random() * notifKinds.length)];
  notifications.push({
    id: uid('N'),
    userId: targetUser.id,
    audience: targetUser.role,
    title: notifTitles[kind],
    message: 'You have a new update regarding your ' + kind + '.',
    read: Math.random() < 0.3,
    createdAt: daysAgo(Math.floor(Math.random() * 30))
  });
}
// Add explicit notification for demo mentor
notifications.push({
  id: 'NDEMO1',
  userId: alumni.id,
  audience: 'alumni',
  title: 'New mentorship request',
  message: otherStudent.name + ' asked to connect about Machine Learning & Cloud Deployment Roadmap.',
  read: false,
  createdAt: daysAgo(2)
});
writeLog('notifications', notifications);

// ---- Build the indexes the storage engine depends on ---------------------
var storage = require('../lib/storage');
storage._invalidate();
var report = storage.ensureIndexes();
console.log('Indexes: ' + (report.length ? JSON.stringify(report) : 'already up to date'));

console.log('\nSeeding complete! Total users: ' + existingUsers.length);
console.log('Demo accounts:');
console.log('  Student: student@alumniconnect.local / student123');
console.log('  Mentor:  alumni@alumniconnect.local / alumni123');
console.log('  Admin:   admin@alumniconnect.local / admin123');
