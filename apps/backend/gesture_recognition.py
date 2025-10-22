# Simple gesture detection stub used by the Flask API during local development.
# Replace the implementation of detect_gesture() once MediaPipe integration is ready.

from typing import TypedDict


class GesturePayload(TypedDict):
    gesture: str
    confidence: float


def detect_gesture() -> GesturePayload:
    """
    Return the latest gesture classification result.

    For now this is a stub implementation that always reports a YES gesture with
    a confident score so the frontend pipeline can be exercised end-to-end.
    """
    return {"gesture": "YES", "confidence": 0.92}
