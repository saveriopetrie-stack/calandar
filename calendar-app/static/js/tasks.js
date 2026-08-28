/* ── Tasks: load, panel render, checkbox, modal ─────────────────── */
const Tasks = {
  async load() {
    const app = CalendarApp;
    const tasks = await apiGet("/api/tasks");
    app.state.tasks = tasks;
    app.state.completions = await this._loadAllCompletions(tasks);
  },

  async _loadAllCompletions(tasks) {
    const map = new Map();
    await Promise.all(tasks.map(async (task) => {
      try {
        const dates = await apiGet(`/api/tasks/${task.id}/completions`);
        map.set(task.id, new Set(dates));
      } catch (e) { map.set(task.id, new Set()); }
    }));
    return map;
  },

  openModal(task) {
    const app = CalendarApp;
    document.getElementById("task-form").reset();
    app.els["task-modal-title"].textContent = t(task ? "task_title_edit" : "task_title_new");
    document.getElementById("tk-delete").hidden = !task;
    document.getElementById("tk-id").value = task ? task.id : "";
    document.getElementById("tk-title").value = task ? task.title : "";
    document.getElementById("tk-time").value = task && task.time ? task.time : "";
    document.getElementById("tk-due").value = task && task.due_date ? task.due_date : toDateKey(app.state.selectedDate);

    const type = task ? task.type : "daily";
    document.querySelectorAll("#tk-type .segment").forEach((seg) => {
      seg.classList.toggle("active", seg.dataset.value === type);
    });
    this.updateTypeFields(type);
    app.openModal("task-modal");
  },

  updateTypeFields(type) {
    document.getElementById("tk-due-field").style.display = type === "one_time" ? "" : "none";
  },

  async save() {
    const app = CalendarApp;
    const id = document.getElementById("tk-id").value;
    const type = document.querySelector("#tk-type .segment.active").dataset.value;
    const payload = {
      title: document.getElementById("tk-title").value.trim(),
      type,
      time: document.getElementById("tk-time").value || null,
      due_date: type === "one_time" ? (document.getElementById("tk-due").value || null) : null,
    };
    try {
      if (id) {
        await apiPut(`/api/tasks/${id}`, payload);
      } else {
        await apiPost("/api/tasks", payload);
      }
      app.toast(t("saved_task"));
      app.closeModal("task-modal");
      await this.load();
      app.renderAll();
    } catch (e) {
      app.toast(app.errText(e), "err");
    }
  },

  async remove() {
    const app = CalendarApp;
    const id = document.getElementById("tk-id").value;
    if (!id) return;
    app.confirm(t("confirm_delete_task"), async () => {
      try {
        await apiDelete(`/api/tasks/${id}`);
        app.toast(t("deleted"));
        app.closeModal("task-modal");
        await this.load();
        app.renderAll();
      } catch (e) {
        app.toast(app.errText(e), "err");
      }
    });
  },

  async toggle(task, dateKey) {
    const app = CalendarApp;
    const set = app.state.completions.get(task.id) || new Set();
    try {
      if (set.has(dateKey)) {
        await apiDelete(`/api/tasks/${task.id}/complete?date=${dateKey}`);
        set.delete(dateKey);
        app.toast(t("updated"));
      } else {
        await apiPost(`/api/tasks/${task.id}/complete`, { date: dateKey });
        set.add(dateKey);
        app.toast(t("done"), "ok");
      }
      this.renderPanel();
    } catch (e) {
      app.toast(app.errText(e), "err");
    }
  },

  renderPanel() {
    const app = CalendarApp;
    const key = toDateKey(app.state.selectedDate);
    const list = app.els["task-list"];
    const today = todayKey();

    app.els["tasks-date"].textContent = fmtDate(app.state.selectedDate, {
      year: "numeric", month: "long", day: "numeric", weekday: "long",
    });

    const visible = app.state.tasks.filter((task) => {
      if (task.type === "daily") return true;
      return (task.due_date || "9999-12-31") <= key; // due on or before selected day
    });

    list.innerHTML = "";
    app.els["tasks-empty"].hidden = visible.length > 0;

    visible
      .sort((a, b) => {
        const da = a.type === "daily" ? "" : (a.due_date || "");
        const db = b.type === "daily" ? "" : (b.due_date || "");
        if (da !== db) return da.localeCompare(db);
        return (a.time || "").localeCompare(b.time || "");
      })
      .forEach((task) => {
        const done = (app.state.completions.get(task.id) || new Set()).has(key);
        const item = document.createElement("li");
        item.className = "task-item" + (done ? " done" : "");

        const check = document.createElement("button");
        check.type = "button";
        check.className = "task-check";
        check.setAttribute("aria-label", task.title);
        check.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
        check.addEventListener("click", () => this.toggle(task, key));

        const body = document.createElement("div");
        body.className = "task-body";

        const title = document.createElement("div");
        title.className = "task-title";
        title.textContent = task.title;

        const meta = document.createElement("div");
        meta.className = "task-meta";
        const parts = [];
        if (task.time) parts.push(task.time);
        if (task.type === "one_time") {
          parts.push(t("pk_onetime"));
          if (task.due_date && task.due_date < today && !done) {
            const ov = document.createElement("span");
            ov.className = "overdue";
            ov.textContent = t("overdue");
            meta.appendChild(ov);
          }
        } else {
          parts.push(t("pk_daily"));
        }
        if (parts.length) {
          const span = document.createElement("span");
          span.textContent = parts.join(" · ");
          meta.appendChild(span);
        }
        body.append(title, meta);

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "task-edit";
        edit.setAttribute("aria-label", t("editing"));
        edit.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
        edit.addEventListener("click", () => this.openModal(task));

        item.append(check, body, edit);
        list.appendChild(item);
      });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("task-form").addEventListener("submit", (e) => {
    e.preventDefault();
    Tasks.save();
  });
  document.getElementById("tk-delete").addEventListener("click", () => Tasks.remove());
  document.querySelectorAll("#tk-type .segment").forEach((seg) => {
    seg.addEventListener("click", () => {
      document.querySelectorAll("#tk-type .segment").forEach((x) => x.classList.remove("active"));
      seg.classList.add("active");
      Tasks.updateTypeFields(seg.dataset.value);
    });
  });
});
