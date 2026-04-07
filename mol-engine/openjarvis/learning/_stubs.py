"""Learning primitive ABCs — standalone for mol-engine.

@origin: openjarvis/src/openjarvis/learning/_stubs.py
Modified: LearningRegistry + RoutingContext inlined (no core dependency)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar, Dict, Optional


# RoutingContext inlined from openjarvis.core.types
@dataclass(slots=True)
class RoutingContext:
    query: str = ""
    query_length: int = 0
    has_code: bool = False
    has_math: bool = False
    has_reasoning: bool = False
    urgency: float = 0.5
    complexity_score: float = 0.0
    suggested_max_tokens: int = 1024
    metadata: Dict[str, Any] = field(default_factory=dict)


# LearningRegistry stub (not needed for routing, but keeps ABCs happy)
class LearningRegistry:
    _policies: Dict[str, Any] = {}

    @classmethod
    def register(cls, name: str, policy: Any) -> None:
        cls._policies[name] = policy

    @classmethod
    def get(cls, name: str) -> Any:
        return cls._policies.get(name)


class RouterPolicy(ABC):
    @abstractmethod
    def select_model(self, context: RoutingContext) -> str: ...


class QueryAnalyzer(ABC):
    @abstractmethod
    def analyze(self, query: str, **kwargs: object) -> RoutingContext: ...


class RewardFunction(ABC):
    @abstractmethod
    def compute(self, context: RoutingContext, model_key: str, response: str, **kwargs: object) -> float: ...


class LearningPolicy(ABC):
    target: ClassVar[str] = ""

    @abstractmethod
    def update(self, trace_store: Any, **kwargs: object) -> Dict[str, Any]: ...


__all__ = [
    "LearningPolicy", "LearningRegistry", "QueryAnalyzer",
    "RewardFunction", "RouterPolicy", "RoutingContext",
]
