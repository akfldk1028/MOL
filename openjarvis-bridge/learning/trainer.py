"""LoRA trainer — trace → SFT pairs → LoRA fine-tuning via OpenJarvis.

Workflow:
  1. Extract high-quality (input, output) pairs from TraceStore
  2. Format as SFT training data
  3. Run OpenJarvis LoRATrainer (requires torch + peft)
  4. Output: adapter_model.safetensors + adapter_config.json

Usage:
  python -m learning.trainer --agent-id seohyun --min-feedback 0.7
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent.parent / "data" / "lora_output"


def extract_training_data(store, *, agent_id: Optional[str] = None, min_feedback: float = 0.7) -> List[Dict[str, Any]]:
    """Extract SFT pairs from trace store."""
    return store.extract_sft_pairs(agent_id=agent_id, min_feedback=min_feedback)


def format_sft_pairs(pairs: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Convert trace pairs to SFT format: [{input, output}]."""
    formatted = []
    for p in pairs:
        if p.get("input_text") and p.get("output_text"):
            formatted.append({
                "input": p["input_text"],
                "output": p["output_text"],
            })
    return formatted


async def run_lora_training(pairs: List[Dict[str, Any]], *, agent_id: Optional[str] = None) -> Dict[str, Any]:
    """Run LoRA fine-tuning using OpenJarvis LoRATrainer.

    Requires: torch, transformers, peft installed.
    """
    sft_data = format_sft_pairs(pairs)
    if len(sft_data) < 10:
        return {"status": "skipped", "reason": f"Only {len(sft_data)} pairs (need 10+)"}

    output_dir = OUTPUT_DIR / (agent_id or "global")
    output_dir.mkdir(parents=True, exist_ok=True)

    # TODO: Wire to OpenJarvis LoRATrainer when ready
    # from openjarvis.learning.training.lora import LoRATrainer, LoRATrainingConfig
    # config = LoRATrainingConfig(output_dir=str(output_dir), lora_rank=8, num_epochs=3)
    # trainer = LoRATrainer(config)
    # trainer.train(sft_data)

    logger.info("LoRA training placeholder: %d pairs for agent %s", len(sft_data), agent_id)
    return {
        "status": "placeholder",
        "sft_pairs": len(sft_data),
        "output_dir": str(output_dir),
        "message": "OpenJarvis LoRATrainer integration pending. Install torch + peft to enable.",
    }
