## Manual Testing Guide for SvelteKit Legal Case Management App

### Current Status:
- ✅ PostgreSQL Database: Running on localhost:5432
- ✅ Sample Data: Loaded (3 cases, 3 criminals, 4 evidence items)
- ✅ SvelteKit Server: Running on http://localhost:5174
- ❓ API Routes: Need manual testing via UI

### Manual Test Steps:

#### 1. User Registration Test
1. Open browser to: http://localhost:5174/register
2. Fill out the form:
   - Name: "Test User"
   - Email: "testuser@example.com" 
   - Password: "testpassword123"
3. Click "Register" button
4. Expected: Redirect to dashboard or success message
5. Verify: Check if user was created in database

#### 2. User Login Test
1. Open browser to: http://localhost:5174/login
2. Use existing user credentials:
   - Email: "example@example.com"
   - Password: "password"
3. Click "Login" button
4. Expected: Redirect to dashboard
5. Verify: User session is active

#### 3. Dashboard Display Test
1. After login, navigate to: http://localhost:5174/dashboard
2. Expected to see:
   - Cases list (should show 3 sample cases)
   - Recent activity
   - Statistics
3. Verify: Data from PostgreSQL is displayed

#### 4. Cases CRUD Test
1. Navigate to: http://localhost:5174/cases
2. View existing cases (should see sample data)
3. Click "New Case" or similar button
4. Fill out case form:
   - Title: "Test Case"
   - Description: "This is a test case"
   - Status: Select appropriate status
5. Save the case
6. Expected: Case appears in list
7. Verify: Check database for new case entry

#### 5. Criminals CRUD Test
1. Navigate to: http://localhost:5174/criminals
2. View existing criminals (should see sample data)
3. Add new criminal:
   - Name: "Test Criminal"
   - Details: Fill appropriate fields
4. Save the criminal
5. Expected: Criminal appears in list
6. Verify: Check database for new criminal entry

#### 6. Evidence CRUD Test
1. Navigate to: http://localhost:5174/evidence
2. View existing evidence (should see sample data)
3. Add new evidence:
   - Title: "Test Evidence"
   - Type: Select type
   - Description: "Test evidence description"
4. Save the evidence
5. Expected: Evidence appears in list
6. Verify: Check database for new evidence entry

### Database Verification Commands:

After each test, verify data persistence:

\`\`\`bash
# Check users
docker exec deeds-app-doesn-t-work--main-db-1 psql -U postgres -d prosecutor_db -c "SELECT id, email, name FROM users;"

# Check cases
docker exec deeds-app-doesn-t-work--main-db-1 psql -U postgres -d prosecutor_db -c "SELECT id, title, status FROM cases;"

# Check criminals
docker exec deeds-app-doesn-t-work--main-db-1 psql -U postgres -d prosecutor_db -c "SELECT id, name FROM criminals;"

# Check evidence
docker exec deeds-app-doesn-t-work--main-db-1 psql -U postgres -d prosecutor_db -c "SELECT id, title, type FROM evidence;"
\`\`\`

### Current Sample Data in Database:
- **Users**: 1 existing user (example@example.com)
- **Cases**: 3 sample cases (Robbery Investigation, Fraud Case, Assault Investigation)
- **Criminals**: 3 sample criminals (John Doe, Jane Smith, Bob Johnson)
- **Evidence**: 4 sample evidence items (Security Camera Footage, Fingerprints, etc.)

### Troubleshooting:
If forms don't submit or show errors:
1. Check browser developer console for JavaScript errors
2. Check network tab for failed API requests
3. Check SvelteKit server logs in terminal
4. Verify PostgreSQL connection in browser network requests

### Success Criteria:
- [  ] User can register and login successfully
- [  ] Dashboard displays existing data from PostgreSQL
- [  ] Can create new cases and they persist in database
- [  ] Can create new criminals and they persist in database  
- [  ] Can create new evidence and they persist in database
- [  ] All CRUD operations work through the UI
- [  ] Data is properly saved and updated in PostgreSQL via Drizzle ORM
