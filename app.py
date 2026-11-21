"""H&H Salud Lab — servidor local.

Uso:  python app.py   (abre http://127.0.0.1:5000)
Los datos se guardan en instance/hhsalud.db (SQLite).
"""
import json
import os
import secrets
import sqlite3
import threading
import webbrowser
from datetime import datetime

from flask import Flask, jsonify, request, send_from_directory, session, Response

from hhsalud.engine import Engine, ActionError
from hhsalud.seed import seed_state, DEMO_PASSWORDS

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "web")
PYDIR = os.path.join(BASE, "hhsalud")
INST = os.path.join(BASE, "instance")
DB = os.path.join(INST, "hhsalud.db")
os.makedirs(INST, exist_ok=True)

app = Flask(__name__, static_folder=None)
key_file = os.path.join(INST, "secret.key")
if not os.path.exists(key_file):
    with open(key_file, "w") as f:
        f.write(secrets.token_hex(32))
app.secret_key = open(key_file).read().strip()
LOCK = threading.Lock()


# ---------------------------------------------------------------- almacenamiento
def db():
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated TEXT NOT NULL)")
    con.execute("CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, created TEXT NOT NULL, reason TEXT)")
    return con


def load():
    with db() as con:
        row = con.execute("SELECT data FROM state WHERE id = 1").fetchone()
    if row:
        return json.loads(row[0])
    s = fresh()
    save(s)
    return s


def fresh():
    e = Engine(seed_state())
    e.ensure_passwords(DEMO_PASSWORDS)
    return e.s


def save(s, backup_reason=None):
    with db() as con:
        if backup_reason:
            old = con.execute("SELECT data FROM state WHERE id = 1").fetchone()
            if old:
                con.execute("INSERT INTO backups (data, created, reason) VALUES (?, ?, ?)", (old[0], datetime.now().isoformat(timespec="seconds"), backup_reason))
        con.execute("INSERT OR REPLACE INTO state (id, data, updated) VALUES (1, ?, ?)", (json.dumps(s, ensure_ascii=False), datetime.now().isoformat(timespec="seconds")))


def err(msg, code=400):
    return jsonify({"ok": False, "error": msg}), code


def current(e):
    uid = session.get("uid")
    u = e.user(uid) if uid else None
    return u if u and u.get("active") else None


# ---------------------------------------------------------------- páginas
@app.get("/")
def index():
    return send_from_directory(WEB, "index.html")


@app.get("/<path:path>")
def static_files(path):
    if path.startswith("py/"):
        return send_from_directory(PYDIR, path[3:])
    return send_from_directory(WEB, path)


# ---------------------------------------------------------------- API
@app.get("/api/ping")
def ping():
    return jsonify({"ok": True, "mode": "server"})


@app.post("/api/login")
def login():
    p = request.get_json(force=True, silent=True) or {}
    with LOCK:
        e = Engine(load())
        try:
            u = e.login(p.get("username"), p.get("password"))
        except ActionError as ex:
            return err(str(ex), 401)
        session["uid"] = u["id"]
        e.log(u["name"], "inició sesión", u["id"])
        save(e.s)
        return jsonify({"ok": True, "state": e.public_state(u["id"])})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/state")
def state():
    e = Engine(load())
    u = current(e)
    if not u:
        return jsonify({"ok": False, "error": "Sesión no iniciada."})
    return jsonify({"ok": True, "state": e.public_state(u["id"])})


@app.post("/api/do")
def do():
    p = request.get_json(force=True, silent=True) or {}
    with LOCK:
        e = Engine(load())
        u = current(e)
        if not u:
            return err("Sesión no iniciada.", 401)
        try:
            r = e.do(u["id"], p.get("action"), p.get("payload") or {})
        except ActionError as ex:
            return err(str(ex))
        save(e.s)
        return jsonify({"ok": True, "message": r["message"], "state": e.public_state(u["id"])})


def admin_only(e):
    u = current(e)
    return u if u and u["role"] == "admin" else None


@app.get("/api/admin/export")
def export():
    e = Engine(load())
    if not admin_only(e):
        return err("Solo el administrador puede exportar.", 403)
    data = json.dumps(e.s, ensure_ascii=False, indent=2)
    return Response(data, mimetype="application/json",
                    headers={"Content-Disposition": f"attachment; filename=hhsalud_lab_{datetime.now():%Y%m%d_%H%M}.json"})


@app.post("/api/admin/import")
def import_():
    with LOCK:
        e = Engine(load())
        u = admin_only(e)
        if not u:
            return err("Solo el administrador puede importar.", 403)
        data = request.get_json(force=True, silent=True)
        if not isinstance(data, dict) or not all(k in data for k in ("config", "users", "patients", "visits")):
            return err("El archivo no es una copia válida de H&H Salud Lab.")
        if not any(x.get("role") == "admin" and x.get("active") for x in data["users"]):
            return err("La copia debe incluir al menos un administrador activo.")
        save(data, backup_reason="antes de importar")
        session.clear()
        return jsonify({"ok": True, "message": "Datos importados. Vuelva a ingresar."})


@app.post("/api/admin/reset")
def reset():
    with LOCK:
        e = Engine(load())
        u = admin_only(e)
        if not u:
            return err("Solo el administrador puede reiniciar.", 403)
        save(fresh(), backup_reason="antes de reiniciar")
        session.clear()
        return jsonify({"ok": True, "message": "Datos de demostración restaurados. Vuelva a ingresar."})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    url = f"http://127.0.0.1:{port}"
    print(f"\n  H&H Salud Lab en {url}\n  Usuario administrador: admin / admin123 (cámbielo en Administración > Usuarios)\n")
    if os.environ.get("NO_BROWSER") != "1":
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=port, debug=False)
