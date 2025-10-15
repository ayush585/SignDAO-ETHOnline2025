import os
from collections import Counter
from typing import List, Tuple

import cv2
import mediapipe as mp
import numpy as np


OUTPUT_PATH = os.path.join("WLASL", "wlasl_lite", "sign_classifier.npz")
LABELS = ("YES", "NO")


def normalize_landmarks(coords: np.ndarray, handedness: str | None = None) -> np.ndarray:
    wrist = coords[0]
    middle_mcp = coords[9]
    translated = coords - wrist
    if handedness == "Left":
        translated[:, 0] *= -1
    scale = np.linalg.norm(middle_mcp - wrist)
    if scale < 1e-6:
        scale = 1.0
    normalized = translated / scale
    return normalized[:, :2].flatten().astype(np.float32)


def extract_feature(frame: np.ndarray, hands_context) -> Tuple[bool, np.ndarray]:
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = hands_context.process(rgb)
    if not results.multi_hand_landmarks:
        return False, np.array([], dtype=np.float32)
    landmarks = results.multi_hand_landmarks[0].landmark
    coords = np.array([(lm.x, lm.y, lm.z) for lm in landmarks], dtype=np.float32)
    handedness = None
    if results.multi_handedness:
        handedness = results.multi_handedness[0].classification[0].label
    feature = normalize_landmarks(coords, handedness)
    return True, feature


def load_existing_samples(path: str) -> Tuple[List[np.ndarray], List[str]]:
    if not os.path.exists(path):
        return [], []
    data = np.load(path, allow_pickle=True)
    X = [sample for sample in data["X"]]
    y = [label for label in data["y"]]
    print(f"[INFO] Loaded {len(y)} existing live samples from {path}")
    return X, y


def save_samples(path: str, features: List[np.ndarray], labels: List[str]) -> None:
    if not features:
        print("[WARN] No samples to save.")
        return
    X = np.stack(features, axis=0)
    y = np.array(labels, dtype=object)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    np.savez(path, X=X, y=y)
    counts = Counter(labels)
    summary = ", ".join(f"{label}:{counts[label]}" for label in LABELS)
    print(f"[INFO] Saved {len(labels)} samples ({summary}) -> {path}")


def main() -> None:
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    features, labels = load_existing_samples(OUTPUT_PATH)
    total_captures = len(labels)

    current_label_index = 0
    current_label = LABELS[current_label_index]
    capture_notification = ""

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise RuntimeError("Unable to access webcam. Check camera permissions or index.")

    mp_hands = mp.solutions.hands
    with mp_hands.Hands(
        max_num_hands=1,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.6,
    ) as hands:
        try:
            while True:
                success, frame = cap.read()
                if not success:
                    print("[WARN] Failed to read frame from webcam.")
                    break

                overlay = frame.copy()
                cv2.putText(overlay, f"Current label: {current_label}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                cv2.putText(
                    overlay,
                    "Keys: SPACE toggle label | C capture | S save+exit | Q quit",
                    (10, 65),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 255),
                    2,
                )
                cv2.putText(
                    overlay,
                    f"Total captures: {total_captures} (YES {labels.count('YES')} | NO {labels.count('NO')})",
                    (10, 95),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (255, 255, 0),
                    2,
                )
                if capture_notification:
                    cv2.putText(
                        overlay,
                        capture_notification,
                        (10, 130),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (255, 0, 0),
                        2,
                    )

                cv2.imshow("SignDAO Live Collector", overlay)
                key = cv2.waitKey(1) & 0xFF

                if key == ord(" "):
                    current_label_index = (current_label_index + 1) % len(LABELS)
                    current_label = LABELS[current_label_index]
                    capture_notification = f"Switched to {current_label}"
                elif key == ord("c"):
                    ok, feature = extract_feature(frame, hands)
                    if ok:
                        features.append(feature)
                        labels.append(current_label)
                        total_captures += 1
                        capture_notification = f"[{current_label}] capture saved ({total_captures} total)"
                        print(f"[INFO] Captured {current_label} sample #{total_captures}")
                    else:
                        capture_notification = "No hand detected."
                        print("[WARN] No hand detected, sample ignored.")
                elif key == ord("s"):
                    save_samples(OUTPUT_PATH, features, labels)
                    break
                elif key == ord("q"):
                    print("[INFO] Quit without saving.")
                    break
        finally:
            cap.release()
            cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
