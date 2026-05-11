/**
 * Setup Karpathy Wiki Design Documents in CouchDB
 * 
 * Implements views for:
 *  - by_feature_key
 *  - by_tag
 *  - by_audit_status
 *  - by_activity_score
 *  - link_matrix (imports/exports)
 */

const COUCHDB_URL = process.env.COUCHDB_URL ?? 'http://localhost:5984';
const COUCHDB_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCHDB_PASS = process.env.COUCHDB_PASS ?? process.env.COUCHDB_PASSWORD ?? 'deeds123';

function authHeader() {
  return 'Basic ' + Buffer.from(COUCHDB_USER + ':' + COUCHDB_PASS).toString('base64');
}

async function couchFetch(path, init) {
  const url = COUCHDB_URL + '/' + path;
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      ...(init?.headers ?? {})
    }
  });
}

const DB_NAME = 'karpathy_wiki';

const designDoc = {
	_id: '_design/wiki',
	views: {
		by_feature_key: {
			map: function(doc) {
				if (doc.featureKeys && Array.isArray(doc.featureKeys)) {
					doc.featureKeys.forEach(function(key) {
						emit(key, { dirPath: doc.dirPath, title: doc.title });
					});
				}
			}.toString()
		},
		by_tag: {
			map: function(doc) {
				if (doc.qdrantTags && Array.isArray(doc.qdrantTags)) {
					doc.qdrantTags.forEach(function(tag) {
						emit(tag, { dirPath: doc.dirPath, title: doc.title });
					});
				}
			}.toString()
		},
		by_audit_status: {
			map: function(doc) {
				if (doc.auditStatus) {
					emit(doc.auditStatus, { dirPath: doc.dirPath, title: doc.title });
				}
			}.toString()
		},
		by_activity_score: {
			map: function(doc) {
				if (typeof doc.activityScore === 'number') {
					emit(doc.activityScore, { dirPath: doc.dirPath, title: doc.title });
				}
			}.toString()
		},
		link_matrix: {
			map: function(doc) {
				if (doc.staticImports && Array.isArray(doc.staticImports)) {
					doc.staticImports.forEach(function(imp) {
						emit(['import', imp], doc.dirPath);
					});
				}
				if (doc.dynamicImports && Array.isArray(doc.dynamicImports)) {
					doc.dynamicImports.forEach(function(imp) {
						emit(['dynamic_import', imp], doc.dirPath);
					});
				}
				emit(['origin', doc.dirPath], doc.dirPath);
			}.toString()
		}
	}
};

async function main() {
	console.log(`Setting up CouchDB: ${DB_NAME}`);
	
	const createRes = await couchFetch(DB_NAME, { method: 'PUT' });
	if (createRes.ok || createRes.status === 412) {
		console.log(`- Database ${DB_NAME} ready.`);
	} else {
		console.log(`- Database ${DB_NAME} check failed (status: ${createRes.status}).`);
	}

	try {
		// Fetch existing to get _rev
		let rev;
		const getRes = await couchFetch(DB_NAME + '/' + encodeURIComponent(designDoc._id));
		if (getRes.ok) {
			const existing = await getRes.json();
			rev = existing._rev;
		}

		const docToPut = { ...designDoc };
		if (rev) docToPut._rev = rev;

		const putRes = await couchFetch(DB_NAME + '/' + encodeURIComponent(designDoc._id), {
			method: 'PUT',
			body: JSON.stringify(docToPut)
		});
		
		const result = await putRes.json();
		console.log(`- Design document updated: ${JSON.stringify(result)}`);
	} catch (e) {
		console.error(`- Error updating design document:`, e);
	}
	
	console.log('Done.');
}

main().catch(console.error);
