import io
import json
import os
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

import streamlit as st

from agent import RunConfig, TeachingVideoAgent, get_api_and_output
from solve_pipeline import run_llm1_solve_text, run_llm2_solve_plan, run_solve_pipeline
from solve_to_storyboard import apply_storyboard_to_agent, render_with_existing_agent_pipeline, solve_plan_file_to_storyboard_file
from utils import extract_answer_from_response


st.set_page_config(page_title="Code2Video Debug GUI", layout="wide")
st.title("Code2Video Debug GUI")

API_NAME_TO_SERVICE = {
    "gpt-41": "gpt41",
    "claude": "claude",
    "gpt-5": "gpt5",
    "gpt-4o": "gpt4o",
    "gpt-o4mini": "gpto4mini",
    "Gemini": "gemini",
}


def _set_env_if_value(service: str, key: str, value: str) -> None:
    if not value:
        return
    os.environ[f"{service}_{key}".upper()] = value


def apply_runtime_api_override(
    api_name: str,
    runtime_model: str,
    runtime_base_url: str,
    runtime_api_key: str,
    runtime_api_type: str,
) -> None:
    svc = API_NAME_TO_SERVICE[api_name]
    _set_env_if_value(svc, "model", runtime_model)
    _set_env_if_value(svc, "base_url", runtime_base_url)
    _set_env_if_value(svc, "api_key", runtime_api_key)
    if runtime_api_type and runtime_api_type != "auto":
        _set_env_if_value(svc, "api_type", runtime_api_type)

    # Keep backward compatibility for legacy o4-mini env key naming.
    if svc == "gpto4mini":
        _set_env_if_value("gpt4omini", "model", runtime_model)
        _set_env_if_value("gpt4omini", "base_url", runtime_base_url)
        _set_env_if_value("gpt4omini", "api_key", runtime_api_key)
        if runtime_api_type and runtime_api_type != "auto":
            _set_env_if_value("gpt4omini", "api_type", runtime_api_type)


def capture_call(fn: Callable, *args, **kwargs) -> Tuple[Any, str, Optional[Exception]]:
    buf = io.StringIO()
    result = None
    err = None
    try:
        with redirect_stdout(buf), redirect_stderr(buf):
            result = fn(*args, **kwargs)
    except Exception as e:  # noqa: BLE001
        err = e
    return result, buf.getvalue(), err


def build_agent(
    idx: int,
    knowledge_point: str,
    api_name: str,
    folder_prefix: str,
    use_feedback: bool,
    use_assets: bool,
    max_code_token_length: int,
    max_fix_bug_tries: int,
    max_regenerate_tries: int,
    max_feedback_gen_code_tries: int,
    max_mllm_fix_bugs_tries: int,
    feedback_rounds: int,
    iconfinder_api_key: str,
    runtime_model: str,
    runtime_base_url: str,
    runtime_api_key: str,
    runtime_api_type: str,
) -> TeachingVideoAgent:
    apply_runtime_api_override(
        api_name=api_name,
        runtime_model=runtime_model,
        runtime_base_url=runtime_base_url,
        runtime_api_key=runtime_api_key,
        runtime_api_type=runtime_api_type,
    )
    api_func, folder_name = get_api_and_output(api_name)
    project_root = Path(__file__).resolve().parent.parent
    folder = project_root / "CASES" / f"{folder_prefix}_{folder_name}"
    cfg = RunConfig(
        use_feedback=use_feedback,
        use_assets=use_assets,
        api=api_func,
        feedback_rounds=feedback_rounds,
        iconfinder_api_key=iconfinder_api_key,
        max_code_token_length=max_code_token_length,
        max_fix_bug_tries=max_fix_bug_tries,
        max_regenerate_tries=max_regenerate_tries,
        max_feedback_gen_code_tries=max_feedback_gen_code_tries,
        max_mllm_fix_bugs_tries=max_mllm_fix_bugs_tries,
    )
    return TeachingVideoAgent(idx=idx, knowledge_point=knowledge_point, folder=folder, cfg=cfg)


def run_stage(agent: TeachingVideoAgent, stage: str, max_render_workers: int) -> Any:
    if stage == "outline":
        return agent.generate_outline()
    if stage == "storyboard":
        agent.generate_outline()
        return agent.generate_storyboard()
    if stage == "code":
        agent.generate_outline()
        agent.generate_storyboard()
        return agent.generate_codes()
    if stage == "render":
        agent.generate_outline()
        agent.generate_storyboard()
        agent.generate_codes()
        return agent.render_all_sections(max_workers=max_render_workers)
    if stage == "merge":
        agent.generate_outline()
        agent.generate_storyboard()
        agent.generate_codes()
        agent.render_all_sections(max_workers=max_render_workers)
        return agent.merge_videos()
    if stage == "full":
        return agent.GENERATE_VIDEO()
    raise ValueError(f"Unknown stage: {stage}")


def show_file_preview(file_path: Path) -> None:
    suffix = file_path.suffix.lower()
    if suffix in {".json", ".py", ".txt", ".md", ".log", ".yaml", ".yml"}:
        text = file_path.read_text(encoding="utf-8", errors="replace")
        st.code(text[:200000], language="python" if suffix == ".py" else None)
    elif suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        st.image(str(file_path))
    elif suffix in {".mp4", ".mov", ".webm"}:
        st.video(str(file_path))
    else:
        st.info("Preview not supported for this file type.")


def _compose_solve_input(question: str, context: str) -> str:
    q = (question or "").strip()
    c = (context or "").strip()
    if q and c:
        return f"{q}\n\nContext:\n{c}"
    return q or c


def _topic_for_output(question: str, fallback: str) -> str:
    base = " ".join((question or "").split())
    if not base:
        base = fallback
    return base[:80]


def run_solve_stage(
    stage: str,
    agent: TeachingVideoAgent,
    solve_question: str,
    solve_context: str,
    llm1_model: str,
    llm2_model: str,
    solve_base_url: str,
    solve_api_key: str,
    llm1_max_tokens: int,
    llm2_max_tokens: int,
    max_render_workers: int,
) -> Dict[str, Any]:
    output_dir = agent.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    question_input = _compose_solve_input(solve_question, solve_context)
    if not question_input.strip():
        raise ValueError("Question is required for solve pipeline")

    solution_path = output_dir / "solution.txt"
    solve_plan_path = output_dir / "solve_plan.json"
    storyboard_path = output_dir / "storyboard_from_solve.json"

    def _ensure_plan() -> None:
        if solve_plan_path.exists():
            return
        if solution_path.exists():
            solution_text = solution_path.read_text(encoding="utf-8").strip()
            if not solution_text:
                solution_text = run_llm1_solve_text(
                    question=question_input,
                    output_path=solution_path,
                    model=llm1_model or None,
                    base_url=solve_base_url or None,
                    api_key=solve_api_key or None,
                    max_tokens=int(llm1_max_tokens),
                )
            run_llm2_solve_plan(
                question=question_input,
                solution=solution_text,
                output_path=solve_plan_path,
                model=llm2_model or None,
                base_url=solve_base_url or None,
                api_key=solve_api_key or None,
                max_tokens=int(llm2_max_tokens),
            )
            return
        run_solve_pipeline(
            question=question_input,
            output_dir=output_dir,
            llm1_model=llm1_model or None,
            llm2_model=llm2_model or None,
            base_url=solve_base_url or None,
            api_key=solve_api_key or None,
            llm1_max_tokens=int(llm1_max_tokens),
            llm2_max_tokens=int(llm2_max_tokens),
        )

    if stage == "llm1":
        solution_text = run_llm1_solve_text(
            question=question_input,
            output_path=solution_path,
            model=llm1_model or None,
            base_url=solve_base_url or None,
            api_key=solve_api_key or None,
            max_tokens=int(llm1_max_tokens),
        )
        return {
            "stage": stage,
            "output_dir": str(output_dir),
            "solution_path": str(solution_path),
            "solution_preview": solution_text[:4000],
        }

    if stage == "llm2":
        if solution_path.exists():
            solution_text = solution_path.read_text(encoding="utf-8").strip()
        else:
            solution_text = run_llm1_solve_text(
                question=question_input,
                output_path=solution_path,
                model=llm1_model or None,
                base_url=solve_base_url or None,
                api_key=solve_api_key or None,
                max_tokens=int(llm1_max_tokens),
            )
        plan = run_llm2_solve_plan(
            question=question_input,
            solution=solution_text,
            output_path=solve_plan_path,
            model=llm2_model or None,
            base_url=solve_base_url or None,
            api_key=solve_api_key or None,
            max_tokens=int(llm2_max_tokens),
        )
        return {
            "stage": stage,
            "output_dir": str(output_dir),
            "solution_path": str(solution_path),
            "solve_plan_path": str(solve_plan_path),
            "steps": len(plan.steps),
            "video_sections": len(plan.video_sections),
        }

    if stage == "adapter":
        _ensure_plan()
        storyboard = solve_plan_file_to_storyboard_file(solve_plan_path=solve_plan_path, storyboard_path=storyboard_path)
        return {
            "stage": stage,
            "output_dir": str(output_dir),
            "solve_plan_path": str(solve_plan_path),
            "storyboard_path": str(storyboard_path),
            "sections": len(storyboard.get("sections", [])),
        }

    if stage == "code":
        _ensure_plan()
        if not storyboard_path.exists():
            solve_plan_file_to_storyboard_file(solve_plan_path=solve_plan_path, storyboard_path=storyboard_path)
        storyboard = json.loads(storyboard_path.read_text(encoding="utf-8"))
        section_count = apply_storyboard_to_agent(agent=agent, storyboard=storyboard)
        if section_count == 0:
            raise ValueError("No valid sections found in storyboard")
        code_map = agent.generate_codes()
        code_files = [str(output_dir / f"{section_id}.py") for section_id in sorted(code_map.keys())]
        return {
            "stage": stage,
            "output_dir": str(output_dir),
            "storyboard_path": str(storyboard_path),
            "sections": section_count,
            "code_files": code_files,
        }

    if stage == "render":
        _ensure_plan()
        if not storyboard_path.exists():
            solve_plan_file_to_storyboard_file(solve_plan_path=solve_plan_path, storyboard_path=storyboard_path)
        storyboard = json.loads(storyboard_path.read_text(encoding="utf-8"))
        final_video = render_with_existing_agent_pipeline(agent=agent, storyboard=storyboard, max_render_workers=max_render_workers)
        return {
            "stage": stage,
            "output_dir": str(output_dir),
            "storyboard_path": str(storyboard_path),
            "final_video": str(final_video),
        }

    if stage == "full":
        run_solve_pipeline(
            question=question_input,
            output_dir=output_dir,
            llm1_model=llm1_model or None,
            llm2_model=llm2_model or None,
            base_url=solve_base_url or None,
            api_key=solve_api_key or None,
            llm1_max_tokens=int(llm1_max_tokens),
            llm2_max_tokens=int(llm2_max_tokens),
        )
        storyboard = solve_plan_file_to_storyboard_file(solve_plan_path=solve_plan_path, storyboard_path=storyboard_path)
        final_video = render_with_existing_agent_pipeline(agent=agent, storyboard=storyboard, max_render_workers=max_render_workers)
        return {
            "stage": stage,
            "output_dir": str(output_dir),
            "solution_path": str(solution_path),
            "solve_plan_path": str(solve_plan_path),
            "storyboard_path": str(storyboard_path),
            "final_video": str(final_video),
            "sections": len(storyboard.get("sections", [])),
        }

    raise ValueError(f"Unknown solve stage: {stage}")


if "last_output_dir" not in st.session_state:
    st.session_state["last_output_dir"] = ""
if "last_logs" not in st.session_state:
    st.session_state["last_logs"] = ""
if "last_result" not in st.session_state:
    st.session_state["last_result"] = None


with st.sidebar:
    st.header("Run Config")
    api_name = st.selectbox("API", ["gpt-41", "claude", "gpt-5", "gpt-4o", "gpt-o4mini", "Gemini"], index=0)
    knowledge_point = st.text_input("Knowledge Point", "Linear transformations and matrices")
    idx = st.number_input("Index", min_value=0, value=0, step=1)
    folder_prefix = st.text_input("Folder Prefix", "DEBUG")
    use_feedback = st.checkbox("Use Feedback", value=True)
    use_assets = st.checkbox("Use Assets", value=True)
    iconfinder_api_key = st.text_input("Iconfinder API Key (optional)", value="", type="password")

    st.subheader("Limits")
    max_code_token_length = st.number_input("Max Code Tokens", min_value=1000, value=10000, step=1000)
    max_fix_bug_tries = st.number_input("Max Fix Bug Tries", min_value=1, value=10, step=1)
    max_regenerate_tries = st.number_input("Max Regenerate Tries", min_value=1, value=10, step=1)
    max_feedback_gen_code_tries = st.number_input("Max Feedback Gen Code Tries", min_value=1, value=3, step=1)
    max_mllm_fix_bugs_tries = st.number_input("Max MLLM Fix Bugs Tries", min_value=1, value=3, step=1)
    feedback_rounds = st.number_input("Feedback Rounds", min_value=1, value=2, step=1)
    max_render_workers = st.number_input("Render Workers", min_value=1, value=2, step=1)

    st.subheader("Runtime API Override")
    runtime_model = st.text_input("Model (optional override)", value="")
    runtime_base_url = st.text_input("Base URL (optional override)", value="")
    runtime_api_key = st.text_input("API Key (optional override)", value="", type="password")
    runtime_api_type = st.selectbox(
        "API Type (optional override)",
        ["auto", "openai_compatible", "azure"],
        index=0,
    )


tab_api, tab_pipeline, tab_solver, tab_outputs = st.tabs(["API Smoke Test", "Pipeline", "Solve Pipeline", "Output Browser"])

with tab_api:
    st.subheader("Chat Completion Quick Test")
    prompt = st.text_area("Prompt", "You are a helpful assistant. Reply with one short line.")
    max_tokens_smoke = st.number_input("Max Tokens (Smoke)", min_value=32, value=256, step=32)
    if st.button("Run API Smoke Test", type="primary"):
        apply_runtime_api_override(
            api_name=api_name,
            runtime_model=runtime_model,
            runtime_base_url=runtime_base_url,
            runtime_api_key=runtime_api_key,
            runtime_api_type=runtime_api_type,
        )
        api_func, _ = get_api_and_output(api_name)
        with st.spinner("Calling API..."):
            response_bundle, logs, err = capture_call(api_func, prompt, max_tokens=int(max_tokens_smoke))
        if logs:
            st.caption("Runtime logs")
            st.code(logs)
        if err:
            st.error(f"API call failed: {err}")
        else:
            response, usage = response_bundle
            answer = extract_answer_from_response(response)
            st.success("API call succeeded.")
            st.write("Response")
            st.code(answer)
            st.write("Usage")
            st.json(usage)


with tab_pipeline:
    st.subheader("Run Agent Stages")
    pipeline_question_text = st.text_area(
        "Question / Knowledge Point (current run)",
        value=knowledge_point,
        help="If empty, sidebar Knowledge Point will be used.",
    )
    run_knowledge_point = (pipeline_question_text or "").strip() or knowledge_point

    col1, col2, col3 = st.columns(3)
    with col1:
        run_outline = st.button("Run Outline")
        run_code = st.button("Run Code")
    with col2:
        run_storyboard = st.button("Run Storyboard")
        run_render = st.button("Run Render")
    with col3:
        run_merge = st.button("Run Merge")
        run_full = st.button("Run Full Pipeline", type="primary")

    stage = None
    if run_outline:
        stage = "outline"
    elif run_storyboard:
        stage = "storyboard"
    elif run_code:
        stage = "code"
    elif run_render:
        stage = "render"
    elif run_merge:
        stage = "merge"
    elif run_full:
        stage = "full"

    if stage:
        agent = build_agent(
            idx=int(idx),
            knowledge_point=run_knowledge_point,
            api_name=api_name,
            folder_prefix=folder_prefix,
            use_feedback=use_feedback,
            use_assets=use_assets,
            max_code_token_length=int(max_code_token_length),
            max_fix_bug_tries=int(max_fix_bug_tries),
            max_regenerate_tries=int(max_regenerate_tries),
            max_feedback_gen_code_tries=int(max_feedback_gen_code_tries),
            max_mllm_fix_bugs_tries=int(max_mllm_fix_bugs_tries),
            feedback_rounds=int(feedback_rounds),
            iconfinder_api_key=iconfinder_api_key,
            runtime_model=runtime_model,
            runtime_base_url=runtime_base_url,
            runtime_api_key=runtime_api_key,
            runtime_api_type=runtime_api_type,
        )
        with st.spinner(f"Running stage: {stage}"):
            result, logs, err = capture_call(run_stage, agent, stage, int(max_render_workers))

        st.session_state["last_output_dir"] = str(agent.output_dir)
        st.session_state["last_logs"] = logs
        st.session_state["last_result"] = str(result)

        if err:
            st.error(f"Stage failed: {err}")
        else:
            st.success(f"Stage finished: {stage}")
            st.write("Question / Knowledge Point")
            st.code(run_knowledge_point)
            st.write("Output dir")
            st.code(str(agent.output_dir))
            st.write("Token usage")
            st.json(agent.token_usage)
            st.write("Stage result")
            st.code(str(result))

    if st.session_state["last_logs"]:
        st.caption("Captured logs")
        st.code(st.session_state["last_logs"][:200000])


with tab_solver:
    st.subheader("Run Solve Pipeline")
    st.caption("Flow: question -> solution.txt -> solve_plan.json -> storyboard_from_solve.json -> code/render/merge")

    solve_question = st.text_area(
        "Question Text",
        value="",
        placeholder="Example: Solve x^2 - 5x + 6 = 0",
        key="solve_question_text",
    )
    solve_context = st.text_area(
        "Extra Context (optional)",
        value="",
        placeholder="Optional constraints, known conditions, or expected style.",
        key="solve_context_text",
    )

    col_cfg1, col_cfg2 = st.columns(2)
    with col_cfg1:
        solve_llm1_model = st.text_input(
            "LLM1 Model",
            value=runtime_model or "MiniMax-M2.1",
            key="solve_llm1_model",
        )
        solve_base_url = st.text_input(
            "Solve Base URL",
            value=runtime_base_url or "",
            key="solve_base_url",
        )
        solve_llm1_max_tokens = st.number_input(
            "LLM1 Max Tokens",
            min_value=128,
            value=4000,
            step=128,
            key="solve_llm1_max_tokens",
        )
    with col_cfg2:
        solve_llm2_model = st.text_input(
            "LLM2 Model",
            value=runtime_model or "MiniMax-M2.1",
            key="solve_llm2_model",
        )
        solve_api_key = st.text_input(
            "Solve API Key",
            value=runtime_api_key or "",
            type="password",
            key="solve_api_key",
        )
        solve_llm2_max_tokens = st.number_input(
            "LLM2 Max Tokens",
            min_value=128,
            value=4000,
            step=128,
            key="solve_llm2_max_tokens",
        )

    col_a, col_b, col_c = st.columns(3)
    with col_a:
        run_solve_llm1 = st.button("Run Solve LLM1", key="run_solve_llm1")
        run_solve_adapter = st.button("Run Solve -> Storyboard", key="run_solve_adapter")
    with col_b:
        run_solve_llm2 = st.button("Run Solve LLM2", key="run_solve_llm2")
        run_solve_code = st.button("Run Storyboard -> Code", key="run_solve_code")
        run_solve_render = st.button("Run Solve Render", key="run_solve_render")
    with col_c:
        run_solve_full = st.button("Run Solve Full", type="primary", key="run_solve_full")

    solve_stage = None
    if run_solve_llm1:
        solve_stage = "llm1"
    elif run_solve_llm2:
        solve_stage = "llm2"
    elif run_solve_adapter:
        solve_stage = "adapter"
    elif run_solve_code:
        solve_stage = "code"
    elif run_solve_render:
        solve_stage = "render"
    elif run_solve_full:
        solve_stage = "full"

    if solve_stage:
        solve_topic = _topic_for_output(solve_question, knowledge_point)
        agent = build_agent(
            idx=int(idx),
            knowledge_point=solve_topic,
            api_name=api_name,
            folder_prefix=folder_prefix,
            use_feedback=use_feedback,
            use_assets=use_assets,
            max_code_token_length=int(max_code_token_length),
            max_fix_bug_tries=int(max_fix_bug_tries),
            max_regenerate_tries=int(max_regenerate_tries),
            max_feedback_gen_code_tries=int(max_feedback_gen_code_tries),
            max_mllm_fix_bugs_tries=int(max_mllm_fix_bugs_tries),
            feedback_rounds=int(feedback_rounds),
            iconfinder_api_key=iconfinder_api_key,
            runtime_model=runtime_model,
            runtime_base_url=runtime_base_url,
            runtime_api_key=runtime_api_key,
            runtime_api_type=runtime_api_type,
        )
        with st.spinner(f"Running solve stage: {solve_stage}"):
            solve_result, logs, err = capture_call(
                run_solve_stage,
                solve_stage,
                agent,
                solve_question,
                solve_context,
                solve_llm1_model,
                solve_llm2_model,
                solve_base_url,
                solve_api_key,
                int(solve_llm1_max_tokens),
                int(solve_llm2_max_tokens),
                int(max_render_workers),
            )

        st.session_state["last_output_dir"] = str(agent.output_dir)
        st.session_state["last_logs"] = logs
        st.session_state["last_result"] = str(solve_result)

        if err:
            st.error(f"Solve stage failed: {err}")
        else:
            st.success(f"Solve stage finished: {solve_stage}")
            st.write("Question")
            st.code((solve_question or "").strip() or knowledge_point)
            st.write("Output dir")
            st.code(str(agent.output_dir))
            st.write("Solve result")
            st.json(solve_result)

    if st.session_state["last_logs"]:
        st.caption("Captured logs")
        st.code(st.session_state["last_logs"][:200000])


with tab_outputs:
    st.subheader("Browse Generated Files")
    output_dir_input = st.text_input("Output Directory", st.session_state["last_output_dir"])
    output_dir = Path(output_dir_input) if output_dir_input else None

    if output_dir and output_dir.exists():
        files = [p for p in output_dir.rglob("*") if p.is_file()]
        files = sorted(files)
        if files:
            selected = st.selectbox("Select a file", [str(p) for p in files])
            show_file_preview(Path(selected))
        else:
            st.info("No files found in this output directory.")
    else:
        st.info("Run pipeline first, or input a valid output directory.")
