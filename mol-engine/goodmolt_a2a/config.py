"""A2A-specific configuration."""

import os

SUPABASE_DATABASE_URL = os.getenv("SUPABASE_DATABASE_URL", "")
A2A_GRPC_PORT = int(os.getenv("A2A_GRPC_PORT", "50051"))
A2A_BASE_URL = os.getenv("A2A_BASE_URL", "http://localhost:5000")
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "")
