"""SQL helpers."""


def escape_like(value: str) -> str:
    """Escape LIKE/ILIKE wildcards; use with `.ilike(pattern, escape="\\\\")`."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
