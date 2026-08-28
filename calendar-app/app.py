"""Calendar web app — Flask backend.

Run:  python app.py   (then open http://127.0.0.1:5000)
"""
import datetime as dt
import os
import re
import secrets
import time
from collections import defaultdict, deque

from flask import Flask, jsonify, redirect, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

import ai
import db

app = Flask(__name__)
db.init_db()

app.secret_key = os.environ.get("SECRET_KEY") or db.get_setting("_secret_key") or None
if not app.secret_key:
    app.secret_key = secrets.token_hex(32)
    db.set_setting("_secret_key", app.secret_key)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=dt.timedelta(days=30),
    MAX_CONTENT_LENGTH=1 * 1024 * 1024,  # 1 MB request body cap
)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
BASE_URL_RE = re.compile(r"^https?://\S+$")
COLORS = {"red", "orange", "yellow", "green", "teal", "blue", "indigo", "purple", "pink", "gray"}
MAX_TITLE_LEN = 200
MAX_TEXT_LEN = 4000


# ---------------------------------------------------------------- auth

_login_attempts = defaultdict(deque)
_ai_attempts = defaultdict(deque)


def _rate_limited(bucket, key, limit, window_seconds):
    """Sliding-window limiter, in-memory (fine for a single-process personal app)."""
    now = time.time()
    dq = bucket[key]
    while dq and dq[0] < now - window_seconds:
        dq.popleft()
    if len(dq) >= limit:
        return True
    dq.append(now)
    return False


def _auth_enabled():
    return bool(db.get_setting("auth_password_hash"))


def _is_authed():
    return session.get("auth") is True


PUBLIC_PATHS = {"/login", "/logout"}


@app.before_request
def _require_auth():
    if not _auth_enabled():
        return None
    if request.path.startswith("/static/") or request.path in PUBLIC_PATHS:
        return None
    if _is_authed():
        return None
    if request.path.startswith("/api/"):
        return jsonify({"error": "auth_required"}), 401
    return redirect("/login")


@app.after_request
def _security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Permissions-Policy"] = "microphone=(self), geolocation=(), camera=()"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
    )
    return resp


# ---------------------------------------------------------------- helpers

def _clean_event(payload):
    """Validate + normalize an event payload. Returns (data, error)."""
    title = str(payload.get("title", "")).strip()[:MAX_TITLE_LEN]
    if not title:
        return None, "title_required"

    start_date = str(payload.get("start_date", "")).strip()
    if not DATE_RE.match(start_date):
        return None, "bad_date"

    all_day = bool(payload.get("all_day", False))
    start_time = str(payload.get("start_time") or "").strip() or None
    if start_time is not None and not TIME_RE.match(start_time):
        return None, "bad_time"
    if all_day:
        start_time = None

    end_date = str(payload.get("end_date", "")).strip() or start_date
    if not DATE_RE.match(end_date):
        return None, "bad_date"
    end_time = str(payload.get("end_time") or "").strip() or None
    if end_time is not None and not TIME_RE.match(end_time):
        return None, "bad_time"
    if all_day:
        end_time = None

    if not all_day:
        s = dt.datetime.fromisoformat(f"{start_date} {start_time or '00:00'}")
        e = dt.datetime.fromisoformat(f"{end_date} {end_time or '23:59'}")
        if e < s:
            end_date, end_time = start_date, start_time

    color = str(payload.get("color", "blue")).strip() or "blue"
    if color not in COLORS:
        color = "blue"
    data = {
        "title": title,
        "description": str(payload.get("description", "")).strip()[:MAX_TEXT_LEN],
        "location": str(payload.get("location", "")).strip()[:MAX_TITLE_LEN],
        "all_day": 1 if all_day else 0,
        "start_date": start_date,
        "start_time": start_time,
        "end_date": end_date,
        "end_time": end_time,
        "color": color,
    }
    return data, None


def _event_row_to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "location": row["location"],
        "all_day": bool(row["all_day"]),
        "start_date": row["start_date"],
        "start_time": row["start_time"],
        "end_date": row["end_date"],
        "end_time": row["end_time"],
        "color": row["color"],
    }


def _task_row_to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "type": row["type"],
        "time": row["time"],
        "due_date": row["due_date"],
    }


# ---------------------------------------------------------------- pages

@app.get("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------- events API

@app.get("/api/events")
def list_events():
    start = request.args.get("start") or "0000-01-01"
    end = request.args.get("end") or "9999-12-31"
    conn = db.get_db()
    try:
        rows = conn.execute(
            """SELECT * FROM events
               WHERE start_date <= ? AND end_date >= ?
               ORDER BY start_date, COALESCE(start_time, ''), id""",
            (end, start),
        ).fetchall()
        return jsonify([_event_row_to_dict(r) for r in rows])
    finally:
        conn.close()


@app.post("/api/events")
def create_event():
    data, err = _clean_event(request.get_json(silent=True) or {})
    if err:
        return jsonify({"error": err}), 400
    conn = db.get_db()
    try:
        cur = conn.execute(
            """INSERT INTO events (title, description, location, all_day,
                                   start_date, start_time, end_date, end_time, color)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data["title"], data["description"], data["location"], data["all_day"],
             data["start_date"], data["start_time"], data["end_date"], data["end_time"],
             data["color"]),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM events WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(_event_row_to_dict(row)), 201
    finally:
        conn.close()


@app.put("/api/events/<int:event_id>")
def update_event(event_id):
    data, err = _clean_event(request.get_json(silent=True) or {})
    if err:
        return jsonify({"error": err}), 400
    conn = db.get_db()
    try:
        cur = conn.execute(
            """UPDATE events SET title=?, description=?, location=?, all_day=?,
               start_date=?, start_time=?, end_date=?, end_time=?, color=?
               WHERE id=?""",
            (data["title"], data["description"], data["location"], data["all_day"],
             data["start_date"], data["start_time"], data["end_date"], data["end_time"],
             data["color"], event_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "not_found"}), 404
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        return jsonify(_event_row_to_dict(row))
    finally:
        conn.close()


@app.delete("/api/events/<int:event_id>")
def delete_event(event_id):
    conn = db.get_db()
    try:
        cur = conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "not_found"}), 404
        return jsonify({"ok": True})
    finally:
        conn.close()


# ---------------------------------------------------------------- tasks API

@app.get("/api/tasks")
def list_tasks():
    conn = db.get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM tasks ORDER BY type DESC, COALESCE(time, ''), id"
        ).fetchall()
        return jsonify([_task_row_to_dict(r) for r in rows])
    finally:
        conn.close()


@app.post("/api/tasks")
def create_task():
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title", "")).strip()[:MAX_TITLE_LEN]
    if not title:
        return jsonify({"error": "title_required"}), 400
    ttype = payload.get("type") if payload.get("type") in ("daily", "one_time") else "daily"
    ttime = str(payload.get("time") or "").strip() or None
    if ttime is not None and not TIME_RE.match(ttime):
        ttime = None
    due = str(payload.get("due_date") or "").strip() or None
    if due is not None and not DATE_RE.match(due):
        due = None
    if ttype == "one_time" and not due:
        due = dt.date.today().isoformat()
    conn = db.get_db()
    try:
        cur = conn.execute(
            "INSERT INTO tasks (title, type, time, due_date) VALUES (?, ?, ?, ?)",
            (title, ttype, ttime, due),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(_task_row_to_dict(row)), 201
    finally:
        conn.close()


@app.put("/api/tasks/<int:task_id>")
def update_task(task_id):
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title", "")).strip()[:MAX_TITLE_LEN]
    if not title:
        return jsonify({"error": "title_required"}), 400
    ttype = payload.get("type") if payload.get("type") in ("daily", "one_time") else "daily"
    ttime = str(payload.get("time") or "").strip() or None
    if ttime is not None and not TIME_RE.match(ttime):
        ttime = None
    due = str(payload.get("due_date") or "").strip() or None
    if due is not None and not DATE_RE.match(due):
        due = None
    if ttype == "one_time" and not due:
        due = dt.date.today().isoformat()
    conn = db.get_db()
    try:
        cur = conn.execute(
            "UPDATE tasks SET title=?, type=?, time=?, due_date=? WHERE id=?",
            (title, ttype, ttime, due, task_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "not_found"}), 404
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return jsonify(_task_row_to_dict(row))
    finally:
        conn.close()


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    conn = db.get_db()
    try:
        cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "not_found"}), 404
        return jsonify({"ok": True})
    finally:
        conn.close()


@app.get("/api/tasks/<int:task_id>/completions")
def task_completions(task_id):
    conn = db.get_db()
    try:
        rows = conn.execute(
            "SELECT completed_date FROM task_completions WHERE task_id = ?", (task_id,)
        ).fetchall()
        return jsonify([r["completed_date"] for r in rows])
    finally:
        conn.close()


@app.post("/api/tasks/<int:task_id>/complete")
def complete_task(task_id):
    payload = request.get_json(silent=True) or {}
    date = str(payload.get("date", "")).strip()
    if not DATE_RE.match(date):
        return jsonify({"error": "bad_date"}), 400
    conn = db.get_db()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO task_completions (task_id, completed_date) VALUES (?, ?)",
            (task_id, date),
        )
        conn.commit()
        return jsonify({"ok": True, "date": date})
    finally:
        conn.close()


@app.delete("/api/tasks/<int:task_id>/complete")
def uncomplete_task(task_id):
    date = request.args.get("date", "").strip()
    if not DATE_RE.match(date):
        return jsonify({"error": "bad_date"}), 400
    conn = db.get_db()
    try:
        conn.execute(
            "DELETE FROM task_completions WHERE task_id = ? AND completed_date = ?",
            (task_id, date),
        )
        conn.commit()
        return jsonify({"ok": True, "date": date})
    finally:
        conn.close()


# ---------------------------------------------------------------- settings API

def _settings_dict():
    key = db.get_setting("deepseek_api_key", "")
    return {
        "deepseek_configured": bool(key),
        "deepseek_key_masked": _mask(key),
        "deepseek_base_url": db.get_setting("deepseek_base_url", ""),
        "deepseek_model": db.get_setting("deepseek_model", ""),
        "language": db.get_setting("language", "zh"),
        "theme": db.get_setting("theme", "auto"),
        "auth_enabled": _auth_enabled(),
    }


@app.get("/api/settings")
def get_settings():
    return jsonify(_settings_dict())


def _mask(key):
    if not key:
        return ""
    if len(key) <= 8:
        return "••••"
    return key[:4] + "••••" + key[-4:]


@app.post("/api/settings")
def save_settings():
    payload = request.get_json(silent=True) or {}
    if payload.get("deepseek_api_key"):
        db.set_setting("deepseek_api_key", str(payload["deepseek_api_key"]).strip()[:200])
    if payload.get("deepseek_base_url") is not None:
        val = str(payload["deepseek_base_url"]).strip()[:300]
        if val and not BASE_URL_RE.match(val):
            return jsonify({"error": "bad_base_url"}), 400
        db.set_setting("deepseek_base_url", val)
    if payload.get("deepseek_model") is not None:
        db.set_setting("deepseek_model", str(payload["deepseek_model"]).strip()[:100])
    if payload.get("language") in ("zh", "en"):
        db.set_setting("language", payload["language"])
    if payload.get("theme") in ("light", "dark", "auto"):
        db.set_setting("theme", payload["theme"])
    return jsonify(_settings_dict())


# ---------------------------------------------------------------- security / auth API

LOGIN_RATE_LIMIT = 8
LOGIN_RATE_WINDOW = 300  # 5 minutes
AI_RATE_LIMIT = 20
AI_RATE_WINDOW = 300


@app.get("/login")
def login_page():
    if not _auth_enabled() or _is_authed():
        return redirect("/")
    return render_template("login.html")


@app.post("/login")
def login_submit():
    ip = request.remote_addr or "unknown"
    if _rate_limited(_login_attempts, ip, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW):
        return jsonify({"error": "rate_limited"}), 429
    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password", ""))
    stored = db.get_setting("auth_password_hash")
    if not stored or not check_password_hash(stored, password):
        return jsonify({"error": "bad_password"}), 401
    session.clear()
    session["auth"] = True
    session.permanent = True
    return jsonify({"ok": True})


@app.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/security")
def set_security():
    payload = request.get_json(silent=True) or {}
    new_password = str(payload.get("new_password", ""))
    current_password = str(payload.get("current_password", ""))
    stored = db.get_setting("auth_password_hash")
    if stored and not check_password_hash(stored, current_password):
        return jsonify({"error": "bad_password"}), 401
    if new_password:
        if len(new_password) < 6:
            return jsonify({"error": "password_too_short"}), 400
        db.set_setting("auth_password_hash", generate_password_hash(new_password))
        session.clear()
        session["auth"] = True
        session.permanent = True
    else:
        db.set_setting("auth_password_hash", "")
    return jsonify({"auth_enabled": _auth_enabled()})


# ---------------------------------------------------------------- AI parse API

@app.post("/api/ai/parse")
def ai_parse():
    ip = request.remote_addr or "unknown"
    if _rate_limited(_ai_attempts, ip, AI_RATE_LIMIT, AI_RATE_WINDOW):
        return jsonify({"error": "rate_limited"}), 429
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", "")).strip()[:1000]
    if not text:
        return jsonify({"error": "empty"}), 400
    try:
        result = ai.parse_text(text, dt.date.today())
        return jsonify(result)
    except ai.AIError as exc:
        msg = str(exc)
        if msg == "no_api_key":
            return jsonify({"error": "no_api_key"}), 400
        if msg == "bad_api_key":
            return jsonify({"error": "bad_api_key"}), 400
        return jsonify({"error": "ai_failed", "detail": msg}), 502


# ---------------------------------------------------------------- boot

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("HOST", "0.0.0.0")
    debug = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true", "yes")
    if host not in ("127.0.0.1", "localhost") and not _auth_enabled():
        print(
            f"\n⚠️  Warning: server is binding to {host} (reachable from your network) "
            "but no access password is set.\n"
            "   Open the app, go to Settings → Security, and set a password — "
            "or restart with HOST=127.0.0.1 for local-only access.\n"
        )
    app.run(host=host, port=port, debug=debug)
