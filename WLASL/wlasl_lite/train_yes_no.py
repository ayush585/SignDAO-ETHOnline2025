import os

import numpy as np
from sklearn.neighbors import KNeighborsClassifier


BASE_DIR = os.path.join("WLASL", "wlasl_lite")
WLASL_DATA = os.path.join(BASE_DIR, "yes_no_landmarks.npz")
LIVE_DATA = os.path.join(BASE_DIR, "sign_classifier.npz")
OUTPUT_DATA = os.path.join(BASE_DIR, "sign_classifier_augmented.npz")


def load_dataset(path: str, required: bool = False):
    if not os.path.exists(path):
        if required:
            print(f"[WARN] Missing dataset at {path}")
        return None, None
    data = np.load(path, allow_pickle=True)
    return data["X"], data["y"]


def main() -> None:
    X_wlasl, y_wlasl = load_dataset(WLASL_DATA, required=True)
    if X_wlasl is None or y_wlasl is None:
        print(
            "[ACTION] Run: python WLASL/wlasl_lite/wlasl_lite_extract.py "
            "--json ./WLASL/start_kit/WLASL_v0.3.json --per_class 25"
        )
        return

    X_live, y_live = load_dataset(LIVE_DATA)

    if X_live is not None and y_live is not None:
        X = np.concatenate([X_wlasl, X_live], axis=0)
        y = np.concatenate([y_wlasl, y_live], axis=0)
    else:
        X, y = X_wlasl, y_wlasl

    clf = KNeighborsClassifier(n_neighbors=3)
    clf.fit(X, y)

    os.makedirs(BASE_DIR, exist_ok=True)
    np.savez(OUTPUT_DATA, X=X, y=y)
    print(f"[INFO] Model trained with {len(y)} samples")
    print(f"[INFO] Saved sign_classifier_augmented.npz with {len(y)} samples")


if __name__ == "__main__":
    main()
