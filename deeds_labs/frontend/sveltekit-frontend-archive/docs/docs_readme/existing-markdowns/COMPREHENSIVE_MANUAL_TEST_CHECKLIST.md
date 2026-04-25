# 🔬 Comprehensive Manual Test Checklist

## Legal Case Management System - Full User Flow Testing

This checklist covers the complete user journey from registration to case creation, testing all
integrated systems.

---

## 🚀 **Phase 1: Application Startup**

### 1.1 Start the Development Server

```bash
cd "c:\Users\james\Downloads\Deeds-App-doesn-t-work--main (2)\web-app\sveltekit-frontend"
npm run dev
```

**Expected Result:** ✅ Server starts on `http://localhost:5173` **Status:** [ ] Pass [ ] Fail

### 1.2 Open Application

- Navigate to `http://localhost:5173`
- **Expected Result:** ✅ Homepage loads with modern CSS styling
- **Check for:** UnoCSS,
- **Status:** [ ] Pass [ ] Fail

---

## 🐘 **Phase 2: Database & Backend Testing**

### 2.1 Database Connection

- **Method:** Check browser console or terminal logs for database connections
- **Expected Result:** ✅ No database connection errors
- **Status:** [ ] Pass [ ] Fail

### 2.2 Drizzle ORM

- **Method:** Look for schema migrations or database queries in logs
- **Expected Result:** ✅ Drizzle ORM connecting to PostgreSQL
- **Status:** [ ] Pass [ ] Fail

---

## 📝 **Phase 3: User Registration**

### 3.1 Access Registration Page

- Navigate to `/register`
- **Expected Result:** ✅ Registration form loads with proper styling
- **Status:** [ ] Pass [ ] Fail

### 3.2 Test Registration Form

Fill out the form with:

- **Email:** `test.user.$(timestamp)@example.com`
- **First Name:** `Test`
- **Last Name:** `User`
- **Password:** `TestPassword123!`
- **Title:** `Prosecutor`

**Expected Result:** ✅ Form submits successfully, user is created in database **Status:** [ ] Pass
[ ] Fail

### 3.3 Verify Registration

- **Check:** Redirect to login or dashboard
- **Check:** No error messages
- **Status:** [ ] Pass [ ] Fail

---

## 🔐 **Phase 4: User Login**

### 4.1 Access Login Page

- Navigate to `/login`
- **Expected Result:** ✅ Login form loads with modern UI
- **Status:** [ ] Pass [ ] Fail

### 4.2 Test Login

Use credentials from registration or:

- **Email:** `admin@prosecutor.com`
- **Password:** `admin123`

**Expected Result:** ✅ Successful login, redirect to dashboard **Status:** [ ] Pass [ ] Fail

### 4.3 Session Management

- **Check:** User session is maintained across page refreshes
- **Check:** Secure session cookies/tokens in browser
- **Status:** [ ] Pass [ ] Fail

---

## 👤 **Phase 5: Profile Management**

### 5.1 Access Profile Page

- Navigate to `/profile`
- **Expected Result:** ✅ Profile form loads with current user data
- **Status:** [ ] Pass [ ] Fail

### 5.2 Update Profile Information

Update the following fields:

- **First Name:** `Updated`
- **Last Name:** `Profile`
- **Title:** `Senior Prosecutor`
- **Department:** `Criminal Justice`

**Expected Result:** ✅ Profile updates successfully save to database **Status:** [ ] Pass [ ] Fail

### 5.3 Verify Profile Updates

- **Check:** Changes persist after page refresh
- **Check:** Success notification appears
- **Status:** [ ] Pass [ ] Fail

---

## 📁 **Phase 6: Case Creation & Management**

### 6.1 Access Dashboard

- Navigate to `/dashboard`
- **Expected Result:** ✅ Dashboard loads with case management interface
- **Status:** [ ] Pass [ ] Fail

### 6.2 Create New Case

Click "Create Case" or similar button and fill out:

- **Title:** `Test Case - Comprehensive System Test`
- **Description:** `This is a test case created during system testing`
- **Case Type:** `Criminal Investigation`
- **Priority:** `High`
- **Status:** `Active`

**Expected Result:** ✅ Case is created and saved to PostgreSQL database **Status:** [ ] Pass [ ]
Fail

### 6.3 Verify Case Creation

- **Check:** Case appears in dashboard list
- **Check:** Case has unique ID
- **Check:** All fields are properly saved
- **Status:** [ ] Pass [ ] Fail

---

## 🔍 **Phase 7: Search Functionality (Fuse.js)**

### 7.1 Test Case Search

- Use the search bar on dashboard
- Search for: `"Test Case"`
- **Expected Result:** ✅ Fuse.js returns fuzzy search results
- **Status:** [ ] Pass [ ] Fail

### 7.2 Test Advanced Filters

Use the enhanced SearchBar component:

- **File Types:** Select Images, Documents
- **Date Range:** Set from/to dates
- **Sort Options:** Try different sorting
- **Expected Result:** ✅ Filters work and communicate with parent component
- **Status:** [ ] Pass [ ] Fail

### 7.3 Clear Filters

- Click "Clear Filters" button
- **Expected Result:** ✅ All filters reset to default state
- **Status:** [ ] Pass [ ] Fail

---

## 💾 **Phase 8: Local Storage (Loki.js)**

### 8.1 Check Browser Storage

- Open browser Developer Tools → Application → Local Storage
- **Expected Result:** ✅ Loki.js database entries visible
- **Look for:** Keys containing 'loki' or application data
- **Status:** [ ] Pass [ ] Fail

### 8.2 Test Data Persistence

- Create some data (search queries, preferences)
- Refresh the page
- **Expected Result:** ✅ Data persists using Loki.js
- **Status:** [ ] Pass [ ] Fail

---

## 🤖 **Phase 9: Qdrant Integration (Auto-tagging)**

### 9.1 Test Embeddings API

- Open Developer Tools → Network tab
- Perform actions that might trigger embeddings (case creation, search)
- **Expected Result:** ✅ Requests to `/api/embeddings/*` endpoints
- **Status:** [ ] Pass [ ] Fail

### 9.2 Auto-tagging Functionality

- Create a case with descriptive content
- **Expected Result:** ✅ Automatic tags generated based on content
- **Check:** Tags appear in case details
- **Status:** [ ] Pass [ ] Fail

---

## 🎨 **Phase 10: CSS Framework Integration**

### 10.1 uno CSS Framework

- **Check:** Inspect elements for framework classes
- **Look for:** Modern button styles, form styling, color themes
- **Expected Result:** ✅ Consistent modern styling throughout app
- **Status:** [ ] Pass [ ] Fail

### 10.2 Responsive Design

- Test on different screen sizes
- **Expected Result:** ✅ App is responsive on mobile/tablet/desktop
- **Status:** [ ] Pass [ ] Fail

---

## 🧩 **Phase 11: UI Component Libraries**

### 11.1 Melt-UI Components

- **Check:** Inspect DOM for `data-melt-*` attributes
- **Look for:** Advanced UI components like modals, dropdowns
- **Expected Result:** ✅ Melt-UI components functioning
- **Status:** [ ] Pass [ ] Fail

### 11.2 Bits-UI Components

- **Check:** Look for `data-bits-*` or bits-ui specific classes
- **Expected Result:** ✅ Bits-UI components integrated
- **Status:** [ ] Pass [ ] Fail

---

## 🔧 **Phase 12: Interactive Canvas**

### 12.1 Access Interactive Canvas

- Navigate to `/interactive-canvas`
- **Expected Result:** ✅ Canvas interface loads with tools
- **Status:** [ ] Pass [ ] Fail

### 12.2 File Upload with Hashing

- Drag and drop a file onto the canvas
- **Expected Result:** ✅ File uploads with SHA256 hash calculation
- **Check:** Progress indicator shows hash calculation and upload
- **Status:** [ ] Pass [ ] Fail

### 12.3 Canvas Functionality

- Test drawing, annotation tools
- **Expected Result:** ✅ Canvas tools work smoothly
- **Status:** [ ] Pass [ ] Fail

---

## 📊 **Final Verification Checklist**

### System Integration

- [ ] ✅ PostgreSQL database connected and working
- [ ] ✅ Drizzle ORM handling database operations
- [ ] ✅ User authentication and sessions secure
- [ ] ✅ Profile management working
- [ ] ✅ Case creation and management functional
- [ ] ✅ Search with Fuse.js working
- [ ] ✅ Loki.js local storage operational
- [ ] ✅ Qdrant auto-tagging active
- [ ] ✅ CSS frameworks providing modern styling
- [ ] ✅ UI component libraries functional
- [ ] ✅ Interactive canvas with file handling

### Performance & UX

- [ ] ✅ Application loads quickly
- [ ] ✅ No console errors in browser
- [ ] ✅ Responsive design works
- [ ] ✅ Accessibility features present
- [ ] ✅ Form validation working
- [ ] ✅ Error handling graceful

### Security

- [ ] ✅ Passwords properly hashed
- [ ] ✅ Session management secure
- [ ] ✅ File uploads validated
- [ ] ✅ API endpoints protected

---

## 🎯 **Success Criteria**

For a **PASSING** grade, the system should achieve:

- ✅ **Login/Register:** 100% functional
- ✅ **Profile Updates:** Working with database persistence
- ✅ **Case Creation:** Full CRUD operations
- ✅ **Database Integration:** PostgreSQL + Drizzle working
- ✅ **Search:** Fuse.js providing results
- ✅ **Storage:** Loki.js maintaining local data
- ✅ **Auto-tagging:** Qdrant integration active
- ✅ **Styling:** Modern CSS framework integration
- ✅ **UI Components:** Melt-UI/Bits-UI functional

## 📝 **Test Report Template**

```
=== COMPREHENSIVE TEST REPORT ===
Date: [DATE]
Tester: [NAME]
System: Legal Case Management System

RESULTS:
✅ Registration: [PASS/FAIL]
✅ Login: [PASS/FAIL]
✅ Profile Update: [PASS/FAIL]
✅ Case Creation: [PASS/FAIL]
✅ PostgreSQL: [PASS/FAIL]
✅ Drizzle ORM: [PASS/FAIL]
✅ Fuse.js Search: [PASS/FAIL]
✅ Loki.js Storage: [PASS/FAIL]
✅ Qdrant Integration: [PASS/FAIL]
✅ CSS Frameworks: [PASS/FAIL]
✅ UI Libraries: [PASS/FAIL]

OVERALL: [PASS/FAIL]
NOTES: [Any issues or observations]
```

---

**⚡ Ready to test! Start with `npm run dev` and work through each phase systematically.**
