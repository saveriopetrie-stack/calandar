/* ── Voice input + AI parse flow ─────────────────────────────────── */
const Voice = {
  _rec: null,
  _listening: false,

  open() {
    const app = CalendarApp;
    document.getElementById("voice-transcript").hidden = true;
    document.getElementById("voice-transcript").textContent = "";
    document.getElementById("voice-hint").textContent = t("voice_hint");
    document.getElementById("voice-hint").hidden = false;
    document.getElementById("voice-examples").hidden = false;
    document.getElementById("parse-result").hidden = true;
    document.getElementById("parse-result").innerHTML = "";
    document.getElementById("voice-text").value = "";
    this._stopListening();
    app.openModal("voice-modal");
  },

  close() {
    this._stopListening();
    CalendarApp.closeModal("voice-modal");
  },

  get _supported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  async toggleMic() {
    if (this._listening) { this._stopListening(); return; }
    const app = CalendarApp;
    if (!this._supported) {
      app.toast(t("voice_unsupported"), "err");
      document.getElementById("voice-hint").textContent = t("voice_unsupported");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    this._rec = rec;
    rec.lang = LANG === "zh" ? "zh-CN" : "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    const mic = document.getElementById("mic-btn");
    mic.classList.add("listening");
    this._listening = true;
    document.getElementById("voice-hint").textContent = t("voice_listening");
    document.getElementById("voice-hint").hidden = false;
    document.getElementById("voice-transcript").hidden = true;
    document.getElementById("voice-examples").hidden = true;

    rec.onresult = (ev) => {
      const text = ev.results[0][0].transcript.trim();
      if (text) this.parse(text);
    };
    rec.onerror = (ev) => {
      this._stopListening();
      if (ev.error === "not-allowed") {
        app.toast("麦克风权限被拒绝", "err");
        document.getElementById("voice-hint").textContent = t("voice_unsupported");
      } else if (ev.error === "no-speech") {
        document.getElementById("voice-hint").textContent = t("voice_hint");
        document.getElementById("voice-examples").hidden = false;
      }
    };
    rec.onend = () => this._stopListening();
    try { rec.start(); } catch (e) { this._stopListening(); }
  },

  _stopListening() {
    this._listening = false;
    document.getElementById("mic-btn").classList.remove("listening");
    if (this._rec) {
      try { this._rec.stop(); } catch (e) { /* already stopped */ }
      this._rec = null;
    }
  },

  async parse(text) {
    const app = CalendarApp;
    this._stopListening();
    const transcript = document.getElementById("voice-transcript");
    transcript.textContent = `“${text}”`;
    transcript.hidden = false;
    document.getElementById("voice-hint").hidden = true;
    document.getElementById("voice-examples").hidden = true;

    const resultEl = document.getElementById("parse-result");
    resultEl.hidden = false;
    resultEl.innerHTML = '<div class="parse-loading"><div class="spinner"></div><span></span></div>';
    resultEl.querySelector("span").textContent = t("parsing");

    let data;
    try {
      data = await apiPost("/api/ai/parse", { text });
    } catch (e) {
      const msg = app.errText(e);
      resultEl.innerHTML = "";
      resultEl.innerHTML = `<div class="parse-row"><span class="k"></span><span class="v" style="color:var(--danger)">${escapeHtml(msg)}</span></div>
        <div class="parse-actions" style="margin-top:10px"><button type="button" class="btn btn-primary" id="parse-open-settings">${escapeHtml(t("settings_title"))}</button></div>`;
      resultEl.querySelector("#parse-open-settings").addEventListener("click", () => {
        this.close();
        app.openSettings();
      });
      return;
    }
    this.renderResult(data, text);
  },

  renderResult(data, originalText) {
    const app = CalendarApp;
    const el = document.getElementById("parse-result");
    const kind = data.kind === "task" ? "task" : "event";
    el.innerHTML = "";

    const kindBadge = document.createElement("span");
    kindBadge.className = "parse-kind kind-" + kind;
    kindBadge.textContent = t(kind === "task" ? "parse_task" : "parse_event");
    el.appendChild(kindBadge);

    const fields = document.createElement("div");
    fields.className = "parse-fields";

    const row = (k, v) => {
      if (!v) return;
      const r = document.createElement("div");
      r.className = "parse-row";
      r.innerHTML = `<span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span>`;
      fields.appendChild(r);
    };

    if (kind === "event") {
      row(t("pk_title"), data.title);
      let when;
      if (data.all_day) {
        when = data.start_date;
        if (data.end_date && data.end_date !== data.start_date) when += ` → ${data.end_date}`;
      } else {
        when = data.start_date + (data.start_time ? " " + data.start_time : "");
        if (data.end_date && (data.end_date !== data.start_date || data.end_time)) {
          when += ` → ${data.end_date}${data.end_time ? " " + data.end_time : ""}`;
        }
      }
      row(t("pk_when"), when);
      row(t("pk_location"), data.location);
      row(t("pk_desc"), data.description);
    } else {
      row(t("pk_title"), data.title);
      row(t("pk_type"), t(data.type === "daily" ? "pk_daily" : "pk_onetime") + (data.time ? " · " + data.time : ""));
      if (data.type === "one_time" && data.due_date) row(t("pk_due"), data.due_date);
    }

    el.appendChild(fields);

    const actions = document.createElement("div");
    actions.className = "parse-actions";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn";
    retry.textContent = t("try_again");
    retry.addEventListener("click", () => {
      document.getElementById("parse-result").hidden = true;
      document.getElementById("voice-hint").hidden = false;
      document.getElementById("voice-hint").textContent = t("voice_hint");
      document.getElementById("voice-examples").hidden = false;
    });

    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn-primary";
    save.textContent = t(kind === "task" ? "save_as_task" : "save_to_calendar");
    save.addEventListener("click", async () => {
      save.disabled = true;
      save.textContent = t("saving");
      try {
        if (kind === "event") {
          await apiPost("/api/events", {
            title: data.title || originalText,
            all_day: !!data.all_day,
            start_date: data.start_date,
            start_time: data.start_time || null,
            end_date: data.end_date || data.start_date,
            end_time: data.end_time || null,
            location: data.location || "",
            description: data.description || "",
            color: data.color || "blue",
          });
          app.toast(t("saved_event"));
        } else {
          await apiPost("/api/tasks", {
            title: data.title || originalText,
            type: data.type === "one_time" ? "one_time" : "daily",
            time: data.time || null,
            due_date: data.due_date || (data.type === "one_time" ? todayKey() : null),
          });
          app.toast(t("saved_task"));
        }
        await app.refreshAll();
        this.close();
      } catch (e) {
        save.disabled = false;
        save.textContent = t(kind === "task" ? "save_as_task" : "save_to_calendar");
        app.toast(app.errText(e), "err");
      }
    });

    actions.append(retry, save);
    el.appendChild(actions);
  },
};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("mic-btn").addEventListener("click", () => Voice.toggleMic());
  document.getElementById("btn-parse").addEventListener("click", () => {
    const text = document.getElementById("voice-text").value.trim();
    if (text) Voice.parse(text);
  });
  document.getElementById("voice-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      const text = e.target.value.trim();
      if (text) Voice.parse(text);
    }
  });
  document.querySelectorAll(".chip[data-example]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("voice-text").value = chip.dataset.example;
      Voice.parse(chip.dataset.example);
    });
  });
});
