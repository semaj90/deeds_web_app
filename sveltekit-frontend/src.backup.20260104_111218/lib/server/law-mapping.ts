// State mappings: abbreviations, slugs, and canonical forms
const states = [
 { abbr: 'ca', slug: 'california', canonical: 'california' },
 { abbr: 'ny', slug: 'new-york', canonical: 'new-york' },
 { abbr: 'tx', slug: 'texas', canonical: 'texas' },
 { abbr: 'fl', slug: 'florida', canonical: 'florida' },
 { abbr: 'il', slug: 'illinois', canonical: 'illinois' },
 { abbr: 'pa', slug: 'pennsylvania', canonical: 'pennsylvania' },
 { abbr: 'oh', slug: 'ohio', canonical: 'ohio' },
 { abbr: 'ga', slug: 'georgia', canonical: 'georgia' },
 { abbr: 'nc', slug: 'north-carolina', canonical: 'north-carolina' },
 { abbr: 'mi', slug: 'michigan', canonical: 'michigan' },
 { abbr: 'nj', slug: 'new-jersey', canonical: 'new-jersey' },
 { abbr: 'va', slug: 'virginia', canonical: 'virginia' },
 { abbr: 'wa', slug: 'washington', canonical: 'washington' },
 { abbr: 'az', slug: 'arizona', canonical: 'arizona' },
 { abbr: 'ma', slug: 'massachusetts', canonical: 'massachusetts' },
 { abbr: 'tn', slug: 'tennessee', canonical: 'tennessee' },
 { abbr: 'mo', slug: 'missouri', canonical: 'missouri' },
 { abbr: 'md', slug: 'maryland', canonical: 'maryland' },
 { abbr: 'wi', slug: 'wisconsin', canonical: 'wisconsin' },
 { abbr: 'co', slug: 'colorado', canonical: 'colorado' },
 { abbr: 'mn', slug: 'minnesota', canonical: 'minnesota' },
 { abbr: 'sc', slug: 'south-carolina', canonical: 'south-carolina' },
 { abbr: 'al', slug: 'alabama', canonical: 'alabama' },
 { abbr: 'la', slug: 'louisiana', canonical: 'louisiana' },
 { abbr: 'ky', slug: 'kentucky', canonical: 'kentucky' },
 { abbr: 'or', slug: 'oregon', canonical: 'oregon' },
 { abbr: 'ok', slug: 'oklahoma', canonical: 'oklahoma' },
 { abbr: 'ct', slug: 'connecticut', canonical: 'connecticut' },
 { abbr: 'ut', slug: 'utah', canonical: 'utah' },
 { abbr: 'ia', slug: 'iowa', canonical: 'iowa' },
 { abbr: 'nv', slug: 'nevada', canonical: 'nevada' },
 { abbr: 'ar', slug: 'arkansas', canonical: 'arkansas' },
 { abbr: 'ms', slug: 'mississippi', canonical: 'mississippi' },
 { abbr: 'ks', slug: 'kansas', canonical: 'kansas' },
 { abbr: 'nm', slug: 'new-mexico', canonical: 'new-mexico' },
 { abbr: 'ne', slug: 'nebraska', canonical: 'nebraska' },
 { abbr: 'id', slug: 'idaho', canonical: 'idaho' },
 { abbr: 'hi', slug: 'hawaii', canonical: 'hawaii' },
 { abbr: 'nh', slug: 'new-hampshire', canonical: 'new-hampshire' },
 { abbr: 'me', slug: 'maine', canonical: 'maine' },
 { abbr: 'mt', slug: 'montana', canonical: 'montana' },
 { abbr: 'ri', slug: 'rhode-island', canonical: 'rhode-island' },
 { abbr: 'de', slug: 'delaware', canonical: 'delaware' },
 { abbr: 'sd', slug: 'south-dakota', canonical: 'south-dakota' },
 { abbr: 'nd', slug: 'north-dakota', canonical: 'north-dakota' },
 { abbr: 'ak', slug: 'alaska', canonical: 'alaska' },
 { abbr: 'vt', slug: 'vermont', canonical: 'vermont' },
 { abbr: 'wy', slug: 'wyoming', canonical: 'wyoming' },
 { abbr: 'dc', slug: 'district-of-columbia', canonical: 'district-of-columbia' },
];

// Legal title mappings: codes, names, and canonical forms
const titles = [
 { code: 'pc', name: 'penal-code', canonical: 'penal-code' },
 { code: 'cc', name: 'civil-code', canonical: 'civil-code' },
 { code: 'fc', name: 'family-code', canonical: 'family-code' },
 { code: 'bpc', name: 'business-professions-code', canonical: 'business-professions-code' },
 { code: 'fcc', name: 'federal-criminal-code', canonical: 'federal-criminal-code' },
 { code: 'usc', name: 'united-states-code', canonical: 'united-states-code' },
 { code: 'cfr', name: 'code-federal-regulations', canonical: 'code-federal-regulations' },
 {
 code: 'frcp',
 name: 'federal-rules-civil-procedure',
 canonical: 'federal-rules-civil-procedure',
 },
 { code: 'frre', name: 'federal-rules-evidence', canonical: 'federal-rules-evidence' },
 {
 code: 'frcr',
 name: 'federal-rules-criminal-procedure',
 canonical: 'federal-rules-criminal-procedure',
 },
];

export function findStateBySlug(slug: string) {
 slug = slug.toLowerCase().trim();
 return states.find((s) => s.abbr === slug || s.slug === slug || s.canonical === slug);
}

export function findTitleBySlug(slug: string) {
 slug = slug.toLowerCase().trim();
 return titles.find((t) => t.code === slug || t.name === slug || t.canonical === slug);
}

export function getStateByAbbr(abbr: string) {
 return states.find((s) => s.abbr === abbr.toLowerCase());
}

export function getTitleByCode(code: string) {
 return titles.find((t) => t.code === code.toLowerCase());
}

export function getAllStates() {
 return states;
}

export function getAllTitles() {
 return titles;
}
