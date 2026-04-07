"""Learning pipeline endpoints — LoRA training + Workers AI deployment.

Workflow:
  1. POST /v1/learning/train   → Extract SFT pairs from traces → LoRA training (local)
  2. POST /v1/learning/deploy  → Upload LoRA to Workers AI
  3. GET  /v1/learning/status  → Current learning state
"""

import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1/learning", tags=["learning"])

logger = logging.getLogger(__name__)

_store = None

def set_store(store):
    global _store
    _store = store


class TrainRequest(BaseModel):
    agent_id: Optional[str] = None
    min_feedback: float = 0.7

class DeployRequest(BaseModel):
    lora_path: str
    finetune_name: str


@router.get("/status")
async def learning_status():
    """Current learning pipeline status."""
    stats = _store.global_stats()
    all_pairs = _store.extract_sft_pairs()
    return {
        "trace_stats": stats,
        "sft_pairs_available": len(all_pairs),
        "ready_for_training": len(all_pairs) >= 10,
    }


@router.post("/train")
async def trigger_training(req: TrainRequest):
    """Trigger LoRA training from accumulated traces.

    Requires: LLM_PROVIDER=ollama (local GPU).
    Extracts high-quality SFT pairs → OpenJarvis LoRATrainer.
    """
    pairs = _store.extract_sft_pairs(agent_id=req.agent_id, min_feedback=req.min_feedback)

    if len(pairs) < 10:
        return {
            "status": "skipped",
            "reason": f"Not enough training data ({len(pairs)} pairs, need 10+)",
            "sft_pairs": len(pairs),
        }

    # TODO: Wire to OpenJarvis LoRATrainer
    # from learning.trainer import run_lora_training
    # result = await run_lora_training(pairs, agent_id=req.agent_id)
    return {
        "status": "ready",
        "sft_pairs": len(pairs),
        "message": "Training data available. Run learning/trainer.py manually or wait for auto-trigger.",
    }


@router.post("/deploy")
async def deploy_lora(req: DeployRequest):
    """Upload trained LoRA adapter to Cloudflare Workers AI.

    Uses wrangler CLI: npx wrangler ai finetune create {model} {name} {path}
    """
    # TODO: Wire to learning.deployer
    # from learning.deployer import upload_lora
    # result = await upload_lora(req.lora_path, req.finetune_name)
    return {
        "status": "not_implemented",
        "message": "Set CF_ACCOUNT_ID and CF_API_TOKEN, then implement learning/deployer.py",
        "lora_path": req.lora_path,
        "finetune_name": req.finetune_name,
    }
