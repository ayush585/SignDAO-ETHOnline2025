import json
import math
import os
from collections import deque
from datetime import datetime

import cv2
import mediapipe as mp
import numpy as np
from sklearn.neighbors import KNeighborsClassifier

UNKNOWN_FLOOR = 0.55
ML_TAKEOVER = 0.60
SMOOTH_WINDOW = 9


def enhance_low_light(frame: np.ndarray) -> np.ndarray:
    """Boost contrast in dim light using CLAHE on the luminance channel."""
    lab_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab_frame)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l_channel)
    enhanced = cv2.merge((l_enhanced, a_channel, b_channel))
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)


def landmark_array(landmarks):
    return np.array([(lm.x, lm.y, lm.z) for lm in landmarks], dtype=np.float32)


def normalize_landmarks(landmarks: np.ndarray, handedness: str | None = None) -> np.ndarray:
    """Translate wrist to origin and scale by palm size for comparability."""
    wrist = landmarks[0]
    translated = landmarks - wrist
    if handedness == "Left":
        translated[:, 0] *= -1
    middle_mcp = landmarks[9]
    scale = np.linalg.norm(middle_mcp - wrist)
    if scale < 1e-6:
        scale = 1.0
    return translated / scale


def vector_angle(v1: np.ndarray, v2: np.ndarray) -> float:
    denom = np.linalg.norm(v1) * np.linalg.norm(v2)
    if denom < 1e-6:
        return 0.0
    cosine = np.clip(np.dot(v1, v2) / denom, -1.0, 1.0)
    return math.acos(cosine)


def finger_curl(landmarks: np.ndarray, indices) -> float:
    mcp, pip, dip, tip = (landmarks[i] for i in indices)
    angle1 = vector_angle(pip - mcp, dip - pip)
    angle2 = vector_angle(dip - pip, tip - dip)
    curl = (angle1 + angle2) / math.pi
    return float(np.clip(curl, 0.0, 1.0))


def thumb_curl(landmarks: np.ndarray) -> float:
    mcp = landmarks[2]
    ip = landmarks[3]
    tip = landmarks[4]
    wrist = landmarks[0]
    angle1 = vector_angle(ip - mcp, tip - ip)
    angle2 = vector_angle(mcp - wrist, tip - mcp)
    curl = (angle1 + angle2) / math.pi
    return float(np.clip(curl, 0.0, 1.0))


def classify_yes_no(landmarks, handedness: str | None = None, normalized: np.ndarray | None = None) -> tuple[str, float]:
    if normalized is None:
        normalized = normalize_landmarks(landmarks, handedness)

    curls = {
        "thumb": thumb_curl(normalized),
        "index": finger_curl(normalized, [5, 6, 7, 8]),
        "middle": finger_curl(normalized, [9, 10, 11, 12]),
        "ring": finger_curl(normalized, [13, 14, 15, 16]),
        "pinky": finger_curl(normalized, [17, 18, 19, 20]),
    }

    palm_span = np.linalg.norm(normalized[5] - normalized[17])
    palm_span = palm_span if palm_span > 1e-6 else 1.0

    thumb_tip = normalized[4]
    index_tip = normalized[8]
    middle_tip = normalized[12]

    index_thumb_dist = np.linalg.norm(thumb_tip - index_tip) / palm_span
    middle_thumb_dist = np.linalg.norm(thumb_tip - middle_tip) / palm_span

    yes_score = np.mean(
        [
            curls["index"],
            curls["middle"],
            curls["ring"],
            curls["pinky"],
        ]
    )

    no_components = [
        1.0 - curls["index"],
        1.0 - curls["middle"],
        1.0 - curls["ring"],
        1.0 - curls["pinky"],
        np.clip(index_thumb_dist, 0.0, 1.0),
        np.clip(middle_thumb_dist, 0.0, 1.0),
    ]
    no_score = np.mean(no_components)

    scores = {"YES": float(np.clip(yes_score, 0.0, 1.0)), "NO": float(np.clip(no_score, 0.0, 1.0))}
    gesture = max(scores, key=scores.get)
    confidence = scores[gesture]

    if confidence < UNKNOWN_FLOOR:
        return "UNKNOWN", confidence
    return gesture, confidence


MODEL_PATH = "./WLASL/wlasl_lite/sign_classifier_augmented.npz"


def load_augmented_model(path: str = MODEL_PATH):
    if not os.path.exists(path):
        print(f"[WARN] Model not found at {path}")
        return None
    data = np.load(path, allow_pickle=True)
    X, y = data["X"], data["y"]
    if len(X) == 0:
        print(f"[WARN] Model dataset at {path} is empty")
        return None
    k = min(5, max(1, len(X) // 2))
    clf = KNeighborsClassifier(n_neighbors=k)
    clf.fit(X, y)
    print(f"[INFO] Loaded ML model with {len(y)} samples")
    return clf


ml_clf = load_augmented_model()
if ml_clf is None:
    print("[INFO] ML model not found. Using rule-based only. Run: python WLASL/wlasl_lite/train_yes_no.py")


def main():
    mp_hands = mp.solutions.hands
    history: deque[tuple[str, float]] = deque(maxlen=SMOOTH_WINDOW)
    last_label_conf: tuple[str, float] | None = None

    with mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        model_complexity=1,
        min_detection_confidence=0.55,
        min_tracking_confidence=0.6,
    ) as hands:
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            raise RuntimeError("Unable to access webcam. Check camera permissions or index.")

        try:
            while True:
                success, frame = cap.read()
                if not success:
                    break

                enhanced_frame = enhance_low_light(frame)
                frame_rgb = cv2.cvtColor(enhanced_frame, cv2.COLOR_BGR2RGB)
                results = hands.process(frame_rgb)

                display_text = "..."
                fused_label = "NONE"
                fused_conf = 0.0

                if results.multi_hand_landmarks:
                    landmarks = results.multi_hand_landmarks[0].landmark
                    landmark_matrix = landmark_array(landmarks)
                    handedness = None
                    if results.multi_handedness:
                        handedness = results.multi_handedness[0].classification[0].label
                    normalized_matrix = normalize_landmarks(landmark_matrix, handedness)
                    rb_label, rb_conf = classify_yes_no(landmark_matrix, handedness, normalized_matrix)
                    normalized_feat = normalized_matrix[:, :2].flatten().astype(np.float32)
                    ml_label, ml_conf = None, 0.0
                    if ml_clf is not None:
                        proba = ml_clf.predict_proba([normalized_feat])[0]
                        idx = int(np.argmax(proba))
                        ml_label = ml_clf.classes_[idx]
                        ml_conf = float(proba[idx])

                    if ml_label and ml_conf >= ML_TAKEOVER:
                        fused_label, fused_conf = ml_label, ml_conf
                    elif rb_label != "UNKNOWN":
                        fused_label, fused_conf = rb_label, rb_conf
                    else:
                        fused_label = ml_label or "UNKNOWN"
                        fused_conf = ml_conf if ml_label else rb_conf

                    if fused_label != "UNKNOWN":
                        history.append((fused_label, fused_conf))
                    else:
                        history.clear()

                    if history:
                        gestures = [g for g, _ in history]
                        dominant = max(set(gestures), key=gestures.count)
                        dominant_conf = float(np.mean([c for g, c in history if g == dominant]))
                        display_text = f"{dominant} ({dominant_conf:.2f})"
                        fused_label, fused_conf = dominant, dominant_conf
                    else:
                        display_text = f"{fused_label} ({fused_conf:.2f})"

                    cv2.putText(
                        enhanced_frame,
                        display_text,
                        (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1,
                        (0, 255, 0),
                        2,
                    )

                    rounded_conf = round(fused_conf, 3)
                    if (fused_label, rounded_conf) != last_label_conf:
                        payload = {
                            "gesture": fused_label,
                            "confidence": rounded_conf,
                            "ts": datetime.now().astimezone().isoformat(timespec="seconds"),
                        }
                        print(json.dumps(payload), flush=True)
                        last_label_conf = (fused_label, rounded_conf)
                else:
                    history.clear()
                    if last_label_conf != ("NONE", 0.0):
                        payload = {
                            "gesture": "NONE",
                            "confidence": 0.0,
                            "ts": datetime.now().astimezone().isoformat(timespec="seconds"),
                        }
                        print(json.dumps(payload), flush=True)
                        last_label_conf = ("NONE", 0.0)

                cv2.imshow("SignDAO Gesture", enhanced_frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
        finally:
            cap.release()
            cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
