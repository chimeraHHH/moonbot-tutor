import re

PARENTHESIS_CONTENT_PATTERN = re.compile(r"（[^（）]*）|\([^()]*\)")
MULTI_COMMA_PATTERN = re.compile(r"[，,]{2,}")


def preprocess_tts_text(text: str) -> str:
    """Replace parenthesized asides with pauses for smoother narration."""
    if not text:
        return text

    processed = PARENTHESIS_CONTENT_PATTERN.sub("，", text)
    processed = MULTI_COMMA_PATTERN.sub("，", processed)
    return processed
