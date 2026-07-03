import requests
import os
from pathlib import Path

TTS_API_URL = "http://localhost:54321/tts"

def generate_tts_audio(text: str, output_path: str | Path, voice: str = "zh-CN-XiaoxiaoNeural", rate: str = "+0%") -> float:
    """
    Calls the local TTS service to generate audio for the given text.
    Downloads the audio file to output_path.
    Returns the duration of the audio in seconds.
    """
    try:
        payload = {
            "text": text,
            "voice": voice,
            "rate": rate
        }
        response = requests.post(TTS_API_URL, json=payload)
        response.raise_for_status()
        
        data = response.json()
        audio_url = data["audio_url"] # relative path like /static/...
        duration = data["duration"]
        
        # The TTS service returns a relative URL. We need to construct the full URL to download it,
        # OR since it's running locally, we might be able to find the file directly if we knew where TTS service is running.
        # But for robustness, let's download it via HTTP.
        download_url = f"http://localhost:54321{audio_url}"
        
        audio_response = requests.get(download_url)
        audio_response.raise_for_status()
        
        # Ensure directory exists
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, "wb") as f:
            f.write(audio_response.content)
            
        return duration
        
    except Exception as e:
        print(f"❌ TTS Generation failed for text: {text[:20]}... Error: {e}")
        # Return 0 duration if failed, so the pipeline can continue without audio or handle it gracefully
        return 0.0
