(process.env.CONTEXTUAL_UPLOADS_REQUIRE_AUTH ?? 'true').toLowerCase() !== 'false';

let luciaAvailableForUploads = false;

export function setLuciaAvailabilityForUploads(enabled: boolean): void {
 luciaAvailableForUploads = enabled;
}

export function requireLuciaForContextualUploads(): boolean {
 return REQUIRE_AUTH;
}

export function isLuciaAvailableForContextualUploads(): boolean {
 return luciaAvailableForUploads;
}


