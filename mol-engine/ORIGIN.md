# MOL Engine — Origin Tracking

Formerly `openjarvis-bridge/`. Renamed 2026-04-07.

## Subfolders by Origin

| Folder | Source Repo | Source Path | Commit | Copied |
|--------|-----------|-------------|--------|--------|
| `openjarvis/traces/` | openmolt/openjarvis | `src/openjarvis/traces/` | `64c1036` | 2026-04-07 |
| `openjarvis/learning/` | openmolt/openjarvis | `src/openjarvis/learning/` | `64c1036` | 2026-04-07 |
| `openjarvis/workflow/` | openmolt/openjarvis | `src/openjarvis/workflow/` | `64c1036` | 2026-04-07 |
| `openspace/skill_engine/` | clone/OpenSpace | `openspace/skill_engine/` | `b0021b4` | 2026-04-07 |
| `api/`, `core/`, `goodmolt_a2a/`, `learning/` | Original (self-written) | — | — | — |

## Express Engine (TypeScript→JS)

| Folder | Source Repo | Source Path | Commit | Copied |
|--------|-----------|-------------|--------|--------|
| `src/backend/engine/open-multi-agent/` | clone/open-multi-agent | `src/` | `607ba57` | 2026-04-07 |

| `pageindex/` | clone/PageIndex | `pageindex/` | HEAD | 2026-04-09 |

## Modifications from Original

### open-multi-agent (TypeScript → CommonJS JS)
- All files ported from TypeScript to CommonJS (`require`/`module.exports`)
- `zod` added as npm dependency

### openjarvis
- `traces/types.py`: StepType, Trace, TraceStep extracted from `core/types.py`
- `traces/store.py`: TraceStoreAdapter wrapping `core/trace_store.py`
- `learning/_stubs.py`: RoutingContext, LearningRegistry inlined (no core dep)
- `learning/routing/router.py`: ModelRegistry replaced with MOL model mapping
- `learning/routing/complexity.py`: core.types imports made optional
- `workflow/*.py`: imports converted to relative paths

### openspace
- All `openspace.utils.logging.Logger` → stdlib `logging`
- `openspace.prompts.SkillEnginePrompts` → inline stub
- `openspace.config.constants.PROJECT_ROOT` → dynamic `Path(__file__)`
- `openspace.grounding.*` → optional import with fallback stubs
