process.env.ATLAS_LIBRARY_INGESTION_RABBITMQ = '1';
await import('./library-ingestion-worker-bootstrap.mjs');
