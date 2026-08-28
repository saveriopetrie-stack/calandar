/* ── Global state + core UI (modals, toasts, theme, nav) ───────── */
const CalendarApp = {
  state: {
    viewDate: new Date(),        // month being viewed (first day)
    selectedDate: new Date(),    // selected day (date only)
    events: [],
    tasks: [],
    completions: new Map(),      // taskId -> Set(YYYY-MM-DD)
    settings: { language: "zh", theme: "auto", deepseek_configured: false },
    theme: "light",
  },
  els: {},

  init() {
    this.cacheEls();
    this.bindEvents();
    this.loadSettings().then(() => {
      setLanguage(this.state.settings.language);
      this.applyTheme();
      this.refreshAll();
    });
    window.CalendarApp = this;
  },

  cacheEls() {
    const ids = [
      "month-title", "btn-prev", "btn-next", "btn-plus", "plus-menu",
      "btn-more", "more-menu", "more-lang-label",
      "month-picker", "mp-year", "mp-months", "mp-prev-year", "mp-next-year", "mp-today",
      "mini-cal", "weekday-row", "month-grid", "task-list", "tasks-empty",
      "tasks-date", "btn-add-task", "toast-wrap",
      "day-popover", "dp-title", "dp-close", "dp-add", "dp-list", "dp-empty",
      "event-modal", "event-modal-title", "task-modal", "task-modal-title",
      "settings-modal", "settings-title", "voice-modal", "confirm-modal",
      "confirm-text", "confirm-yes", "confirm-no",
      "set-key", "set-key-status", "set-base-url", "set-model", "set-language", "set-theme",
      "security-form", "security-status", "security-current-field", "sec-current", "sec-new",
      "sec-disable", "menu-logout",
    ];
    ids.forEach((id) => (this.els[id] = document.getElementById(id)));
  },

  bindEvents() {
    const { els } = this;
    els["btn-prev"].addEventListener("click", () => this.shiftMonth(-1));
    els["btn-next"].addEventListener("click", () => this.shiftMonth(1));
    els["month-title"].addEventListener("click", () => MonthPicker.open(els["month-title"]));
    els["btn-add-task"].addEventListener("click", () => Tasks.openModal(null));

    // "+" create menu
    els["btn-plus"].addEventListener("click", (e) => {
      e.stopPropagation();
      if (els["plus-menu"].hidden) {
        els["plus-menu"].hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => els["plus-menu"].classList.add("show")));
      } else {
        this.closePlusMenu();
      }
    });
    els["plus-menu"].querySelectorAll("[data-action]").forEach((item) => {
      item.addEventListener("click", () => {
        this.closePlusMenu();
        const a = item.dataset.action;
        if (a === "event") Events.openModal(null, this.state.selectedDate);
        else if (a === "voice") Voice.open();
        else if (a === "task") Tasks.openModal(null);
      });
    });

    // "⋯" more menu: language / theme / settings
    els["btn-more"].addEventListener("click", (e) => {
      e.stopPropagation();
      if (els["more-menu"].hidden) {
        els["more-menu"].hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => els["more-menu"].classList.add("show")));
      } else {
        this.closeMoreMenu();
      }
    });
    els["more-menu"].querySelectorAll("[data-action]").forEach((item) => {
      item.addEventListener("click", () => {
        this.closeMoreMenu();
        const a = item.dataset.action;
        if (a === "lang") this.toggleLang();
        else if (a === "theme") this.cycleTheme();
        else if (a === "settings") this.openSettings();
        else if (a === "logout") this.logout();
      });
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".menu-wrap")) {
        this.closePlusMenu();
        this.closeMoreMenu();
      }
    });

    // month picker
    els["mp-prev-year"].addEventListener("click", () => MonthPicker.shiftYear(-1));
    els["mp-next-year"].addEventListener("click", () => MonthPicker.shiftYear(1));
    els["mp-today"].addEventListener("click", () => this.goToday());
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest("#month-picker") && !e.target.closest("#month-title") && !e.target.closest(".mini-title")) {
        MonthPicker.close();
      }
    });

    // day popover (docked, draggable)
    els["dp-close"].addEventListener("click", () => DayPanel.close());
    els["dp-add"].addEventListener("click", () => {
      Events.openModal(null, DayPanel.date || this.state.selectedDate);
    });
    DayPanel.bindDrag();

    // modal open/close via backdrop
    document.querySelectorAll(".modal-backdrop").forEach((bd) => {
      bd.addEventListener("click", (e) => {
        if (e.target === bd) this.closeModal(bd.id);
      });
      bd.querySelectorAll("[data-close]").forEach((btn) => {
        btn.addEventListener("click", () => this.closeModal(bd.id));
      });
    });

    // escape closes everything; "t" jumps to today
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        DayPanel.close();
        MonthPicker.close();
        this.closePlusMenu();
        this.closeMoreMenu();
        const open = [...document.querySelectorAll(".modal-backdrop.show")];
        if (open.length) this.closeModal(open[open.length - 1].id);
        return;
      }
      const tag = (e.target && e.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable);
      if (!typing && (e.key === "t" || e.key === "T")) this.goToday();
    });

    // confirm dialog
    els["confirm-no"].addEventListener("click", () => this.closeModal("confirm-modal"));
    els["confirm-yes"].addEventListener("click", () => {
      if (this._confirmCb) { this._confirmCb(); this._confirmCb = null; }
      this.closeModal("confirm-modal");
    });

    // mobile tabs
    document.querySelectorAll(".mobile-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".mobile-tab").forEach((x) => x.classList.remove("active"));
        tab.classList.add("active");
        document.body.dataset.tab = tab.dataset.tab;
      });
    });

    // settings form
    document.getElementById("settings-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveSettings();
    });
    document.getElementById("set-key-toggle").addEventListener("click", () => {
      const inp = els["set-key"];
      inp.type = inp.type === "password" ? "text" : "password";
    });

    // security (access password) form
    els["security-form"].addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveSecurity();
    });
    els["sec-disable"].addEventListener("click", () => this.disableSecurity());
  },

  /* ── topbar actions ── */
  toggleLang() {
    const next = this.state.settings.language === "zh" ? "en" : "zh";
    this.state.settings.language = next;
    setLanguage(next);
    apiPost("/api/settings", { language: next }).catch(() => {});
  },

  cycleTheme() {
    const order = ["auto", "light", "dark"];
    const cur = this.state.settings.theme;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    this.state.settings.theme = next;
    this.applyTheme();
    apiPost("/api/settings", { theme: next }).catch(() => {});
  },

  goToday() {
    this.state.viewDate = startOfMonth(new Date());
    this.state.selectedDate = new Date();
    MonthPicker.close();
    this.renderAll();
  },

  closePlusMenu() {
    const m = this.els["plus-menu"];
    m.classList.remove("show");
    clearTimeout(this._plusTimer);
    this._plusTimer = setTimeout(() => { m.hidden = true; }, 180);
  },

  closeMoreMenu() {
    const m = this.els["more-menu"];
    m.classList.remove("show");
    clearTimeout(this._moreTimer);
    this._moreTimer = setTimeout(() => { m.hidden = true; }, 180);
  },

  /* ── settings ── */
  async loadSettings() {
    try {
      const s = await apiGet("/api/settings");
      this.state.settings = { ...this.state.settings, ...s };
    } catch (e) { /* offline default */ }
    this.els["menu-logout"].hidden = !this.state.settings.auth_enabled;
  },

  applyTheme() {
    const pref = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = this.state.settings.theme === "auto" ? pref : this.state.settings.theme;
    this.state.theme = theme;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#1c1c1e" : "#f5f5f7";
  },

  async saveSettings() {
    const body = {};
    const key = this.els["set-key"].value.trim();
    if (key) body.deepseek_api_key = key;
    body.deepseek_base_url = this.els["set-base-url"].value.trim();
    body.deepseek_model = this.els["set-model"].value.trim();
    body.language = this.els["set-language"].value;
    body.theme = this.els["set-theme"].value;
    try {
      const s = await apiPost("/api/settings", body);
      this.state.settings = { ...this.state.settings, ...s };
      setLanguage(s.language);
      this.applyTheme();
      this.toast(t("updated"), "ok");
      this.closeModal("settings-modal");
      this.refreshSettingsUI();
    } catch (e) {
      this.toast(this.errText(e), "err");
    }
  },

  openSettings() {
    this.refreshSettingsUI();
    this.openModal("settings-modal");
  },

  refreshSettingsUI() {
    const s = this.state.settings;
    this.els["set-key"].value = "";
    this.els["set-key-status"].textContent = s.deepseek_configured
      ? t("api_key_saved") + (s.deepseek_key_masked || "")
      : t("api_key_missing");
    this.els["set-key-status"].className = "hint " + (s.deepseek_configured ? "ok" : "err");
    this.els["set-base-url"].value = s.deepseek_base_url || "";
    this.els["set-model"].value = s.deepseek_model || "";
    this.els["set-language"].value = s.language;
    this.els["set-theme"].value = s.theme;

    this.els["sec-current"].value = "";
    this.els["sec-new"].value = "";
    this.els["security-current-field"].hidden = !s.auth_enabled;
    this.els["sec-disable"].hidden = !s.auth_enabled;
    this.els["security-status"].textContent = s.auth_enabled ? t("security_hint_on") : t("security_hint_off");
    this.els["security-status"].className = "hint " + (s.auth_enabled ? "ok" : "err");
    this.els["menu-logout"].hidden = !s.auth_enabled;
  },

  async saveSecurity() {
    const newPassword = this.els["sec-new"].value;
    if (!newPassword) return;
    const body = {
      new_password: newPassword,
      current_password: this.els["sec-current"].value,
    };
    try {
      const s = await apiPost("/api/security", body);
      this.state.settings.auth_enabled = s.auth_enabled;
      this.toast(t("security_saved"), "ok");
      this.refreshSettingsUI();
    } catch (e) {
      this.toast(this.errText(e), "err");
    }
  },

  async disableSecurity() {
    const body = { new_password: "", current_password: this.els["sec-current"].value };
    try {
      const s = await apiPost("/api/security", body);
      this.state.settings.auth_enabled = s.auth_enabled;
      this.toast(t("security_disabled"), "ok");
      this.refreshSettingsUI();
    } catch (e) {
      this.toast(this.errText(e), "err");
    }
  },

  async logout() {
    try { await apiPost("/logout"); } catch (e) { /* ignore */ }
    window.location.href = "/login";
  },

  /* ── data ── */
  async refreshAll() {
    await Promise.all([Events.load(), Tasks.load()]);
    this.renderAll();
  },

  renderAll() {
    Calendar.renderMonth();
    Calendar.renderMini();
    Tasks.renderPanel();
    DayPanel.refresh();
  },

  refreshDynamic() {
    // called after language switch — re-render everything dynamic
    this.renderAll();
  },

  /* ── month nav ── */
  shiftMonth(delta) {
    const d = new Date(this.state.viewDate);
    d.setMonth(d.getMonth() + delta, 1);
    this.state.viewDate = d;
    this.renderAll();
  },

  selectDate(date) {
    this.state.selectedDate = date;
    // jump month if selected outside current view
    if (date.getFullYear() !== this.state.viewDate.getFullYear() ||
        date.getMonth() !== this.state.viewDate.getMonth()) {
      this.state.viewDate = startOfMonth(date);
    }
    this.renderAll();
  },

  /* ── modals ── */
  openModal(id) {
    const bd = document.getElementById(id);
    bd.hidden = false;
    // force reflow so the transition plays
    requestAnimationFrame(() => requestAnimationFrame(() => bd.classList.add("show")));
    const focusable = bd.querySelector("input:not([type=hidden]), select, textarea, button");
    if (focusable) setTimeout(() => focusable.focus(), 60);
  },

  closeModal(id) {
    const bd = document.getElementById(id);
    bd.classList.remove("show");
    setTimeout(() => { bd.hidden = true; }, 160);
  },

  confirm(text, cb) {
    this._confirmCb = cb;
    this.els["confirm-text"].textContent = text;
    this.openModal("confirm-modal");
  },

  /* ── toasts ── */
  toast(msg, kind = "ok") {
    const wrap = this.els["toast-wrap"];
    const el = document.createElement("div");
    el.className = "toast entering";
    const icon = kind === "ok"
      ? '<svg class="t-ok" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
      : '<svg class="t-err" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
    el.innerHTML = icon + "<span></span>";
    el.querySelector("span").textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("entering")));
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 160);
    }, 2600);
  },

  errText(e) {
    const m = e && e.message;
    return t("err_" + m) || m || t("err_network");
  },
};

/* ── date helpers ──────────────────────────────────────────────── */
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function toDateKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dateFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayKey() { return toDateKey(new Date()); }
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function timeLabel(e) {
  if (e.all_day) return t("all_day_label");
  const s = e.start_time || "00:00";
  if (e.end_date === e.start_date && e.end_time) return `${s} – ${e.end_time}`;
  return s + (e.end_date !== e.start_date ? " …" : "");
}

document.addEventListener("DOMContentLoaded", () => CalendarApp.init());
