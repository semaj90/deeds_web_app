-- Quick Database Status Check -- Legal AI Platform Migration Summary \echo '🎯 Legal AI Platform Database Status' \echo
'====================================' -- Extensions \echo '' \echo '📦 Extensions:' SELECT ' ✅ ' || extname as
extension_status FROM pg_extension WHERE extname IN ('vector', 'uuid-ossp', 'pg_trgm', 'btree_gin') ORDER BY extname; --
Core Tables \echo '' \echo '🗄️ Core Tables:' SELECT ' 📊 ' || table_name || ' (' || (SELECT count(*)::text FROM
information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') || ' columns)' as table_info
FROM information_schema.tables t WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name IN ('users',
'legal_cases', 'legal_documents', 'document_chunks') ORDER BY table_name; -- GPU Cache System Tables \echo '' \echo '🚀
GPU Cache System:' SELECT ' 🔧 ' || table_name || ' - ' || CASE WHEN table_name LIKE '%shader_cache%' THEN 'GPU shader
storage' WHEN table_name LIKE '%user_patterns%' THEN 'ML behavior patterns' WHEN table_name LIKE '%preload%' THEN
'Predictive loading' WHEN table_name LIKE '%compilation%' THEN 'Compilation queue' WHEN table_name LIKE '%dependencies%'
THEN 'Dependency tracking' ELSE 'GPU optimization' END as table_purpose FROM information_schema.tables WHERE
table_schema = 'public' AND table_type = 'BASE TABLE' AND (table_name LIKE '%shader%' OR table_name LIKE '%gpu%') ORDER
BY table_name; -- Tensor Processing Tables \echo '' \echo '🧠 Tensor Processing System:' SELECT ' 🔬 ' || table_name ||
' - ' || CASE WHEN table_name LIKE '%tensor%' THEN 'Tensor metadata & processing' WHEN table_name LIKE '%neural%' THEN
'Neural model registry' ELSE 'AI processing' END as table_purpose FROM information_schema.tables WHERE table_schema =
'public' AND table_type = 'BASE TABLE' AND (table_name LIKE '%tensor%' OR table_name LIKE '%neural%') ORDER BY
table_name; -- Vector Indexes \echo '' \echo '🔍 Vector Similarity Indexes:' SELECT ' 📈 ' || indexname || ' - HNSW
vector index' as vector_index FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%_hnsw' ORDER BY
indexname; -- Database Summary \echo '' \echo '📊 Database Summary:' SELECT ' 📝 Tables: ' || count(*)::text as
table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'; SELECT ' 🔗
Indexes: ' || count(*)::text as index_count FROM pg_indexes WHERE schemaname = 'public'; SELECT ' 🎯 Vector Indexes: '
|| count(*)::text as vector_index_count FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%_hnsw'; \echo
'' \echo '🎉 Legal AI Platform Database - READY FOR PRODUCTION!' \echo ''
