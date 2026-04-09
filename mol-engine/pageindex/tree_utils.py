"""
트리 변환 유틸리티
@origin clone/PageIndex pageindex/utils.py

포팅된 함수:
  - list_to_tree (L324-370): 플랫→중첩 트리
  - post_processing (L433-452): 플랫 TOC → start/end 보정 → list_to_tree
  - get_nodes / structure_to_list (L144-170): 트리 순회
  - add_preface_if_needed (L372-383): 첫 섹션 전 preface 추가

MOL 추가:
  - tree_to_flat: CGB 노드 생성용
  - add_section_summaries: 텍스트 범위 매핑
"""

import copy
from typing import Any


def list_to_tree(data: list[dict]) -> list[dict]:
    """플랫 섹션 리스트 → 중첩 트리.

    @origin PageIndex utils.py L324-370
    각 항목에 'structure' 키 (예: '1', '1.1', '1.2', '2')가 있으면
    parent-child 관계를 추론하여 중첩 트리로 변환.

    Args:
        data: [{ structure: '1.1', title: '...', start_offset: N, end_offset: N }, ...]

    Returns:
        [{ title: '...', start_offset, end_offset, nodes: [...] }, ...]
    """
    def get_parent_structure(structure: str) -> str | None:
        if not structure:
            return None
        parts = str(structure).split('.')
        return '.'.join(parts[:-1]) if len(parts) > 1 else None

    nodes: dict[str, dict] = {}
    root_nodes: list[dict] = []

    for item in data:
        structure = item.get('structure', '')
        node = {
            'title': item.get('title', ''),
            'start_offset': item.get('start_offset', 0),
            'end_offset': item.get('end_offset', 0),
            'level': item.get('level', 1),
            'nodes': [],
        }
        nodes[structure] = node

        parent_structure = get_parent_structure(structure)
        if parent_structure and parent_structure in nodes:
            nodes[parent_structure]['nodes'].append(node)
        else:
            root_nodes.append(node)

    def clean_node(node: dict) -> dict:
        if not node['nodes']:
            del node['nodes']
        else:
            for child in node['nodes']:
                clean_node(child)
        return node

    return [clean_node(node) for node in root_nodes]


def tree_to_flat(tree: list[dict], parent_id: str = '') -> list[dict]:
    """중첩 트리 → 플랫 리스트 (CGB 노드 생성용).

    Args:
        tree: list_to_tree() 결과
        parent_id: 상위 노드 ID (재귀용)

    Returns:
        [{ title, level, start_offset, end_offset, parent_id, node_id }, ...]
    """
    flat: list[dict] = []
    for i, node in enumerate(tree):
        node_id = f'{parent_id}.{i}' if parent_id else str(i)
        entry = {
            'title': node.get('title', ''),
            'level': node.get('level', 1),
            'start_offset': node.get('start_offset', 0),
            'end_offset': node.get('end_offset', 0),
            'parent_id': parent_id or None,
            'node_id': node_id,
        }
        flat.append(entry)
        if 'nodes' in node:
            flat.extend(tree_to_flat(node['nodes'], parent_id=node_id))
    return flat


def post_processing(structure: list[dict], end_physical_index: int) -> list[dict]:
    """플랫 TOC → start/end_offset 보정 → 중첩 트리.

    @origin PageIndex utils.py post_processing() L433-452
    원본: physical_index → start_index/end_index 변환 + appear_start 보정 + list_to_tree
    MOL: physical_index = 문자 오프셋 (원본은 페이지 번호)
    """
    if not structure:
        return []

    for i, item in enumerate(structure):
        item['start_offset'] = item.get('physical_index', 0)
        if i < len(structure) - 1:
            next_item = structure[i + 1]
            if next_item.get('appear_start') == 'yes':
                item['end_offset'] = next_item.get('physical_index', end_physical_index)
            else:
                item['end_offset'] = next_item.get('physical_index', end_physical_index)
        else:
            item['end_offset'] = end_physical_index

    tree = list_to_tree(structure)
    return tree if tree else structure


def add_preface_if_needed(data: list[dict]) -> list[dict]:
    """첫 섹션 전에 내용이 있으면 Preface 노드 추가.
    @origin PageIndex utils.py add_preface_if_needed() L372-383
    """
    if not data:
        return data
    first_offset = data[0].get('physical_index', 0)
    if first_offset and first_offset > 100:  # 100자 이상 앞에 내용 있으면
        preface = {
            "structure": "0",
            "title": "Preface",
            "physical_index": 0,
            "appear_start": "yes",
        }
        data.insert(0, preface)
    return data


def structure_to_list(structure) -> list[dict]:
    """트리를 플랫 리스트로 (모든 노드 순회). @origin utils.py L159-170"""
    if isinstance(structure, dict):
        nodes = [structure]
        if 'nodes' in structure:
            nodes.extend(structure_to_list(structure['nodes']))
        return nodes
    elif isinstance(structure, list):
        nodes = []
        for item in structure:
            nodes.extend(structure_to_list(item))
        return nodes
    return []


def get_leaf_nodes(structure) -> list[dict]:
    """리프 노드만 반환. @origin utils.py L173-189"""
    if isinstance(structure, dict):
        if not structure.get('nodes'):
            node = copy.deepcopy(structure)
            node.pop('nodes', None)
            return [node]
        else:
            leaves = []
            if 'nodes' in structure:
                leaves.extend(get_leaf_nodes(structure['nodes']))
            return leaves
    elif isinstance(structure, list):
        leaves = []
        for item in structure:
            leaves.extend(get_leaf_nodes(item))
        return leaves
    return []


def add_section_summaries(tree: list[dict], text: str) -> list[dict]:
    """각 섹션에 텍스트 범위 매핑.

    트리의 start_offset/end_offset으로 텍스트 슬라이스를 할당.
    LLM summary 생성은 호출 측에서 별도로 수행.

    Args:
        tree: 계층 트리
        text: 전체 소설 텍스트

    Returns:
        tree (mutated) — 각 노드에 'text_preview' 추가
    """
    def _traverse(nodes: list[dict]) -> None:
        for node in nodes:
            start = node.get('start_offset', 0)
            end = node.get('end_offset', len(text))
            # 최대 500자 미리보기
            section_text = text[start:end]
            node['text_preview'] = section_text[:500]
            node['char_count'] = len(section_text)
            if 'nodes' in node:
                _traverse(node['nodes'])

    tree_copy = copy.deepcopy(tree)
    _traverse(tree_copy)
    return tree_copy
