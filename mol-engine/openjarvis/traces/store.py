"""TraceStore adapter — wraps mol-engine core/trace_store.py for OJ TraceAnalyzer.

@origin: openjarvis/src/openjarvis/traces/store.py (interface adapted)

The OJ TraceAnalyzer expects a store with list_traces() returning Trace objects.
This adapter converts core.trace_store rows (dicts) into OJ Trace format.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Add mol-engine root to path for core imports
_MOL_ENGINE_ROOT = str(Path(__file__).parent.parent.parent)
if _MOL_ENGINE_ROOT not in sys.path:
    sys.path.insert(0, _MOL_ENGINE_ROOT)

from core.trace_store import TraceStore as _CoreTraceStore
from .types import Trace, TraceStep, StepType


class TraceStoreAdapter:
    """Adapter over core.trace_store for OJ TraceAnalyzer compatibility."""

    def __init__(self, core_store: Optional[_CoreTraceStore] = None):
        self._core = core_store or _CoreTraceStore()

    def list_traces(
        self,
        *,
        since: Optional[float] = None,
        until: Optional[float] = None,
        limit: int = 1000,
    ) -> List[Trace]:
        """Convert core trace rows to OJ Trace objects."""
        rows = self._core.list_traces(limit=limit)

        traces = []
        for row in rows:
            created = row.get('created_at', 0)

            # Time filtering
            if since and created < since:
                continue
            if until and created > until:
                continue

            traces.append(Trace(
                trace_id=row.get('trace_id', ''),
                query=row.get('input_text', ''),
                agent=row.get('agent_name', ''),
                model=row.get('interest_source', ''),
                outcome=row.get('outcome'),
                feedback=row.get('feedback'),
                steps=[TraceStep(
                    step_type=StepType.GENERATE,
                    timestamp=created,
                    input={'text': row.get('input_text', ''), 'action': row.get('action', '')},
                    output={'text': row.get('output_text', ''), 'success': row.get('outcome') == 'success'},
                )],
                started_at=created,
                ended_at=created,
                total_tokens=0,
                total_latency_seconds=0.0,
            ))
        return traces

    def record(self, data: Dict[str, Any]) -> str:
        return self._core.record(data)

    def close(self):
        self._core.close()
