"""
Canonical PII redaction for the audit trail.

Both the middleware and the signals import from here so the protected
key set stays consistent. Matching is CASE-INSENSITIVE: `Email` and
`email` both redact.
"""

REDACTED = "[REDACTED]"

# Substring matches — a key containing any of these redacts.
# Broader than an exact-match list because field names vary across
# serializers and models (e.g. `contact_email`, `user_email`, `idNumber`).
PII_KEY_FRAGMENTS = {
    # Identity
    "email",
    "first_name",
    "last_name",
    "full_name",
    "date_of_birth",
    "dob",
    "nationality",
    "id_number",
    "idnumber",
    "passport",
    "ssn",
    "phone",
    "mobile",
    "address",
    "postal",
    # Auth
    "password",
    "token",
    "secret",
    "api_key",
    "apikey",
    # Financial
    "card_number",
    "cardnumber",
    "cvv",
    "cvc",
    "iban",
    "account_number",
    # Document / OCR
    "file",
    "extracted_text",
    "raw_text",
    "mrz",
    "ocr",
    # Network
    "ip_address",
}

# Exact-match — these are individual tokens, not substrings.
# Matched as a whole word to avoid redacting e.g. "filename" for "name".
PII_EXACT = {
    "name",
    "username",   # include only if you consider usernames sensitive;
                  # remove this line if usernames should be visible in audit
}


def _is_pii_key(key: str) -> bool:
    if not isinstance(key, str):
        return False
    k = key.lower().replace("-", "_")
    if k in PII_EXACT:
        return True
    return any(frag in k for frag in PII_KEY_FRAGMENTS)


def redact(value):
    """
    Recursively replace any value under a PII key with [REDACTED].
    Handles dicts, lists, tuples, and any other type as a passthrough.
    """
    if isinstance(value, dict):
        return {
            k: (REDACTED if _is_pii_key(k) else redact(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, tuple):
        return tuple(redact(v) for v in value)
    return value