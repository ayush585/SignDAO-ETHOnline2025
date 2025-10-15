import argparse
import json
import os
import random
import shutil
import tempfile
from typing import List, Tuple

import cv2
import mediapipe as mp
import numpy as np
from yt_dlp import YoutubeDL


random.seed(42)

CLASSES = ("YES", "NO")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download YES/NO samples and extract MediaPipe landmarks.")
    parser.add_argument("--json", required=True, help="Path to WLASL_v0.3.json metadata file.")
    parser.add_argument("--per_class", type=int, default=25, help="Maximum videos to download per class.")
    parser.add_argument("--keep_videos", action="store_true", help="Keep downloaded raw videos instead of deleting them.")
    return parser.parse_args()


def load_wlasl_metadata(path: str) -> List[dict]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


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
    flattened = normalized[:, :2].flatten()
    return flattened.astype(np.float32)


def extract_landmarks_from_video(video_path: str) -> Tuple[bool, np.ndarray]:
    mp_hands = mp.solutions.hands
    samples: List[np.ndarray] = []
    stride = 5
    max_samples = 60
    with mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        model_complexity=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as hands:
        cap = cv2.VideoCapture(video_path)
        frame_idx = 0
        try:
            while cap.isOpened():
                success, frame = cap.read()
                if not success:
                    break
                if frame_idx % stride == 0 and len(samples) < max_samples:
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = hands.process(rgb)
                    if results.multi_hand_landmarks:
                        lm = results.multi_hand_landmarks[0].landmark
                        coords = np.array([(p.x, p.y, p.z) for p in lm], dtype=np.float32)
                        handedness = None
                        if results.multi_handedness:
                            handedness = results.multi_handedness[0].classification[0].label
                        samples.append(normalize_landmarks(coords, handedness))
                frame_idx += 1
                if len(samples) >= max_samples:
                    break
        finally:
            cap.release()
    if not samples:
        return False, np.array([], dtype=np.float32)
    feature = np.mean(samples, axis=0)
    return True, feature.astype(np.float32)


def ensure_directory(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def download_video(url: str, video_id: str, directory: str) -> str | None:
    ydl_opts = {
        "outtmpl": os.path.join(directory, f"{video_id}.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            return filename
    except Exception as exc:
        print(f"[WARN] Failed to download {url}: {exc}")
        return None


def collect_instances(metadata: List[dict], gloss: str) -> List[dict]:
    filtered = []
    for entry in metadata:
        if entry.get("gloss", "").strip().upper() == gloss:
            filtered.append(entry)
    return filtered


def main() -> None:
    args = parse_args()
    output_dir = os.path.join("WLASL", "wlasl_lite")
    ensure_directory(output_dir)
    dataset_path = os.path.join(output_dir, "yes_no_landmarks.npz")

    metadata = load_wlasl_metadata(args.json)

    temp_dir = tempfile.mkdtemp(prefix="wlasl_dl_")
    print(f"[INFO] Using temporary download folder: {temp_dir}")
    downloaded_features: List[np.ndarray] = []
    downloaded_labels: List[str] = []

    try:
        for gloss in CLASSES:
            collected = 0
            entries = collect_instances(metadata, gloss)
            random.shuffle(entries)
            for entry in entries:
                if collected >= args.per_class:
                    break
                instances = entry.get("instances", [])
                random.shuffle(instances)
                for inst in instances:
                    if collected >= args.per_class:
                        break
                    url = inst.get("url")
                    video_id = inst.get("video_id") or f"{gloss}_{collected}"
                    if not url:
                        continue
                    video_path = download_video(url, f"{gloss}_{video_id}", temp_dir)
                    if not video_path or not os.path.exists(video_path):
                        continue
                    ok, feature = extract_landmarks_from_video(video_path)
                    if ok:
                        downloaded_features.append(feature)
                        downloaded_labels.append(gloss)
                        collected += 1
                        print(f"[INFO] Collected sample {collected}/{args.per_class} for {gloss}")
                    if not args.keep_videos:
                        try:
                            os.remove(video_path)
                        except OSError:
                            pass
    finally:
        if not args.keep_videos:
            shutil.rmtree(temp_dir, ignore_errors=True)
        else:
            print(f"[INFO] Videos retained at {temp_dir}")

    if not downloaded_features:
        print("[WARN] No new samples collected. Existing dataset remains unchanged.")
        return

    X_new = np.stack(downloaded_features, axis=0)
    y_new = np.array(downloaded_labels, dtype=object)

    if os.path.exists(dataset_path):
        existing = np.load(dataset_path, allow_pickle=True)
        X_existing = existing["X"]
        y_existing = existing["y"]
        X = np.concatenate([X_existing, X_new], axis=0)
        y = np.concatenate([y_existing, y_new], axis=0)
    else:
        X, y = X_new, y_new

    feature_size = X.shape[1]
    np.savez(dataset_path, X=X, y=y)
    print(f"[INFO] Saved {len(y)} samples with feature size {feature_size} -> {dataset_path}")
    if len(y) < 10:
        print("[WARN] Low sample count. Re-run with --per_class 40")


if __name__ == "__main__":
    main()
