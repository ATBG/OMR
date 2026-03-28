CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    exam_name TEXT,
    mcq_count INTEGER NOT NULL,
    score REAL NOT NULL,
    accuracy REAL NOT NULL,
    avg_time REAL NOT NULL,
    variance REAL NOT NULL,
    streak INTEGER NOT NULL,
    overtime_ratio REAL NOT NULL
);
