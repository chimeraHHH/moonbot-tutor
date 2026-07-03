import sys
from pathlib import Path
import requests

# Ensure we can import tts_client
sys.path.append(str(Path(__file__).parent))
from tts_client import generate_tts_audio

def test_tts():
    print("Testing TTS connection...")
    text = "这是一个测试音频，用于验证语音合成服务是否正常工作。"
    output_path = Path("test_audio.mp3")
    
    try:
        print(f"Attempting to generate audio to {output_path.absolute()}...")
        duration = generate_tts_audio(text, output_path)
        
        if duration > 0:
            print(f"✅ TTS Success! Duration: {duration:.2f}s")
            print(f"File exists: {output_path.exists()}")
            print(f"File size: {output_path.stat().st_size} bytes")
        else:
            print("❌ TTS Failed (duration is 0)")
            
    except Exception as e:
        print(f"❌ Exception during TTS test: {e}")

if __name__ == "__main__":
    test_tts()
