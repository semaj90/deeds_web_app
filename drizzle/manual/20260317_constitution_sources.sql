-- ─────────────────────────────────────────────────────────────────────────────
-- Constitution corpus schema additions
-- Extends the legal library tables created in 20260317_legal_library.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Extend library_documents with provenance + hash tracking
ALTER TABLE library_documents
    ADD COLUMN IF NOT EXISTS source_hash         text,
    ADD COLUMN IF NOT EXISTS source_confidence   text DEFAULT 'medium'
        CHECK (source_confidence IN ('high', 'medium', 'low')),
    ADD COLUMN IF NOT EXISTS fetched_at          timestamptz,
    ADD COLUMN IF NOT EXISTS minio_key_normalized text,
    ADD COLUMN IF NOT EXISTS source_kind         text DEFAULT 'uploaded_pdf'
        CHECK (source_kind IN ('official_state', 'lii_indexed', 'uploaded_pdf', 'scraped', 'api'));

-- Extend legal_nodes with topical tagging
ALTER TABLE legal_nodes
    ADD COLUMN IF NOT EXISTS tags_json jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_legal_nodes_tags ON legal_nodes USING gin(tags_json);

-- Extend legal_chunks with Qdrant point ID for mirror tracking
ALTER TABLE legal_chunks
    ADD COLUMN IF NOT EXISTS qdrant_point_id text;

CREATE INDEX IF NOT EXISTS idx_legal_chunks_qdrant
    ON legal_chunks(qdrant_point_id)
    WHERE qdrant_point_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- State constitution sources registry
-- One row per state/territory; links to library_documents once ingested
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS state_constitution_sources (
    id               serial PRIMARY KEY,
    state_code       char(2) NOT NULL UNIQUE,
    state_name       text NOT NULL,
    discovery_url    text NOT NULL,          -- LII index URL (stable reference)
    source_url       text,                   -- Official state URL (preferred)
    format           text DEFAULT 'html'
        CHECK (format IN ('html', 'pdf', 'xml')),
    is_official      boolean DEFAULT false,
    source_confidence text DEFAULT 'medium'
        CHECK (source_confidence IN ('high', 'medium', 'low')),
    crawler_type     text DEFAULT 'html'
        CHECK (crawler_type IN ('html', 'pdf', 'api')),
    last_fetched_at  timestamptz,
    last_hash        text,                   -- SHA-256 of last successful fetch
    last_fetch_status text,                  -- 'ok' | 'failed' | 'skipped'
    document_id      uuid REFERENCES library_documents(id),
    notes            text,                   -- manual verification notes
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scs_state_code ON state_constitution_sources(state_code);
CREATE INDEX IF NOT EXISTS idx_scs_document_id ON state_constitution_sources(document_id)
    WHERE document_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: all 50 states + DC
-- discovery_url = LII state materials page (reliable discovery layer)
-- source_url    = official state legislature / state code site
-- is_official   = true only where source_url is confirmed official endpoint
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO state_constitution_sources
    (state_code, state_name, discovery_url, source_url, format, is_official, source_confidence)
VALUES
    ('al', 'Alabama',       'https://law.justia.com/constitution/alabama/',         'https://alisondb.legislature.state.al.us/Alison/default.aspx',        'html', true,  'medium'),
    ('ak', 'Alaska',        'https://law.justia.com/constitution/alaska/',          'https://ltgov.alaska.gov/information/alaskas-constitution/',           'html', true,  'high'),
    ('az', 'Arizona',       'https://law.justia.com/constitution/arizona/',         'https://www.azleg.gov/constitution/',                                 'html', true,  'high'),
    ('ar', 'Arkansas',      'https://law.justia.com/constitution/arkansas/',        'https://www.arkleg.state.ar.us/assembly/Constitution/Constitution.pdf','pdf',  true,  'medium'),
    ('ca', 'California',    'https://law.justia.com/constitution/california/',      'https://leginfo.legislature.ca.gov/faces/codes.xhtml?mode=DisplayCode&codeId=CONS','html',true,'high'),
    ('co', 'Colorado',      'https://law.justia.com/constitution/colorado/',        'https://leg.colorado.gov/constitution',                               'html', true,  'high'),
    ('ct', 'Connecticut',   'https://law.justia.com/constitution/connecticut/',     'https://www.cga.ct.gov/current/pub/const.htm',                        'html', true,  'high'),
    ('de', 'Delaware',      'https://law.justia.com/constitution/delaware/',        'https://delcode.delaware.gov/constitution/',                          'html', true,  'high'),
    ('fl', 'Florida',       'https://law.justia.com/constitution/florida/',         'https://www.flsenate.gov/Laws/Constitution',                          'html', true,  'high'),
    ('ga', 'Georgia',       'https://law.justia.com/constitution/georgia/',         'https://www.legis.ga.gov/laws/constitution',                          'html', true,  'high'),
    ('hi', 'Hawaii',        'https://law.justia.com/constitution/hawaii/',          'https://ltgov.hawaii.gov/the-office/constitution-of-the-state-of-hawaii/', 'html', true, 'medium'),
    ('id', 'Idaho',         'https://law.justia.com/constitution/idaho/',           'https://legislature.idaho.gov/statutesrules/idconst/',                'html', true,  'high'),
    ('il', 'Illinois',      'https://law.justia.com/constitution/illinois/',        'https://www.ilga.gov/commission/lrb/con0.htm',                        'html', true,  'high'),
    ('in', 'Indiana',       'https://law.justia.com/constitution/indiana/',         'https://iga.in.gov/legislative/laws/const',                           'html', true,  'high'),
    ('ia', 'Iowa',          'https://law.justia.com/constitution/iowa/',            'https://www.legis.iowa.gov/law/iowaCode/constitution',                'html', true,  'high'),
    ('ks', 'Kansas',        'https://law.justia.com/constitution/kansas/',          'https://www.kslegislature.org/li/constitution/',                      'html', true,  'high'),
    ('ky', 'Kentucky',      'https://law.justia.com/constitution/kentucky/',        'https://legislature.ky.gov/Law/Constitution/Pages/default.aspx',      'html', true,  'high'),
    ('la', 'Louisiana',     'https://law.justia.com/constitution/louisiana/',       'https://legis.la.gov/Legis/LawSearch.aspx',                           'html', true,  'medium'),
    ('me', 'Maine',         'https://law.justia.com/constitution/maine/',           'https://legislature.maine.gov/ros/LawsOfMaine/mainelaws.html',        'html', true,  'medium'),
    ('md', 'Maryland',      'https://law.justia.com/constitution/maryland/',        'https://msa.maryland.gov/msa/mdmanual/43const/html/const.html',        'html', true,  'high'),
    ('ma', 'Massachusetts', 'https://law.justia.com/constitution/massachusetts/',   'https://malegislature.gov/Laws/Constitution',                         'html', true,  'high'),
    ('mi', 'Michigan',      'https://law.justia.com/constitution/michigan/',        'https://legislature.mi.gov/document/constitution',                    'pdf',  true,  'high'),
    ('mn', 'Minnesota',     'https://law.justia.com/constitution/minnesota/',       'https://www.revisor.mn.gov/constitution/',                            'html', true,  'high'),
    ('ms', 'Mississippi',   'https://law.justia.com/constitution/mississippi/',     'https://www.legislature.ms.gov/laws/miss_code/const',                 'html', true,  'medium'),
    ('mo', 'Missouri',      'https://law.justia.com/constitution/missouri/',        'https://www.moga.mo.gov/mostatutes/moconstn.html',                    'html', true,  'high'),
    ('mt', 'Montana',       'https://law.justia.com/constitution/montana/',         'https://leg.mt.gov/laws/constitution',                                'html', true,  'medium'),
    ('ne', 'Nebraska',      'https://law.justia.com/constitution/nebraska/',        'https://nebraskalegislature.gov/laws/articles.php?article=I-1',       'html', true,  'high'),
    ('nv', 'Nevada',        'https://law.justia.com/constitution/nevada/',          'https://www.leg.state.nv.us/const/nvconst.html',                      'html', true,  'high'),
    ('nh', 'New Hampshire', 'https://law.justia.com/constitution/new-hampshire/',   'https://www.nh.gov/glance/constitution.htm',                          'html', true,  'high'),
    ('nj', 'New Jersey',    'https://law.justia.com/constitution/new-jersey/',      'https://www.njleg.state.nj.us/constitution',                          'html', true,  'high'),
    ('nm', 'New Mexico',    'https://law.justia.com/constitution/new-mexico/',      'https://www.nmlegis.gov/constitution/',                               'html', true,  'medium'),
    ('ny', 'New York',      'https://law.justia.com/constitution/new-york/',        'https://www.nysenate.gov/legislation/laws/CNS',                       'html', true,  'high'),
    ('nc', 'North Carolina','https://law.justia.com/constitution/north-carolina/',  'https://www.ncleg.gov/Laws/Constitution/Constitution',                'html', true,  'high'),
    ('nd', 'North Dakota',  'https://law.justia.com/constitution/north-dakota/',    'https://www.legis.nd.gov/general-information/north-dakota-century-code/constitution','html',true,'high'),
    ('oh', 'Ohio',          'https://law.justia.com/constitution/ohio/',            'https://codes.ohio.gov/ohio-constitution',                            'html', true,  'high'),
    ('ok', 'Oklahoma',      'https://law.justia.com/constitution/oklahoma/',        'https://www.oscn.net/applications/oscn/index.asp?level=1&type=TITLE&title=CONSTITUTION','html',true,'medium'),
    ('or', 'Oregon',        'https://law.justia.com/constitution/oregon/',          'https://www.oregonlegislature.gov/bills_laws/Pages/ORS.aspx',         'html', true,  'medium'),
    ('pa', 'Pennsylvania',  'https://law.justia.com/constitution/pennsylvania/',    'https://www.legis.state.pa.us/cfdocs/legis/LI/consCheck.cfm?txtType=HTM&ttl=00','html',true,'high'),
    ('ri', 'Rhode Island',  'https://law.justia.com/constitution/rhode-island/',    'https://webserver.rilin.state.ri.us/RiConstitution/',                 'html', true,  'high'),
    ('sc', 'South Carolina','https://law.justia.com/constitution/south-carolina/',  'https://www.scstatehouse.gov/scconstitution/scconst.php',             'html', true,  'high'),
    ('sd', 'South Dakota',  'https://law.justia.com/constitution/south-dakota/',    'https://sdlegislature.gov/Statutes/Constitution',                     'html', true,  'high'),
    ('tn', 'Tennessee',     'https://law.justia.com/constitution/tennessee/',       'https://sos.tn.gov/sites/default/files/documents/constitution.pdf',   'pdf',  true,  'high'),
    ('tx', 'Texas',         'https://law.justia.com/constitution/texas/',           'https://statutes.capitol.texas.gov/Docs/CN/htm/CN.1.htm',             'html', true,  'high'),
    ('ut', 'Utah',          'https://law.justia.com/constitution/utah/',            'https://le.utah.gov/const/index.html',                                'html', true,  'high'),
    ('vt', 'Vermont',       'https://law.justia.com/constitution/vermont/',         'https://legislature.vermont.gov/statutes/constitution',               'html', true,  'high'),
    ('va', 'Virginia',      'https://law.justia.com/constitution/virginia/',        'https://law.lis.virginia.gov/constitution/',                          'html', true,  'high'),
    ('wa', 'Washington',    'https://law.justia.com/constitution/washington/',      'https://app.leg.wa.gov/rcw/default.aspx?cite=CONSTITUTION',           'html', true,  'high'),
    ('wv', 'West Virginia', 'https://law.justia.com/constitution/west-virginia/',   'https://code.wvlegislature.gov/Constitution/',                        'html', true,  'medium'),
    ('wi', 'Wisconsin',     'https://law.justia.com/constitution/wisconsin/',       'https://docs.legis.wisconsin.gov/document/statutes/constitution',     'html', true,  'high'),
    ('wy', 'Wyoming',       'https://law.justia.com/constitution/wyoming/',         'https://wyoleg.gov/statutes/compress/constitution.pdf',               'pdf',  true,  'high'),
    ('dc', 'Dist. of Columbia','https://code.dccouncil.gov/',                       'https://code.dccouncil.gov/us/dc/council/code',                       'html', false, 'medium')
ON CONFLICT (state_code) DO NOTHING;
