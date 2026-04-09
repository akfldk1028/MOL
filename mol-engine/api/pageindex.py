"""PageIndex API — LLM 기반 문서 트리 생성
@origin clone/PageIndex
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/v1/pageindex", tags=["pageindex"])


class BuildTreeRequest(BaseModel):
    text: str
    model: str = "qwen-turbo"
    max_preview: int = 5000


class VerifyBoundaryRequest(BaseModel):
    title: str
    text_chunk: str
    model: str = "qwen-turbo"


class SummarizeRequest(BaseModel):
    text: str
    tree: list
    model: str = "qwen-turbo"


@router.post("/build-tree")
async def build_tree(req: BuildTreeRequest):
    """텍스트 → 계층 트리 JSON. @origin PageIndex page_index()"""
    if len(req.text) < 100:
        raise HTTPException(400, "Text too short (min 100 chars)")

    from pageindex import build_tree_from_text
    tree = await build_tree_from_text(req.text, model=req.model, max_preview=req.max_preview)

    from pageindex.tree_utils import structure_to_list
    flat = structure_to_list(tree)
    return {"tree": tree, "sections": len(flat)}


@router.post("/summarize")
async def summarize_tree(req: SummarizeRequest):
    """트리 각 노드에 summary 병렬 생성. @origin PageIndex generate_summaries_for_structure()"""
    from pageindex import generate_summaries
    result = await generate_summaries(req.tree, req.text, model=req.model)
    return {"tree": result}


@router.post("/verify-boundary")
async def verify_boundary(req: VerifyBoundaryRequest):
    """섹션 경계가 실제 텍스트에 있는지 LLM 검증."""
    from pageindex import verify_section_boundary
    result = await verify_section_boundary(req.title, req.text_chunk, model=req.model)
    return {"verified": result}
