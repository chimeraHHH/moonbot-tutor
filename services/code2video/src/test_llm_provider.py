from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SRC_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SRC_DIR.parent
for path in (SRC_DIR, PROJECT_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from agent import RunConfig, TeachingVideoAgent
from gpt_request import LLMProviderAdapter, LLMResponse, invoke_llm
from solve_pipeline import run_llm1_solve_text, run_llm2_solve_plan


class FakeHttpResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload, ensure_ascii=False)

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx

            request = httpx.Request("POST", "https://aiplatform.googleapis.com/test")
            response = httpx.Response(self.status_code, request=request, text=self.text)
            raise httpx.HTTPStatusError("vertex error", request=request, response=response)

    def json(self):
        return self._payload


class FakeHttpClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


class RecordingAdapter:
    def __init__(self):
        self.calls = []
        self.responses = []

    def invoke_messages(self, messages, *, max_tokens, model=None):
        self.calls.append(("solve", model, messages))
        return self.responses.pop(0)

    def __call__(self, prompt, *, max_tokens=8000, model=None, system_prompt=None):
        self.calls.append(("agent", model, prompt))
        return self.responses.pop(0)


class LLMProviderTests(unittest.TestCase):
    def test_vertex_express_uses_native_api_key_header_and_model(self):
        client = FakeHttpClient(
            FakeHttpResponse(
                {
                    "candidates": [
                        {"content": {"parts": [{"text": "OK"}]}, "finishReason": "STOP"}
                    ],
                    "usageMetadata": {
                        "promptTokenCount": 1,
                        "candidatesTokenCount": 1,
                        "totalTokenCount": 2,
                    },
                }
            )
        )

        result = invoke_llm(
            provider="vertex-express",
            model="google/gemini-3.5-flash",
            messages=[{"role": "user", "content": "Return OK"}],
            api_key="vertex-key",
            http_client=client,
        )

        self.assertEqual(result.content, "OK")
        url, kwargs = client.calls[0]
        self.assertEqual(
            url,
            "https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.5-flash:generateContent",
        )
        self.assertEqual(kwargs["headers"]["x-goog-api-key"], "vertex-key")
        self.assertNotIn("authorization", {key.lower(): value for key, value in kwargs["headers"].items()})

    def test_vertex_error_body_is_preserved(self):
        client = FakeHttpClient(FakeHttpResponse({"error": {"message": "model denied"}}, status_code=403))

        with self.assertRaisesRegex(RuntimeError, "model denied"):
            invoke_llm(
                provider="vertex-express",
                model="gemini-3.5-flash",
                messages=[{"role": "user", "content": "hello"}],
                api_key="vertex-key",
                http_client=client,
            )

    @patch("gpt_request.OpenAI")
    def test_openai_compatible_path_is_unchanged(self, openai_cls):
        completion = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="hello"), finish_reason="stop")],
            usage=SimpleNamespace(prompt_tokens=2, completion_tokens=1, total_tokens=3),
        )
        openai_cls.return_value.chat.completions.create.return_value = completion

        result = invoke_llm(
            provider="openai-compatible",
            model="existing-model",
            messages=[{"role": "user", "content": "hello"}],
            api_key="existing-key",
            base_url="https://example.test/v1",
            max_tokens=99,
        )

        openai_cls.assert_called_once_with(api_key="existing-key", base_url="https://example.test/v1")
        openai_cls.return_value.chat.completions.create.assert_called_once_with(
            model="existing-model",
            messages=[{"role": "user", "content": "hello"}],
            max_tokens=99,
        )
        self.assertEqual(result.content, "hello")

    def test_solve_codegen_and_fix_share_one_adapter(self):
        adapter = RecordingAdapter()
        adapter.responses.extend(
            [
                LLMResponse("1. Explain\n2. Answer: 2"),
                LLMResponse(
                    json.dumps(
                        {
                            "question_text": "1+1?",
                            "analysis_points": [],
                            "steps": [{"line": "1+1=2", "subtitle": "Step 1"}],
                            "final_answer": "2",
                            "video_sections": [
                                {
                                    "id": "section_1",
                                    "title": "Answer",
                                    "lecture_lines": ["1+1=2"],
                                    "animations": ["Show 1+1=2"],
                                }
                            ],
                        }
                    )
                ),
                LLMResponse("codegen"),
                LLMResponse("fix"),
            ]
        )

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            run_llm1_solve_text("1+1?", output / "solution.txt", model="m1", llm=adapter)
            run_llm2_solve_plan(
                "1+1?",
                "1+1=2",
                output / "plan.json",
                model="m2",
                llm=adapter,
            )
            cfg = RunConfig(
                use_feedback=False,
                use_assets=False,
                api=adapter,
                max_fix_bug_tries=1,
                max_regenerate_tries=1,
                max_feedback_gen_code_tries=1,
                max_mllm_fix_bugs_tries=1,
            )
            agent = TeachingVideoAgent(1, "1+1", folder=output, cfg=cfg)
            self.assertIs(agent.API, adapter)
            self.assertIs(agent.scope_refine_fixer.request_gpt, adapter)
            self.assertEqual(agent._request_api_and_track_tokens("codegen").content, "codegen")
            self.assertEqual(agent.scope_refine_fixer.request_gpt("fix").content, "fix")

        self.assertEqual([call[0] for call in adapter.calls], ["solve", "solve", "agent", "agent"])


if __name__ == "__main__":
    unittest.main()
