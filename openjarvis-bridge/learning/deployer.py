"""LoRA deployer — upload trained LoRA adapter to Cloudflare Workers AI.

Uses wrangler CLI:
  npx wrangler ai finetune create @cf/qwen/qwq-32b {finetune_name} {folder_path}

Requirements:
  - adapter_model.safetensors + adapter_config.json in folder
  - adapter_config.json must include "model_type" field
  - CF_ACCOUNT_ID and CF_API_TOKEN env vars set
  - wrangler installed: npm i -g wrangler

Usage:
  python -m learning.deployer --path data/lora_output/seohyun --name seohyun-v1
"""

import json
import logging
import subprocess
from pathlib import Path
from typing import Any, Dict

from core.config import CF_MODEL

logger = logging.getLogger(__name__)


def validate_lora_files(folder: Path) -> bool:
    """Check that required LoRA files exist."""
    config_file = folder / "adapter_config.json"
    weights_file = folder / "adapter_model.safetensors"

    if not config_file.exists():
        logger.error("Missing adapter_config.json in %s", folder)
        return False
    if not weights_file.exists():
        logger.error("Missing adapter_model.safetensors in %s", folder)
        return False

    # Verify model_type is set (required by Workers AI)
    with open(config_file) as f:
        config = json.load(f)
    if "model_type" not in config:
        logger.error("adapter_config.json missing 'model_type' field (must be 'mistral', 'gemma', or 'llama')")
        return False

    return True


def upload_lora(lora_path: str, finetune_name: str) -> Dict[str, Any]:
    """Upload LoRA adapter to Workers AI via wrangler CLI."""
    folder = Path(lora_path)

    if not validate_lora_files(folder):
        return {"status": "error", "message": "Invalid LoRA files"}

    model = CF_MODEL
    cmd = ["npx", "wrangler", "ai", "finetune", "create", model, finetune_name, str(folder)]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode == 0:
            logger.info("LoRA uploaded: %s → %s", finetune_name, model)
            return {
                "status": "success",
                "finetune_name": finetune_name,
                "model": model,
                "output": result.stdout,
            }
        else:
            logger.error("wrangler finetune failed: %s", result.stderr)
            return {"status": "error", "message": result.stderr}
    except FileNotFoundError:
        return {"status": "error", "message": "wrangler not found. Run: npm i -g wrangler"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "message": "Upload timed out (120s)"}
