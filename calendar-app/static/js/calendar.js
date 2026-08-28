/* ── Month grid + mini calendar ─────────────────────────────────── */
const Calendar = {
  renderMonth() {
    const app = CalendarApp;
    const grid = app.els["month-grid"];
    const wk = app.els["weekday-row"];
    const vd = app.state.viewDate;
    const sel = app.state.selectedDate;

    app.els["month-title"].textContent = t("month_title", {
      y: vd.getFullYear(),
      m: t("months_full")[vd.getMonth()],
    });

    // weekday header
    wk.innerHTML = "";
    t("weekdays_short").forEach((w) => {
      const s = document.createElement("span");
      s.textContent = w;
      wk.appendChild(s);
    });

    // leading blanks
    const first = new Date(vd.getFullYear(), vd.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(vd.getFullYear(), vd.getMonth() + 1, 0).getDate();
    const prevMonthDays = new Date(vd.getFullYear(), vd.getMonth(), 0).getDate();

    grid.innerHTML = "";
    const frag = document.createDocumentFragment();
    const today = todayKey();

    // build 6 weeks x 7 = 42 cells (stable height)
    for (let i = 0; i < 42; i++) {
      let date, inMonth;
      if (i < lead) {
        date = new Date(vd.getFullYear(), vd.getMonth() - 1, prevMonthDays - lead + 1 + i);
        inMonth = false;
      } else if (i < lead + daysInMonth) {
        date = new Date(vd.getFullYear(), vd.getMonth(), i - lead + 1);
        inMonth = true;
      } else {
        date = new Date(vd.getFullYear(), vd.getMonth() + 1, i - lead - daysInMonth + 1);
        inMonth = false;
      }

      const key = toDateKey(date);
      const cell = document.createElement("div");
      cell.className = "day-cell" + (inMonth ? "" : " out") + (key === today ? " today" : "") + (key === toDateKey(sel) ? " selected" : "");
      cell.dataset.date = key;

      const num = document.createElement("div");
      num.className = "day-num";
      num.textContent = date.getDate();
      cell.appendChild(num);

      const chips = document.createElement("div");
      chips.className = "day-chips";
      const dayEvents = app.state.events
        .filter((e) => key >= e.start_date && key <= e.end_date)
        .sort((a, b) => (a.all_day ? -1 : (a.start_time || "00:00")) > (b.all_day ? -1 : (b.start_time || "00:00")) ? 1 : -1);

      const MAX = 2;
      dayEvents.slice(0, MAX).forEach((e) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `event-chip c-${e.color}`;
        chip.textContent = (e.all_day ? "" : (e.start_time || "") + " ") + e.title;
        chip.addEventListener("click", (ev) => {
          ev.stopPropagation();
          Events.openModal(e);
        });
        chips.appendChild(chip);
      });
      if (dayEvents.length > MAX) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "more-chip";
        more.textContent = `+${dayEvents.length - MAX}`;
        more.addEventListener("click", (ev) => {
          ev.stopPropagation();
          app.selectDate(date);
          DayPanel.open(date);
        });
        chips.appendChild(more);
      }

      cell.appendChild(chips);
      cell.addEventListener("click", () => {
        app.selectDate(date);
        DayPanel.open(date);
      });
      frag.appendChild(cell);
    }
    grid.appendChild(frag);
  },

  renderMini() {
    const app = CalendarApp;
    const el = app.els["mini-cal"];
    const vd = app.state.viewDate;
    const sel = app.state.selectedDate;
    const today = todayKey();

    const head = document.createElement("div");
    head.className = "mini-head";
    const title = document.createElement("button");
    title.type = "button";
    title.className = "mini-title";
    title.textContent = t("month_title", { y: vd.getFullYear(), m: t("months_full")[vd.getMonth()] });
    title.addEventListener("click", () => MonthPicker.open(title));
    const prev = document.createElement("button");
    prev.className = "icon-btn sm";
    prev.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>';
    prev.addEventListener("click", () => app.shiftMonth(-1));
    const next = document.createElement("button");
    next.className = "icon-btn sm";
    next.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>';
    next.addEventListener("click", () => app.shiftMonth(1));
    head.append(prev, title, next);

    const wkRow = document.createElement("div");
    wkRow.className = "mini-weekday";
    t("weekdays_short").forEach((w) => {
      const s = document.createElement("span");
      s.textContent = w;
      wkRow.appendChild(s);
    });

    const grid = document.createElement("div");
    grid.className = "mini-grid";

    const first = new Date(vd.getFullYear(), vd.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(vd.getFullYear(), vd.getMonth() + 1, 0).getDate();
    const prevDays = new Date(vd.getFullYear(), vd.getMonth(), 0).getDate();

    for (let i = 0; i < lead + daysInMonth; i++) {
      let date;
      if (i < lead) {
        date = new Date(vd.getFullYear(), vd.getMonth() - 1, prevDays - lead + 1 + i);
      } else {
        date = new Date(vd.getFullYear(), vd.getMonth(), i - lead + 1);
      }
      const key = toDateKey(date);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "mini-day" + (i < lead ? " out" : "") + (key === today ? " today" : "") + (key === toDateKey(sel) ? " selected" : "");
      cell.textContent = date.getDate();
      cell.addEventListener("click", () => app.selectDate(date));
      grid.appendChild(cell);
    }

    el.innerHTML = "";
    el.append(head, wkRow, grid);
  },
};

/* ── Month / year quick picker ──────────────────────────────────── */
const MonthPicker = {
  year: 0,
  _t: null,

  open(anchor) {
    this.year = CalendarApp.state.viewDate.getFullYear();
    this.render();
    const el = document.getElementById("month-picker");
    el.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth || 280;
    const h = el.offsetHeight || 320;
    let left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    let origin = "top left";
    if (top + h > window.innerHeight - 8) {
      top = Math.max(8, r.top - h - 8);
      origin = "bottom left";
    }
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.setProperty("--origin", origin);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
  },

  close() {
    const el = document.getElementById("month-picker");
    el.classList.remove("show");
    clearTimeout(this._t);
    this._t = setTimeout(() => { el.hidden = true; }, 150);
  },

  shiftYear(delta) {
    this.year += delta;
    this.render();
  },

  render() {
    const app = CalendarApp;
    document.getElementById("mp-year").textContent = this.year;
    const grid = document.getElementById("mp-months");
    grid.innerHTML = "";
    const cur = app.state.viewDate.getMonth();
    t("months_full").forEach((m, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mp-month" + (i === cur ? " active" : "");
      b.textContent = m;
      b.addEventListener("click", () => {
        app.state.viewDate = new Date(this.year, i, 1);
        this.close();
        app.renderAll();
      });
      grid.appendChild(b);
    });
  },
};
