from __future__ import annotations

import sys
import unittest
from pathlib import Path


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from narrative_pipeline import (  # noqa: E402
    normalize_narrative_storyboard,
    storyboard_has_invented_stem_problem,
    validate_narrative_storyboard,
)


MYTH_SOURCE = {
    "page_title": "从混沌初开到人类繁衍",
    "teaching_note": "盘古与女娲代表了先民对宇宙起源的浪漫解读。",
    "key_points": ["盘古开天辟地", "女娲创造人类", "理解神话的文化意义"],
    "target_language": "zh-CN",
    "visual_prompt": "水墨风神话动画",
}


class NarrativePipelineTest(unittest.TestCase):
    def test_accepts_source_faithful_myth_storyboard(self) -> None:
        storyboard = {
            "source_title": "从混沌初开到人类繁衍",
            "narrative_goal": "理解先民对宇宙起源的浪漫想象",
            "source_facts": ["盘古开天辟地", "女娲创造人类"],
            "sections": [
                {
                    "id": "section_1",
                    "title": "盘古开天辟地",
                    "lecture_lines": ["混沌之中，盘古开辟天地。"],
                    "animations": ["展示混沌分开、天地形成的过程。"],
                },
                {
                    "id": "section_2",
                    "title": "女娲与人类繁衍",
                    "lecture_lines": ["女娲造人的故事寄托了先民对生命起源的想象。"],
                    "animations": ["展示女娲塑造人类、生命逐渐繁衍。"],
                },
            ],
        }
        self.assertEqual(validate_narrative_storyboard(storyboard, MYTH_SOURCE), [])

    def test_rejects_invented_mountain_height_problem(self) -> None:
        drifted = {
            "sections": [
                {
                    "id": "section_1",
                    "title": "计算山顶高度",
                    "lecture_lines": ["已知山脚距离为 500 米，请计算山顶高度。"],
                    "animations": ["根据三角函数公式计算高度。"],
                }
            ]
        }
        self.assertTrue(storyboard_has_invented_stem_problem(MYTH_SOURCE, drifted))
        self.assertTrue(
            any("STEM calculation" in error for error in validate_narrative_storyboard(drifted, MYTH_SOURCE))
        )

    def test_allows_stem_when_the_source_explicitly_requests_it(self) -> None:
        source = {
            **MYTH_SOURCE,
            "page_title": "计算山顶高度",
            "teaching_note": "已知水平距离为 500 米，请使用三角函数计算山顶高度。",
        }
        storyboard = {
            "sections": [
                {
                    "id": "section_1",
                    "title": "计算山顶高度",
                    "lecture_lines": ["根据已知距离计算山顶高度。"],
                    "animations": ["展示直角三角形和高度计算。"],
                }
            ]
        }
        self.assertFalse(storyboard_has_invented_stem_problem(source, storyboard))

    def test_normalization_drops_solve_template_fields(self) -> None:
        normalized = normalize_narrative_storyboard(
            {
                "steps": [{"line": "不应保留"}],
                "final_answer": "不应保留",
                "sections": [
                    {
                        "id": "invalid chinese id",
                        "title": "盘古开天辟地",
                        "lecture_lines": ["混沌之中，盘古开辟天地。"],
                        "animations": [],
                    }
                ],
            },
            MYTH_SOURCE,
        )
        self.assertNotIn("steps", normalized)
        self.assertNotIn("final_answer", normalized)
        self.assertEqual(normalized["sections"][0]["id"], "section_1")
        self.assertEqual(len(normalized["sections"][0]["animations"]), 1)


if __name__ == "__main__":
    unittest.main()
