/**
 * State Constitution Source Registry
 *
 * Two-tier source model:
 *  Tier 1 (discovery): Justia/LII state index — reliable stable URLs
 *  Tier 2 (canonical): Official state legislature / state code endpoints
 *
 * is_official = primary source is an official state government domain
 * source_confidence = high | medium | low (based on URL stability/verification)
 *
 * NOTE: These URLs should be verified periodically — state legislature sites
 *       sometimes restructure. The discovery_url is the stable fallback.
 */

export interface StateConstitutionSource {
	stateCode: string;           // 2-letter postal code
	stateName: string;
	discoveryUrl: string;        // Justia/LII — reliable discovery reference
	sourceUrl: string | null;    // Official state URL (preferred for fetch)
	format: 'html' | 'pdf';
	isOfficial: boolean;
	sourceConfidence: 'high' | 'medium' | 'low';
	notes?: string;
}

/** All 50 states + DC + Federal US Constitution, sorted by state code */
export const STATE_CONSTITUTION_SOURCES: StateConstitutionSource[] = [
	{
		stateCode: 'us', stateName: 'United States',
		discoveryUrl: 'https://law.justia.com/constitution/us/',
		sourceUrl: 'https://constitution.congress.gov/constitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
		notes: 'Federal US Constitution — official Congress.gov source (Articles I-VII + 27 Amendments)',
	},
	{
		stateCode: 'al', stateName: 'Alabama',
		discoveryUrl: 'https://law.justia.com/constitution/alabama/',
		sourceUrl: 'https://alisondb.legislature.state.al.us/Alison/default.aspx',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
	},
	{
		stateCode: 'ak', stateName: 'Alaska',
		discoveryUrl: 'https://law.justia.com/constitution/alaska/',
		sourceUrl: 'https://ltgov.alaska.gov/information/alaskas-constitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'az', stateName: 'Arizona',
		discoveryUrl: 'https://law.justia.com/constitution/arizona/',
		sourceUrl: 'https://www.azleg.gov/constitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ar', stateName: 'Arkansas',
		discoveryUrl: 'https://law.justia.com/constitution/arkansas/',
		sourceUrl: 'https://www.arkleg.state.ar.us/assembly/Constitution/Constitution.pdf',
		format: 'pdf', isOfficial: true, sourceConfidence: 'medium',
	},
	{
		stateCode: 'ca', stateName: 'California',
		discoveryUrl: 'https://law.justia.com/constitution/california/',
		sourceUrl: 'https://leginfo.legislature.ca.gov/faces/codes.xhtml?mode=DisplayCode&codeId=CONS',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'co', stateName: 'Colorado',
		discoveryUrl: 'https://law.justia.com/constitution/colorado/',
		sourceUrl: 'https://leg.colorado.gov/constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ct', stateName: 'Connecticut',
		discoveryUrl: 'https://law.justia.com/constitution/connecticut/',
		sourceUrl: 'https://www.cga.ct.gov/current/pub/const.htm',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'de', stateName: 'Delaware',
		discoveryUrl: 'https://law.justia.com/constitution/delaware/',
		sourceUrl: 'https://delcode.delaware.gov/constitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'fl', stateName: 'Florida',
		discoveryUrl: 'https://law.justia.com/constitution/florida/',
		sourceUrl: 'https://www.flsenate.gov/Laws/Constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ga', stateName: 'Georgia',
		discoveryUrl: 'https://law.justia.com/constitution/georgia/',
		sourceUrl: 'https://www.legis.ga.gov/laws/constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'hi', stateName: 'Hawaii',
		discoveryUrl: 'https://law.justia.com/constitution/hawaii/',
		sourceUrl: 'https://ltgov.hawaii.gov/the-office/constitution-of-the-state-of-hawaii/',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
	},
	{
		stateCode: 'id', stateName: 'Idaho',
		discoveryUrl: 'https://law.justia.com/constitution/idaho/',
		sourceUrl: 'https://legislature.idaho.gov/statutesrules/idconst/',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'il', stateName: 'Illinois',
		discoveryUrl: 'https://law.justia.com/constitution/illinois/',
		sourceUrl: 'https://www.ilga.gov/commission/lrb/con0.htm',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'in', stateName: 'Indiana',
		discoveryUrl: 'https://law.justia.com/constitution/indiana/',
		sourceUrl: 'https://iga.in.gov/legislative/laws/const',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ia', stateName: 'Iowa',
		discoveryUrl: 'https://law.justia.com/constitution/iowa/',
		sourceUrl: 'https://www.legis.iowa.gov/law/iowaCode/constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ks', stateName: 'Kansas',
		discoveryUrl: 'https://law.justia.com/constitution/kansas/',
		sourceUrl: 'https://www.kslegislature.org/li/constitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ky', stateName: 'Kentucky',
		discoveryUrl: 'https://law.justia.com/constitution/kentucky/',
		sourceUrl: 'https://legislature.ky.gov/Law/Constitution/Pages/default.aspx',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'la', stateName: 'Louisiana',
		discoveryUrl: 'https://law.justia.com/constitution/louisiana/',
		sourceUrl: 'https://legis.la.gov/Legis/LawSearch.aspx',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
		notes: 'LawSearch — may need navigation for constitution text',
	},
	{
		stateCode: 'me', stateName: 'Maine',
		discoveryUrl: 'https://law.justia.com/constitution/maine/',
		sourceUrl: 'https://legislature.maine.gov/ros/LawsOfMaine/mainelaws.html',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
	},
	{
		stateCode: 'md', stateName: 'Maryland',
		discoveryUrl: 'https://law.justia.com/constitution/maryland/',
		sourceUrl: 'https://msa.maryland.gov/msa/mdmanual/43const/html/const.html',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ma', stateName: 'Massachusetts',
		discoveryUrl: 'https://law.justia.com/constitution/massachusetts/',
		sourceUrl: 'https://malegislature.gov/Laws/Constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'mi', stateName: 'Michigan',
		discoveryUrl: 'https://law.justia.com/constitution/michigan/',
		sourceUrl: 'https://legislature.mi.gov/document/constitution',
		format: 'pdf', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'mn', stateName: 'Minnesota',
		discoveryUrl: 'https://law.justia.com/constitution/minnesota/',
		sourceUrl: 'https://www.revisor.mn.gov/constitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ms', stateName: 'Mississippi',
		discoveryUrl: 'https://law.justia.com/constitution/mississippi/',
		sourceUrl: 'https://www.legislature.ms.gov/laws/miss_code/const',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
	},
	{
		stateCode: 'mo', stateName: 'Missouri',
		discoveryUrl: 'https://law.justia.com/constitution/missouri/',
		sourceUrl: 'https://www.moga.mo.gov/mostatutes/moconstn.html',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'mt', stateName: 'Montana',
		discoveryUrl: 'https://law.justia.com/constitution/montana/',
		sourceUrl: 'https://leg.mt.gov/laws/constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
	},
	{
		stateCode: 'ne', stateName: 'Nebraska',
		discoveryUrl: 'https://law.justia.com/constitution/nebraska/',
		sourceUrl: 'https://nebraskalegislature.gov/laws/articles.php?article=I-1',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'nv', stateName: 'Nevada',
		discoveryUrl: 'https://law.justia.com/constitution/nevada/',
		sourceUrl: 'https://www.leg.state.nv.us/const/nvconst.html',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'nh', stateName: 'New Hampshire',
		discoveryUrl: 'https://law.justia.com/constitution/new-hampshire/',
		sourceUrl: 'https://www.nh.gov/glance/constitution.htm',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'nj', stateName: 'New Jersey',
		discoveryUrl: 'https://law.justia.com/constitution/new-jersey/',
		sourceUrl: 'https://www.njleg.state.nj.us/constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'nm', stateName: 'New Mexico',
		discoveryUrl: 'https://law.justia.com/constitution/new-mexico/',
		sourceUrl: 'https://www.nmlegis.gov/constitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
	},
	{
		stateCode: 'ny', stateName: 'New York',
		discoveryUrl: 'https://law.justia.com/constitution/new-york/',
		sourceUrl: 'https://www.nysenate.gov/legislation/laws/CNS',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'nc', stateName: 'North Carolina',
		discoveryUrl: 'https://law.justia.com/constitution/north-carolina/',
		sourceUrl: 'https://www.ncleg.gov/Laws/Constitution/Constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'nd', stateName: 'North Dakota',
		discoveryUrl: 'https://law.justia.com/constitution/north-dakota/',
		sourceUrl: 'https://www.legis.nd.gov/general-information/north-dakota-century-code/constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'oh', stateName: 'Ohio',
		discoveryUrl: 'https://law.justia.com/constitution/ohio/',
		sourceUrl: 'https://codes.ohio.gov/ohio-constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ok', stateName: 'Oklahoma',
		discoveryUrl: 'https://law.justia.com/constitution/oklahoma/',
		sourceUrl: 'https://www.oscn.net/applications/oscn/index.asp?level=1&type=TITLE&title=CONSTITUTION',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
	},
	{
		stateCode: 'or', stateName: 'Oregon',
		discoveryUrl: 'https://law.justia.com/constitution/oregon/',
		sourceUrl: 'https://www.oregonlegislature.gov/bills_laws/Pages/ORS.aspx',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
		notes: 'ORS index page — constitution is under Oregon Revised Statutes',
	},
	{
		stateCode: 'pa', stateName: 'Pennsylvania',
		discoveryUrl: 'https://law.justia.com/constitution/pennsylvania/',
		sourceUrl: 'https://www.legis.state.pa.us/cfdocs/legis/LI/consCheck.cfm?txtType=HTM&ttl=00',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ri', stateName: 'Rhode Island',
		discoveryUrl: 'https://law.justia.com/constitution/rhode-island/',
		sourceUrl: 'https://webserver.rilin.state.ri.us/RiConstitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'sc', stateName: 'South Carolina',
		discoveryUrl: 'https://law.justia.com/constitution/south-carolina/',
		sourceUrl: 'https://www.scstatehouse.gov/scconstitution/scconst.php',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'sd', stateName: 'South Dakota',
		discoveryUrl: 'https://law.justia.com/constitution/south-dakota/',
		sourceUrl: 'https://sdlegislature.gov/Statutes/Constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'tn', stateName: 'Tennessee',
		discoveryUrl: 'https://law.justia.com/constitution/tennessee/',
		sourceUrl: 'https://sos.tn.gov/sites/default/files/documents/constitution.pdf',
		format: 'pdf', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'tx', stateName: 'Texas',
		discoveryUrl: 'https://law.justia.com/constitution/texas/',
		sourceUrl: 'https://statutes.capitol.texas.gov/Docs/CN/htm/CN.1.htm',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'ut', stateName: 'Utah',
		discoveryUrl: 'https://law.justia.com/constitution/utah/',
		sourceUrl: 'https://le.utah.gov/const/index.html',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'vt', stateName: 'Vermont',
		discoveryUrl: 'https://law.justia.com/constitution/vermont/',
		sourceUrl: 'https://legislature.vermont.gov/statutes/constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'va', stateName: 'Virginia',
		discoveryUrl: 'https://law.justia.com/constitution/virginia/',
		sourceUrl: 'https://law.lis.virginia.gov/constitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'wa', stateName: 'Washington',
		discoveryUrl: 'https://law.justia.com/constitution/washington/',
		sourceUrl: 'https://app.leg.wa.gov/rcw/default.aspx?cite=CONSTITUTION',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'wv', stateName: 'West Virginia',
		discoveryUrl: 'https://law.justia.com/constitution/west-virginia/',
		sourceUrl: 'https://code.wvlegislature.gov/Constitution/',
		format: 'html', isOfficial: true, sourceConfidence: 'medium',
	},
	{
		stateCode: 'wi', stateName: 'Wisconsin',
		discoveryUrl: 'https://law.justia.com/constitution/wisconsin/',
		sourceUrl: 'https://docs.legis.wisconsin.gov/document/statutes/constitution',
		format: 'html', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'wy', stateName: 'Wyoming',
		discoveryUrl: 'https://law.justia.com/constitution/wyoming/',
		sourceUrl: 'https://wyoleg.gov/statutes/compress/constitution.pdf',
		format: 'pdf', isOfficial: true, sourceConfidence: 'high',
	},
	{
		stateCode: 'dc', stateName: 'District of Columbia',
		discoveryUrl: 'https://code.dccouncil.gov/',
		sourceUrl: 'https://code.dccouncil.gov/us/dc/council/code',
		format: 'html', isOfficial: false, sourceConfidence: 'medium',
		notes: 'DC has DC Code but no state constitution; this links the DC Code home.',
	},
];

/** Look up a single source by 2-letter state code (case-insensitive). */
export function getSource(stateCode: string): StateConstitutionSource | undefined {
	return STATE_CONSTITUTION_SOURCES.find(
		(s) => s.stateCode === stateCode.toLowerCase()
	);
}

/** List all states that have an official source URL. */
export function getOfficialSources(): StateConstitutionSource[] {
	return STATE_CONSTITUTION_SOURCES.filter((s) => s.isOfficial && s.sourceUrl);
}

/** Return the best fetch URL: official source first, discovery URL as fallback. */
export function getBestFetchUrl(source: StateConstitutionSource): string {
	return source.sourceUrl ?? source.discoveryUrl;
}
