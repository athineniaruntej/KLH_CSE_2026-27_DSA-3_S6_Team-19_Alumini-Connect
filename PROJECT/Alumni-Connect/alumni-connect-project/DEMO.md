# Alumni Connect — Presentation & Viva Demo Script

This document provides a click-by-click walkthrough for evaluating or presenting **Alumni Connect (DSA-3 Project)**, followed by frequently asked academic viva questions and answers regarding the hand-built algorithms.

---

## 1. Step-by-Step Viva Presentation Flow

### Step 1: Clean Startup & Reset
1. Open PowerShell and navigate to `alumni-connect-project/`.
2. Run `npm run reset-data`. Explain to the examiner that this resets the text-file database in `data/*.txt` and rebuilds all index files.
3. Run `npm start`. Point out that the server runs on Node.js built-in modules with **zero npm dependencies**.
4. Open `http://localhost:5000` in the browser.

---

### Step 2: Student Flow
1. **Login as Student**:
   - On the login screen, leave the **Student** card selected.
   - Credentials pre-filled: `student@alumniconnect.local` / `student123`. Click **Sign in as Student →**.
2. **Student Dashboard & Sidebar**:
   - Point out that the sidebar exclusively contains **Student** items (Find Mentors, My Mentorship, Book a Session, Career Roadmap, etc.).
   - Highlight the **Smart Mentor Recommendations** card showing real-time match scores (e.g., 94% Match) computed using Jaccard similarity and Levenshtein distance.
3. **Typo-Tolerant Search**:
   - Click **Find Mentors** in the sidebar.
   - In the search bar, type a typo such as `"jva"` or `"pythn"`.
   - Show that mentors with `"Java"` or `"Python"` skills are instantly retrieved via the Levenshtein dynamic programming algorithm.
4. **Smart Match (AI/DSA)**:
   - Click the **Smart Match (AI/DSA)** toggle.
   - Point out the match explanation pills: `"Shares 3 skills: Java, DSA, Spring Boot"`, `"Same department (CSE)"`.
   - Click **Request Mentorship** on one of the mentor cards, enter a topic (e.g., `"Placement Mock Interview Prep"`), and submit.
5. **Book a 1:1 Session**:
   - Navigate to **Book a Session** from the sidebar.
   - Click **+ Schedule New Session**, choose an accepted mentor, pick a date and time, and submit.
   - Point out the generated Google Meet link.
6. **Career Roadmap Generator**:
   - Click **Career Roadmap** in the sidebar.
   - Switch between **Backend Engineer**, **Full-Stack**, and **Data Science & AI**.
   - Show the interactive milestone timeline, required skills, and automatically matched domain mentors.
7. **Opportunities & Messaging**:
   - Browse **Opportunities**, click **Apply** on a job posting, and submit a cover note.
   - Open **Messages**, view the conversation thread with the mentor, and send a message.
8. **Logout**:
   - Click **Logout** at the bottom of the sidebar.

---

### Step 3: Mentor Portal (The Fixed Role Portal)
1. **Login as Mentor**:
   - Click the **Mentor** role card on the login screen.
   - Credentials pre-filled: `alumni@alumniconnect.local` / `alumni123`. Click **Sign in as Mentor →**.
2. **Dedicated Mentor Dashboard**:
   - **Show the Fix**: Point out that the mentor no longer sees the student dashboard. The mentor now sees a dedicated mentor dashboard with 6 stat cards:
     - *Pending Requests*, *Active Mentees*, *Sessions This Week*, *Opportunities Published*, *Profile Views*, *Average Rating (5.0★)*.
   - Show the **Upcoming 1:1 Sessions** card and **Active Mentees Progress Snapshot**.
3. **Mentorship Requests**:
   - Click **Mentorship Requests** in the sidebar.
   - Review incoming student requests with full details.
   - Click **Accept** on a pending request.
4. **My Mentees & Progress Notes**:
   - Click **My Mentees**.
   - Show the accepted student list.
   - Click **Edit Notes** to update the mentee's career progress notes, save, and demonstrate persistence.
5. **Session Management**:
   - Click **Sessions** in the sidebar.
   - Point out scheduled sessions, meeting links, and click **Mark Completed ✓**.
6. **Availability & Capacity**:
   - Click **Availability** in the sidebar.
   - Show the **Open to New Mentees** toggle, the **Max Mentee Capacity** limiter (e.g., 5 students), and the weekly schedule slots. Save the settings.
7. **Opportunities & Applicant Review**:
   - Click **Opportunities**.
   - Under **Published by Me**, click **View Applicants**.
   - Review the students who applied, their cover notes, and click **Shortlist ✓**.
8. **Referrals**:
   - Click **Referrals**, click **+ Create Referral**, select a mentee, enter company details, and submit.
9. **Reviews & Impact**:
   - Click **Reviews & Impact** to show student feedback, the 5-star rating breakdown, and earned badges (*Top Mentor 🏆*, *Quick Responder ⚡*, *Verified Expert 💎*).
10. Click **Logout**.

---

### Step 4: Admin Governance & Algorithm Lab
1. Click the small **Admin** hint on the login screen (`admin@alumniconnect.local` / `admin123`) and sign in.
2. **Manage Users & Mentor Verification**:
   - Click **Manage Users**.
   - Click **Verify ✓** to toggle the verified expert badge on an alumni account.
3. **Platform Analytics**:
   - Click **Analytics**. Show the pure SVG **Mentorship Funnel** chart, the CSS **Skills in Demand** bar graph, and the **Department Distribution** chart.
4. **Academic Algorithm Lab**:
   - Click **Algorithm Lab**.
   - Select an algorithm (e.g., `KMP Pattern Search`, `Levenshtein`, `Bipartite Matching`, `Dinic Flow`).
   - Click **Run Algorithm ⚡** and show live output execution with elapsed runtime in milliseconds.

---

## 2. Likely Viva Questions & Answers

### Q1: Why does this project avoid external database engines (like MongoDB or MySQL) and npm packages?
**Answer:** The goal of DSA-3 is to demonstrate foundational understanding of data structures and operating system primitives. We built our own storage engine using append-only text logs (`data/*.txt`) with in-memory byte-offset hash indexes (`.idx`). Concurrency safety is achieved using an in-process promise-based write queue that serializes disk writes, and atomicity is guaranteed via write-to-temp-then-rename.

### Q2: How does the Smart Mentor Matching algorithm work?
**Answer:** It uses a multi-factor scoring function:
1. **Set Overlap & Jaccard Similarity**: Computes $|A \cap B| / |A \cup B|$ between the student's skills and the mentor's skills.
2. **Levenshtein Distance**: A dynamic programming algorithm ($O(n \cdot m)$ time) that measures edit distance between skill names, enabling fuzzy matching (e.g., matching `"ReactJS"` with `"React"`).
3. **Department & Industry Alignment**: Adds weighted preference bonuses if both are in the same department or industry.
4. **Mentor Capacity & Availability**: Checks whether the mentor has toggled `isOpen` and has not exceeded their `maxMentees` limit.

### Q3: How is typo-tolerance achieved in search without external search engines?
**Answer:** When a user types a query like `"jva"` or `"pythn"`:
- The backend splits the query into terms and compares them against known keywords using the Wagner-Fischer dynamic programming implementation of **Levenshtein distance**.
- If the edit distance is $\le 2$ (for words $\ge 3$ characters), the term is recognized as a typo of the target keyword and scored accordingly.
- For exact substrings in resumes, we use **KMP (Knuth-Morris-Pratt)** with the $\pi$ failure function to search in $O(N + M)$ worst-case time without backtracking.

### Q4: How does the Bipartite Matching algorithm fit into this project?
**Answer:** In the academic algorithm suite (`algorithms.js`), bipartite matching is implemented using augmenting paths (Ford-Fulkerson style) to solve maximum cardinality matching. In mentorship assignment, students represent left-side vertices and mentors represent right-side vertices; edges represent mutual interest and capacity. The algorithm determines the maximum number of disjoint student-mentor pairings.

### Q5: What is the purpose of the LRU Cache in `lib/lru.js`?
**Answer:** To avoid re-reading disk files on frequent point reads (such as looking up user profiles), we implemented a Least Recently Used cache using a doubly-linked list combined with a JavaScript hash map. Both `get()` and `put()` run in $O(1)$ time, and least-recently-accessed records are evicted when the cache reaches capacity.

### Q6: How does Huffman Coding work in `lib/huffman.js`?
**Answer:** Huffman Coding is used for archiving old logs into `data/archive/*.huff`. It calculates character frequencies, builds a binary min-heap priority queue, merges the two lowest-frequency nodes repeatedly to build a prefix-free binary tree, and generates variable-length bit codes. Frequent characters receive shorter bit sequences, achieving lossless text compression.

### Q7: How is security handled on the server?
**Answer:**
- **Password Security**: Passwords are never stored in plaintext; they are hashed using Node's built-in `crypto.scrypt` with a unique 16-byte cryptographically secure random salt and compared using timing-safe comparisons (`timingSafeEqual`).
- **Session Tokens**: 32-byte hexadecimal tokens stored in `data/sessions.txt` with a 24-hour TTL, verified via `Authorization: Bearer <token>`.
- **Role Enforcement**: Every route enforces user permissions on the server (e.g., a student trying to call mentor-only routes like `PUT /api/availability` receives HTTP 403 Forbidden).
