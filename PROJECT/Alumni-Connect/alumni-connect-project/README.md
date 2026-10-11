# Alumni Connect — DSA-3 Project (Updated & Upgraded)

A production-grade, full-featured alumni platform with a hand-written text-file storage engine and **zero external npm dependencies**. Built using Node.js built-in modules (`http`, `crypto`, `fs`, `path`) on the backend and single-page vanilla JavaScript with modern editorial aesthetics on the frontend.

---

## 1. Quick Start (Windows PowerShell)

Ensure Node.js 18+ is installed (`node -v`).

```powershell
# Navigate to project folder
cd "C:\Users\ArunTej\OneDrive\Documents\Telegram Downloads\Alumni-Connect-DSA3-Project-Updated(1)\alumni-connect-project"

# Reset demo data (63 users, sessions, posts, events, reviews, messages)
npm run reset-data

# Start server
npm start
```

Open your browser to: **`http://localhost:5000`**

To launch directly from PowerShell:
```powershell
start http://localhost:5000
```

### Available npm Scripts
| Command | Description |
|---|---|
| `npm start` | Starts the Alumni Connect HTTP server at `http://localhost:5000` |
| `npm test` | Runs both the 76-test unit suite (`tests/run.js`) and the 55-test API smoke/security suite (`tests/smoke.js`) |
| `npm run reset-data` | Restores all demo text files in `data/*.txt` and rebuilds hash indexes |
| `npm run dev` | Runs the server in development mode |

---

## 2. Demo Accounts
| Role | Email | Password | Primary Interface |
|---|---|---|---|
| **Student** | `student@alumniconnect.local` | `student123` | Student Portal (Find Mentors, Book Sessions, Career Roadmap) |
| **Mentor (Alumni)** | `alumni@alumniconnect.local` | `alumni123` | Dedicated Mentor Portal (Requests, Mentees, Sessions, Availability) |
| **Admin** | `admin@alumniconnect.local` | `admin123` | Governance, Verification, Analytics Charts & Algorithm Lab |

*Note: The login screen features convenient role cards for Student and Mentor. Admin is accessible via the subtle "Admin" shortcut on the sign-in card.*

---

## 3. Role-Based Navigation & Page Architecture

The platform provides strictly separated navigation, dashboard statistics, and page sets per role, enforced both in the UI and via server-side authorization checks (HTTP 403 Forbidden on illegal cross-role requests).

### Role-Wise Menu Breakdown
| Feature / Menu Item | Student Portal | Mentor Portal | Admin Portal | Description |
|---|:---:|:---:|:---:|---|
| **Dashboard** | ✓ | ✓ | ✓ | Role-tailored metrics, upcoming sessions, quick action cards |
| **Find Mentors** | ✓ | — | — | Typo-tolerant search, filters, Smart Match percentage badges |
| **Mentorship Requests** | — | ✓ | — | Incoming guidance requests with Accept, Reject, and Reply |
| **My Mentorship** | ✓ | — | — | Active mentors, pending requests, session scheduling |
| **My Mentees** | — | ✓ | — | Accepted students, goals, progress notes editor |
| **1:1 Sessions** | ✓ (Book) | ✓ (Schedule) | — | Google Meet links, session lifecycle, completion marking |
| **Availability & Capacity**| — | ✓ | — | Weekly slot schedule, max mentee capacity limit, open toggle |
| **Opportunities Board** | ✓ (Apply/Save) | ✓ (Publish/Review) | ✓ (Manage) | Jobs, internships, workshops, applicant shortlisting |
| **My Applications** | ✓ | — | — | Application tracking with status badges (Submitted/Shortlisted) |
| **Referrals** | ✓ (View) | ✓ (Create) | — | Mentor official recommendations for job openings |
| **Campus Events** | ✓ (RSVP) | ✓ (Host/RSVP) | ✓ (Manage) | Reunions, webinars, capacity tracking & waitlists |
| **1:1 Messaging** | ✓ | ✓ | — | In-platform chat, conversation threads, unread badge counter |
| **Leaderboard & Badges** | ✓ | ✓ (View) | — | Mentor points ranking, badges (Top Mentor, Quick Responder) |
| **Career Roadmap** | ✓ | — | — | Guided milestones, required skills, matching mentors & jobs |
| **Reviews & Impact** | ✓ (Leave Review)| ✓ (Feedback/Stats)| — | 1-5 star ratings, feedback comments, badge showcase |
| **Manage Users** | — | — | ✓ | Verification toggle for alumni mentors, role modification |
| **Platform Analytics** | — | — | ✓ | Pure CSS/SVG visualizations: Funnel, Skills demand, Dept stats |
| **Algorithm Lab** | — | — | ✓ | Academic sandbox for running and inspecting all 34 DSA algorithms |
| **Storage Engine** | — | — | ✓ | Collection stats, compaction, log archival, index rebuilds |

---

## 4. DSA-3 Academic Architecture Note: Algorithms & Where They Are Used

Every core data structure and algorithm in Alumni Connect is hand-built from scratch with **zero external libraries**:

| Algorithm | File | Academic Category | Practical Platform Usage |
|---|---|---|---|
| **Jaccard Similarity** | `routes/features.js` | Set Similarity | **Smart Mentor Match**: Computes overlap between student skill/interest sets and mentor expertise. |
| **Levenshtein Distance** | `algorithms.js`, `routes/features.js` | Dynamic Programming | **Typo-Tolerant Autocomplete & Fuzzy Matching**: Searches like `"jva"` or `"pythn"` resolve to `"Java"` and `"Python"`. Matches variant skill terms. |
| **KMP (Knuth-Morris-Pratt)** | `algorithms.js`, `routes/features.js` | String Matching | **Global Directory Search**: Linear-time $O(n + m)$ exact pattern searching across profile resumes and descriptions. |
| **Aho-Corasick Multi-Pattern**| `algorithms.js` | Automata / String | **Skill Demand Extraction**: Simultaneously scans job postings for 40+ technology tags in a single pass. |
| **Bipartite Matching** | `algorithms.js`, `routes/features.js` | Network Flow | **Fair Mentorship Assignment**: Simulates matching student requests to mentors under mentor maximum capacity constraints. |
| **Bounded Max-Heap (`topK`)** | `lib/sort.js` | Priority Queue / Heap | **Alumni Directory Ranking**: Selects top $k$ scored mentors in $O(n \log k)$ without sorting the entire database. |
| **MergeSort (`mergeSortBy`)** | `lib/sort.js` | Divide & Conquer | **Stable Feed Sorting**: Used for sorting sessions, application lists, threads, and leaderboard rankings chronologically and by score. |
| **LRU Cache** | `lib/lru.js` | Doubly-Linked List + Hash | **Point-Read Caching**: Protects storage engine with an $O(1)$ Least Recently Used cache for frequent record lookups. |
| **Huffman Coding** | `lib/huffman.js` | Greedy / Prefix-Free Tree | **Log Compaction & Archival**: Compresses old JSONL logs into binary prefix-free codebooks for long-term storage. |
| **Binary Search (`Range`/`Prefix`)** | `lib/storage.js` | Searching | **Index Lookups**: Range-searches batch years ($O(\log n)$) and prefix-searches names without scanning files. |

---

## 5. Storage Engine & Security Specifications

1. **Append-Only JSON-Lines Storage (`lib/storage.js`)**:
   - Stored in plain text files in `data/*.txt`.
   - Each collection maintains an in-memory byte-offset hash index (`.idx`) for $O(1)$ random lookups.
   - Updates append new versions; deletions append tombstone markers. `compact()` safely purges superseded records.
   - Concurrency safety: Writes are serialized through an in-process promise-based queue with atomic temp-file-rename.

2. **Security & Session Management (`routes/auth.js`)**:
   - Passwords hashed using Node's built-in `crypto.scrypt` with 16-byte random salts.
   - Opaque 32-byte session tokens required via `Authorization: Bearer <token>` or `X-Session-Token` on all private routes.
   - Strict role checks on both frontend and backend (e.g., student calling `PUT /api/availability` receives HTTP 403 Forbidden).
   - HTML escaping (`esc()`) and length-limiting on all user inputs to prevent injection attacks.