import openai
import time
import random
import os
import ssl
import base64
from openai import OpenAI
import json
import pathlib
import httpx
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse


@dataclass(frozen=True)
class LLMResponse:
    """Provider-neutral response consumed by solve/codegen/fix stages."""

    content: str
    usage: Optional[Dict[str, int]] = None
    finish_reason: Optional[str] = None

    @property
    def text(self) -> str:
        return self.content


def _usage_dict(usage: Any) -> Optional[Dict[str, int]]:
    if not usage:
        return None
    prompt_tokens = getattr(usage, "prompt_tokens", None)
    completion_tokens = getattr(usage, "completion_tokens", None)
    total_tokens = getattr(usage, "total_tokens", None)
    if prompt_tokens is None:
        prompt_tokens = getattr(usage, "prompt_token_count", None)
    if completion_tokens is None:
        completion_tokens = getattr(usage, "candidates_token_count", None)
    if total_tokens is None:
        total_tokens = getattr(usage, "total_token_count", None)
    if prompt_tokens is None and completion_tokens is None and total_tokens is None:
        return None
    return {
        "prompt_tokens": int(prompt_tokens or 0),
        "completion_tokens": int(completion_tokens or 0),
        "total_tokens": int(total_tokens or 0),
    }


def _usage_dict_from_vertex(usage: Any) -> Optional[Dict[str, int]]:
    if not isinstance(usage, dict):
        return None
    if not usage:
        return None
    return {
        "prompt_tokens": int(usage.get("promptTokenCount") or 0),
        "completion_tokens": int(usage.get("candidatesTokenCount") or 0),
        "total_tokens": int(usage.get("totalTokenCount") or 0),
    }


def _vertex_model_name(model: str) -> str:
    normalized = (model or "").strip()
    if normalized.startswith("google/"):
        normalized = normalized[len("google/") :]
    if normalized.startswith("publishers/google/models/"):
        normalized = normalized[len("publishers/google/models/") :]
    return normalized


def _vertex_contents(messages: List[Dict[str, Any]]) -> tuple[Optional[str], List[Dict[str, Any]]]:
    system_parts: List[str] = []
    contents: List[Dict[str, Any]] = []
    for message in messages:
        role = str(message.get("role") or "user")
        raw_content = message.get("content", "")
        if isinstance(raw_content, str):
            text = raw_content
        elif isinstance(raw_content, list):
            text = "\n".join(
                str(part.get("text") or "")
                for part in raw_content
                if isinstance(part, dict) and part.get("type") in (None, "text")
            )
        else:
            text = str(raw_content)
        if role == "system":
            if text:
                system_parts.append(text)
            continue
        contents.append(
            {
                "role": "model" if role == "assistant" else "user",
                "parts": [{"text": text}],
            }
        )
    return ("\n\n".join(system_parts) or None), contents


def _vertex_response_content(response: Dict[str, Any]) -> str:
    parts: List[str] = []
    for candidate in response.get("candidates", []) or []:
        content = candidate.get("content", {}) or {}
        for part in content.get("parts", []) or []:
            text = part.get("text")
            if text:
                parts.append(text)
    return "".join(parts)


def _request_metadata(provider: str, base_url: Optional[str], model: str) -> Dict[str, str]:
    if provider == "vertex-express":
        normalized_model = _vertex_model_name(model)
        return {
            "provider": provider,
            "host": "aiplatform.googleapis.com",
            "path": f"/v1/publishers/google/models/{normalized_model}:generateContent",
            "model": normalized_model,
            "authType": "x-goog-api-key",
        }
    parsed = urlparse(base_url or "https://api.openai.com/v1")
    return {
        "provider": provider,
        "host": parsed.netloc,
        "path": f"{parsed.path.rstrip('/')}/chat/completions",
        "model": model,
        "authType": "Bearer",
    }


def _is_transient_vertex_error(exc: Exception) -> bool:
    """Transient proxy/Vertex faults worth retrying: connection drops, SSL EOF,
    timeouts, and 429/5xx. Permanent 4xx (bad request/auth) must not retry."""
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        return code == 429 or 500 <= code < 600
    if isinstance(exc, (httpx.TransportError, httpx.TimeoutException, ConnectionError, ssl.SSLError)):
        return True
    msg = str(exc).upper()
    return "UNEXPECTED_EOF" in msg or "EOF OCCURRED" in msg or "CONNECTION RESET" in msg


def invoke_llm(
    *,
    provider: str,
    model: str,
    messages: List[Dict[str, Any]],
    api_key: str,
    base_url: Optional[str] = None,
    api_version: Optional[str] = None,
    max_tokens: int = 8000,
    extra_headers: Optional[Dict[str, str]] = None,
    http_client: Any = None,
) -> LLMResponse:
    """The single provider boundary used by solve, code generation and repair."""
    metadata = _request_metadata(provider, base_url, model)
    print(json.dumps({"event": "llm_request", **metadata}, ensure_ascii=False), flush=True)

    if provider == "vertex-express":
        system_instruction, contents = _vertex_contents(messages)
        request_body: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {"maxOutputTokens": max_tokens},
        }
        if system_instruction:
            request_body["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        url = f"https://{metadata['host']}{metadata['path']}"
        client = http_client or httpx.Client(timeout=120.0, trust_env=True)
        max_attempts = 4
        response = None
        for attempt in range(max_attempts):
            try:
                response = client.post(
                    url,
                    headers={
                        "content-type": "application/json",
                        "x-goog-api-key": api_key,
                    },
                    json=request_body,
                )
                response.raise_for_status()
                break
            except Exception as exc:
                if _is_transient_vertex_error(exc) and attempt < max_attempts - 1:
                    backoff = min(2**attempt, 8) + random.uniform(0, 0.5)
                    print(
                        json.dumps(
                            {
                                "event": "llm_retry",
                                "provider": provider,
                                "attempt": attempt + 1,
                                "max": max_attempts,
                                "reason": type(exc).__name__,
                                "backoff": round(backoff, 3),
                            },
                            ensure_ascii=False,
                        ),
                        flush=True,
                    )
                    time.sleep(backoff)
                    continue
                # Preserve the provider's error body; callers must never misreport it
                # as an empty model response.
                error_response = getattr(exc, "response", None)
                error_body = getattr(error_response, "text", "") if error_response is not None else ""
                detail = f"{exc}; response={error_body}" if error_body else str(exc)
                raise RuntimeError(f"vertex-express request failed: {detail}") from exc
        payload = response.json()
        finish_reason = None
        candidates = payload.get("candidates", []) or []
        if candidates:
            finish_reason = candidates[0].get("finishReason")
        return LLMResponse(
            content=_vertex_response_content(payload),
            usage=_usage_dict_from_vertex(payload.get("usageMetadata")),
            finish_reason=finish_reason,
        )

    if provider == "openai-compatible":
        kwargs: Dict[str, Any] = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        client = OpenAI(**kwargs)
    elif provider == "azure":
        client = openai.AzureOpenAI(
            azure_endpoint=base_url,
            api_version=api_version,
            api_key=api_key,
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")

    request_kwargs: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if extra_headers:
        request_kwargs["extra_headers"] = extra_headers
    completion = client.chat.completions.create(**request_kwargs)
    choice = completion.choices[0]
    return LLMResponse(
        content=choice.message.content or "",
        usage=_usage_dict(completion.usage),
        finish_reason=getattr(choice, "finish_reason", None),
    )


class LLMProviderAdapter:
    """Bound provider configuration shared by every Deep Solve LLM stage."""

    def __init__(
        self,
        *,
        provider: str,
        model: str,
        api_key: str,
        base_url: Optional[str] = None,
        api_version: Optional[str] = None,
    ) -> None:
        self.provider = provider
        self.model = model
        self.api_key = api_key
        self.base_url = base_url
        self.api_version = api_version

    def __call__(
        self,
        prompt: str,
        *,
        max_tokens: int = 8000,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> LLMResponse:
        messages: List[Dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        return self.invoke_messages(messages, max_tokens=max_tokens, model=model)

    def invoke_messages(
        self,
        messages: List[Dict[str, Any]],
        *,
        max_tokens: int = 8000,
        model: Optional[str] = None,
    ) -> LLMResponse:
        return invoke_llm(
            provider=self.provider,
            model=model or self.model,
            messages=messages,
            api_key=self.api_key,
            base_url=self.base_url,
            api_version=self.api_version,
            max_tokens=max_tokens,
        )


# Read and cache once
_CFG_PATH = pathlib.Path(__file__).with_name("api_config.json")
if _CFG_PATH.exists():
    with _CFG_PATH.open("r", encoding="utf-8") as _f:
        _CFG = json.load(_f)
else:
    print(f"WARNING: Config file not found: {_CFG_PATH}. Falling back to environment variables.")
    _CFG = {}


def cfg(svc: str, key: str, default=None):
    return os.getenv(f"{svc}_{key}".upper(), _CFG.get(svc, {}).get(key, default))


def cfg_o4mini(key: str, default=None):
    # Backward-compatible lookup: prefer current key `gpto4mini`, fallback to legacy `gpt4omini`.
    return cfg("gpto4mini", key, cfg("gpt4omini", key, default))


def resolve_api_type(svc: str, base_url: str, api_version: str = None) -> str:
    base_url_l = (base_url or "").lower()
    # Auto-detect SophNet/OpenAI-compatible style endpoints.
    if "sophnet.com" in base_url_l or "/open-apis/v1" in base_url_l:
        return "openai_compatible"

    api_type = str(cfg(svc, "api_type", "")).strip().lower()
    if api_type:
        return api_type

    return "azure" if api_version else "openai_compatible"


def is_openai_compatible(svc: str, base_url: str, api_version: str = None) -> bool:
    return resolve_api_type(svc, base_url, api_version) in {"openai", "openai_compatible", "compat"}


def create_client(svc: str, base_url: str, api_key: str, api_version: str = None):
    """
    Build an API client with compatibility for:
    - Azure OpenAI style: api_type='azure' (default when api_version exists)
    - OpenAI-compatible style: api_type='openai_compatible' (OpenAI SDK + base_url)
    """
    api_type = resolve_api_type(svc, base_url, api_version)

    if api_type in {"openai", "openai_compatible", "compat"}:
        kwargs = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        return OpenAI(**kwargs)

    return openai.AzureOpenAI(
        azure_endpoint=base_url,
        api_version=api_version,
        api_key=api_key,
    )


def build_text_messages(svc: str, prompt: str, base_url: str, api_version: str = None):
    # Strict OpenAI-compatible format requested by user example.
    if is_openai_compatible(svc, base_url, api_version):
        system_prompt = cfg(svc, "system_prompt", "你是SophNet智能助手")
        return [{"role": "system", "content": system_prompt}, {"role": "user", "content": prompt}]
    return [{"role": "user", "content": prompt}]


def generate_log_id():
    """Generate a log ID with 'tkb' prefix and current timestamp."""
    return f"tkb{int(time.time() * 1000)}"


def request_claude(prompt, log_id=None, max_tokens=16384, max_retries=3, model=None):
    base_url = cfg("claude", "base_url")
    api_version = cfg("claude", "api_version")
    api_key = cfg("claude", "api_key")
    model_name = model or cfg("claude", "model", "claude-4-opus")
    client = create_client("claude", base_url=base_url, api_key=api_key, api_version=api_version)
    messages = build_text_messages("claude", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    retry_count = 0
    while retry_count < max_retries:
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )

            return response.choices[0].message.content.strip()

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)


def request_claude_token(prompt, log_id=None, max_tokens=10000, max_retries=3, model=None):
    base_url = cfg("claude", "base_url")
    api_version = cfg("claude", "api_version")
    api_key = cfg("claude", "api_key")
    model_name = model or cfg("claude", "model", "claude-4-opus")
    client = create_client("claude", base_url=base_url, api_key=api_key, api_version=api_version)
    messages = build_text_messages("claude", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}
    usage_info = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )
            # --- MODIFIED: token usage ---
            if completion.usage:
                usage_info["prompt_tokens"] = completion.usage.prompt_tokens
                usage_info["completion_tokens"] = completion.usage.completion_tokens
                usage_info["total_tokens"] = completion.usage.total_tokens
            return completion, usage_info

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)

    return None, usage_info


def request_gemini_with_video(prompt: str, video_path: str, log_id=None, max_tokens: int = 10000, max_retries: int = 3):
    """
    Makes a multimodal request to the Gemini-2.5 model using video + text.

    Args:
        prompt (str): The user instruction, e.g., "Please evaluate and suggest improvements for this educational animation."
        video_path (str): Local path to the video file (MP4 preferred, <20MB recommended).
        log_id (str, optional): Tracking ID
        max_tokens (int): Max response token length
        max_retries (int): Max retry attempts

    Returns:
        dict: The Gemini model response
    """
    base_url = cfg("gemini", "base_url")
    api_version = cfg("gemini", "api_version")
    api_key = cfg("gemini", "api_key")
    model_name = cfg("gemini", "model")

    client = create_client("gemini", base_url=base_url, api_key=api_key, api_version=api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    # Load and base64-encode video
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")

    with open(video_path, "rb") as f:
        video_bytes = f.read()

    video_base64 = base64.b64encode(video_bytes).decode("utf-8")
    data_url = f"data:video/mp4;base64,{video_base64}"

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}, "media_type": "video/mp4"},
                        ],
                    }
                ],
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )
            return completion

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")
            delay = (2**retry_count) * 0.2 + random.random() * 0.2
            print(f"Retry {retry_count}/{max_retries} after error: {e}, waiting {delay:.2f}s...")
            time.sleep(delay)


def request_gemini_video_img(
    prompt: str, video_path: str, image_path: str, log_id=None, max_tokens: int = 10000, max_retries: int = 3
):
    """
    Makes a multimodal request to the Gemini-2.5 model using video & ref img + text.

    Args:
        prompt (str): The user instruction, e.g., "Please evaluate and suggest improvements for this educational animation."
        video_path (str): Local path to the video file (MP4 preferred, <20MB recommended).
        log_id (str, optional): Tracking ID
        max_tokens (int): Max response token length
        max_retries (int): Max retry attempts

    Returns:
        dict: The Gemini model response
    """
    base_url = cfg("gemini", "base_url")
    api_version = cfg("gemini", "api_version")
    api_key = cfg("gemini", "api_key")
    model_name = cfg("gemini", "model")

    client = create_client("gemini", base_url=base_url, api_key=api_key, api_version=api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    # Load and base64-encode video
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")
    with open(video_path, "rb") as f:
        video_bytes = f.read()
    video_base64 = base64.b64encode(video_bytes).decode("utf-8")
    video_data_url = f"data:video/mp4;base64,{video_base64}"

    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    with open(image_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode("utf-8")
    image_data_url = f"data:image/png;base64,{base64_image}"

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": video_data_url, "detail": "high"},
                                "media_type": "video/mp4",
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": image_data_url, "detail": "high"},
                                "media_type": "image/png",
                            },
                        ],
                    }
                ],
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )
            return completion

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")
            delay = (2**retry_count) * 0.2 + random.random() * 0.2
            print(f"Retry {retry_count}/{max_retries} after error: {e}, waiting {delay:.2f}s...")
            time.sleep(delay)
    return None


def request_gemini_video_img_token(
    prompt: str, video_path: str, image_path: str, log_id=None, max_tokens: int = 10000, max_retries: int = 3
):
    """
    Makes a multimodal request to the Gemini-2.5 model using video & ref img + text.

    Args:
        prompt (str): The user instruction, e.g., "Please evaluate and suggest improvements for this educational animation."
        video_path (str): Local path to the video file (MP4 preferred, <20MB recommended).
        log_id (str, optional): Tracking ID
        max_tokens (int): Max response token length
        max_retries (int): Max retry attempts

    Returns:
        dict: The Gemini model response
    """
    base_url = cfg("gemini", "base_url")
    api_version = cfg("gemini", "api_version")
    api_key = cfg("gemini", "api_key")
    model_name = cfg("gemini", "model")

    client = create_client("gemini", base_url=base_url, api_key=api_key, api_version=api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    usage_info = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    # Load and base64-encode video
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")
    with open(video_path, "rb") as f:
        video_bytes = f.read()
    video_base64 = base64.b64encode(video_bytes).decode("utf-8")
    video_data_url = f"data:video/mp4;base64,{video_base64}"

    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    with open(image_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode("utf-8")
    image_data_url = f"data:image/png;base64,{base64_image}"

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": video_data_url, "detail": "high"},
                                "media_type": "video/mp4",
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": image_data_url, "detail": "high"},
                                "media_type": "image/png",
                            },
                        ],
                    }
                ],
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )
            # return completion

            if completion.usage:
                usage_info["prompt_tokens"] = completion.usage.prompt_tokens
                usage_info["completion_tokens"] = completion.usage.completion_tokens
                usage_info["total_tokens"] = completion.usage.total_tokens
            return completion, usage_info

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")
            delay = (2**retry_count) * 0.2 + random.random() * 0.2
            print(f"Retry {retry_count}/{max_retries} after error: {e}, waiting {delay:.2f}s...")
            time.sleep(delay)
    return None, usage_info


def request_gemini(prompt, log_id=None, max_tokens=8000, max_retries=3):
    """
    Makes a request to the gemini-2.5-pro-preview-03-25 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 8000
        max_retries (int, optional): Maximum number of retry attempts, default 3

    Returns:
        dict: The model's response
    """
    base_url = cfg("gemini", "base_url")
    api_version = cfg("gemini", "api_version")
    api_key = cfg("gemini", "api_key")
    model_name = cfg("gemini", "model")

    client = create_client("gemini", base_url=base_url, api_key=api_key, api_version=api_version)
    messages = build_text_messages("gemini", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )
            return completion
        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)


def request_gemini_token(prompt, log_id=None, max_tokens=8000, max_retries=3):
    """
    Makes a request to the gemini-2.5-pro-preview-03-25 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 8000
        max_retries (int, optional): Maximum number of retry attempts, default 3

    Returns:
        dict: The model's response
    """

    base_url = cfg("gemini", "base_url")
    api_version = cfg("gemini", "api_version")
    api_key = cfg("gemini", "api_key")
    model_name = cfg("gemini", "model")

    client = create_client("gemini", base_url=base_url, api_key=api_key, api_version=api_version)
    messages = build_text_messages("gemini", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    usage_info = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )

            if completion.usage:
                usage_info["prompt_tokens"] = completion.usage.prompt_tokens
                usage_info["completion_tokens"] = completion.usage.completion_tokens
                usage_info["total_tokens"] = completion.usage.total_tokens
            return completion, usage_info

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)
    return None, usage_info


def request_gpt4o(prompt, log_id=None, max_tokens=8000, max_retries=3):
    """
    Makes a request to the gpt-4o-2024-11-20 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 8000
        max_retries (int, optional): Maximum number of retry attempts, default 3

    Returns:
        dict: The model's response
    """

    base_url = cfg("gpt4o", "base_url")
    api_version = cfg("gpt4o", "api_version")
    ak = cfg("gpt4o", "api_key")
    model_name = cfg("gpt4o", "model")

    client = create_client("gpt4o", base_url=base_url, api_key=ak, api_version=api_version)
    messages = build_text_messages("gpt4o", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )
            return completion.choices[0].message.content
        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)


def request_gpt4o_token(prompt, log_id=None, max_tokens=8000, max_retries=3):
    """
    Makes a request to the gpt-4o-2024-11-20 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 8000
        max_retries (int, optional): Maximum number of retry attempts, default 3

    Returns:
        dict: The model's response
    """
    base_url = cfg("gpt4o", "base_url")
    api_version = cfg("gpt4o", "api_version")
    ak = cfg("gpt4o", "api_key")
    model_name = cfg("gpt4o", "model")

    client = create_client("gpt4o", base_url=base_url, api_key=ak, api_version=api_version)
    messages = build_text_messages("gpt4o", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    usage_info = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )

            if completion.usage:
                usage_info["prompt_tokens"] = completion.usage.prompt_tokens
                usage_info["completion_tokens"] = completion.usage.completion_tokens
                usage_info["total_tokens"] = completion.usage.total_tokens
            return completion, usage_info

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)
    return None, usage_info


def request_o4mini(prompt, log_id=None, max_tokens=8000, max_retries=3, thinking=False):
    """
    Makes a request to the o4-mini-2025-04-16 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 8000
        max_retries (int, optional): Maximum number of retry attempts, default 3
        thinking (bool, optional): Whether to enable thinking mode, default False

    Returns:
        dict: The model's response
    """
    base_url = cfg_o4mini("base_url")
    api_version = cfg_o4mini("api_version")
    ak = cfg_o4mini("api_key")
    model_name = cfg_o4mini("model")

    client = create_client("gpto4mini", base_url=base_url, api_key=ak, api_version=api_version)
    messages = build_text_messages("gpto4mini", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    # Configure extra_body for thinking if enabled
    extra_body = None
    if thinking:
        extra_body = {"thinking": {"type": "enabled", "budget_tokens": 2000}}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
                extra_body=extra_body,
            )
            return completion
        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)


def request_o4mini_token(prompt, log_id=None, max_tokens=8000, max_retries=3, thinking=False):
    """
    Makes a request to the o4-mini-2025-04-16 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 8000
        max_retries (int, optional): Maximum number of retry attempts, default 3
        thinking (bool, optional): Whether to enable thinking mode, default False

    Returns:
        dict: The model's response
    """
    base_url = cfg_o4mini("base_url")
    api_version = cfg_o4mini("api_version")
    ak = cfg_o4mini("api_key")
    model_name = cfg_o4mini("model")

    client = create_client("gpto4mini", base_url=base_url, api_key=ak, api_version=api_version)
    messages = build_text_messages("gpto4mini", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    usage_info = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    # Configure extra_body for thinking if enabled
    extra_body = None
    if thinking:
        extra_body = {"thinking": {"type": "enabled", "budget_tokens": 2000}}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
                extra_body=extra_body,
            )

            if completion.usage:
                usage_info["prompt_tokens"] = completion.usage.prompt_tokens
                usage_info["completion_tokens"] = completion.usage.completion_tokens
                usage_info["total_tokens"] = completion.usage.total_tokens
            return completion, usage_info

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)
    return None, usage_info


def request_gpt5(prompt, log_id=None, max_tokens=1000, max_retries=3):
    """
    Makes a request to the gpt-5-chat-2025-08-07 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 1000
        max_retries (int, optional): Maximum number of retry attempts, default 3

    Returns:
        dict: The model's response
    """

    base_url = cfg("gpt5", "base_url")
    api_version = cfg("gpt5", "api_version")
    ak = cfg("gpt5", "api_key")
    model_name = cfg("gpt5", "model")

    client = create_client("gpt5", base_url=base_url, api_key=ak, api_version=api_version)
    messages = build_text_messages("gpt5", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )
            return completion
        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)


def request_gpt5_token(prompt, log_id=None, max_tokens=1000, max_retries=3):
    """
    Makes a request to the gpt-5-chat-2025-08-07 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 1000
        max_retries (int, optional): Maximum number of retry attempts, default 3

    Returns:
        dict: The model's response
    """
    base_url = cfg("gpt5", "base_url")
    api_version = cfg("gpt5", "api_version")
    ak = cfg("gpt5", "api_key")
    model_name = cfg("gpt5", "model")

    client = create_client("gpt5", base_url=base_url, api_key=ak, api_version=api_version)
    messages = build_text_messages("gpt5", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    usage_info = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )

            if completion.usage:
                usage_info["prompt_tokens"] = completion.usage.prompt_tokens
                usage_info["completion_tokens"] = completion.usage.completion_tokens
                usage_info["total_tokens"] = completion.usage.total_tokens
            return completion, usage_info

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)
    return None, usage_info


def request_gpt41(prompt, log_id=None, max_tokens=1000, max_retries=3):
    """
    Makes a request to the gpt-4.1-2025-04-14 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 1000
        max_retries (int, optional): Maximum number of retry attempts, default 3

    Returns:
        dict: The model's response
    """
    base_url = cfg("gpt41", "base_url")
    api_version = cfg("gpt41", "api_version")
    api_key = cfg("gpt41", "api_key")
    model_name = cfg("gpt41", "model")

    client = create_client("gpt41", base_url=base_url, api_key=api_key, api_version=api_version)
    messages = build_text_messages("gpt41", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )
            return completion
        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")

            # Exponential backoff with jitter
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)


def request_gpt41_token(prompt, log_id=None, max_tokens=1000, max_retries=3):
    """
    Makes a request to the gpt-4.1-2025-04-14 model with retry functionality.

    Args:
        prompt (str): The text prompt to send to the model
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 1000
        max_retries (int, optional): Maximum number of retry attempts, default 3

    Returns:
        dict: The model's response
    """
    base_url = cfg("gpt41", "base_url")
    api_version = cfg("gpt41", "api_version")
    ak = cfg("gpt41", "api_key")
    model_name = cfg("gpt41", "model")

    client = create_client("gpt41", base_url=base_url, api_key=ak, api_version=api_version)
    messages = build_text_messages("gpt41", prompt, base_url, api_version)

    if log_id is None:
        log_id = generate_log_id()

    extra_headers = {"X-TT-LOGID": log_id}
    usage_info = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )

            if completion.usage:
                usage_info["prompt_tokens"] = completion.usage.prompt_tokens
                usage_info["completion_tokens"] = completion.usage.completion_tokens
                usage_info["total_tokens"] = completion.usage.total_tokens
            return completion, usage_info

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                # 即使失败也返回，以便主程序可以继续
                print(f"Failed after {max_retries} attempts. Last error: {str(e)}")
                return None, usage_info

            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)

    return None, usage_info


def request_gpt41_img(prompt, image_path=None, log_id=None, max_tokens=1000, max_retries=3):
    """
    Makes a request to the gpt-4.1-2025-04-14 model with optional image input and retry functionality.
    Args:
        prompt (str): The text prompt to send to the model
        image_path (str, optional): Absolute path to an image file to include
        log_id (str, optional): The log ID for tracking requests, defaults to tkb+timestamp
        max_tokens (int, optional): Maximum tokens for response, default 1000
        max_retries (int, optional): Maximum number of retry attempts, default 3
    Returns:
        dict: The model's response
    """
    base_url = cfg("gpt41", "base_url")
    api_version = cfg("gpt41", "api_version")
    ak = cfg("gpt41", "api_key")
    model_name = cfg("gpt41", "model")

    client = create_client("gpt41", base_url=base_url, api_key=ak, api_version=api_version)
    if log_id is None:
        log_id = generate_log_id()
    extra_headers = {"X-TT-LOGID": log_id}

    if image_path:
        # 检查图片路径是否存在
        if not os.path.isfile(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")

        with open(image_path, "rb") as image_file:
            base64_image = base64.b64encode(image_file.read()).decode("utf-8")

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}},
                ],
            }
        ]

    else:
        messages = [{"role": "user", "content": prompt}]
    retry_count = 0
    while retry_count < max_retries:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                extra_headers=extra_headers,
            )
            return completion
        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} attempts. Last error: {str(e)}")
            delay = (2**retry_count) * 0.1 + (random.random() * 0.1)
            print(
                f"Request failed with error: {str(e)}. Retrying in {delay:.2f} seconds... (Attempt {retry_count}/{max_retries})"
            )
            time.sleep(delay)


if __name__ == "__main__":

    # Gemini
    # response_gemini = request_gemini("上海天气怎么样？")
    # print(response_gemini.model_dump_json())

    # # GPT-4o
    # response_gpt4o = request_gpt4o("上海天气怎么样？")
    # print(response_gpt4o)

    # # o4-mini
    # response_o4mini = request_o4mini("上海天气怎么样？")
    # print(response_o4mini.model_dump_json())

    # # GPT-4.1
    response_gpt41 = request_gpt41("上海天气怎么样？")
    print(response_gpt41.model_dump_json())

    # GPT-5
    # response_gpt5 = request_gpt5("新加坡天气怎么样？")
    # print(response_gpt5.model_dump_json())

    # # Claude
    # response_claude = request_claude_token("新加坡天气怎么样？")
    # print(response_claude)
