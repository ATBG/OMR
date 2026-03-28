import os
import sqlite3
from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

DB_PATH = os.environ.get("OMR_DB_PATH", "omr.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                mcq_count INTEGER NOT NULL,
                score REAL NOT NULL,
                accuracy REAL NOT NULL,
                avg_time REAL NOT NULL,
                variance REAL NOT NULL,
                streak INTEGER NOT NULL,
                overtime_ratio REAL NOT NULL
            );
            """
        )
        conn.commit()


def create_app():
    app = Flask(__name__)
    CORS(app)
    init_db()

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "db": os.path.abspath(DB_PATH)})

    @app.get("/api/sessions")
    def list_sessions():
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT created_at, mcq_count, score, accuracy, avg_time, variance, streak, overtime_ratio "
                "FROM sessions ORDER BY id DESC LIMIT 100"
            ).fetchall()
        return jsonify([dict(r) for r in rows])

    @app.post("/api/sessions")
    def save_session():
        data = request.get_json(force=True)
        required = [
            "mcqCount",
            "score",
            "accuracy",
            "avgTime",
            "variance",
            "streak",
            "overtimeRatio",
        ]
        missing = [k for k in required if k not in data]
        if missing:
            return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

        with get_conn() as conn:
            conn.execute(
                """
                INSERT INTO sessions (created_at, mcq_count, score, accuracy, avg_time, variance, streak, overtime_ratio)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.utcnow().isoformat(),
                    int(data["mcqCount"]),
                    float(data["score"]),
                    float(data["accuracy"]),
                    float(data["avgTime"]),
                    float(data["variance"]),
                    int(data["streak"]),
                    float(data["overtimeRatio"]),
                ),
            )
            conn.commit()
        return jsonify({"status": "saved"})

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
