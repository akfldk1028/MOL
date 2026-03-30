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
        conversation_manager=None,
    ):
        self._card_registry = card_registry
        self._executor = executor
        self._task_store = task_store or InMemoryTaskStore()
        self._conversation_manager = conversation_manager

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

        @app.post("/a2a/agents/{from_name}/talk-to/{to_name}")
        async def agent_to_agent_chat(from_name: str, to_name: str, request: Request):
            """Agent-to-agent conversation. Creates context, both agents exchange messages."""
            from_card = self._card_registry.get(from_name)
            to_card = self._card_registry.get(to_name)
            if not from_card:
                raise HTTPException(status_code=404, detail=f"Agent '{from_name}' not found")
            if not to_card:
                raise HTTPException(status_code=404, detail=f"Agent '{to_name}' not found")

            body = await request.json()
            topic = body.get("topic") or body.get("text") or "general conversation"
            context_id = body.get("context_id")  # Continue existing conversation

            # Get agent IDs from registry names
            from_profile = self._executor._registry.get(from_name)
            to_profile = self._executor._registry.get(to_name)

            # If conversation manager available, persist
            result = {"context_id": context_id, "messages": []}

            if self._conversation_manager:
                if not context_id:
                    ctx = await self._conversation_manager.create_context(
                        initiator_agent_id=from_name,
                        target_agent_id=to_name,
                        skill_id="conversation",
                    )
                    context_id = ctx["id"]
                    result["context_id"] = context_id

                # Agent A initiates
                await self._conversation_manager.add_message(
                    context_id=context_id, agent_id=from_name, role="agent", text=topic,
                )

            # Agent B responds with their persona
            to_system = to_profile.soul if to_profile and to_profile.soul else f"You are {to_name}."
            from_display = from_profile.config.get("display_name", from_name) if from_profile else from_name
            b_prompt = f"{from_display} says to you: \"{topic}\"\nRespond naturally in 2-3 sentences."
            b_response = await self._executor._llm_generate(to_system, b_prompt)

            if self._conversation_manager:
                await self._conversation_manager.add_message(
                    context_id=context_id, agent_id=to_name, role="agent", text=b_response,
                )

            # Agent A reacts to B's response
            from_system = from_profile.soul if from_profile and from_profile.soul else f"You are {from_name}."
            to_display = to_profile.config.get("display_name", to_name) if to_profile else to_name
            a_prompt = f"{to_display} replied: \"{b_response}\"\nRespond naturally in 2-3 sentences."
            a_response = await self._executor._llm_generate(from_system, a_prompt)

            if self._conversation_manager:
                await self._conversation_manager.add_message(
                    context_id=context_id, agent_id=from_name, role="agent", text=a_response,
                )

            result["messages"] = [
                {"agent": from_name, "role": "initiator", "text": topic},
                {"agent": to_name, "role": "responder", "text": b_response},
                {"agent": from_name, "role": "initiator", "text": a_response},
            ]
            return JSONResponse(result)

        @app.get("/a2a/conversations/{context_id}/messages")
        async def get_conversation_messages(context_id: str):
            """Get message history for a conversation."""
            if not self._conversation_manager:
                raise HTTPException(status_code=503, detail="Conversation manager not available (no DB)")
            messages = await self._conversation_manager.get_messages(context_id)
            return JSONResponse({
                "context_id": context_id,
                "messages": [
                    {
                        "id": str(m["id"]),
                        "agent_id": m["agent_id"],
                        "role": m["role"],
                        "parts": m["parts"] if isinstance(m["parts"], list) else [],
                        "created_at": str(m["created_at"]),
                    }
                    for m in messages
                ],
                "count": len(messages),
            })

        @app.post("/a2a/teams/webtoon/produce")
        async def webtoon_team_produce(request: Request):
            """Webtoon production team: artist + reviewer collaborate on an episode."""
            from goodmolt_a2a.teams.webtoon_team import WebtoonTeam

            body = await request.json()
            artist = body.get("artist", "adagio")
            reviewer = body.get("reviewer", "allegro")
            series_title = body.get("series_title", "Untitled Series")
            episode_number = body.get("episode_number", 1)
            previous_summary = body.get("previous_summary", "")
            style_notes = body.get("style_notes", "")

            # Validate agents exist
            if not self._card_registry.get(artist):
                raise HTTPException(status_code=404, detail=f"Artist '{artist}' not found")
            if not self._card_registry.get(reviewer):
                raise HTTPException(status_code=404, detail=f"Reviewer '{reviewer}' not found")

            team = WebtoonTeam(
                agent_registry=self._executor._registry,
                llm_generate=self._executor._llm_generate,
                conversation_manager=self._conversation_manager,
            )

            result = await team.produce_episode(
                artist_name=artist,
                reviewer_name=reviewer,
                series_title=series_title,
                episode_number=episode_number,
                previous_summary=previous_summary,
                style_notes=style_notes,
            )

            return JSONResponse({
                "pattern": result.pattern,
                "context_id": result.context_id,
                "tasks": [
                    {"member": t.member.name, "role": t.member.role,
                     "instruction": t.instruction, "status": t.status,
                     "result_preview": t.result[:200] if t.result else ""}
                    for t in result.tasks
                ],
                "final_output": result.final_output,
                "total_rounds": len([t for t in result.tasks if t.member.role == "reviewer"]),
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
