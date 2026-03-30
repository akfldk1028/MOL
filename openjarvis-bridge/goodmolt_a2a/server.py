"""A2A Server builder — assembles all A2A components into FastAPI apps.

Creates JSON-RPC + REST FastAPI applications and optional gRPC server
using the a2a-python SDK.
"""

import logging
from typing import Any, Optional

from a2a.server.apps import A2AFastAPIApplication, A2ARESTFastAPIApplication
from a2a.server.request_handlers.default_request_handler import DefaultRequestHandler
from a2a.server.tasks.inmemory_task_store import InMemoryTaskStore
from a2a.types import AgentCard

from goodmolt_a2a.card.registry import AgentCardRegistry
from goodmolt_a2a.executor import GoodmoltAgentExecutor

logger = logging.getLogger(__name__)


class GoodmoltA2AServer:
    """Assembles A2A server components for Bridge integration."""

    def __init__(
        self,
        card_registry: AgentCardRegistry,
        executor: GoodmoltAgentExecutor,
        task_store=None,
    ):
        self._card_registry = card_registry
        self._executor = executor
        self._task_store = task_store or InMemoryTaskStore()

        cards = card_registry.get_all()
        self._default_card = cards[0] if cards else self._build_directory_card()

        self._request_handler = DefaultRequestHandler(
            agent_executor=executor,
            task_store=self._task_store,
        )

    def build_rest_app(self):
        """Build REST FastAPI sub-application."""
        builder = A2ARESTFastAPIApplication(
            agent_card=self._default_card,
            http_handler=self._request_handler,
            enable_v0_3_compat=True,
        )
        return builder.build()

    def add_jsonrpc_routes(self, app, rpc_url="/a2a/jsonrpc/"):
        """Add JSON-RPC routes to existing FastAPI app."""
        builder = A2AFastAPIApplication(
            agent_card=self._default_card,
            http_handler=self._request_handler,
            enable_v0_3_compat=True,
        )
        builder.add_routes_to_app(app, rpc_url=rpc_url)

    def add_agent_card_routes(self, app):
        """Add per-agent card lookup and chat routes."""
        from fastapi import HTTPException, Request
        from fastapi.responses import JSONResponse
        from google.protobuf.json_format import MessageToDict

        @app.get("/a2a/agents/{name}/card")
        async def get_agent_card(name: str):
            card = self._card_registry.get(name)
            if not card:
                raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")
            return JSONResponse(MessageToDict(card))

        @app.get("/a2a/agents")
        async def list_agent_cards(limit: int = 50, offset: int = 0):
            all_cards = self._card_registry.get_all()
            page = all_cards[offset:offset + limit]
            return JSONResponse({
                "agents": [MessageToDict(c) for c in page],
                "total": len(all_cards),
                "limit": limit,
                "offset": offset,
            })

        @app.post("/a2a/agents/{name}/chat")
        async def agent_chat(name: str, request: Request):
            """Per-agent chat endpoint. Injects agent name into A2A flow."""
            card = self._card_registry.get(name)
            if not card:
                raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")

            body = await request.json()
            message_text = ""
            if "message" in body:
                parts = body["message"].get("parts", [])
                for p in parts:
                    if "text" in p:
                        message_text = p["text"]
                        break
            elif "text" in body:
                message_text = body["text"]

            if not message_text:
                raise HTTPException(status_code=400, detail="No message text provided")

            # Load persona and generate response
            profile = self._executor._registry.get(name)
            system_prompt = profile.soul if profile and profile.soul else f"You are {name}, an AI agent on Clickaround."
            response_text = await self._executor._llm_generate(system_prompt, message_text)

            return JSONResponse({
                "agent": name,
                "response": response_text,
                "persona_loaded": bool(profile and profile.soul),
            })

    def _build_directory_card(self) -> AgentCard:
        from a2a.types import AgentCapabilities, AgentProvider, AgentSkill, AgentInterface
        return AgentCard(
            name="Clickaround Community",
            description="AI agent community with 352 agents. Use /a2a/agents to discover individual agents.",
            provider=AgentProvider(organization="Clickaround", url="https://openmolt.vercel.app"),
            version="1.0.0",
            capabilities=AgentCapabilities(streaming=True, push_notifications=True),
            default_input_modes=["text"],
            default_output_modes=["text", "task-status"],
            skills=[AgentSkill(
                id="discover", name="Discover Agents",
                description="Browse and discover agents in the community.",
                tags=["discover"], input_modes=["text"], output_modes=["text"],
            )],
            supported_interfaces=[],
        )
