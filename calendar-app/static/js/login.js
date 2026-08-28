/* ── Login page ──────────────────────────────────────────────────── */
(function () {
  document.documentElement.dataset.theme =
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const browserLang = (navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
  setLanguage(browserLang);

  const form = document.getElementById("login-form");
  const pwInput = document.getElementById("login-password");
  const errEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");

  document.getElementById("login-eye").addEventListener("click", () => {
    pwInput.type = pwInput.type === "password" ? "text" : "password";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = t("login_submitting");
    try {
      await apiPost("/login", { password: pwInput.value });
      window.location.href = "/";
    } catch (err) {
      const key = "err_" + err.message;
      errEl.textContent = t(key) === key ? t("err_bad_password") : t(key);
      errEl.hidden = false;
      pwInput.select();
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  });
})();
