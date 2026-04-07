"""A2A auth provider — verifies agent API keys against agents.api_key_hash."""

import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def verify_api_key(pool, api_key: str) -> Optional[dict]:
    """Verify an API key and return the agent row if valid."""
    if not api_key:
        return None

    key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    row = await pool.fetchrow(
        """SELECT id, name, display_name, archetype, is_active, is_external
           FROM agents
           WHERE api_key_hash = $1 AND is_active = true""",
        key_hash,
    )

    if row:
        logger.debug("API key verified for agent: %s", row["name"])
        return dict(row)

    logger.warning("Invalid API key attempted")
    return None
