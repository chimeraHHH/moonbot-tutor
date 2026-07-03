from __future__ import annotations

import asyncio
import json
import os
import subprocess
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
import uvicorn


API_PREFIX = "/api/v1"
DEEP_SOLVE_PREFIX = f"{API_PREFIX}/deep-solve"
STAGES: tuple[str, ...] = ("llm1", "llm2", "storyboard", "audio", "code", "render", "merge")
TERMINAL_STATES = {"succeeded", "failed", "cancelled"}
PIPELINE_MAX_CONCURRENCY = 1

PROVIDER_CHOICES = ("gpt-41", "claude", "gpt-5", "gpt-4o", "gpt-o4mini", "Gemini")
API_NAME_TO_SERVICE = {
    "gpt-41": "gpt41",
    "claude": "claude",
    "gpt-5": "gpt5",
    "gpt-4o": "gpt4o",
    "gpt-o4mini": "gpto4mini",
    "Gemini": "gemini",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def redact_secret(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    if len(value) <= 8:
        return "***"
    return f"{value[:4]}***{value[-4:]}"


def read_text_preview(path: Path, limit: int = 4000) -> str:
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    return text[:limit]


def read_json_preview(path: Path, limit: int = 4000) -> str:
    if not path.exists():
        return ""
    try:
        data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
        text = json.dumps(data, ensure_ascii=False, indent=2)
    except Exception:
        text = path.read_text(encoding="utf-8", errors="replace")
    return text[:limit]


def to_topic(question: str, fallback: str = "Deep Solve Task") -> str:
    base = " ".join((question or "").split())
    if not base:
        base = fallback
    return base[:80]


def compose_question(question: str, context: str) -> str:
    q = (question or "").strip()
    c = (context or "").strip()
    if q and c:
        return f"{q}\n\nContext:\n{c}"
    return q or c


def ffprobe_duration_seconds(video_path: Path) -> Optional[float]:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if result.returncode != 0:
            return None
        return round(float((result.stdout or "").strip()), 3)
    except Exception:
        return None


class RuntimeConfig(BaseModel):
    provider: Optional[str] = None
    api_key: Optional[str] = Field(default=None, repr=False)
    base_url: Optional[str] = None
    model: Optional[str] = None
    llm1_model: Optional[str] = None
    llm2_model: Optional[str] = None
    api_type: Literal["auto", "openai_compatible", "azure"] = "auto"


class PipelineOptions(BaseModel):
    use_feedback: bool = True
    use_assets: bool = True
    max_render_workers: int = 2
    max_code_token_length: int = 10000
    max_fix_bug_tries: int = 10
    max_regenerate_tries: int = 10
    max_feedback_gen_code_tries: int = 3
    max_mllm_fix_bugs_tries: int = 3
    feedback_rounds: int = 2


class ClientContext(BaseModel):
    request_id: Optional[str] = None
    session_id: Optional[str] = None


class DeepSolveInput(BaseModel):
    question: str
    context: str = ""


class CreateTaskRequest(BaseModel):
    engine: Literal["code2video"] = "code2video"
    input: DeepSolveInput
    runtime: RuntimeConfig = Field(default_factory=RuntimeConfig)
    options: PipelineOptions = Field(default_factory=PipelineOptions)
    client: ClientContext = Field(default_factory=ClientContext)


class ErrorObject(BaseModel):
    code: str
    message: str
    stage: Optional[str] = None
    retryable: bool = False
    details: Dict[str, Any] = Field(default_factory=dict)


class StageStatus(BaseModel):
    state: Literal["queued", "running", "succeeded", "failed", "cancelled"] = "queued"
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    message: Optional[str] = None


class Artifact(BaseModel):
    kind: str
    path: str
    url: Optional[str] = None


class TaskStatus(BaseModel):
    task_id: str
    state: Literal["queued", "running", "succeeded", "failed", "cancelled"]
    current_stage: Optional[str] = None
    progress: float = 0.0
    stages: Dict[str, StageStatus]
    artifacts: list[Artifact] = Field(default_factory=list)
    error: Optional[ErrorObject] = None
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


class CreateTaskResponse(BaseModel):
    task_id: str
    state: str
    events_url: str
    status_url: str
    cancel_url: str
    created_at: str


class CancelTaskResponse(BaseModel):
    task_id: str
    state: str


class ConfigValidateRequest(BaseModel):
    runtime: RuntimeConfig


class ConfigValidateResponse(BaseModel):
    ok: bool
    message: str


class CancelledByUser(Exception):
    pass


@dataclass
class TaskBundle:
    task: TaskStatus
    req: CreateTaskRequest
    events: list[Dict[str, Any]] = field(default_factory=list)
    condition: asyncio.Condition = field(default_factory=asyncio.Condition)
    cancel_requested: asyncio.Event = field(default_factory=asyncio.Event)
    worker: Optional[asyncio.Task] = None
    context: Dict[str, Any] = field(default_factory=dict)


class DeepSolveTaskManager:
    def __init__(self) -> None:
        self._tasks: dict[str, TaskBundle] = {}
        self._lock = asyncio.Lock()
        self._pipeline_semaphore = asyncio.Semaphore(PIPELINE_MAX_CONCURRENCY)

    async def create_task(self, req: CreateTaskRequest, base_url: str) -> CreateTaskResponse:
        if not req.input.question.strip():
            raise HTTPException(status_code=400, detail="input.question cannot be empty")

        task_id = f"dsv_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
        created_at = utc_now_iso()
        stages = {stage: StageStatus() for stage in STAGES}
        task = TaskStatus(
            task_id=task_id,
            state="queued",
            stages=stages,
            created_at=created_at,
        )
        bundle = TaskBundle(task=task, req=req)
        bundle.context["base_url"] = base_url

        async with self._lock:
            self._tasks[task_id] = bundle

        bundle.worker = asyncio.create_task(self._run_phase2_pipeline(bundle))

        events_url = f"{base_url}{DEEP_SOLVE_PREFIX}/tasks/{task_id}/events"
        status_url = f"{base_url}{DEEP_SOLVE_PREFIX}/tasks/{task_id}"
        cancel_url = f"{base_url}{DEEP_SOLVE_PREFIX}/tasks/{task_id}/cancel"
        return CreateTaskResponse(
            task_id=task_id,
            state=task.state,
            events_url=events_url,
            status_url=status_url,
            cancel_url=cancel_url,
            created_at=created_at,
        )

    async def get_task(self, task_id: str) -> TaskStatus:
        async with self._lock:
            bundle = self._tasks.get(task_id)
        if not bundle:
            raise HTTPException(status_code=404, detail="task not found")
        return bundle.task

    async def get_video_path(self, task_id: str) -> str:
        """Resolve the final merged MP4 path for a succeeded task, for HTTP download."""
        async with self._lock:
            bundle = self._tasks.get(task_id)
        if not bundle:
            raise HTTPException(status_code=404, detail="task not found")
        path = bundle.context.get("final_video_path")
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=409, detail="final video not ready")
        return path

    async def cancel_task(self, task_id: str) -> CancelTaskResponse:
        async with self._lock:
            bundle = self._tasks.get(task_id)
        if not bundle:
            raise HTTPException(status_code=404, detail="task not found")

        if bundle.task.state in TERMINAL_STATES:
            return CancelTaskResponse(task_id=task_id, state=bundle.task.state)

        bundle.cancel_requested.set()
        await self._append_event(
            bundle,
            event="stage_log",
            stage=bundle.task.current_stage,
            payload={"level": "info", "message": "Cancellation requested"},
        )
        return CancelTaskResponse(task_id=task_id, state=bundle.task.state)

    async def get_events_since(self, task_id: str, last_seq: int) -> tuple[list[Dict[str, Any]], bool]:
        async with self._lock:
            bundle = self._tasks.get(task_id)
        if not bundle:
            raise HTTPException(status_code=404, detail="task not found")

        async with bundle.condition:
            if len(bundle.events) <= last_seq and bundle.task.state not in TERMINAL_STATES:
                try:
                    await asyncio.wait_for(bundle.condition.wait(), timeout=15)
                except asyncio.TimeoutError:
                    return [], bundle.task.state in TERMINAL_STATES
            return bundle.events[last_seq:], bundle.task.state in TERMINAL_STATES

    async def _append_event(
        self,
        bundle: TaskBundle,
        event: str,
        stage: Optional[str],
        payload: Dict[str, Any],
    ) -> None:
        async with bundle.condition:
            seq = len(bundle.events) + 1
            envelope = {
                "task_id": bundle.task.task_id,
                "seq": seq,
                "event": event,
                "stage": stage,
                "at": utc_now_iso(),
                "payload": payload,
            }
            bundle.events.append(envelope)
            bundle.condition.notify_all()

    async def _emit_stage_log(self, bundle: TaskBundle, stage: Optional[str], message: str, level: str = "info") -> None:
        await self._append_event(bundle, "stage_log", stage, {"level": level, "message": message})

    async def _emit_stage_result(self, bundle: TaskBundle, stage: str, payload: Dict[str, Any]) -> None:
        await self._append_event(bundle, "stage_result", stage, payload)

    async def _record_artifact(self, bundle: TaskBundle, kind: str, path: Path, url: Optional[str] = None) -> None:
        abs_path = str(path.resolve())
        if any(a.kind == kind and a.path == abs_path for a in bundle.task.artifacts):
            return
        bundle.task.artifacts.append(Artifact(kind=kind, path=abs_path, url=url))

    def _final_video_url(self, bundle: TaskBundle) -> Optional[str]:
        """HTTP URL where the final video can be downloaded (served by the /video route)."""
        base_url = bundle.context.get("base_url")
        if not base_url:
            return None
        return f"{base_url}{DEEP_SOLVE_PREFIX}/tasks/{bundle.task.task_id}/video"

    @staticmethod
    def _calc_progress(task: TaskStatus) -> float:
        completed = 0
        running = 0
        for stage in STAGES:
            state = task.stages[stage].state
            if state in {"succeeded", "failed", "cancelled"}:
                completed += 1
            elif state == "running":
                running += 1
        total = len(STAGES)
        if total == 0:
            return 0.0
        return round(((completed + 0.5 * running) / total) * 100, 2)

    async def _set_task_running(self, bundle: TaskBundle) -> None:
        bundle.task.state = "running"
        bundle.task.started_at = utc_now_iso()
        bundle.task.progress = self._calc_progress(bundle.task)

    async def _set_stage_running(self, bundle: TaskBundle, stage: str, title: str) -> None:
        bundle.task.current_stage = stage
        stage_ref = bundle.task.stages[stage]
        stage_ref.state = "running"
        stage_ref.started_at = utc_now_iso()
        stage_ref.finished_at = None
        stage_ref.message = title
        bundle.task.progress = self._calc_progress(bundle.task)
        await self._append_event(bundle, "stage_started", stage, {"title": title})

    async def _set_stage_succeeded(self, bundle: TaskBundle, stage: str, message: str) -> None:
        stage_ref = bundle.task.stages[stage]
        stage_ref.state = "succeeded"
        stage_ref.finished_at = utc_now_iso()
        stage_ref.message = message
        bundle.task.progress = self._calc_progress(bundle.task)

    async def _set_task_succeeded(self, bundle: TaskBundle, summary: str, final_video_path: Optional[str]) -> None:
        bundle.task.state = "succeeded"
        bundle.task.finished_at = utc_now_iso()
        bundle.task.progress = 100.0
        await self._append_event(
            bundle,
            "task_done",
            None,
            {
                "state": "succeeded",
                "summary": summary,
                "final_video_url": self._final_video_url(bundle) if final_video_path else None,
                "final_video_path": final_video_path,
            },
        )

    async def _set_task_failed(self, bundle: TaskBundle, stage: Optional[str], err: ErrorObject) -> None:
        if stage and stage in bundle.task.stages:
            stage_ref = bundle.task.stages[stage]
            if stage_ref.state == "running":
                stage_ref.state = "failed"
                stage_ref.finished_at = utc_now_iso()
                stage_ref.message = err.message
        bundle.task.state = "failed"
        bundle.task.error = err
        bundle.task.finished_at = utc_now_iso()
        bundle.task.progress = self._calc_progress(bundle.task)
        if stage:
            await self._append_event(bundle, "stage_error", stage, {"error": err.model_dump()})
        await self._append_event(
            bundle,
            "task_done",
            None,
            {
                "state": "failed",
                "summary": err.message,
                "final_video_url": None,
                "final_video_path": None,
            },
        )

    async def _set_task_cancelled(self, bundle: TaskBundle) -> None:
        current = bundle.task.current_stage
        if current and bundle.task.stages[current].state == "running":
            stage_ref = bundle.task.stages[current]
            stage_ref.state = "cancelled"
            stage_ref.finished_at = utc_now_iso()
            stage_ref.message = "Cancelled by user"
        bundle.task.state = "cancelled"
        bundle.task.finished_at = utc_now_iso()
        bundle.task.progress = self._calc_progress(bundle.task)
        await self._append_event(bundle, "task_done", None, {"state": "cancelled", "summary": "Cancelled"})

    def _raise_if_cancelled(self, bundle: TaskBundle) -> None:
        if bundle.cancel_requested.is_set():
            raise CancelledByUser("Task cancelled by user")

    @staticmethod
    def _load_iconfinder_api_key() -> str:
        cfg_path = Path(__file__).with_name("api_config.json")
        if not cfg_path.exists():
            return ""
        try:
            data = json.loads(cfg_path.read_text(encoding="utf-8"))
            return str(data.get("iconfinder", {}).get("api_key", "") or "")
        except Exception:
            return ""

    @staticmethod
    def _set_env_if_value(service: str, key: str, value: Optional[str]) -> None:
        if value is None:
            return
        text = str(value).strip()
        if not text:
            return
        os.environ[f"{service}_{key}".upper()] = text

    def _apply_runtime_api_override(self, runtime: RuntimeConfig) -> str:
        provider = runtime.provider or "gpt-41"
        if provider not in PROVIDER_CHOICES:
            raise ValueError(f"Unsupported provider: {provider}")
        service = API_NAME_TO_SERVICE[provider]

        self._set_env_if_value(service, "model", runtime.model)
        self._set_env_if_value(service, "base_url", runtime.base_url)
        self._set_env_if_value(service, "api_key", runtime.api_key)
        if runtime.api_type and runtime.api_type != "auto":
            self._set_env_if_value(service, "api_type", runtime.api_type)

        # Backward compatibility for legacy env key naming.
        if service == "gpto4mini":
            self._set_env_if_value("gpt4omini", "model", runtime.model)
            self._set_env_if_value("gpt4omini", "base_url", runtime.base_url)
            self._set_env_if_value("gpt4omini", "api_key", runtime.api_key)
            if runtime.api_type and runtime.api_type != "auto":
                self._set_env_if_value("gpt4omini", "api_type", runtime.api_type)

        return provider

    async def _build_agent_for_task(self, bundle: TaskBundle) -> Any:
        from agent import RunConfig, TeachingVideoAgent, get_api_and_output

        runtime = bundle.req.runtime
        options = bundle.req.options
        provider = self._apply_runtime_api_override(runtime)

        api_func, folder_name = get_api_and_output(provider)
        project_root = Path(__file__).resolve().parent.parent
        folder = project_root / "CASES" / f"DEEP-SOLVE_{folder_name}"
        iconfinder_api_key = self._load_iconfinder_api_key()

        cfg = RunConfig(
            use_feedback=options.use_feedback,
            use_assets=options.use_assets,
            api=api_func,
            feedback_rounds=options.feedback_rounds,
            iconfinder_api_key=iconfinder_api_key,
            max_code_token_length=options.max_code_token_length,
            max_fix_bug_tries=options.max_fix_bug_tries,
            max_regenerate_tries=options.max_regenerate_tries,
            max_feedback_gen_code_tries=options.max_feedback_gen_code_tries,
            max_mllm_fix_bugs_tries=options.max_mllm_fix_bugs_tries,
        )
        idx = int(uuid.uuid4().int % 1_000_000)
        knowledge_point = to_topic(bundle.req.input.question)
        return TeachingVideoAgent(idx=idx, knowledge_point=knowledge_point, folder=folder, cfg=cfg)

    async def _run_phase2_pipeline(self, bundle: TaskBundle) -> None:
        await self._set_task_running(bundle)
        await self._append_event(
            bundle,
            event="task_started",
            stage=None,
            payload={
                "input_summary": {
                    "question": bundle.req.input.question,
                    "context": bundle.req.input.context,
                },
                "runtime": {
                    "provider": bundle.req.runtime.provider or "gpt-41",
                    "base_url": bundle.req.runtime.base_url,
                    "model": bundle.req.runtime.model,
                    "llm1_model": bundle.req.runtime.llm1_model,
                    "llm2_model": bundle.req.runtime.llm2_model,
                    "api_type": bundle.req.runtime.api_type,
                    "api_key": redact_secret(bundle.req.runtime.api_key),
                },
                "options": bundle.req.options.model_dump(),
            },
        )

        try:
            if self._pipeline_semaphore.locked():
                await self._emit_stage_log(bundle, None, "Another deep-solve task is running. Waiting for execution slot.")

            async with self._pipeline_semaphore:
                await self._execute_pipeline(bundle)

            final_video_path = bundle.context.get("final_video_path")
            await self._set_task_succeeded(
                bundle,
                summary="Solve pipeline completed successfully",
                final_video_path=final_video_path,
            )
        except CancelledByUser:
            await self._set_task_cancelled(bundle)
        except Exception as exc:
            stage = bundle.task.current_stage
            err = ErrorObject(
                code="PIPELINE_STAGE_FAILED",
                message=str(exc),
                stage=stage,
                retryable=False,
                details={"type": exc.__class__.__name__},
            )
            await self._set_task_failed(bundle, stage=stage, err=err)

    async def _execute_pipeline(self, bundle: TaskBundle) -> None:
        from solve_pipeline import run_llm1_solve_text, run_llm2_solve_plan
        from solve_to_storyboard import apply_storyboard_to_agent, solve_plan_file_to_storyboard_file

        self._raise_if_cancelled(bundle)
        agent = await self._build_agent_for_task(bundle)
        output_dir = agent.output_dir
        bundle.context["agent"] = agent
        bundle.context["output_dir"] = output_dir

        question_input = compose_question(bundle.req.input.question, bundle.req.input.context)
        if not question_input.strip():
            raise ValueError("Question is required for solve pipeline")

        runtime = bundle.req.runtime
        options = bundle.req.options
        base_url = runtime.base_url or None
        api_key = runtime.api_key or None
        llm1_model = runtime.llm1_model or runtime.model or None
        llm2_model = runtime.llm2_model or runtime.model or None

        solution_path = output_dir / "solution.txt"
        solve_plan_path = output_dir / "solve_plan.json"
        storyboard_path = output_dir / "storyboard_from_solve.json"

        # Stage 1: llm1
        stage = "llm1"
        await self._set_stage_running(bundle, stage=stage, title="Run Solve LLM1")
        await self._emit_stage_log(bundle, stage, "Generating solution text from question.")
        solution_text = await asyncio.to_thread(
            run_llm1_solve_text,
            question=question_input,
            output_path=solution_path,
            model=llm1_model,
            base_url=base_url,
            api_key=api_key,
            max_tokens=4000,
        )
        await self._record_artifact(bundle, "solution_text", solution_path)
        await self._set_stage_succeeded(bundle, stage, "LLM1 completed")
        await self._emit_stage_result(
            bundle,
            stage,
            {
                "solution_path": str(solution_path.resolve()),
                "solution_preview": (solution_text or "")[:4000],
                "token_usage": None,
            },
        )
        self._raise_if_cancelled(bundle)

        # Stage 2: llm2
        stage = "llm2"
        await self._set_stage_running(bundle, stage=stage, title="Run Solve LLM2")
        await self._emit_stage_log(bundle, stage, "Structuring solution into solve_plan.json.")
        plan = await asyncio.to_thread(
            run_llm2_solve_plan,
            question=question_input,
            solution=(solution_text or "").strip() or read_text_preview(solution_path, limit=12000),
            output_path=solve_plan_path,
            model=llm2_model,
            base_url=base_url,
            api_key=api_key,
            max_tokens=4000,
        )
        sections_count = len(getattr(plan, "video_sections", []) or [])
        await self._record_artifact(bundle, "solve_plan", solve_plan_path)
        await self._set_stage_succeeded(bundle, stage, "LLM2 completed")
        await self._emit_stage_result(
            bundle,
            stage,
            {
                "solve_plan_path": str(solve_plan_path.resolve()),
                "solve_plan_preview": read_json_preview(solve_plan_path),
                "sections_count": sections_count,
                "token_usage": None,
            },
        )
        self._raise_if_cancelled(bundle)

        # Stage 3: storyboard
        stage = "storyboard"
        await self._set_stage_running(bundle, stage=stage, title="Convert solve plan to storyboard")
        await self._emit_stage_log(bundle, stage, "Adapting solve plan into storyboard sections.")
        storyboard = await asyncio.to_thread(
            solve_plan_file_to_storyboard_file,
            solve_plan_path=solve_plan_path,
            storyboard_path=storyboard_path,
        )
        storyboard_sections = len((storyboard or {}).get("sections", []))
        await self._record_artifact(bundle, "storyboard", storyboard_path)
        await self._set_stage_succeeded(bundle, stage, "Storyboard generated")
        await self._emit_stage_result(
            bundle,
            stage,
            {
                "storyboard_path": str(storyboard_path.resolve()),
                "storyboard_preview": read_json_preview(storyboard_path),
                "sections_count": storyboard_sections,
            },
        )
        self._raise_if_cancelled(bundle)
        sections_total = apply_storyboard_to_agent(agent, storyboard)

        # Stage 4: audio
        stage = "audio"
        await self._set_stage_running(bundle, stage=stage, title="Generate section audio")
        await self._emit_stage_log(bundle, stage, "Generating TTS audio for storyboard sections.")
        await asyncio.to_thread(agent.generate_audio)
        audio_items = []
        for section in agent.sections:
            audio_path = Path(section.audio_path) if section.audio_path else None
            if audio_path and audio_path.exists():
                await self._record_artifact(bundle, "section_audio", audio_path)
                audio_items.append(
                    {
                        "section_id": section.id,
                        "audio_path": str(audio_path.resolve()),
                        "duration_sec": float(section.audio_duration or 0.0),
                    }
                )
        await self._set_stage_succeeded(bundle, stage, "Audio generation completed")
        await self._emit_stage_result(
            bundle,
            stage,
            {
                "audio_count": len(audio_items),
                "section_audio": audio_items,
            },
        )
        self._raise_if_cancelled(bundle)

        # Stage 5: code
        stage = "code"
        await self._set_stage_running(bundle, stage=stage, title="Generate animation code")
        await self._emit_stage_log(bundle, stage, "Generating code files for storyboard sections.")
        section_codes = await asyncio.to_thread(agent.generate_codes)
        generated_files = []
        for section_id in sorted(section_codes.keys()):
            code_file = output_dir / f"{section_id}.py"
            if code_file.exists():
                generated_files.append(str(code_file.resolve()))
                await self._record_artifact(bundle, "section_code", code_file)
        sections_ok = len([c for c in section_codes.values() if isinstance(c, str) and c.strip()])
        sections_failed = max(0, sections_total - sections_ok)
        await self._set_stage_succeeded(bundle, stage, "Code generation completed")
        await self._emit_stage_result(
            bundle,
            stage,
            {
                "generated_files": generated_files,
                "sections_total": sections_total,
                "sections_ok": sections_ok,
                "sections_failed": sections_failed,
            },
        )
        self._raise_if_cancelled(bundle)

        # Stage 6: render
        stage = "render"
        await self._set_stage_running(bundle, stage=stage, title="Render section videos")
        await self._emit_stage_log(bundle, stage, "Rendering section videos with Manim.")
        section_videos = await asyncio.to_thread(agent.render_all_sections, int(options.max_render_workers))
        rendered_count = len(section_videos)
        failed_count = max(0, sections_total - rendered_count)
        section_videos_abs: Dict[str, str] = {}
        for sid, path in section_videos.items():
            abs_path = str(Path(path).resolve())
            section_videos_abs[sid] = abs_path
            await self._record_artifact(bundle, "section_video", Path(abs_path))
        await self._set_stage_succeeded(bundle, stage, "Render step completed")
        await self._emit_stage_result(
            bundle,
            stage,
            {
                "section_videos": section_videos_abs,
                "rendered_count": rendered_count,
                "failed_count": failed_count,
            },
        )
        self._raise_if_cancelled(bundle)

        # Stage 7: merge
        stage = "merge"
        await self._set_stage_running(bundle, stage=stage, title="Merge section videos")
        await self._emit_stage_log(bundle, stage, "Merging rendered videos into final output.")
        final_video_path_str = await asyncio.to_thread(agent.merge_videos)
        if not final_video_path_str:
            raise RuntimeError("Merge failed: final video path is empty")
        final_video_path = Path(final_video_path_str).resolve()
        duration_sec = await asyncio.to_thread(ffprobe_duration_seconds, final_video_path)
        bundle.context["final_video_path"] = str(final_video_path)
        final_video_url = self._final_video_url(bundle)
        await self._record_artifact(bundle, "final_video", final_video_path, url=final_video_url)
        await self._set_stage_succeeded(bundle, stage, "Merge completed")
        await self._emit_stage_result(
            bundle,
            stage,
            {
                "final_video_path": str(final_video_path),
                "final_video_url": final_video_url,
                "duration_sec": duration_sec,
            },
        )


task_manager = DeepSolveTaskManager()

app = FastAPI(title="Code2Video Deep Solve Bridge", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def read_root() -> JSONResponse:
    return JSONResponse({"message": "Code2Video Deep Solve Bridge is running."})


@app.post(f"{DEEP_SOLVE_PREFIX}/tasks", response_model=CreateTaskResponse, status_code=202)
async def create_deep_solve_task(req: CreateTaskRequest, request: Request) -> CreateTaskResponse:
    return await task_manager.create_task(req=req, base_url=str(request.base_url).rstrip("/"))


@app.get(f"{DEEP_SOLVE_PREFIX}/tasks/{{task_id}}", response_model=TaskStatus)
async def get_task_status(task_id: str) -> TaskStatus:
    return await task_manager.get_task(task_id)


@app.get(f"{DEEP_SOLVE_PREFIX}/tasks/{{task_id}}/events")
async def stream_task_events(task_id: str, last_seq: int = 0) -> StreamingResponse:
    if last_seq < 0:
        raise HTTPException(status_code=400, detail="last_seq must be >= 0")

    async def event_generator() -> Any:
        cursor = last_seq
        while True:
            events, terminal = await task_manager.get_events_since(task_id=task_id, last_seq=cursor)
            if events:
                for event in events:
                    cursor = int(event["seq"])
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            else:
                yield ": keep-alive\n\n"

            if terminal and not events:
                break

    headers = {
        "Cache-Control": "no-store",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), headers=headers)


@app.get(f"{DEEP_SOLVE_PREFIX}/tasks/{{task_id}}/video")
async def download_task_video(task_id: str) -> FileResponse:
    path = await task_manager.get_video_path(task_id)
    return FileResponse(path, media_type="video/mp4", filename=os.path.basename(path))


@app.post(f"{DEEP_SOLVE_PREFIX}/tasks/{{task_id}}/cancel", response_model=CancelTaskResponse)
async def cancel_task(task_id: str) -> CancelTaskResponse:
    return await task_manager.cancel_task(task_id)


@app.post(f"{DEEP_SOLVE_PREFIX}/config/validate", response_model=ConfigValidateResponse)
async def validate_runtime_config(req: ConfigValidateRequest) -> ConfigValidateResponse:
    runtime = req.runtime

    if runtime.provider and runtime.provider not in PROVIDER_CHOICES:
        return ConfigValidateResponse(ok=False, message=f"Unsupported provider: {runtime.provider}")

    has_key = bool((runtime.api_key or "").strip())
    has_base = bool((runtime.base_url or "").strip())
    has_model = bool((runtime.model or runtime.llm1_model or runtime.llm2_model or "").strip())

    if not has_key:
        return ConfigValidateResponse(ok=False, message="api_key is required")
    if not has_base:
        return ConfigValidateResponse(ok=False, message="base_url is required")
    if not has_model:
        return ConfigValidateResponse(ok=False, message="model (or llm1_model/llm2_model) is required")

    return ConfigValidateResponse(ok=True, message="runtime config looks valid")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8010)
