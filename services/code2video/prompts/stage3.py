import os


def get_prompt3_code(regenerate_note, section, base_class):
    return f"""
You are an expert Manim Community Edition v0.19.0 animator. Generate a teaching
animation whose narration is spoken by Manim's own voiceover system via the
provided `self.teach(...)` helper. Do NOT use external audio files.
{regenerate_note}

1. STRUCTURE (MANDATORY):
- `from manim import *` then `{base_class}` then `class {section.id.title().replace('_', '')}Scene(TeachingScene):`.
- First line of construct: `self.setup_layout("{section.title}")`.

2. NARRATION VIA self.teach (MANDATORY — this is the TTS):
- `self.teach(text, *animations)` SPEAKS `text` while playing the animations, timed to the speech.
- Produce ONE `self.teach(...)` call PER lecture line, using that line VERBATIM as the spoken text,
  together with the animation(s) that illustrate it.
- EVERY visual step that teaches something MUST go through `self.teach(...)`.
- Do NOT call `self.voiceover(...)`, `self.set_speech_service(...)`, `self.add_sound(...)`,
  or bare `self.play(...)` for teaching content. (Only `self.teach` narrates.)
- Every narration string passed to `self.teach(...)` MUST be Simplified Chinese.

2A. OUTPUT LANGUAGE (MANDATORY):
- Every user-visible title, label, annotation, caption, and explanatory Text/MarkupText string
  MUST be Simplified Chinese, even when the original request or animation description is English.
- Every `Text(...)` or `MarkupText(...)` object containing Chinese MUST set `font=CHINESE_FONT`.
  Keep formulas in `MathTex(...)`; do not put Chinese prose inside `MathTex(...)`.
- English is allowed only in mathematical formulas, universal symbols, code identifiers, and
  indispensable proper nouns. Never add English explanatory sentences to the rendered video.

3. POSITIONING (provided by TeachingScene):
- `self.place_at_grid(obj, 'B2', scale_factor=0.8)` or `self.place_in_area(obj, 'A1', 'C3', 0.7)`.
- NEVER use .to_edge(), .move_to(), or manual coordinates.

4. TEACHING CONTENT:
- Title: {section.title}
- Lecture Lines (each becomes ONE self.teach call, verbatim as its narration): {section.lecture_lines}
- Animation Description: {'; '.join(section.animations)}

5. EXAMPLE:
```python
from manim import *
{base_class}

class {section.id.title().replace('_', '')}Scene(TeachingScene):
    def construct(self):
        self.setup_layout("{section.title}")

        tri = Polygon([-1, -1, 0], [1, -1, 0], [1, 1, 0], color="#4DA6FF")
        self.place_at_grid(tri, "C3")
        self.teach("首先，我们画一个直角三角形。", Create(tri))

        formula = MathTex("a^2 + b^2 = c^2").scale(0.9)
        self.place_at_grid(formula, "B4")
        self.teach("它的两条直角边平方和，等于斜边的平方。", Write(formula))
```

6. CONSTRAINTS:
- Colors: light, distinguishable hex colors; keep font sizes readable.
- Keep it simple and robust: basic, well-tested Manim CE v0.19.0 objects/animations only.
- Assets: if the Animation Description contains [Asset: XXX/XXX.png], you MUST use those files.
- No 3D, no external dependencies other than asset filenames.
"""


def get_regenerate_note(attempt, MAX_REGENERATE_TRIES):
    return f"""
**IMPORTANT NOTE:** This is attempt {attempt}/{MAX_REGENERATE_TRIES} to generate working code.
Previous attempts failed to run. Please:
1. Use only basic, well-tested Manim functions
2. Keep exactly one `self.teach("<lecture line>", <animation>)` per lecture line
3. Keep the class subclassing TeachingScene; never fall back to a plain Scene
"""
