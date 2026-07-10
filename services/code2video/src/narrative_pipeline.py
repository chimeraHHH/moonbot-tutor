from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from solve_pipeline import (
    DEFAULT_LLM1_MODEL,
    DEFAULT_LLM2_MODEL,
    _create_openai_client,
    _extract_json_text,
    _resolve_model,
)


NARRATIVE_BRIEF_SYSTEM_PROMPT = """
你是一名教育叙事策划师。你的任务是忠实整理当前页面的教学内容，为 Manim 教学动画准备叙事简报。

内容优先级必须严格遵守：
1. teaching_note、key_points、teaching_objective 是教学内容的最高事实来源；
2. page_title、course_title、course_description 用于确定主题边界；
3. visual_prompt 只描述视觉表现，不得改变教学主题。

硬性规则：
- 不得把神话、历史、文学、艺术或文化内容改写成数学、物理、化学或其他 STEM 解题任务。
- 来源没有数值、公式、测量或求解要求时，不得新增高度、面积、速度、距离、受力、角度、单位、算式或已知条件。
- 不得虚构人物、事件、因果关系或教学结论。
- 保留来源中的核心人物、时间线、事件和文化含义。
- 使用 target_language 指定的语言；语言指令存在时同时遵守。
- 输出一份简洁的叙事简报，不要输出 JSON，不要给出制作教程，不要讨论提示词本身。
""".strip()


NARRATIVE_STORYBOARD_SYSTEM_PROMPT = """
你是一名 Manim 教育动画分镜师。请把叙事简报转换为忠于来源的 narrative storyboard。

只返回 JSON，结构必须是：
{
  "source_title": "string",
  "narrative_goal": "string",
  "source_facts": ["string"],
  "sections": [
    {
      "id": "section_1",
      "title": "string",
      "lecture_lines": ["string"],
      "animations": ["string"]
    }
  ]
}

硬性规则：
- 不得输出 steps、final_answer、question_text、analysis_points 或任何解题模板字段。
- teaching_note、key_points、teaching_objective 是内容事实来源；visual_prompt 只能影响视觉风格和运动方式。
- 不得把人文叙事改写成数学或 STEM 问题，不得凭空新增计算、公式、数值、单位和测量目标。
- 旁白必须直接讲授页面主题，不要讲解“如何制作动画”。
- 每条 lecture_lines 必须与同位置的 animations 一一对应。
- 所有用户可见文字和旁白使用 target_language 指定的语言。
- 输出 JSON，不要 Markdown，不要解释。
""".strip()


_STEM_PROBLEM_PATTERNS = (
    re.compile(r"(?:求|计算)(?:出|一下|其|该|剩余|阴影|山顶|物体)?[^。；\n]{0,35}(?:高度|面积|速度|加速度|距离|质量|体积|角度|受力|功率|电阻|周长)"),
    re.compile(r"已知[^。；\n]{0,80}(?:厘米|米|千米|秒|小时|cm|km|m/s|kg|N\b)", re.IGNORECASE),
    re.compile(r"(?:高度|面积|速度|加速度|距离|质量|体积|角度|周长)[^。；\n]{0,20}(?:为|等于|是)\s*\d"),
    re.compile(r"\d+(?:\.\d+)?\s*(?:cm|mm|km|m/s|kg|N|厘米|毫米|千米|米/秒)\b", re.IGNORECASE),
    re.compile(r"(?:根据|使用)[^。；\n]{0,25}(?:公式|定理)[^。；\n]{0,35}(?:求|计算)"),
)


def _source_payload(prompt: str, context: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "page_title": str(context.get("page_title") or "").strip(),
        "teaching_note": str(context.get("teaching_note") or "").strip(),
        "key_points": [str(v).strip() for v in context.get("key_points", []) if str(v).strip()],
        "teaching_objective": str(context.get("teaching_objective") or "").strip(),
        "course_title": str(context.get("course_title") or "").strip(),
        "course_description": str(context.get("course_description") or "").strip(),
        "target_language": str(context.get("target_language") or "zh-CN").strip(),
        "language_directive": str(context.get("language_directive") or "").strip(),
        "visual_prompt": (prompt or "").strip(),
    }


def _content_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value


def contains_stem_problem(text: str) -> bool:
    return any(pattern.search(text or "") for pattern in _STEM_PROBLEM_PATTERNS)


def storyboard_has_invented_stem_problem(source: Any, storyboard: Any) -> bool:
    source_text = _content_text(source)
    if contains_stem_problem(source_text):
        return False
    return contains_stem_problem(_content_text(storyboard))


def _cjk_anchors(source: Dict[str, Any]) -> List[str]:
    authoritative = "\n".join(
        [
            str(source.get("page_title") or ""),
            str(source.get("teaching_note") or ""),
            "\n".join(source.get("key_points") or []),
            str(source.get("teaching_objective") or ""),
        ]
    )
    chunks = re.findall(r"[\u3400-\u9fff]{4,}", authoritative)
    anchors: List[str] = []
    for chunk in chunks:
        for idx in range(max(1, len(chunk) - 3)):
            anchor = chunk[idx : idx + 4]
            if len(anchor) == 4 and anchor not in anchors:
                anchors.append(anchor)
    return anchors[:80]


def _preserves_source_topic(source: Dict[str, Any], storyboard: Dict[str, Any]) -> bool:
    anchors = _cjk_anchors(source)
    if not anchors:
        return True
    output = _content_text(storyboard)
    return any(anchor in output for anchor in anchors)


def normalize_narrative_storyboard(raw: Any, source: Dict[str, Any]) -> Dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    raw_sections = data.get("sections") if isinstance(data.get("sections"), list) else []
    sections: List[Dict[str, Any]] = []

    for idx, item in enumerate(raw_sections, start=1):
        if not isinstance(item, dict):
            continue
        lecture_lines = [
            str(value).strip()
            for value in item.get("lecture_lines", [])
            if str(value).strip()
        ] if isinstance(item.get("lecture_lines"), list) else []
        animations = [
            str(value).strip()
            for value in item.get("animations", [])
            if str(value).strip()
        ] if isinstance(item.get("animations"), list) else []
        if len(animations) < len(lecture_lines):
            animations.extend(
                f"围绕旁白进行可视化：{line}" for line in lecture_lines[len(animations) :]
            )
        sections.append(
            {
                "id": f"section_{idx}",
                "title": str(item.get("title") or source.get("page_title") or f"第 {idx} 部分").strip(),
                "lecture_lines": lecture_lines,
                "animations": animations[: len(lecture_lines)],
            }
        )

    return {
        "source_title": str(data.get("source_title") or source.get("page_title") or "").strip(),
        "narrative_goal": str(data.get("narrative_goal") or source.get("teaching_note") or "").strip(),
        "source_facts": [
            str(value).strip()
            for value in data.get("source_facts", [])
            if str(value).strip()
        ] if isinstance(data.get("source_facts"), list) else [],
        "sections": sections,
    }


def validate_narrative_storyboard(
    storyboard: Dict[str, Any], source: Dict[str, Any]
) -> List[str]:
    errors: List[str] = []
    sections = storyboard.get("sections")
    if not isinstance(sections, list) or not sections:
        errors.append("sections must contain at least one narrative section")
    else:
        for idx, section in enumerate(sections, start=1):
            if not section.get("title"):
                errors.append(f"sections[{idx}] title is required")
            lines = section.get("lecture_lines")
            animations = section.get("animations")
            if not isinstance(lines, list) or not lines:
                errors.append(f"sections[{idx}] lecture_lines must not be empty")
            if not isinstance(animations, list) or len(animations) != len(lines or []):
                errors.append(f"sections[{idx}] animations must align with lecture_lines")
    if storyboard_has_invented_stem_problem(source, storyboard):
        errors.append("storyboard invented a STEM calculation absent from the source page")
    if not _preserves_source_topic(source, storyboard):
        errors.append("storyboard does not preserve the source page topic")
    return errors


def _completion_text(response: Any) -> str:
    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("Narrative planner returned empty content")
    return text


def run_narrative_brief(
    prompt: str,
    narrative_context: Dict[str, Any],
    output_path: str | Path,
    *,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    max_tokens: int = 4000,
) -> str:
    source = _source_payload(prompt, narrative_context)
    client = _create_openai_client(api_key=api_key, base_url=base_url)
    model_name = _resolve_model(model, "SOLVE_LLM1_MODEL", DEFAULT_LLM1_MODEL)
    correction = ""

    for attempt in range(2):
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": NARRATIVE_BRIEF_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"source_page": source, "correction": correction}, ensure_ascii=False
                    ),
                },
            ],
            max_tokens=max_tokens,
        )
        brief = _completion_text(response)
        if not storyboard_has_invented_stem_problem(source, brief):
            path = Path(output_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(brief, encoding="utf-8")
            return brief
        correction = "上一次结果擅自加入了来源中不存在的 STEM 计算。请完全删除计算题并忠于页面叙事。"

    raise ValueError("Narrative brief invented a STEM calculation absent from the source page")


def run_narrative_storyboard(
    prompt: str,
    brief: str,
    narrative_context: Dict[str, Any],
    output_path: str | Path,
    *,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    max_tokens: int = 4000,
) -> Dict[str, Any]:
    source = _source_payload(prompt, narrative_context)
    client = _create_openai_client(api_key=api_key, base_url=base_url)
    model_name = _resolve_model(model, "SOLVE_LLM2_MODEL", DEFAULT_LLM2_MODEL)
    correction = ""

    for attempt in range(2):
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": NARRATIVE_STORYBOARD_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "source_page": source,
                            "narrative_brief": brief,
                            "correction": correction,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            max_tokens=max_tokens,
        )
        raw = json.loads(_extract_json_text(_completion_text(response)))
        storyboard = normalize_narrative_storyboard(raw, source)
        errors = validate_narrative_storyboard(storyboard, source)
        if not errors:
            path = Path(output_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(storyboard, ensure_ascii=False, indent=2), encoding="utf-8")
            return storyboard
        correction = "上一次分镜校验失败：" + "；".join(errors) + "。请修正后重新输出完整 JSON。"

    raise ValueError("Narrative storyboard validation failed after correction retry")
