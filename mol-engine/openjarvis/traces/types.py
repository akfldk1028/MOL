"""Trace types — extracted from openjarvis.core.types for standalone use.

@origin: openjarvis/src/openjarvis/core/types.py (StepType, TraceStep, Trace)
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


def _trace_id() -> str:
    return uuid.uuid4().hex[:16]


class StepType(str, Enum):
    ROUTE = "route"
    RETRIEVE = "retrieve"
    GENERATE = "generate"
    TOOL_CALL = "tool_call"
    RESPOND = "respond"


@dataclass(slots=True)
class TraceStep:
    step_type: StepType
    timestamp: float = 0.0
    duration_seconds: float = 0.0
    input: Dict[str, Any] = field(default_factory=dict)
    output: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Trace:
    trace_id: str = field(default_factory=_trace_id)
    query: str = ""
    agent: str = ""
    model: str = ""
    engine: str = ""
    steps: List[TraceStep] = field(default_factory=list)
    result: str = ""
    outcome: Optional[str] = None
    feedback: Optional[float] = None
    started_at: float = 0.0
    ended_at: float = 0.0
    total_tokens: int = 0
    total_latency_seconds: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def add_step(self, step: TraceStep) -> None:
        self.steps.append(step)
        self.total_latency_seconds += step.duration_seconds
        self.total_tokens += step.output.get("tokens", 0)
