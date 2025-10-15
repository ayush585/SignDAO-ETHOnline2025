YES means thumbs-up, NO means open palm facing camera. Follow the steps below to get your SignDAO mini-stack ready:

```
pip install -r requirements.txt

# Option A: collect my data
python WLASL/wlasl_lite/collect_live_samples.py

# Option B: build WLASL-Lite (adjust path to JSON if needed)
python WLASL/wlasl_lite/wlasl_lite_extract.py --json ./WLASL/start_kit/WLASL_v0.3.json --per_class 25

# Train merged model
python WLASL/wlasl_lite/train_yes_no.py

# Run live
python gesture_test.py
```

WLASL is released under Creative Commons CC BY-NC-SA (C-UDA); use it for academic or experimental projects only.
