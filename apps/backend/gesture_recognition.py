"""
Real-time gesture recognition using MediaPipe Hands.
Detects simple ASL 'YES'/'NO' from webcam and returns JSON.
"""

# Run backend:
#   cd apps/backend
#   pip install -r requirements.txt
#   python api.py
# Then open http://localhost:3000/proofs to see live YES/NO gestures.
# Tip: Good lighting improves detection.

from __future__ import annotations

import atexit
import threading
import time
from typing import Final, Optional, TypedDict

import cv2
import mediapipe as mp
import numpy as np


class GesturePayload(TypedDict):
    gesture: str
    confidence: float


_DEFAULT_RESPONSE: Final[GesturePayload] = {"gesture": "N/A", "confidence": 0.0}
_POSITIVE_RESPONSE: Final[GesturePayload] = {"gesture": "YES", "confidence": 0.9}
_NEGATIVE_RESPONSE: Final[GesturePayload] = {"gesture": "NO", "confidence": 0.9}
_CAPTURE_INDEX: Final[int] = 0
_READ_TIMEOUT_SEC: Final[float] = 1.0

_mp_hands = mp.solutions.hands
_hands = _mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.4,
    min_tracking_confidence=0.4,
)

_capture_lock: Final[threading.Lock] = threading.Lock()
_capture: Optional[cv2.VideoCapture] = None


def _release_capture() -> None:
    """Release the camera if it is currently open."""
    global _capture
    if _capture is None:
        return

    try:
        if _capture.isOpened():
            _capture.release()
    finally:
        _capture = None


def _release_resources() -> None:
    """Callback used at interpreter shutdown to release hardware resources."""
    _release_capture()
    _hands.close()


atexit.register(_release_resources)


def _open_capture() -> Optional[cv2.VideoCapture]:
    """Open the webcam if it is not already available."""
    global _capture
    if _capture is not None and _capture.isOpened():
        return _capture

    # Release any stale handle before attempting to reacquire the camera.
    _release_capture()

    try:
        capture = cv2.VideoCapture(_CAPTURE_INDEX)
        if capture.isOpened():
            # Reduce internal buffering so each read returns a fresh frame.
            capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            _capture = capture
            return _capture
    except Exception:
        pass

    return None


def _read_frame() -> Optional[np.ndarray]:
    """Attempt to read one frame from the webcam within a short timeout."""
    deadline = time.perf_counter() + _READ_TIMEOUT_SEC

    with _capture_lock:
        capture = _open_capture()
        if capture is None:
            return None

        while time.perf_counter() < deadline:
            ok, frame = capture.read()
            if ok:
                return frame
            time.sleep(0.05)

        # Timed out; drop the capture so the next request can retry cleanly.
        _release_capture()

    return None


def detect_gesture() -> GesturePayload:
    """Detect whether the current hand pose is a YES (thumbs up) or NO (thumbs down)."""
    try:
        frame = _read_frame()
    except Exception:
        _release_capture()
        return _DEFAULT_RESPONSE

    if frame is None:
        return _DEFAULT_RESPONSE

    try:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    except Exception:
        return _DEFAULT_RESPONSE

    rgb_frame.flags.writeable = False
    results = _hands.process(rgb_frame)

    if not results.multi_hand_landmarks:
        return _DEFAULT_RESPONSE

    landmarks = np.array(
        [(lm.x, lm.y, lm.z) for lm in results.multi_hand_landmarks[0].landmark],
        dtype=np.float32,
    )

    if landmarks.shape[0] <= 4:
        return _DEFAULT_RESPONSE

    thumb_tip_y = landmarks[4, 1]
    thumb_ip_y = landmarks[3, 1]
    thumb_up = thumb_tip_y < thumb_ip_y

    return _POSITIVE_RESPONSE if thumb_up else _NEGATIVE_RESPONSE
