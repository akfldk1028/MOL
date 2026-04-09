"""
pageindex — LLM 기반 문서 계층 트리 인덱싱
@origin clone/PageIndex (VectifyAI)

포팅된 핵심 알고리즘:
  - generate_toc_init/continue: 텍스트→TOC LLM 추출
  - check_title_appearance: 섹션 위치 LLM 검증 (병렬)
  - post_processing: 플랫→트리 변환 + start/end 보정
  - generate_summaries: 노드별 요약 병렬 생성
  - list_to_tree, structure_to_list, get_leaf_nodes: 트리 유틸
"""

from .tree_builder import build_tree_from_text, verify_section_boundary, generate_summaries
from .tree_utils import (
    list_to_tree, tree_to_flat, add_section_summaries,
    post_processing, add_preface_if_needed,
    structure_to_list, get_leaf_nodes,
)

__all__ = [
    'build_tree_from_text',
    'verify_section_boundary',
    'generate_summaries',
    'list_to_tree',
    'tree_to_flat',
    'add_section_summaries',
    'post_processing',
    'add_preface_if_needed',
    'structure_to_list',
    'get_leaf_nodes',
]
