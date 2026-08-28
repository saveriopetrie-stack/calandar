"""DeepSeek AI client: turns natural-language input into structured event/task JSON."""
import json
import re

import requests

from db import get_setting

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"

SYSTEM_PROMPT = """You are the parsing engine of a calendar app. The user speaks or types a sentence about
an event, a meeting, or a task. Your ONLY job is to convert it to strict JSON. No markdown, no
explanation, no code fences — reply with one valid JSON object only.

Decide the kind:
- If it describes a calendar event / meeting / appointment / activity happening at a specific
  date or time -> kind = "event".
- If it describes a recurring daily routine or a one-time to-do item -> kind = "task".
  "每天早上8点跑步", "daily standup at 9", "remember to buy milk", "写作业" are tasks.

Event JSON:
{"kind":"event","title":string,"all_day":bool,"start_date":"YYYY-MM-DD","start_time":"HH:MM"|null,
 "end_date":"YYYY-MM-DD","end_time":"HH:MM"|null,"location":string,"description":string,
 "color":"red|orange|yellow|green|teal|blue|indigo|purple|pink|gray"}

Task JSON:
{"kind":"task","title":string,"type":"daily"|"one_time","time":"HH:MM"|null,
 "due_date":"YYYY-MM-DD"|null}

Rules:
- Today's date is {today} ({today_weekday}). Resolve relative expressions against it:
  今天/明天/后天/今晚/下周X/下个月/next Friday/this weekend/三天后 etc.
- If a date is given but no clock time, prefer all_day=true for events; if the user clearly
  means a point in the day without a clock time ("明天上午", "后天下午"), pick 09:00 / 14:00
  and set all_day=false.
- If only a clock time is given without a date, assume today (or the nearest sensible day).
- Events default to 1 hour; an explicit end ("3点到4点") overrides it. End must never be
  before start; if so, move end to start+1h.
- Tasks: "每天/每天早上/每周" -> type "daily". A one-off errand without a time -> type
  "one_time", due_date = today unless a date was given. "daily" tasks should still carry
  time when mentioned ("每天8点跑步" -> time "08:00").
- Keep title and description in the same language the user wrote. Title must be concise.
- Empty/missing optional fields -> null or "" as shown in the schemas.
- Choose a sensible color for events (blue by default).
"""


class AIError(Exception):
    """Raised when the AI parse fails for a user-facing reason."""


def _strip_code_fence(text):
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        return fence.group(1).strip()
    return text


def parse_text(text, today):
    """Parse natural-language input into an event/task dict. Raises AIError on failure."""
    api_key = get_setting("deepseek_api_key", "").strip()
    if not api_key:
        raise AIError("no_api_key")

    base_url = (get_setting("deepseek_base_url", "").strip() or DEFAULT_BASE_URL).rstrip("/")
    model = get_setting("deepseek_model", "").strip() or DEFAULT_MODEL

    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    today_str = today.isoformat() if hasattr(today, "isoformat") else str(today)
    system = (SYSTEM_PROMPT
              .replace("{today}", today_str)
              .replace("{today_weekday}", weekdays[today.weekday()]))

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": text},
        ],
        "temperature": 0.1,
        "max_tokens": 500,
        "response_format": {"type": "json_object"},
    }

    try:
        resp = requests.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
    except requests.RequestException as exc:
        raise AIError(f"network: {exc}") from exc

    if resp.status_code == 401:
        raise AIError("bad_api_key")
    if resp.status_code != 200:
        raise AIError(f"http_{resp.status_code}: {resp.text[:200]}")

    try:
        content = resp.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise AIError(f"bad_response: {resp.text[:200]}") from exc

    data = json.loads(_strip_code_fence(content))
    if not isinstance(data, dict):
        raise AIError("bad_json")
    return data
