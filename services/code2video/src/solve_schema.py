from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class SolveStep:
    """A single solving step."""

    line: str
    subtitle: str = ""


@dataclass
class VideoSection:
    """A storyboard-compatible section used by downstream video generation."""

    id: str
    title: str
    lecture_lines: List[str] = field(default_factory=list)
    animations: List[str] = field(default_factory=list)


@dataclass
class SolvePlan:
    """
    Minimal solve contract between solver output and video pipeline input.

    Fields are intentionally small for MVP:
    - question_text
    - analysis_points[]
    - steps[]
    - final_answer
    - video_sections[]
    """

    question_text: str
    analysis_points: List[str] = field(default_factory=list)
    steps: List[SolveStep] = field(default_factory=list)
    final_answer: str = ""
    video_sections: List[VideoSection] = field(default_factory=list)


def _to_str_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _step_from_dict(data: Any) -> SolveStep:
    if isinstance(data, str):
        return SolveStep(line=data.strip())
    if not isinstance(data, dict):
        return SolveStep(line="")

    line = str(data.get("line") or data.get("step") or data.get("text") or "").strip()
    subtitle = str(data.get("subtitle") or "").strip()
    return SolveStep(line=line, subtitle=subtitle)


def _step_to_dict(step: SolveStep) -> Dict[str, Any]:
    out: Dict[str, Any] = {"line": step.line}
    if step.subtitle:
        out["subtitle"] = step.subtitle
    return out


def _video_section_from_dict(data: Any, index: int) -> VideoSection:
    if not isinstance(data, dict):
        return VideoSection(id=f"section_{index}", title=f"Section {index}")

    section_id = str(data.get("id") or f"section_{index}").strip()
    title = str(data.get("title") or f"Section {index}").strip()
    lecture_lines = _to_str_list(data.get("lecture_lines", []))
    animations = _to_str_list(data.get("animations", []))
    return VideoSection(
        id=section_id or f"section_{index}",
        title=title or f"Section {index}",
        lecture_lines=lecture_lines,
        animations=animations,
    )


def _video_section_to_dict(section: VideoSection) -> Dict[str, Any]:
    return {
        "id": section.id,
        "title": section.title,
        "lecture_lines": list(section.lecture_lines),
        "animations": list(section.animations),
    }


def _extract_analysis_points(data: Dict[str, Any]) -> List[str]:
    # Native SolvePlan shape
    direct = _to_str_list(data.get("analysis_points", []))
    if direct:
        return direct

    # Compatibility with AI4Learning ProblemPlan question.analysis
    # question.analysis: {formulas: [], conditions: [], strategy: []}
    questions = data.get("questions", [])
    if not isinstance(questions, list) or not questions:
        return []
    first_q = questions[0] if isinstance(questions[0], dict) else {}
    analysis = first_q.get("analysis", {}) if isinstance(first_q, dict) else {}
    if not isinstance(analysis, dict):
        return []

    merged: List[str] = []
    for key in ("formulas", "conditions", "strategy"):
        merged.extend(_to_str_list(analysis.get(key, [])))
    return merged


def _extract_steps(data: Dict[str, Any]) -> List[SolveStep]:
    raw_steps = data.get("steps", [])
    if isinstance(raw_steps, list) and raw_steps:
        return [_step_from_dict(step) for step in raw_steps]

    # Compatibility with AI4Learning ProblemPlan questions[0].steps
    questions = data.get("questions", [])
    if not isinstance(questions, list) or not questions:
        return []
    first_q = questions[0] if isinstance(questions[0], dict) else {}
    q_steps = first_q.get("steps", []) if isinstance(first_q, dict) else []
    if not isinstance(q_steps, list):
        return []
    return [_step_from_dict(step) for step in q_steps]


def solve_plan_from_dict(data: Dict[str, Any]) -> SolvePlan:
    """
    Deserialize dict to SolvePlan.

    Supports:
    1) Native SolvePlan shape
    2) Partial compatibility with AI4Learning ProblemPlan shape
    """
    if not isinstance(data, dict):
        raise TypeError("solve_plan_from_dict expects a dict")

    question_text = str(data.get("question_text", "")).strip()
    if not question_text:
        # Compatibility with ProblemPlan naming
        question_text = str(data.get("problem_full_text", "")).strip()

    final_answer = str(data.get("final_answer", "")).strip()
    if not final_answer:
        # Compatibility fallback from ProblemPlan if no explicit final answer.
        questions = data.get("questions", [])
        if isinstance(questions, list) and questions and isinstance(questions[0], dict):
            final_answer = str(questions[0].get("question_text", "")).strip()

    analysis_points = _extract_analysis_points(data)
    steps = _extract_steps(data)

    video_sections_raw = data.get("video_sections", [])
    if not isinstance(video_sections_raw, list):
        video_sections_raw = []
    video_sections = [_video_section_from_dict(item, idx + 1) for idx, item in enumerate(video_sections_raw)]

    return SolvePlan(
        question_text=question_text,
        analysis_points=analysis_points,
        steps=steps,
        final_answer=final_answer,
        video_sections=video_sections,
    )


def solve_plan_to_dict(plan: SolvePlan) -> Dict[str, Any]:
    """Serialize SolvePlan to dict."""
    return {
        "question_text": plan.question_text,
        "analysis_points": list(plan.analysis_points),
        "steps": [_step_to_dict(step) for step in plan.steps],
        "final_answer": plan.final_answer,
        "video_sections": [_video_section_to_dict(section) for section in plan.video_sections],
    }


def validate_solve_plan(plan: SolvePlan) -> List[str]:
    """Validate minimal contract completeness. Returns a list of errors."""
    errors: List[str] = []

    if not plan.question_text.strip():
        errors.append("question_text is required")
    if not plan.final_answer.strip():
        errors.append("final_answer is required")
    if not plan.steps:
        errors.append("steps must contain at least one item")
    else:
        for idx, step in enumerate(plan.steps, start=1):
            if not step.line.strip():
                errors.append(f"steps[{idx}] line is empty")

    for idx, section in enumerate(plan.video_sections, start=1):
        if not section.id.strip():
            errors.append(f"video_sections[{idx}] id is empty")
        if not section.title.strip():
            errors.append(f"video_sections[{idx}] title is empty")

    return errors


def new_empty_solve_plan(question_text: str = "") -> SolvePlan:
    """Helper for UI or pipeline bootstrap."""
    return SolvePlan(question_text=question_text.strip())
