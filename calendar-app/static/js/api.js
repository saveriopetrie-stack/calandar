/* ── API helpers ────────────────────────────────────────────────── */
async function api(method, url, body) {
  let opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let resp;
  try {
    resp = await fetch(url, opts);
  } catch (e) {
    throw new Error("network");
  }
  let data = null;
  try { data = await resp.json(); } catch (e) { /* empty body */ }
  if (resp.status === 401 && data && data.error === "auth_required") {
    window.location.href = "/login";
    throw new Error("auth_required");
  }
  if (!resp.ok) {
    const err = (data && data.error) || "unknown";
    throw new Error(err);
  }
  return data;
}

const apiGet = (url) => api("GET", url);
const apiPost = (url, body) => api("POST", url, body);
const apiPut = (url, body) => api("PUT", url, body);
const apiDelete = (url) => api("DELETE", url);
