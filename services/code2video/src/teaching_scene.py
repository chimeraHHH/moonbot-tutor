"""Teaching scene base + narration, built on manim-voiceover (Manim's own TTS
system). Narration is generated and synced *inside* the Manim scene via
`self.voiceover(...)`, replacing the old external-TTS + `add_sound` approach.

The speech backend is Microsoft edge-tts (wrapped as a manim-voiceover
SpeechService) so the original high-quality Chinese voice is preserved.
Override the voice with C2V_TTS_VOICE.
"""
import asyncio
import os
from pathlib import Path

import numpy as np
from manim import VGroup, Text, WHITE, UP, DOWN, LEFT
from manim_voiceover import VoiceoverScene
from manim_voiceover.helper import remove_bookmarks
from manim_voiceover.services.base import (
    SpeechService,
    initialize_speech_service,
    path_to_string,
)

import edge_tts

VOICE = os.getenv("C2V_TTS_VOICE", "zh-CN-XiaoxiaoNeural")
RATE = os.getenv("C2V_TTS_RATE", "+0%")


class EdgeTTSService(SpeechService):
    """manim-voiceover speech service backed by Microsoft edge-tts."""

    def __init__(self, voice: str = VOICE, rate: str = RATE, **kwargs: object) -> None:
        initialize_speech_service(self, kwargs)
        self.voice = voice
        self.rate = rate

    def generate_from_text(self, text, cache_dir=None, path=None, **kwargs):
        if cache_dir is None:
            cache_dir = self.cache_dir

        input_text = remove_bookmarks(text)
        input_data = {
            "input_text": input_text,
            "service": "edge-tts",
            "voice": self.voice,
            "rate": self.rate,
        }

        cached = self.get_cached_result(input_data, cache_dir)
        if cached is not None:
            return cached

        audio_path = (
            path_to_string(path)
            if path is not None
            else self.get_audio_basename(input_data) + ".mp3"
        )
        out = str(Path(cache_dir) / audio_path)

        async def _save() -> None:
            await edge_tts.Communicate(input_text, self.voice, rate=self.rate).save(out)

        asyncio.run(_save())

        return {"input_text": text, "input_data": input_data, "original_audio": audio_path}


class TeachingScene(VoiceoverScene):
    """Base class the generated section scenes subclass. Provides the layout +
    grid helpers and wires up the edge-tts voiceover service."""

    def setup_layout(self, title_text, lecture_lines=None):
        # Voiceover TTS (Manim's own system) — call before any self.voiceover().
        self.set_speech_service(EdgeTTSService())

        self.camera.background_color = "#000000"
        self.title = Text(title_text, font_size=28, color=WHITE).to_edge(UP)
        self.add(self.title)

        # Optional left-side lecture bullets (visual only). Narration is spoken
        # separately via self.teach(...).
        if lecture_lines:
            lecture_texts = [Text(line, font_size=22, color=WHITE) for line in lecture_lines]
            self.lecture = VGroup(*lecture_texts).arrange(DOWN, aligned_edge=LEFT).scale(0.8)
            self.lecture.to_edge(LEFT, buff=0.2)
            self.add(self.lecture)

        # Fine-grained animation grid (right side)
        self.grid = {}
        rows = ["A", "B", "C", "D", "E", "F"]
        cols = ["1", "2", "3", "4", "5", "6"]
        for i, row in enumerate(rows):
            for j, col in enumerate(cols):
                x = 0.5 + j * 1
                y = 2.2 - i * 1
                self.grid[f"{row}{col}"] = np.array([x, y, 0])

    def teach(self, text, *animations, run_time=None, **kwargs):
        """Speak `text` (Manim voiceover TTS) while playing `animations`, timed to
        the narration. This is the ONLY way narration should be produced."""
        with self.voiceover(text=text) as tracker:
            if animations:
                self.play(*animations, run_time=(run_time or tracker.duration), **kwargs)
            else:
                self.safe_wait(tracker.duration)

    def safe_wait(self, duration):
        self.wait(max(0.1, float(duration)))

    def place_at_grid(self, mobject, grid_pos, scale_factor=1.0):
        mobject.scale(scale_factor)
        mobject.move_to(self.grid[grid_pos])
        return mobject

    def place_in_area(self, mobject, top_left, bottom_right, scale_factor=1.0):
        tl_pos = self.grid[top_left]
        br_pos = self.grid[bottom_right]
        center = np.array([(tl_pos[0] + br_pos[0]) / 2, (tl_pos[1] + br_pos[1]) / 2, 0])
        mobject.scale(scale_factor)
        mobject.move_to(center)
        return mobject
