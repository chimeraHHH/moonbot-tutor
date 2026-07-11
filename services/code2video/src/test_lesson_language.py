"""Tests for lesson-language enforcement in the Deep Solve pipeline.

Covers the language matrix (absent → Chinese, zh-CN, en-US, bilingual), the
retry idempotency guard, and positional-argument compatibility of the solve
entry points. Uses ``unittest`` to match the repo convention (no pytest).

    python -m unittest test_lesson_language      # from services/code2video/src
"""

import inspect
import unittest

from lesson_language import (
    DEFAULT_LESSON_LANGUAGE,
    localize_system_prompt,
    normalize_lesson_language,
)

BASE_LLM1 = "You are a careful math tutor."
BASE_LLM2 = "You convert a math solution into structured JSON."


class NormalizeLessonLanguageTests(unittest.TestCase):
    def test_absent_defaults_to_chinese(self):
        self.assertEqual(normalize_lesson_language(None), "zh-CN")
        self.assertEqual(normalize_lesson_language(""), "zh-CN")
        self.assertEqual(normalize_lesson_language("   "), "zh-CN")
        self.assertEqual(DEFAULT_LESSON_LANGUAGE, "zh-CN")

    def test_zh_cn_resolves_to_chinese(self):
        self.assertEqual(normalize_lesson_language("zh-CN"), "zh-CN")
        self.assertEqual(normalize_lesson_language("整堂课必须使用简体中文"), "zh-CN")

    def test_en_us_resolves_to_english(self):
        self.assertEqual(normalize_lesson_language("en-US"), "en-US")
        self.assertEqual(normalize_lesson_language("Teach in English"), "en-US")

    def test_bilingual_resolves_to_bilingual(self):
        self.assertEqual(normalize_lesson_language("bilingual"), "bilingual")
        self.assertEqual(normalize_lesson_language("中英双语"), "bilingual")

    def test_unrecognized_falls_back_to_chinese(self):
        self.assertEqual(normalize_lesson_language("klingon"), "zh-CN")


class LocalizeSystemPromptTests(unittest.TestCase):
    def test_absent_forces_chinese_prompt(self):
        for stage in ("llm1", "llm2"):
            out = localize_system_prompt(BASE_LLM1, None, stage=stage)
            self.assertIn("简体中文", out)
            self.assertTrue(out.startswith(BASE_LLM1))

    def test_zh_cn_forces_chinese_prompt(self):
        out = localize_system_prompt(BASE_LLM2, "zh-CN", stage="llm2")
        self.assertIn("简体中文", out)
        # References the real solve_schema field names for the plan.
        self.assertIn("lecture_lines", out)
        self.assertIn("final_answer", out)

    def test_en_us_forces_english_prompt(self):
        out = localize_system_prompt(BASE_LLM1, "en-US", stage="llm1")
        self.assertIn("in English", out)
        self.assertNotIn("简体中文", out)

    def test_bilingual_forces_bilingual_prompt(self):
        out = localize_system_prompt(BASE_LLM1, "bilingual", stage="llm1")
        self.assertIn("简体中文", out)
        self.assertIn("English", out)

    def test_localize_is_idempotent_on_retry(self):
        once = localize_system_prompt(BASE_LLM1, "zh-CN", stage="llm1")
        # A retry that re-localizes the already-localized prompt must not append
        # the instruction again — even if a different language is requested.
        twice = localize_system_prompt(once, "en-US", stage="llm1")
        self.assertEqual(twice, once)
        self.assertEqual(once.count("[[lesson-language]]"), 1)


class SolveEntrypointSignatureTests(unittest.TestCase):
    def test_lesson_language_is_keyword_only_and_last(self):
        # Imported here so the pure tests above run without the heavy solve deps.
        from solve_pipeline import run_llm1_solve_text, run_llm2_solve_plan

        for fn, leading in (
            (run_llm1_solve_text, ["question", "output_path"]),
            (run_llm2_solve_plan, ["question", "solution", "output_path"]),
        ):
            params = list(inspect.signature(fn).parameters.values())
            # Leading positional params unchanged → old positional calls work.
            self.assertEqual([p.name for p in params[: len(leading)]], leading)
            last = params[-1]
            self.assertEqual(last.name, "lesson_language")
            self.assertEqual(last.kind, inspect.Parameter.KEYWORD_ONLY)


if __name__ == "__main__":
    unittest.main()
