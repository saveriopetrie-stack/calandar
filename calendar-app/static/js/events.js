/* ── Events: load, modal form, day popover ──────────────────────── */
const Events = {
  _color: "blue",

  async load() {
    CalendarApp.state.events = await apiGet("/api/events?start=2000-01-01&end=2099-12-31");
  },

  openModal(event, defaultDate) {
    const app = CalendarApp;
    const form = document.getElementById("event-form");
    form.reset();

    app.els["event-modal-title"].textContent = t(event ? "event_title_edit" : "event_title_new");
    document.getElementById("ev-delete").hidden = !event;
    document.getElementById("ev-id").value = event ? event.id : "";
    document.getElementById("ev-title").value = event ? event.title : "";
    document.getElementById("ev-location").value = event ? (event.location || "") : "";
    document.getElementById("ev-description").value = event ? (event.description || "") : "";

    let startDate, startTime, endDate, endTime, allDay;
    if (event) {
      startDate = event.start_date;
      startTime = event.start_time || "";
      endDate = event.end_date;
      endTime = event.end_time || "";
      allDay = event.all_day;
      this._color = event.color || "blue";
    } else {
      const d = defaultDate || new Date();
      startDate = toDateKey(d);
      endDate = startDate;
      startTime = "";
      endTime = "";
      allDay = false;
      this._color = "blue";
    }

    document.getElementById("ev-start-date").value = startDate;
    document.getElementById("ev-start-time").value = startTime;
    document.getElementById("ev-end-date").value = endDate;
    document.getElementById("ev-end-time").value = endTime;
    document.getElementById("ev-all-day").checked = allDay;
    this.updateTimeFields();

    // color swatches
    document.querySelectorAll("#ev-colors .color-swatch").forEach((sw) => {
      sw.classList.toggle("active", sw.dataset.color === this._color);
    });

    app.openModal("event-modal");
  },

  updateTimeFields() {
    const allDay = document.getElementById("ev-all-day").checked;
    document.getElementById("ev-start-time").disabled = allDay;
    document.getElementById("ev-end-time").disabled = allDay;
    document.getElementById("ev-start-row").style.opacity = allDay ? 0.55 : 1;
    document.getElementById("ev-end-row").style.opacity = allDay ? 0.55 : 1;
  },

  async save(form) {
    const app = CalendarApp;
    const id = document.getElementById("ev-id").value;
    const payload = {
      title: document.getElementById("ev-title").value.trim(),
      all_day: document.getElementById("ev-all-day").checked,
      start_date: document.getElementById("ev-start-date").value,
      start_time: document.getElementById("ev-start-time").value || null,
      end_date: document.getElementById("ev-end-date").value,
      end_time: document.getElementById("ev-end-time").value || null,
      location: document.getElementById("ev-location").value.trim(),
      description: document.getElementById("ev-description").value.trim(),
      color: this._color,
    };
    try {
      if (id) {
        await apiPut(`/api/events/${id}`, payload);
        app.toast(t("event_saved"));
      } else {
        await apiPost("/api/events", payload);
        app.toast(t("saved_event"));
      }
      app.closeModal("event-modal");
      await this.load();
      app.renderAll();
    } catch (e) {
      app.toast(app.errText(e), "err");
    }
  },

  async remove() {
    const app = CalendarApp;
    const id = document.getElementById("ev-id").value;
    if (!id) return;
    app.confirm(t("confirm_delete_event"), async () => {
      try {
        await apiDelete(`/api/events/${id}`);
        app.toast(t("deleted"));
        app.closeModal("event-modal");
        await this.load();
        app.renderAll();
      } catch (e) {
        app.toast(app.errText(e), "err");
      }
    });
  },

  renderAgenda() {
    // (removed — replaced by the DayPanel popover below)
  },
};

/* ── Day panel: bottom-left docked card, draggable, shows day events ── */
const DayPanel = {
  date: null,
  _hideTimer: null,
  _pos: null,   // remembered drag position (session only)

  open(date) {
    clearTimeout(this._hideTimer);
    this.date = date;
    const pop = document.getElementById("day-popover");
    pop.hidden = false;
    this.render();
    // dock bottom-left by default; keep last dragged position if any
    if (this._pos) {
      pop.style.left = this._pos.x + "px";
      pop.style.top = this._pos.y + "px";
      pop.style.bottom = "auto";
      pop.style.setProperty("--origin", "top left");
    } else {
      pop.style.left = "16px";
      pop.style.bottom = "16px";
      pop.style.top = "auto";
      pop.style.setProperty("--origin", "bottom left");
    }
    requestAnimationFrame(() => requestAnimationFrame(() => pop.classList.add("show")));
  },

  close() {
    const pop = document.getElementById("day-popover");
    pop.classList.remove("show");
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => { pop.hidden = true; }, 150);
    this.date = null;
  },

  refresh() {
    if (!this.date) return;
    const pop = document.getElementById("day-popover");
    if (pop.hidden || !pop.classList.contains("show")) return;
    this.render();
  },

  /* pointer-capture drag: 1:1 tracking, clamped to viewport */
  bindDrag() {
    const pop = document.getElementById("day-popover");
    let drag = null;
    pop.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      drag = { dx: e.clientX - pop.offsetLeft, dy: e.clientY - pop.offsetTop, id: e.pointerId };
      pop.setPointerCapture(e.pointerId);
      pop.classList.add("dragging");
      pop.style.bottom = "auto";
    });
    pop.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const left = Math.max(8, Math.min(e.clientX - drag.dx, window.innerWidth - pop.offsetWidth - 8));
      const top = Math.max(8, Math.min(e.clientY - drag.dy, window.innerHeight - pop.offsetHeight - 8));
      pop.style.left = left + "px";
      pop.style.top = top + "px";
      this._pos = { x: left, y: top };
    });
    const end = (e) => {
      if (drag && e.pointerId === drag.id) {
        drag = null;
        pop.classList.remove("dragging");
      }
    };
    pop.addEventListener("pointerup", end);
    pop.addEventListener("pointercancel", end);
  },

  render() {
    const date = this.date;
    if (!date) return;
    const app = CalendarApp;
    const key = toDateKey(date);

    document.getElementById("dp-title").textContent = fmtDate(date);

    const dayEvents = app.state.events
      .filter((e) => key >= e.start_date && key <= e.end_date)
      .sort((a, b) => {
        if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
        return (a.start_time || "").localeCompare(b.start_time || "");
      });

    const list = document.getElementById("dp-list");
    list.innerHTML = "";
    document.getElementById("dp-empty").hidden = dayEvents.length > 0;

    dayEvents.forEach((e) => {
      const row = document.createElement("div");
      row.className = `dp-row c-${e.color}`;

      const dot = document.createElement("span");
      dot.className = "dp-dot";

      const body = document.createElement("div");
      body.className = "dp-body";

      const title = document.createElement("div");
      title.className = "dp-title";
      title.textContent = e.title;

      const meta = document.createElement("div");
      meta.className = "dp-meta";
      const parts = [];
      if (e.all_day) parts.push(t("all_day_label"));
      else {
        if (e.start_time) parts.push(e.start_time);
        if (e.end_time && e.end_date === e.start_date) parts.push("– " + e.end_time);
      }
      if (e.location) parts.push(e.location);
      meta.textContent = parts.filter(Boolean).join(" · ");

      body.append(title, meta);
      row.append(dot, body);
      row.addEventListener("click", () => Events.openModal(e));
      list.appendChild(row);
    });
  },
};

/* wire form events */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("ev-all-day").addEventListener("change", () => Events.updateTimeFields());
  document.getElementById("event-form").addEventListener("submit", (e) => {
    e.preventDefault();
    Events.save();
  });
  document.getElementById("ev-delete").addEventListener("click", () => Events.remove());
  document.querySelectorAll("#ev-colors .color-swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      Events._color = sw.dataset.color;
      document.querySelectorAll("#ev-colors .color-swatch").forEach((x) => x.classList.toggle("active", x === sw));
    });
  });
});
