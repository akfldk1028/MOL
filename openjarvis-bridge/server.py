"""OpenJarvis Bridge — Goodmolt ↔ OpenJarvis bridge service.

Dual LLM provider:
  - Production: Cloudflare Workers AI (free 10K Neurons/day)
  - Local dev:  Ollama (qwen2.5:3b, LoRA training)

Run:
  LLM_PROVIDER=ollama python server.py        # local
  LLM_PROVIDER=workers_ai python server.py    # production
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI

from api import agents, generate, health, interest, learning, traces
from core.config import BRIDGE_HOST, BRIDGE_PORT, LLM_PROVIDER
from core.llm import close_provider, get_provider
from core.trace_store import TraceStore
from core.agent_registry import AgentRegistry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("openjarvis-bridge")

_trace_store: TraceStore = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _trace_store
    _trace_store = TraceStore()
    registry = AgentRegistry()

    # Inject dependencies into routers
    traces.set_store(_trace_store)
    agents.set_store(_trace_store)
    agents.set_registry(registry)
    learning.set_store(_trace_store)
    health.set_store(_trace_store)
    interest.set_registry(registry)
    generate.set_registry(registry)
    generate.set_store(_trace_store)

    # Check provider
    provider = get_provider()
    ok = await provider.is_available()
    logger.info("Provider: %s (available: %s)", provider.provider_name(), ok)
    logger.info("Agents: %d loaded from AGTHUB", len(registry))
    logger.info("OpenJarvis Bridge ready on port %d", BRIDGE_PORT)

    yield

    _trace_store.close()
    await close_provider()
    logger.info("OpenJarvis Bridge shutdown")


app = FastAPI(
    title="OpenJarvis Bridge",
    description="Goodmolt ↔ OpenJarvis bridge: interest scoring, trace collection, LoRA learning",
    version="0.2.0",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(interest.router)
app.include_router(traces.router)
app.include_router(agents.router)
app.include_router(learning.router)
app.include_router(generate.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host=BRIDGE_HOST, port=BRIDGE_PORT, reload=True)
