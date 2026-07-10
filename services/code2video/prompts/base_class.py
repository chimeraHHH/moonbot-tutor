# The TeachingScene base class now lives in src/teaching_scene.py and extends
# manim-voiceover's VoiceoverScene (Manim's own TTS system). Generated section
# files import it instead of defining it inline.
base_class = "from teaching_scene import TeachingScene"
