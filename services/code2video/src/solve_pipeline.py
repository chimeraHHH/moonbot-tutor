from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import OpenAI

from solve_schema import (
    SolvePlan,
    SolveStep,
    VideoSection,
    solve_plan_from_dict,
    solve_plan_to_dict,
    validate_solve_plan,
)


DEFAULT_BASE_URL = "https://www.sophnet.com/api/open-apis/v1"
DEFAULT_LLM1_MODEL = "MiniMax-M2.1"
DEFAULT_LLM2_MODEL = "MiniMax-M2.1"

DEFAULT_LLM1_SYSTEM_PROMPT = (
    "You are a careful math tutor. Solve the question clearly with concise numbered steps, "
    "and provide a final answer at the end."
)

DEFAULT_LLM2_SYSTEM_PROMPT = """
You convert a math solution into structured JSON.
Return JSON only with this schema:
{
  "question_text": "string",
  "analysis_points": ["string"],
  "steps": [{"line": "string", "subtitle": "string"}],
  "final_answer": "string",
  "video_sections": [
    {
      "id": "section_1",
      "title": "string",
      "lecture_lines": ["string"],
      "animations": ["string"]
    }
  ]
}
Rules:
- Keep all fields present.
- steps must be non-empty.
- final_answer must be explicit and short.
- lecture_lines and animations should align in count.
- Output JSON only, no markdown, no explanations.
""".strip()


def _resolve_api_key(api_key: Optional[str]) -> str:
    key = api_key or os.getenv("SOLVE_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("API key is required. Set SOLVE_API_KEY/OPENAI_API_KEY or pass api_key.")
    return key


def _resolve_base_url(base_url: Optional[str]) -> str:
    return base_url or os.getenv("SOLVE_BASE_URL") or os.getenv("OPENAI_BASE_URL") or DEFAULT_BASE_URL


def _resolve_model(explicit_model: Optional[str], env_key: str, default_model: str) -> str:
    return explicit_model or os.getenv(env_key) or default_model


def _create_openai_client(api_key: Optional[str], base_url: Optional[str]) -> OpenAI:
    resolved_key = _resolve_api_key(api_key)
    resolved_base = _resolve_base_url(base_url)
    return OpenAI(api_key=resolved_key, base_url=resolved_base)


def _extract_json_text(raw_text: str) -> str:
    text = (raw_text or "").strip()
    if not text:
        return "{}"

    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, flags=re.DOTALL)
    if fenced:
        return fenced.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return text[start : end + 1].strip()
    return text


def _solution_lines(solution_text: str) -> List[str]:
    lines: List[str] = []
    for raw in solution_text.splitlines():
        line = re.sub(r"^\s*(\d+[\.\)]|[-*•])\s*", "", raw).strip()
        if line:
            lines.append(line)
    if lines:
        return lines
    fallback = solution_text.strip()
    return [fallback] if fallback else []


def _build_default_steps(solution_text: str) -> List[SolveStep]:
    return [SolveStep(line=line, subtitle=f"Step {idx}") for idx, line in enumerate(_solution_lines(solution_text), start=1)]


def _build_default_video_sections(steps: List[SolveStep], final_answer: str) -> List[VideoSection]:
    step_lines = [s.line for s in steps if s.line.strip()]
    if not step_lines and final_answer.strip():
        step_lines = [final_answer.strip()]
    if not step_lines:
        return []

    chunk_size = 3
    sections: List[VideoSection] = []
    for offset in range(0, len(step_lines), chunk_size):
        chunk = step_lines[offset : offset + chunk_size]
        section_idx = len(sections) + 1
        sections.append(
            VideoSection(
                id=f"section_{section_idx}",
                title=f"Solve Part {section_idx}",
                lecture_lines=chunk,
                animations=[f"Show and explain: {line}" for line in chunk],
            )
        )
    return sections


def _normalize_plan_dict(raw_data: Any, question: str, solution: str) -> Dict[str, Any]:
    data: Dict[str, Any] = raw_data if isinstance(raw_data, dict) else {}
    if "plan" in data and isinstance(data["plan"], dict):
        data = data["plan"]

    normalized: Dict[str, Any] = dict(data)
    normalized["question_text"] = str(normalized.get("question_text") or question).strip()

    if not isinstance(normalized.get("analysis_points"), list):
        normalized["analysis_points"] = []

    if not isinstance(normalized.get("steps"), list):
        normalized["steps"] = [{"line": line, "subtitle": f"Step {idx}"} for idx, line in enumerate(_solution_lines(solution), start=1)]

    final_answer = str(normalized.get("final_answer") or "").strip()
    if not final_answer:
        lines = _solution_lines(solution)
        final_answer = lines[-1] if lines else solution.strip()
    normalized["final_answer"] = final_answer

    if not isinstance(normalized.get("video_sections"), list):
        normalized["video_sections"] = []
    return normalized


def _ensure_plan_valid(plan: SolvePlan, solution_text: str) -> SolvePlan:
    if not plan.steps:
        plan.steps = _build_default_steps(solution_text)
    if not plan.final_answer.strip():
        lines = _solution_lines(solution_text)
        plan.final_answer = lines[-1] if lines else solution_text.strip()
    if not plan.video_sections:
        plan.video_sections = _build_default_video_sections(plan.steps, plan.final_answer)
    return plan


def run_llm1_solve_text(
    question: str,
    output_path: str | Path = "solution.txt",
    *,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    system_prompt: str = DEFAULT_LLM1_SYSTEM_PROMPT,
    max_tokens: int = 4000,
) -> str:
    """
    LLM1 stage:
    question -> solution.txt
    """
    question_text = (question or "").strip()
    if not question_text:
        raise ValueError("question must not be empty")

    client = _create_openai_client(api_key=api_key, base_url=base_url)
    model_name = _resolve_model(model, "SOLVE_LLM1_MODEL", DEFAULT_LLM1_MODEL)

    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question_text},
        ],
        max_tokens=max_tokens,
    )
    solution_text = (response.choices[0].message.content or "").strip()
    if not solution_text:
        raise RuntimeError("LLM1 returned empty solution text")

    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(solution_text, encoding="utf-8")
    return solution_text


def run_llm2_solve_plan(
    question: str,
    solution: str,
    output_path: str | Path = "solve_plan.json",
    *,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    system_prompt: str = DEFAULT_LLM2_SYSTEM_PROMPT,
    max_tokens: int = 4000,
) -> SolvePlan:
    """
    LLM2 stage:
    question + solution -> solve_plan.json
    """
    question_text = (question or "").strip()
    solution_text = (solution or "").strip()
    if not question_text:
        raise ValueError("question must not be empty")
    if not solution_text:
        raise ValueError("solution must not be empty")

    client = _create_openai_client(api_key=api_key, base_url=base_url)
    model_name = _resolve_model(model, "SOLVE_LLM2_MODEL", DEFAULT_LLM2_MODEL)

    user_payload = json.dumps(
        {
            "question": question_text,
            "solution_text": solution_text,
            "target_schema": {
                "question_text": "string",
                "analysis_points": ["string"],
                "steps": [{"line": "string", "subtitle": "string"}],
                "final_answer": "string",
                "video_sections": [
                    {
                        "id": "section_1",
                        "title": "string",
                        "lecture_lines": ["string"],
                        "animations": ["string"],
                    }
                ],
            },
        },
        ensure_ascii=False,
    )

    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_payload},
        ],
        max_tokens=max_tokens,
    )
    raw_content = (response.choices[0].message.content or "").strip()
    if not raw_content:
        raise RuntimeError("LLM2 returned empty plan content")

    json_text = _extract_json_text(raw_content)
    raw_data = json.loads(json_text)
    normalized = _normalize_plan_dict(raw_data, question=question_text, solution=solution_text)
    plan = solve_plan_from_dict(normalized)
    plan = _ensure_plan_valid(plan, solution_text=solution_text)
    errors = validate_solve_plan(plan)
    if errors:
        raise ValueError(f"solve plan validation failed: {errors}")

    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(solve_plan_to_dict(plan), ensure_ascii=False, indent=2), encoding="utf-8")
    return plan


def run_solve_pipeline(
    question: str,
    output_dir: str | Path = ".",
    *,
    llm1_model: Optional[str] = None,
    llm2_model: Optional[str] = None,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    llm1_max_tokens: int = 4000,
    llm2_max_tokens: int = 4000,
) -> SolvePlan:
    """
    Convenience wrapper for MVP solve pipeline.
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    solution_path = out_dir / "solution.txt"
    plan_path = out_dir / "solve_plan.json"

    solution_text = run_llm1_solve_text(
        question=question,
        output_path=solution_path,
        model=llm1_model,
        base_url=base_url,
        api_key=api_key,
        max_tokens=llm1_max_tokens,
    )
    return run_llm2_solve_plan(
        question=question,
        solution=solution_text,
        output_path=plan_path,
        model=llm2_model,
        base_url=base_url,
        api_key=api_key,
        max_tokens=llm2_max_tokens,
    )

