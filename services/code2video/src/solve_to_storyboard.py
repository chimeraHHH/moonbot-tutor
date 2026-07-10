from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from solve_schema import SolvePlan, SolveStep, VideoSection, solve_plan_from_dict


def _fallback_video_sections_from_steps(steps: List[SolveStep], final_answer: str) -> List[VideoSection]:
    lines = [step.line.strip() for step in steps if step.line.strip()]
    if not lines and final_answer.strip():
        lines = [final_answer.strip()]
    if not lines:
        return []

    chunk_size = 3
    sections: List[VideoSection] = []
    for offset in range(0, len(lines), chunk_size):
        chunk = lines[offset : offset + chunk_size]
        idx = len(sections) + 1
        sections.append(
            VideoSection(
                id=f"section_{idx}",
                title=f"讲解第 {idx} 部分",
                lecture_lines=chunk,
                animations=[f"动画展示并讲解：{line}" for line in chunk],
            )
        )
    return sections


def _normalize_section(section: VideoSection, default_idx: int, fallback_line: str) -> Dict[str, Any]:
    section_id = section.id.strip() or f"section_{default_idx}"
    title = section.title.strip() or f"讲解第 {default_idx} 部分"
    lecture_lines = [line.strip() for line in section.lecture_lines if line and line.strip()]
    if not lecture_lines and fallback_line.strip():
        lecture_lines = [fallback_line.strip()]

    animations = [line.strip() for line in section.animations if line and line.strip()]
    if len(animations) < len(lecture_lines):
        missing = len(lecture_lines) - len(animations)
        animations.extend([f"动画展示并讲解：{line}" for line in lecture_lines[-missing:]])

    return {
        "id": section_id,
        "title": title,
        "lecture_lines": lecture_lines,
        "animations": animations[: len(lecture_lines)] if lecture_lines else animations,
    }


def solve_plan_to_storyboard_dict(plan: SolvePlan) -> Dict[str, Any]:
    """
    Map SolvePlan to current storyboard format:
    {"sections":[{"id","title","lecture_lines","animations"}]}
    """
    sections = list(plan.video_sections)
    if not sections:
        sections = _fallback_video_sections_from_steps(plan.steps, plan.final_answer)

    fallback_line = (plan.final_answer or plan.question_text or "").strip()
    storyboard_sections = [
        _normalize_section(section=sec, default_idx=idx, fallback_line=fallback_line) for idx, sec in enumerate(sections, start=1)
    ]
    return {"sections": storyboard_sections}


def load_solve_plan(path: str | Path) -> SolvePlan:
    plan_path = Path(path)
    data = json.loads(plan_path.read_text(encoding="utf-8"))
    return solve_plan_from_dict(data)


def save_storyboard(storyboard: Dict[str, Any], path: str | Path) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(storyboard, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path


def solve_plan_file_to_storyboard_file(
    solve_plan_path: str | Path,
    storyboard_path: str | Path = "storyboard_from_solve.json",
) -> Dict[str, Any]:
    plan = load_solve_plan(solve_plan_path)
    storyboard = solve_plan_to_storyboard_dict(plan)
    save_storyboard(storyboard, storyboard_path)
    return storyboard


def apply_storyboard_to_agent(agent: Any, storyboard: Dict[str, Any]) -> int:
    """
    Inject storyboard into TeachingVideoAgent and reuse existing code/render pipeline
    without modifying TeachingVideoAgent methods.
    """
    from agent import Section

    sections_raw = storyboard.get("sections", [])
    if not isinstance(sections_raw, list):
        sections_raw = []

    sections: List[Section] = []
    normalized_sections: List[Dict[str, Any]] = []
    for idx, item in enumerate(sections_raw, start=1):
        if not isinstance(item, dict):
            continue
        section_data = _normalize_section(
            section=VideoSection(
                id=str(item.get("id", "")),
                title=str(item.get("title", "")),
                lecture_lines=[str(v) for v in item.get("lecture_lines", [])] if isinstance(item.get("lecture_lines"), list) else [],
                animations=[str(v) for v in item.get("animations", [])] if isinstance(item.get("animations"), list) else [],
            ),
            default_idx=idx,
            fallback_line=str(agent.learning_topic),
        )
        normalized_sections.append(section_data)
        sections.append(
            Section(
                id=section_data["id"],
                title=section_data["title"],
                lecture_lines=section_data["lecture_lines"],
                animations=section_data["animations"],
            )
        )

    agent.enhanced_storyboard = {"sections": normalized_sections}
    agent.sections = sections
    return len(sections)


def render_with_existing_agent_pipeline(agent: Any, storyboard: Dict[str, Any], max_render_workers: int = 2) -> str:
    """
    Reuse existing TeachingVideoAgent methods:
    generate_codes -> render_all_sections -> merge_videos
    """
    section_count = apply_storyboard_to_agent(agent, storyboard)
    if section_count == 0:
        raise ValueError("No valid sections found in storyboard")

    agent.generate_codes()
    agent.render_all_sections(max_workers=max_render_workers)
    return agent.merge_videos()
