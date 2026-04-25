# Database Migration Strategy

## Current State
The database already has these tables:
- account
- case_activities  
- case_law_links
- cases
- content_embeddings
- crimes
- criminals
- evidence
- law_paragraphs
- sessions
- statutes
- users
- verificationToken

## Our Schema Has
Many additional tables that don't exist yet. We need to:

1. Create a compatible schema that works with existing tables
2. Add new tables incrementally via proper migrations
3. Ensure the app works with existing data

## Strategy
1. First, create a schema that only includes existing tables
2. Run the app to ensure it works
3. Then add new tables via migrations
4. Update the schema incrementally

## Action Plan
1. Create a minimal compatible schema
2. Test database connection
3. Run the app
4. Add new tables one by one
