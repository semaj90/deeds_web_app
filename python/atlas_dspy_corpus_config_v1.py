import json
import re
from urllib.parse import urlparse


def reject_duplicate_json_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"JSON_DUPLICATE_KEY:{key}")
        result[key] = value
    return result


def parse_json_no_duplicates(text):
    return json.loads(text, object_pairs_hook=reject_duplicate_json_pairs)


def validate_dspy_corpus_source_v1(config):
    errors = []
    if not isinstance(config, dict):
        return ["CONFIG_NOT_OBJECT"]

    required_strings = (
        "corpusId",
        "authority",
        "scopePrefix",
        "discoveryIndex",
        "sitemap",
        "firecrawlMapEndpoint",
        "versionChannel",
    )
    for field in required_strings:
        if not isinstance(config.get(field), str) or not config[field].strip():
            errors.append(f"REQUIRED_NONEMPTY_STRING:{field}")

    if config.get("schema") != "atlas.local-doc-corpus-source.v1":
        errors.append("SCHEMA_ID_INVALID")
    if config.get("canonicalAuthority") is not False:
        errors.append("CANONICAL_AUTHORITY_MUST_BE_FALSE")
    if config.get("datastoreWritesPerformed") is not False:
        errors.append("DATASTORE_WRITES_MUST_BE_FALSE")
    if isinstance(config.get("corpusId"), str) and not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", config["corpusId"]):
        errors.append("CORPUS_ID_INVALID")
    if config.get("sourceAuthority") != "OFFICIAL":
        errors.append("SOURCE_AUTHORITY_INVALID")
    if config.get("captureMethod") != "FIRECRAWL_MAP_PLUS_BEAUTIFULSOUP_HTTP":
        errors.append("CAPTURE_METHOD_INVALID")
    if config.get("storage") != "LOCAL_IMMUTABLE_SNAPSHOT":
        errors.append("STORAGE_POLICY_INVALID")
    if config.get("admissionState") != "LOCAL_UNADMITTED":
        errors.append("ADMISSION_STATE_INVALID")

    authority = config.get("authority")
    prefix = config.get("scopePrefix")
    authority_parts = urlparse(authority) if isinstance(authority, str) else None
    if not authority_parts or authority_parts.scheme != "https" or not authority_parts.netloc or authority_parts.path not in ("", "/") or authority_parts.query or authority_parts.fragment:
        errors.append("AUTHORITY_URL_INVALID")
    if isinstance(prefix, str) and (not prefix.startswith("/") or not prefix.endswith("/") or "?" in prefix or "#" in prefix or ".." in prefix):
        errors.append("SCOPE_PREFIX_INVALID")

    if authority_parts and authority_parts.netloc and isinstance(prefix, str):
        for field in ("discoveryIndex", "sitemap"):
            value = config.get(field)
            parts = urlparse(value) if isinstance(value, str) else None
            if not parts or parts.scheme != "https" or parts.netloc != authority_parts.netloc or not parts.path.startswith(prefix) or parts.query or parts.fragment:
                errors.append(f"URL_OUTSIDE_DECLARED_SCOPE:{field}")

    endpoint = config.get("firecrawlMapEndpoint")
    endpoint_parts = urlparse(endpoint) if isinstance(endpoint, str) else None
    if not endpoint_parts or endpoint_parts.scheme != "https" or endpoint_parts.netloc != "api.firecrawl.dev" or endpoint_parts.path != "/v2/map" or endpoint_parts.query or endpoint_parts.fragment:
        errors.append("FIRECRAWL_ENDPOINT_INVALID")

    return errors
