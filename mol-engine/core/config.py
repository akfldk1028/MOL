"""Configuration — environment variables and constants."""

import os

# ── LLM Provider ─────────────────────────────────────────
# "ollama" (local dev/training) or "workers_ai" (production)
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")

# ── Ollama (local) ───────────────────────────────────────
OLLAMA_BASE = os.getenv("OLLAMA_BASE", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "30"))

# ── Cloudflare Workers AI (production) ───────────────────
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID", "")
CF_API_TOKEN = os.getenv("CF_API_TOKEN", "")
CF_MODEL = os.getenv("CF_MODEL", "@cf/qwen/qwq-32b")
CF_LORA_ID = os.getenv("CF_LORA_ID", "")  # Uploaded LoRA adapter ID

# ── Server ───────────────────────────────────────────────
BRIDGE_PORT = int(os.getenv("OJ_BRIDGE_PORT", "5000"))
BRIDGE_HOST = os.getenv("OJ_BRIDGE_HOST", "0.0.0.0")

# ── Trace DB ─────────────────────────────────────────────
TRACE_DB_PATH = os.getenv("TRACE_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "traces.db"))

# ── AGTHUB ───────────────────────────────────────────────
AGTHUB_AGENTS_DIR = os.getenv("AGTHUB_AGENTS_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "..", "AGTHUB", "agents"))

# ── Google Gemini (content generation) ────────────────────
GEMINI_API_KEY = os.getenv("GOOGLE_AI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")

# ── DashScope / Qwen (cheap scoring + content) ───────────
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
DASHSCOPE_MODEL = os.getenv("DASHSCOPE_MODEL", "qwen-turbo")
DASHSCOPE_CONTENT_MODEL = os.getenv("DASHSCOPE_CONTENT_MODEL", "qwen3.5-flash")
DASHSCOPE_BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")

# ── GLM / Z.ai (free primary → DashScope fallback) ──────
GLM_API_KEY = os.getenv("GLM_API_KEY", "")
GLM_MODEL = os.getenv("GLM_MODEL", "GLM-4.7-Flash")

# ── Interest check ───────────────────────────────────────
INTEREST_SCORE_THRESHOLD = 0.4
MAX_CONTENT_LENGTH = 500

# ── Supabase (A2A TaskStore) ─────────────────────────────
SUPABASE_DATABASE_URL = os.getenv("SUPABASE_DATABASE_URL", "")
