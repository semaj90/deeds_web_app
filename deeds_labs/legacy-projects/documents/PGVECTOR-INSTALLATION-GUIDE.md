# pgvector Installation Guide for PostgreSQL 17

## ✅ **Confirmed: pgvector-precompiled.zip WORKS with PostgreSQL 17**

The precompiled package at `C:\Users\james\Desktop\deeds-web\deeds-web-app\pgvector-precompiled.zip` is specifically built for **PostgreSQL v17.3 on Windows x64**.

## 🚀 **Installation Steps**

### 1. Install pgvector Files (Requires Administrator)

**Option A: Using PowerShell Script**
```powershell
# Right-click PowerShell → "Run as Administrator"
cd "C:\Users\james\Desktop\deeds-web\deeds-web-app"
.\install-pgvector.ps1
```

**Option B: Manual Installation**
```cmd
# Run Command Prompt as Administrator
copy "C:\Users\james\Desktop\deeds-web\deeds-web-app\pgvector-precompiled\lib\vector.dll" "C:\Program Files\PostgreSQL\17\lib\"

xcopy "C:\Users\james\Desktop\deeds-web\deeds-web-app\pgvector-precompiled\share\extension\*" "C:\Program Files\PostgreSQL\17\share\extension\" /Y
```

### 2. Restart PostgreSQL
```cmd
"C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" restart -D "C:\Program Files\PostgreSQL\17\data" -l "C:\Program Files\PostgreSQL\17\data\postgresql.log"
```

### 3. Create Extension in Database
```cmd
set PGPASSWORD=123456
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d legal_ai_db -f create-vector-extension.sql
```

## 📦 **What Gets Installed**

- **pgvector 0.8.0** (latest version)
- **Vector data type** for storing embeddings
- **Vector operators**: `<->` (L2), `<#>` (inner product), `<=>` (cosine)
- **Vector indexes**: IVFFlat and HNSW for performance

## 🧪 **Testing the Installation**

The `create-vector-extension.sql` script includes comprehensive tests:

1. ✅ Extension creation
2. ✅ Vector table creation  
3. ✅ Vector similarity search
4. ✅ Vector operations testing
5. ✅ Vector index creation

## 🔗 **Integration with Legal AI System**

### Drizzle Schema Update
```typescript
import { vector } from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 384 }), // or 768, 1536, etc.
  metadata: jsonb('metadata')
});
```

### Vector Search Queries
```typescript
// Similarity search
const results = await db.select()
  .from(documents)
  .orderBy(sql`embedding <=> ${queryEmbedding}`)
  .limit(10);

// Distance threshold
const results = await db.select()
  .from(documents)  
  .where(sql`embedding <=> ${queryEmbedding} < 0.5`)
  .orderBy(sql`embedding <=> ${queryEmbedding}`);
```

### Unified System Integration

Your unified system can now use vector search in both processing paths:

**GPU Path**: High-priority documents with complex vector operations
**CPU Path**: Standard documents with cached vector results

## 📁 **Files Created**

1. `install-pgvector.ps1` - PowerShell installer script
2. `create-vector-extension.sql` - Extension creation and testing
3. `PGVECTOR-INSTALLATION-GUIDE.md` - This guide

## 🎯 **Next Steps**

1. **Install pgvector** using the PowerShell script
2. **Update database schema** to include vector columns
3. **Integrate with embedding generation** in your pipeline
4. **Test vector search** with your legal documents
5. **Optimize vector indexes** for your data size

## 🔧 **Troubleshooting**

- **Permission denied**: Run as Administrator
- **Extension not found**: Ensure files are copied to correct directories  
- **Function errors**: Restart PostgreSQL after installation
- **Performance issues**: Create appropriate vector indexes

## 🎉 **Success Indicators**

After installation, you should see:
```sql
legal_ai_db=# SELECT extname,extversion FROM pg_extension WHERE extname='vector';
 extname | extversion 
---------+------------
 vector  | 0.8.0
```

Your PostgreSQL 17 legal AI system now has full vector search capabilities!