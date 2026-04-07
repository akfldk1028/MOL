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

# A2A Protocol
from goodmolt_a2a.card.builder import AgentCardBuilder
from goodmolt_a2a.card.registry import AgentCardRegistry
from goodmolt_a2a.executor import GoodmoltAgentExecutor
from goodmolt_a2a.server import GoodmoltA2AServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("openjarvis-bridge")

_trace_store: TraceStore = None
_a2a_server: GoodmoltA2AServer = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _trace_store, _a2a_server
    _trace_store = TraceStore()
    registry = AgentRegistry()

    # Inject dependencies into existing routers
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

    # === A2A Protocol Setup ===
    card_builder = AgentCardBuilder(base_url=f"http://localhost:{BRIDGE_PORT}")
    card_registry = AgentCardRegistry(card_builder)

    # Build AgentCards for all AGTHUB agents
    for name, profile in registry._agents.items():
        agent_row = {
            "id": name, "name": name,
            "display_name": profile.config.get("display_name", name),
            "persona": profile.soul[:200] if profile.soul else "",
            "archetype": profile.config.get("archetype", "utility"),
            "expertise_topics": profile.config.get("topics", []),
            "updated_at": "2026-03-30",
        }
        card_registry.register(agent_row, profile)

    logger.info("A2A AgentCards: %d built", len(card_registry))

    # LLM generate function for A2A executor
    # Provider signature: generate(prompt, *, system="", temperature=0.3, max_tokens=256)
    async def llm_generate(system_prompt: str, user_prompt: str) -> str:
        p = get_provider()
        result = await p.generate(user_prompt, system=system_prompt, max_tokens=512)
        return result or "I'm not sure how to respond to that."

    executor = GoodmoltAgentExecutor(
        agent_registry=registry,
        llm_generate=llm_generate,
    )

    # Conversation manager (requires Supabase DB)
    conversation_mgr = None
    from core.config import SUPABASE_DATABASE_URL
    if SUPABASE_DATABASE_URL:
        try:
            import asyncpg
            from goodmolt_a2a.conversation import ConversationManager
            a2a_pool = await asyncpg.create_pool(SUPABASE_DATABASE_URL, min_size=1, max_size=5, ssl="require")
            conversation_mgr = ConversationManager(a2a_pool)
            logger.info("A2A ConversationManager connected to Supabase")
        except Exception as e:
            logger.warning("A2A ConversationManager unavailable: %s", e)

    _a2a_server = GoodmoltA2AServer(
        card_registry=card_registry,
        executor=executor,
        conversation_manager=conversation_mgr,
    )

    # Mount A2A apps
    rest_app = _a2a_server.build_rest_app()
    app.mount("/a2a/rest", rest_app)
    _a2a_server.add_jsonrpc_routes(app)
    _a2a_server.add_agent_card_routes(app)

    logger.info("A2A server mounted (JSON-RPC + REST + agent cards)")
    logger.info("OpenJarvis Bridge ready on port %d", BRIDGE_PORT)

    yield

    _trace_store.close()
    await close_provider()
    if conversation_mgr and hasattr(conversation_mgr, '_pool') and conversation_mgr._pool:
        await conversation_mgr._pool.close()
        logger.info("A2A connection pool closed")
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
