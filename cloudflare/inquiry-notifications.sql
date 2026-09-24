CREATE TABLE IF NOT EXISTS inquiry_notifications (
 inquiry_id TEXT PRIMARY KEY REFERENCES inquiries(id),
 fingerprint TEXT NOT NULL,
 payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0,
 last_attempt INTEGER
);
