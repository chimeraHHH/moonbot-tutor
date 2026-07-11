"""Lesson-language helpers for the Deep Solve pipeline.

The classroom passes down a *lesson language* as a small structured enum —
``"zh-CN"``, ``"en-US"`` or ``"bilingual"`` — resolved from the course
``languageDirective`` at the frontend entry point. These helpers turn that enum
into an explicit instruction the solve LLMs must follow, so Manim narration,
on-screen subtitles and TTS text come out in the course language instead of
drifting to English.

Design notes:
- Pure stdlib (only ``re``) so it imports without the heavy solve dependencies
  and can be unit-tested in isolation.
- The default is Simplified Chinese: an absent/unknown value resolves to
  ``zh-CN`` so legacy requests keep producing Chinese. ``en-US`` and
  ``bilingual`` only take effect when explicitly passed.
- ``localize_system_prompt`` is idempotent (guarded by a marker) so a retry that
  re-localizes an already-localized prompt never appends the instruction twice.
"""

from __future__ import annotations

import re
from typing import Optional

DEFAULT_LESSON_LANGUAGE = "zh-CN"
LESSON_LANGUAGES = ("zh-CN", "en-US", "bilingual")

# Marker embedded in every appended instruction; its presence means the prompt
# is already localized, so re-localizing is a no-op.
_MARKER = "[[lesson-language]]"

# Detection over either a locale code ("zh-CN", "en_US") or a free directive
# ("整堂课必须使用简体中文", "teach in English", "中英双语"). Bilingual is checked
# first because a bilingual directive usually also mentions one of the base
# languages.
_BILINGUAL_RE = re.compile(r"(?:bilingual|双语|中英|zh[-_]?en|en[-_]?zh)", re.IGNORECASE)
_CHINESE_RE = re.compile(r"(?:\bzh\b|zh[-_]|中文|简体|chinese)", re.IGNORECASE)
_ENGLISH_RE = re.compile(r"(?:\ben\b|en[-_]|english|英文|英语)", re.IGNORECASE)

_INSTRUCTIONS = {
    ("zh-CN", "llm1"): (
        "请全程使用简体中文进行讲解：所有解题步骤、说明文字和最终答案都必须是简体中文，"
        "不得使用英文叙述。数学符号、公式和通用专有名词可以保留原样。"
    ),
    ("zh-CN", "llm2"): (
        "重要语言要求：question_text、analysis_points、steps 的 line 与 subtitle、"
        "final_answer，以及 video_sections 的 title 与 lecture_lines 等所有自然语言字段"
        "都必须使用简体中文（旁白、字幕与 TTS 文本保持一致）。仅数学符号与公式可保留原样。"
        "仍然只输出 JSON。"
    ),
    ("en-US", "llm1"): (
        "Explain entirely in English: all solution steps, explanations and the "
        "final answer must be written in English."
    ),
    ("en-US", "llm2"): (
        "Language requirement: question_text, analysis_points, the line and "
        "subtitle of each step, final_answer, and the title and lecture_lines of "
        "each video_section must all be written in English (narration, subtitles "
        "and TTS text stay consistent). Keep mathematical symbols and formulas "
        "as-is. Still output JSON only."
    ),
    ("bilingual", "llm1"): (
        "请使用中英双语讲解：每一处解题步骤、说明文字和最终答案都先给出简体中文，"
        "再给出对应英文。Explain bilingually: provide Simplified Chinese first, "
        "then the English equivalent."
    ),
    ("bilingual", "llm2"): (
        "重要语言要求：question_text、analysis_points、steps 的 line 与 subtitle、"
        "final_answer，以及 video_sections 的 title 与 lecture_lines 等所有自然语言字段"
        "都必须采用中英双语（先简体中文再英文），旁白、字幕与 TTS 文本保持一致。"
        "仅数学符号与公式可保留原样。仍然只输出 JSON。"
    ),
}


def normalize_lesson_language(value: Optional[str]) -> str:
    """Resolve any lesson-language input to a canonical enum value.

    Accepts an enum value, a locale code, or a free-text directive. Absent or
    unrecognized input resolves to the ``zh-CN`` default so legacy/no-language
    requests still produce Simplified Chinese.
    """
    if not value:
        return DEFAULT_LESSON_LANGUAGE
    text = value.strip()
    if not text:
        return DEFAULT_LESSON_LANGUAGE
    if _BILINGUAL_RE.search(text):
        return "bilingual"
    if _CHINESE_RE.search(text):
        return "zh-CN"
    if _ENGLISH_RE.search(text):
        return "en-US"
    return DEFAULT_LESSON_LANGUAGE


def localize_system_prompt(
    base_prompt: str,
    lesson_language: Optional[str],
    *,
    stage: str,
) -> str:
    """Append a lesson-language instruction to a base system prompt.

    ``stage`` selects the instruction variant: ``"llm1"`` (free-form solution
    text) or ``"llm2"`` (structured plan whose fields drive narration, subtitles
    and TTS). Any other stage falls back to the ``llm1`` wording.

    Idempotent: if ``base_prompt`` already carries the marker it is returned
    unchanged, so retries never duplicate the instruction.
    """
    if _MARKER in base_prompt:
        return base_prompt

    resolved = normalize_lesson_language(lesson_language)
    stage_key = stage if stage in ("llm1", "llm2") else "llm1"
    instruction = _INSTRUCTIONS[(resolved, stage_key)]
    return f"{base_prompt}\n\n{_MARKER} {instruction}"
