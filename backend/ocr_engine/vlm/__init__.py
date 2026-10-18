"""
Vision-language-model extraction as a third engine alongside the v1
whole-image OCR and SuperOCR.

The VLM path exists for the exact cases the classical engines fail on:
coloured ink, heavy glare, extreme angles, old green Zimbabwe IDs.
Classical OCR needs binarization and dewarping; a VLM does not.

A backend is picked from environment variables at first use. If none
is configured, the step is a silent no-op — the pipeline keeps running
with the two classical engines.
"""