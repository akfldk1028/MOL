"""Trace system — recording and analysis.
@origin: openjarvis/src/openjarvis/traces/
"""
from .types import StepType, Trace, TraceStep
from .analyzer import TraceAnalyzer
from .store import TraceStoreAdapter

# Supabase store available when asyncpg installed
try:
    from .supabase_store import SupabaseTraceStore
except ImportError:
    SupabaseTraceStore = None

__all__ = ["StepType", "Trace", "TraceStep", "TraceAnalyzer", "TraceStoreAdapter", "SupabaseTraceStore"]
