# -----------------------------------------------------------
# Backend Run Instructions (Judge-Ready, No Virtual Env Needed)
# -----------------------------------------------------------
# Setup:
#   cd apps/backend
#   pip install -r requirements.txt   # installs Flask + Flask-CORS etc.
#
# Run:
#   python api.py
#
# Test:
#   curl http://localhost:5000/gesture
#   # or open http://localhost:5000/gesture in a browser
#
# Notes:
# - Works directly on Windows, macOS, or Linux.
# - No virtual environment required.
# - Make sure Python 3.10+ is installed.
# -----------------------------------------------------------

"""Minimal Flask API that bridges gesture recognition output to the frontend."""

from flask import Flask, jsonify
from flask_cors import CORS

from gesture_recognition import detect_gesture

app = Flask(__name__)

# Allow only the local Next.js app to access the gesture endpoint during development.
CORS(app, resources={r"/gesture": {"origins": "http://localhost:3000"}})


@app.get("/gesture")
def gesture():
    """Return the latest gesture classification as JSON."""
    return jsonify(detect_gesture()), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

