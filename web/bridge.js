/* Puente de datos: usa el servidor Python (Flask) si está disponible;
   si no (GitHub Pages), ejecuta el mismo motor Python en el navegador con Pyodide. */
(function () {
  "use strict";
  const PYODIDE = window.HHSALUD_PYODIDE || "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  const KEY = "hhsalud.lab.state.v1";
  const SKEY = "hhsalud.lab.uid";

  const Api = { mode: null };

  async function json(r) {
    let body = {};
    try { body = await r.json(); } catch (e) { body = { ok: false, error: "Respuesta no válida del servidor." }; }
    if (!r.ok && body.ok !== false) body = { ok: false, error: "Error " + r.status };
    return body;
  }

  // ---------------------------------------------------------- servidor
  const Server = {
    login: (u, p) => fetch("api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) }).then(json),
    logout: () => fetch("api/logout", { method: "POST" }).then(json),
    state: () => fetch("api/state").then(json),
    act: (action, payload) => fetch("api/do", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) }).then(json),
    exportData: async () => {
      const r = await fetch("api/admin/export");
      if (!r.ok) return json(r);
      const blob = await r.blob();
      download(blob, "hhsalud_lab_copia.json");
      return { ok: true, message: "Copia descargada." };
    },
    importData: (obj) => fetch("api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }).then(json),
    reset: () => fetch("api/admin/reset", { method: "POST" }).then(json),
  };

  // ---------------------------------------------------------- navegador (Pyodide)
  let py = null;
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
    sget: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* nada */ } },
    sdel: (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* nada */ } },
  };
  let memState = null;
  const raw = () => memState;
  const keep = (r) => { memState = r; store.set(KEY, r); };

  const GLUE = `
import json
from hhsalud.engine import Engine, ActionError
from hhsalud.seed import seed_state, DEMO_PASSWORDS

def boot(raw):
    s = json.loads(raw) if raw else seed_state()
    e = Engine(s)
    e.ensure_passwords(DEMO_PASSWORDS)
    return json.dumps(e.s)

def call(raw, uid, op, payload):
    e = Engine(json.loads(raw))
    p = json.loads(payload or "{}")
    try:
        if op == "login":
            u = e.login(p.get("username"), p.get("password"))
            e.log(u["name"], "inició sesión", u["id"])
            return json.dumps({"ok": True, "uid": u["id"], "raw": json.dumps(e.s), "state": e.public_state(u["id"])})
        if op == "state":
            u = e.user(uid)
            if not u or not u.get("active"):
                return json.dumps({"ok": False, "error": "Sesión no iniciada."})
            return json.dumps({"ok": True, "state": e.public_state(uid)})
        if op == "export":
            u = e.user(uid)
            if not u or u["role"] != "admin":
                return json.dumps({"ok": False, "error": "Solo el administrador puede exportar."})
            return json.dumps({"ok": True, "data": e.s})
        r = e.do(uid, op, p)
        return json.dumps({"ok": True, "message": r["message"], "raw": json.dumps(e.s), "state": e.public_state(uid)})
    except ActionError as ex:
        return json.dumps({"ok": False, "error": str(ex)})
`;

  async function loadPy(progress) {
    progress("Cargando el motor Python en el navegador…");
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = PYODIDE + "pyodide.js"; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar Pyodide."));
      document.head.appendChild(s);
    });
    py = await window.loadPyodide({ indexURL: PYODIDE });
    py.FS.mkdirTree("/home/pyodide/hhsalud");
    for (const f of ["__init__.py", "engine.py", "seed.py"]) {
      const r = await fetch("py/" + f);
      if (!r.ok) throw new Error("Falta py/" + f);
      py.FS.writeFile("/home/pyodide/hhsalud/" + f, await r.text());
    }
    py.runPython("import sys; sys.path.insert(0, '/home/pyodide')");
    py.runPython(GLUE);
    progress("Preparando los datos de demostración…");
    keep(py.globals.get("boot")(store.get(KEY, null)));
  }
  function pcall(op, payload) {
    const out = JSON.parse(py.globals.get("call")(raw(), store.sget(SKEY) || "", op, JSON.stringify(payload || {})));
    if (out.raw) keep(out.raw);
    return out;
  }
  const Browser = {
    login: async (u, p) => { const r = pcall("login", { username: u, password: p }); if (r.ok) store.sset(SKEY, r.uid); return r; },
    logout: async () => { store.sdel(SKEY); return { ok: true }; },
    state: async () => (store.sget(SKEY) ? pcall("state") : { ok: false, error: "Sesión no iniciada." }),
    act: async (a, p) => pcall(a, p),
    exportData: async () => {
      const r = pcall("export");
      if (!r.ok) return r;
      download(new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" }), "hhsalud_lab_copia.json");
      return { ok: true, message: "Copia descargada." };
    },
    importData: async (obj) => {
      if (!obj || !obj.config || !obj.users || !obj.patients || !obj.visits) return { ok: false, error: "El archivo no es una copia válida de H&H Salud Lab." };
      if (!obj.users.some((x) => x.role === "admin" && x.active)) return { ok: false, error: "La copia debe incluir al menos un administrador activo." };
      keep(py.globals.get("boot")(JSON.stringify(obj))); store.sdel(SKEY);
      return { ok: true, message: "Datos importados. Vuelva a ingresar." };
    },
    reset: async () => { store.del(KEY); keep(py.globals.get("boot")(null)); store.sdel(SKEY); return { ok: true, message: "Datos de demostración restaurados. Vuelva a ingresar." }; },
  };

  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  Api.init = async function (progress) {
    try {
      const r = await fetch("api/ping", { cache: "no-store" });
      if (r.ok && (await r.json()).mode === "server") { Object.assign(Api, Server); Api.mode = "server"; return; }
    } catch (e) { /* sin servidor: modo navegador */ }
    await loadPy(progress);
    Object.assign(Api, Browser); Api.mode = "browser";
  };
  window.Api = Api;
})();
