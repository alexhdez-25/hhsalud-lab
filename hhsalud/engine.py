"""Motor de H&H Salud Lab: toda la lógica de negocio y las reglas de la norma.

Es Python puro (solo biblioteca estándar). Lo usa el servidor Flask en el PC local
y Pyodide en el navegador para la demostración en GitHub Pages.
"""
import copy
import hashlib
import hmac
import os
import time

ROLES = {
    "admin": "Administración",
    "direccion": "Dirección",
    "medico": "Médico",
    "enfermeria": "Enfermería",
    "recepcion": "Recepción y caja",
    "paciente": "Paciente",
}

# Vistas que puede abrir cada rol
VIEWS = {
    "admin": ["inicio", "paciente", "clinica", "recepcion", "direccion", "admin"],
    "direccion": ["inicio", "clinica", "recepcion", "direccion"],
    "medico": ["inicio", "clinica"],
    "enfermeria": ["inicio", "clinica"],
    "recepcion": ["inicio", "recepcion"],
    "paciente": ["paciente"],
}

# Acciones permitidas por rol
PERMS = {
    "book": {"paciente", "recepcion", "admin"},
    "bp": {"paciente", "admin"},
    "tele": {"paciente", "admin"},
    "data_request": {"paciente", "recepcion", "admin"},
    "arrive": {"recepcion", "admin"},
    "pay": {"recepcion", "admin"},
    "new_patient": {"recepcion", "admin"},
    "claim": {"recepcion", "admin"},
    "claim_status": {"recepcion", "direccion", "admin"},
    "ars_status": {"recepcion", "direccion", "admin"},
    "triage": {"enfermeria", "medico", "admin"},
    "open": {"medico", "enfermeria", "direccion", "admin"},
    "save_note": {"medico", "admin"},
    "consent": {"medico", "admin"},
    "rx": {"medico", "admin"},
    "lab": {"medico", "admin"},
    "ref": {"medico", "admin"},
    "vig": {"medico", "admin"},
    "sign": {"medico", "admin"},
}
ADMIN_ACTIONS = {"cfg", "user_save", "user_pw", "user_toggle", "room_save", "service_save", "cie_save",
                 "drug_save", "patient_save", "reset_week", "ars_save"}


class ActionError(Exception):
    """Error que se muestra al usuario tal cual."""


NATIVE_PBKDF2 = hasattr(hashlib, "pbkdf2_hmac")
# En el servidor (CPython) se usan 120 000 iteraciones. En el navegador (Pyodide no trae
# pbkdf2_hmac nativo) se usa una implementación en Python puro con menos iteraciones,
# suficiente para una demostración con datos ficticios.
ITERATIONS = 120_000 if NATIVE_PBKDF2 else 3_000


def _pbkdf2(password, salt, iterations):
    if NATIVE_PBKDF2:
        return hashlib.pbkdf2_hmac("sha256", password, salt, iterations)
    inner, outer = hashlib.sha256(), hashlib.sha256()
    key = password if len(password) <= 64 else hashlib.sha256(password).digest()
    key = key.ljust(64, b"\0")
    inner.update(bytes(x ^ 0x36 for x in key))
    outer.update(bytes(x ^ 0x5C for x in key))

    def prf(msg):
        i, o = inner.copy(), outer.copy()
        i.update(msg)
        o.update(i.digest())
        return o.digest()

    u = prf(salt + b"\x00\x00\x00\x01")
    acc = int.from_bytes(u, "big")
    for _ in range(iterations - 1):
        u = prf(u)
        acc ^= int.from_bytes(u, "big")
    return acc.to_bytes(32, "big")


def hash_pw(password, salt=None, iterations=None):
    """Devuelve 'iteraciones$sal$hash'."""
    salt = salt or os.urandom(16).hex()
    iterations = iterations or ITERATIONS
    dk = _pbkdf2(password.encode(), bytes.fromhex(salt), iterations)
    return f"{iterations}${salt}${dk.hex()}"


def check_pw(password, stored):
    parts = (stored or "").split("$")
    if len(parts) == 2:          # formato anterior sal$hash
        parts = ["120000"] + parts
    if len(parts) != 3:
        return False
    try:
        iterations = int(parts[0])
    except ValueError:
        return False
    return hmac.compare_digest(hash_pw(password, parts[1], iterations), "$".join(parts))


def now_hms():
    t = time.localtime()
    return "%02d:%02d:%02d" % (t.tm_hour, t.tm_min, t.tm_sec)


class Engine:
    def __init__(self, state):
        self.s = state

    # ------------------------------------------------------------ ayuda
    def _find(self, coll, key, val):
        for x in self.s[coll]:
            if x.get(key) == val:
                return x
        return None

    def user(self, uid):
        return self._find("users", "id", uid)

    def patient(self, pid):
        p = self._find("patients", "id", pid)
        if not p:
            raise ActionError("Paciente no encontrado.")
        return p

    def visit(self, vid):
        v = self._find("visits", "id", vid)
        if not v:
            raise ActionError("Atención no encontrada.")
        return v

    def service(self, sid):
        return self._find("services", "id", sid) or {"name": "Servicio", "price": 0.0, "procedure": False}

    def log(self, who, what, ref):
        self.s["audit"].append([now_hms(), who, what, ref])

    def next_id(self, kind, prefix, width=0):
        self.s["seq"][kind] = self.s["seq"].get(kind, 0) + 1
        n = self.s["seq"][kind]
        return f"{prefix}{str(n).zfill(width) if width else n}"

    def ensure_passwords(self, defaults):
        """Asigna contraseñas iniciales a usuarios sin contraseña."""
        for u in self.s["users"]:
            if not u.get("pw"):
                u["pw"] = hash_pw(defaults.get(u["username"], "demo123"))

    # ------------------------------------------------------------ acceso
    def login(self, username, password):
        u = self._find("users", "username", (username or "").strip().lower())
        if not u or not u.get("active") or not check_pw(password or "", u.get("pw")):
            raise ActionError("Usuario o contraseña incorrectos.")
        return self.public_user(u)

    def public_user(self, u):
        return {"id": u["id"], "username": u["username"], "name": u["name"], "role": u["role"],
                "role_name": ROLES[u["role"]], "views": VIEWS[u["role"]], "patient": u.get("patient"), "room": u.get("room")}

    def public_state(self, uid):
        u = self.user(uid)
        st = copy.deepcopy(self.s)
        for x in st["users"]:
            x.pop("pw", None)
        if u and u["role"] == "paciente":
            pid = u.get("patient")
            st["patients"] = [p for p in st["patients"] if p["id"] == pid]
            st["visits"] = [v for v in st["visits"] if v["pid"] == pid]
            st["audit"] = []
            st["claims"] = []
            st["data_requests"] = [r for r in st["data_requests"] if r["pid"] == pid]
            st["notifications"] = []
            st["ars_claims"] = []
            st["users"] = [x for x in st["users"] if x["role"] == "medico"]
        st["me"] = self.public_user(u) if u else None
        st["roles"] = ROLES
        if u and u["role"] != "paciente":
            st["kpis"] = self.kpis()
        return st

    # ------------------------------------------------------------ acciones
    def do(self, uid, action, p=None):
        p = p or {}
        u = self.user(uid)
        if not u or not u.get("active"):
            raise ActionError("Sesión no válida. Vuelva a ingresar.")
        role = u["role"]
        if action in ADMIN_ACTIONS:
            if role != "admin":
                raise ActionError("Solo el administrador puede hacer este cambio.")
        elif role not in PERMS.get(action, set()):
            raise ActionError("Su perfil no tiene permiso para esta acción.")
        fn = getattr(self, "a_" + action, None)
        if not fn:
            raise ActionError("Acción desconocida.")
        msg = fn(u, p)
        return {"ok": True, "message": msg or "Listo."}

    # ---- paciente
    def a_book(self, u, p):
        pid = u.get("patient") if u["role"] == "paciente" else p.get("pid")
        pat = self.patient(pid)
        time_ = p.get("time")
        if not time_:
            raise ActionError("Elija una hora.")
        if any(v["pid"] == pid and v["st"] in ("agendado", "en espera", "triaje") for v in self.s["visits"]):
            raise ActionError("Ya tiene una cita activa.")
        if any(v["time"] == time_ for v in self.s["visits"]):
            raise ActionError("Ese horario ya está ocupado. Elija otro.")
        svc = p.get("service") or "S-CON"
        vid = self.next_id("visit", "V")
        room = self._doctor_room(pat.get("doctor"))
        self.s["visits"].append({"id": vid, "pid": pid, "time": time_, "reason": p.get("reason") or "Consulta",
                                 "service": svc, "st": "agendado", "paid": False, "ecf": None, "vitals": None, "dx": None,
                                 "note": "", "consent": False, "room": room, "source": "app" if u["role"] == "paciente" else "recepcion"})
        self.s["visits"].sort(key=lambda v: v["time"])
        price = self.service(svc)["price"]
        self.log(u["name"], f"agendó cita {p.get('day', '')} {time_}".replace("  ", " "), pid)
        rem = " Recordatorios programados 24 h y 2 h antes." if pat.get("consent_reminders") else ""
        cov = self.coverage(pat, self.service(svc))
        cop = f" Con su ARS paga un copago estimado de {self.money(price - cov[1])}." if cov else ""
        return f"Cita confirmada a las {time_}. Precio informado: {self.money(price)}.{cop}{rem}"

    def coverage(self, pat, svc):
        """Devuelve (ars, monto que cubre la ARS) o None si se paga como particular."""
        a = self._find("ars", "id", pat.get("ars")) if pat.get("ars") else None
        if not a or not a.get("active") or not svc.get("ars"):
            return None
        return a, round(svc["price"] * float(a["coverage"]), 2)

    def _doctor_room(self, doctor):
        for r in self.s["rooms"]:
            if r.get("doctor") == doctor:
                return r["id"]
        return "C2"

    def a_bp(self, u, p):
        val = (p.get("value") or "").strip()
        parts = val.split("/")
        if len(parts) != 2 or not all(x.isdigit() and 2 <= len(x) <= 3 for x in parts):
            raise ActionError("Escriba la presión como 128/82.")
        pat = self.patient(u.get("patient") or p.get("pid"))
        pat.setdefault("bp", []).insert(0, ["16 nov", val])
        self.log(u["name"], "registró presión arterial en casa", pat["id"])
        return "Presión guardada. Su médica la verá en su expediente."

    def a_tele(self, u, p):
        self.log(u["name"], "solicitó teleconsulta", u.get("patient") or "")
        return "Solicitud enviada. Su médica responderá hoy y decidirá si debe venir en persona."

    def a_data_request(self, u, p):
        pid = u.get("patient") if u["role"] == "paciente" else p.get("pid")
        self.patient(pid)
        rid = self.next_id("datareq", "SD-", 3)
        kind = p.get("kind") or "Acceso a mis datos"
        self.s["data_requests"].append({"id": rid, "pid": pid, "kind": kind, "due": "5 días hábiles" if kind.startswith("Acceso") else "10 días hábiles", "status": "Recibida"})
        self.log(u["name"], "solicitud de " + kind.lower(), pid)
        return f"Solicitud {rid} registrada. Plazo de respuesta: {self.s['data_requests'][-1]['due']} (Ley 172-13)."

    # ---- recepción
    def a_arrive(self, u, p):
        v = self.visit(p.get("vid"))
        if v["st"] != "agendado":
            raise ActionError("La llegada ya fue registrada.")
        v["st"] = "en espera"
        pat = self.patient(v["pid"])
        cov = self.coverage(pat, self.service(v["service"]))
        self.log(u["name"], "registró la llegada, validó la cédula" + (" y la afiliación a la ARS" if cov else "") + " e informó el precio", v["id"])
        return "Llegada registrada. Enfermería ve al paciente en espera."

    def a_pay(self, u, p):
        v = self.visit(p.get("vid"))
        if v["st"] != "atendido":
            raise ActionError("Solo se cobra una atención cerrada por el médico.")
        if v["paid"]:
            raise ActionError("Esta atención ya fue cobrada.")
        pat = self.patient(v["pid"])
        svc = self.service(v["service"])
        cfg = self.s["config"]
        price = svc["price"]
        cov = self.coverage(pat, svc)
        lines = [f"{svc['name']}  {self.money(price)}"]
        ars_amount = 0.0
        if cov:
            auth = (p.get("auth") or "").strip()
            if not auth:
                raise ActionError("Indique el número de autorización de la ARS.")
            ars, ars_amount = cov
            lines.append(f"Cobertura {ars['name']} (aut. {auth})  {self.money(ars_amount)}")
            lines.append(f"Copago pagado por el paciente  {self.money(price - ars_amount)}")
            rid = self.next_id("arsclaim", "RA-", 4)
            self.s.setdefault("ars_claims", []).append({"id": rid, "vid": v["id"], "ars": ars["id"], "amount": ars_amount, "auth": auth, "status": "Por reclamar"})
            v["auth"] = auth
        if cfg.get("itbis_exempt", True):
            lines.append("Servicio de salud exento de ITBIS")
        else:
            base = price / (1 + cfg["itbis_rate"])
            lines.append(f"Subtotal {self.money(base)} · ITBIS {self.money(price - base)}")
        self.s["ecf_count"] += 1
        n = self.s["ecf_count"]
        v["paid"] = True
        v["ars_amount"] = ars_amount
        v["copay"] = round(price - ars_amount, 2)
        v["ecf"] = (f"e-CF tipo 32 · Factura de consumo electrónica · Ambiente: pruebas\ne-NCF: E32{str(n).zfill(10)}\n"
                    f"Código de seguridad: {format(n * 7919 % 999983, 'X').zfill(6)}\nCliente: {pat['name']}\n" + "\n".join(lines) +
                    f"\nForma de pago: {p.get('method') or 'Tarjeta'}")
        self.log(u["name"], "emitió e-CF" + (" y registró reclamación a la ARS" if cov else ""), v["id"])
        extra = f" Reclamación a la ARS por {self.money(ars_amount)} registrada." if cov else ""
        return f"Cobro registrado: {self.money(v['copay'])}. e-CF enviado a la DGII (ambiente de pruebas).{extra}"

    def a_ars_status(self, u, p):
        c = self._find("ars_claims", "id", p.get("id"))
        if not c:
            raise ActionError("Reclamación no encontrada.")
        order = ["Por reclamar", "Reclamada", "Pagada"]
        c["status"] = p.get("status") or order[min(order.index(c["status"]) + 1, 2)]
        self.log(u["name"], "actualizó reclamación ARS a " + c["status"].lower(), c["id"])
        return f"Reclamación {c['id']}: {c['status']}."

    def a_new_patient(self, u, p):
        name = (p.get("name") or "").strip()
        if not name:
            raise ActionError("Indique el nombre completo.")
        if not p.get("consent_data"):
            raise ActionError("Sin consentimiento para tratar datos de salud no se puede abrir el expediente.")
        pid = self.next_id("patient", "P-")
        doctor = p.get("doctor") or "U-MED"
        self.s["patients"].append({"id": pid, "name": name, "age": int(p.get("age") or 0), "doc": p.get("doc") or "Ficticio", "ars": p.get("ars") or "", "nss": p.get("nss") or "",
                                   "allergy": p.get("allergy") or "", "chronic": [], "doctor": doctor,
                                   "consent_data": True, "consent_reminders": bool(p.get("consent_reminders")),
                                   "consent_promo": bool(p.get("consent_promo")), "bp": []})
        self.log(u["name"], "abrió expediente nuevo y registró consentimiento", pid)
        if p.get("time"):
            vid = self.next_id("visit", "V")
            self.s["visits"].append({"id": vid, "pid": pid, "time": p["time"], "reason": "Primera consulta", "service": "S-CON",
                                     "st": "en espera", "paid": False, "ecf": None, "vitals": None, "dx": None, "note": "",
                                     "consent": False, "room": self._doctor_room(doctor), "source": "recepcion"})
            self.s["visits"].sort(key=lambda v: v["time"])
        return f"Paciente {pid} inscrito y asignado a su médico de cabecera."

    def a_claim(self, u, p):
        text = (p.get("text") or "").strip()
        if not text:
            raise ActionError("Describa la queja.")
        cid = self.next_id("claim", "Q-", 3)
        self.s["claims"].append({"id": cid, "type": p.get("type") or "Queja", "text": text, "due": "5 días hábiles (plazo interno)", "status": "Recibida"})
        self.log(u["name"], "registró queja", cid)
        return f"Queja {cid} registrada. Respuesta escrita en 5 días hábiles."

    def a_claim_status(self, u, p):
        c = self._find("claims", "id", p.get("id")) or self._find("data_requests", "id", p.get("id"))
        if not c:
            raise ActionError("Registro no encontrado.")
        c["status"] = p.get("status") or "Respondida"
        self.log(u["name"], "cambió estado a " + c["status"], c["id"])
        return "Estado actualizado."

    # ---- clínica
    def a_open(self, u, p):
        v = self.visit(p.get("vid"))
        self.log(u["name"], "abrió el expediente", v["pid"])
        return "Expediente abierto."

    def a_triage(self, u, p):
        v = self.visit(p.get("vid"))
        if v["st"] == "agendado":
            raise ActionError("El paciente aún no ha llegado: recepción debe registrar la llegada.")
        if v["st"] == "atendido":
            raise ActionError("La atención ya está cerrada.")
        v["vitals"] = {k: p.get(k, "") for k in ("pa", "fc", "t", "sat", "peso")}
        v["st"] = "triaje"
        self.log(u["name"], "registró signos vitales", v["id"])
        return "Triaje registrado. El paciente queda listo para consulta."

    def a_save_note(self, u, p):
        v = self.visit(p.get("vid"))
        if v["st"] == "atendido":
            raise ActionError("La nota está firmada; solo se corrige por adenda.")
        v["note"] = p.get("note", v["note"])
        v["dx"] = p.get("dx") or v["dx"]
        return "Borrador guardado."

    def a_consent(self, u, p):
        v = self.visit(p.get("vid"))
        if not p.get("confirmed"):
            raise ActionError("Marque la confirmación de la persona.")
        v["consent"] = True
        self.log(u["name"], "archivó consentimiento firmado", v["id"])
        return "Consentimiento registrado y archivado en el expediente."

    def a_rx(self, u, p):
        v = self.visit(p.get("vid"))
        pat = self.patient(v["pid"])
        d = self._find("drugs", "id", p.get("drug"))
        if not d:
            raise ActionError("Elija un medicamento.")
        if d.get("group") and pat.get("allergy") and d["group"].lower() == pat["allergy"].lower():
            raise ActionError(f"Contraindicado: el paciente tiene alergia registrada a {pat['allergy']}.")
        self.log(u["name"], "emitió receta: " + d["name"], v["id"])
        return "Receta emitida y visible en la app del paciente."

    def a_lab(self, u, p):
        v = self.visit(p.get("vid"))
        self.log(u["name"], "emitió orden de laboratorio (" + (p.get("test") or "hemograma") + ")", v["id"])
        return "Orden enviada al laboratorio aliado."

    def a_ref(self, u, p):
        v = self.visit(p.get("vid"))
        self.log(u["name"], "emitió referencia (" + (p.get("kind") or "consulta especializada") + ") con seguimiento de retorno", v["id"])
        return "Referencia emitida. Enfermería verificará la asistencia y pedirá el retorno."

    def a_vig(self, u, p):
        v = self.visit(p.get("vid"))
        if not v.get("dx") or not self._is_notifiable(v["dx"]):
            raise ActionError("El diagnóstico no es de notificación obligatoria.")
        if any(n["vid"] == v["id"] for n in self.s["notifications"]):
            raise ActionError("La ficha ya fue generada.")
        nid = self.next_id("notif", "VG-", 3)
        self.s["notifications"].append({"id": nid, "vid": v["id"], "dx": v["dx"], "status": "Pendiente de envío"})
        self.log(u["name"], f"generó ficha de notificación SINAVE ({v['dx']})", v["pid"])
        return "Ficha SINAVE prellenada. Se incluye en el reporte semanal del centro."

    def _is_notifiable(self, code):
        c = self._find("cie", "code", code)
        return bool(c and c.get("notifiable"))

    def a_sign(self, u, p):
        v = self.visit(p.get("vid"))
        if v["st"] == "atendido":
            raise ActionError("La nota ya está firmada.")
        if not v.get("vitals"):
            raise ActionError("Falta el triaje de enfermería.")
        note = (p.get("note") or v.get("note") or "").strip()
        dx = p.get("dx") or v.get("dx")
        if not note or not dx:
            raise ActionError("Para firmar, escriba la nota y elija un diagnóstico CIE-10.")
        if self.service(v["service"]).get("procedure") and not v.get("consent"):
            raise ActionError("Procedimiento sin consentimiento escrito: el cierre está bloqueado.")
        v["note"], v["dx"], v["st"] = note, dx, "atendido"
        self.log(u["name"], f"firmó la nota de consulta ({dx})", v["id"])
        extra = " Diagnóstico de notificación obligatoria: genere la ficha." if self._is_notifiable(dx) else ""
        return "Consulta cerrada. El paciente pasa a caja." + extra

    # ---- administración
    def a_cfg(self, u, p):
        c = self.s["config"]
        for k in ("center", "address", "day", "currency"):
            if k in p:
                c[k] = str(p[k]).strip() or c[k]
        for k in ("slot_minutes", "weekly_capacity"):
            if k in p:
                c[k] = max(1, int(p[k]))
        for k in ("itbis_rate", "occupancy_goal"):
            if k in p:
                c[k] = float(p[k])
        if "itbis_exempt" in p:
            c["itbis_exempt"] = bool(p["itbis_exempt"])
        self.log(u["name"], "actualizó la configuración del centro", "config")
        return "Configuración guardada."

    def a_user_save(self, u, p):
        role = p.get("role")
        if role not in ROLES:
            raise ActionError("Rol no válido.")
        username = (p.get("username") or "").strip().lower()
        if not username or not username.replace(".", "").replace("_", "").isalnum():
            raise ActionError("Usuario no válido: use letras, números, punto o guion bajo.")
        name = (p.get("name") or "").strip()
        if not name:
            raise ActionError("Indique el nombre.")
        if p.get("id"):
            x = self.user(p["id"])
            if not x:
                raise ActionError("Usuario no encontrado.")
            other = self._find("users", "username", username)
            if other and other["id"] != x["id"]:
                raise ActionError("Ese nombre de usuario ya existe.")
            if x["id"] == u["id"] and role != "admin":
                raise ActionError("No puede quitarse a sí mismo el rol de administrador.")
            x.update({"username": username, "name": name, "role": role})
        else:
            if self._find("users", "username", username):
                raise ActionError("Ese nombre de usuario ya existe.")
            pw = p.get("password") or ""
            if len(pw) < 6:
                raise ActionError("La contraseña inicial debe tener al menos 6 caracteres.")
            x = {"id": self.next_id("user", "U-", 3), "username": username, "name": name, "role": role, "active": True, "pw": hash_pw(pw)}
            self.s["users"].append(x)
        if role == "paciente":
            pid = p.get("patient")
            self.patient(pid)
            x["patient"] = pid
        if role == "medico" and p.get("room"):
            x["room"] = p["room"]
        self.log(u["name"], f"guardó el usuario {username} ({ROLES[role]})", x["id"])
        return "Usuario guardado."

    def a_user_pw(self, u, p):
        x = self.user(p.get("id"))
        if not x:
            raise ActionError("Usuario no encontrado.")
        pw = p.get("password") or ""
        if len(pw) < 6:
            raise ActionError("La contraseña debe tener al menos 6 caracteres.")
        x["pw"] = hash_pw(pw)
        self.log(u["name"], "cambió la contraseña de " + x["username"], x["id"])
        return "Contraseña actualizada."

    def a_user_toggle(self, u, p):
        x = self.user(p.get("id"))
        if not x:
            raise ActionError("Usuario no encontrado.")
        if x["id"] == u["id"]:
            raise ActionError("No puede desactivar su propio usuario.")
        x["active"] = not x.get("active")
        self.log(u["name"], ("activó" if x["active"] else "desactivó") + " el usuario " + x["username"], x["id"])
        return "Usuario " + ("activado." if x["active"] else "desactivado.")

    def a_room_save(self, u, p):
        name = (p.get("name") or "").strip()
        if not name:
            raise ActionError("Indique el nombre del consultorio.")
        doctor = p.get("doctor") or None
        if doctor:
            d = self.user(doctor)
            if not d or d["role"] != "medico":
                raise ActionError("El responsable debe ser un usuario con rol de médico.")
            for r in self.s["rooms"]:
                if r.get("doctor") == doctor and r["id"] != p.get("id"):
                    r["doctor"] = None
        if p.get("id"):
            r = self._find("rooms", "id", p["id"])
            if not r:
                raise ActionError("Consultorio no encontrado.")
            r.update({"name": name, "doctor": doctor, "active": bool(p.get("active", True))})
        else:
            r = {"id": "C" + str(len(self.s["rooms"]) + 1), "name": name, "doctor": doctor, "active": True}
            self.s["rooms"].append(r)
        self.log(u["name"], "guardó " + name, r["id"])
        return "Consultorio guardado."

    def a_service_save(self, u, p):
        name = (p.get("name") or "").strip()
        try:
            price = round(float(p.get("price")), 2)
        except (TypeError, ValueError):
            raise ActionError("Indique un precio válido.")
        if not name or price < 0:
            raise ActionError("Indique nombre y precio válidos.")
        if p.get("id"):
            s = self._find("services", "id", p["id"])
            if not s:
                raise ActionError("Servicio no encontrado.")
            s.update({"name": name, "price": price, "procedure": bool(p.get("procedure")), "ars": bool(p.get("ars")), "active": bool(p.get("active", True))})
        else:
            s = {"id": "S-" + str(len(self.s["services"]) + 1).zfill(3), "name": name, "price": price, "procedure": bool(p.get("procedure")), "ars": bool(p.get("ars")), "active": True}
            self.s["services"].append(s)
        self.log(u["name"], f"guardó el servicio {name} a {self.money(price)}", s["id"])
        return "Servicio guardado."

    def a_cie_save(self, u, p):
        code = (p.get("code") or "").strip().upper()
        name = (p.get("name") or "").strip()
        if not code or not name:
            raise ActionError("Indique código y descripción.")
        c = self._find("cie", "code", code)
        if c:
            c.update({"name": name, "notifiable": bool(p.get("notifiable"))})
        else:
            self.s["cie"].append({"code": code, "name": name, "notifiable": bool(p.get("notifiable"))})
        self.log(u["name"], f"guardó el diagnóstico {code}", code)
        return "Diagnóstico guardado."

    def a_drug_save(self, u, p):
        name = (p.get("name") or "").strip()
        if not name:
            raise ActionError("Indique el medicamento.")
        if p.get("id"):
            d = self._find("drugs", "id", p["id"])
            if not d:
                raise ActionError("Medicamento no encontrado.")
            d.update({"name": name, "group": (p.get("group") or "").strip()})
        else:
            d = {"id": "D" + str(len(self.s["drugs"]) + 1), "name": name, "group": (p.get("group") or "").strip()}
            self.s["drugs"].append(d)
        self.log(u["name"], "guardó el medicamento " + name, d["id"])
        return "Medicamento guardado."

    def a_patient_save(self, u, p):
        x = self.patient(p.get("id"))
        for k in ("name", "doc", "allergy", "ars", "nss"):
            if k in p:
                x[k] = str(p[k]).strip()
        if "age" in p:
            x["age"] = int(p["age"] or 0)
        if "chronic" in p:
            x["chronic"] = [c.strip() for c in str(p["chronic"]).split(",") if c.strip()]
        for k in ("consent_reminders", "consent_promo"):
            if k in p:
                x[k] = bool(p[k])
        if p.get("doctor"):
            x["doctor"] = p["doctor"]
        self.log(u["name"], "actualizó datos del paciente", x["id"])
        return "Paciente actualizado."

    def a_ars_save(self, u, p):
        name = (p.get("name") or "").strip()
        if not name:
            raise ActionError("Indique el nombre de la ARS.")
        try:
            cov = float(p.get("coverage"))
        except (TypeError, ValueError):
            raise ActionError("La cobertura debe ser un número.")
        if cov > 1:
            cov = cov / 100
        if not 0 <= cov <= 1:
            raise ActionError("La cobertura debe estar entre 0 y 100 %.")
        if p.get("id"):
            a = self._find("ars", "id", p["id"])
            if not a:
                raise ActionError("ARS no encontrada.")
            a.update({"name": name, "coverage": cov, "active": bool(p.get("active", True))})
        else:
            a = {"id": "ARS-" + str(len(self.s["ars"]) + 1), "name": name, "coverage": cov, "active": True}
            self.s["ars"].append(a)
        self.log(u["name"], f"guardó la ARS {name} ({round(cov * 100)} %)", a["id"])
        return "ARS guardada."

    def a_reset_week(self, u, p):
        self.s["week_cons"] = [int(x) for x in p.get("values", self.s["week_cons"])]
        return "Serie actualizada."

    # ------------------------------------------------------------ indicadores
    def money(self, n):
        return ("RD$" if self.s["config"].get("currency") == "DOP" else self.s["config"].get("currency", "") + " ") + f"{n:,.2f}"

    def kpis(self):
        cfg = self.s["config"]
        attended = sum(1 for v in self.s["visits"] if v["st"] == "atendido")
        paid = [v for v in self.s["visits"] if v["paid"]]
        week = self.s["week_cons"][-1] + attended
        return {
            "week": week, "occupancy": week / cfg["weekly_capacity"],
            "collected": sum(v.get("copay", self.service(v["service"])["price"]) for v in paid),
            "ars_pending": sum(c["amount"] for c in self.s.get("ars_claims", []) if c["status"] != "Pagada"),
            "ecf": self.s["ecf_count"], "patients": len(self.s["patients"]),
            "pending_notif": sum(1 for n in self.s["notifications"] if n["status"] != "Enviada"),
            "open_claims": sum(1 for c in self.s["claims"] if c["status"] != "Respondida"),
            "open_requests": sum(1 for r in self.s["data_requests"] if r["status"] != "Respondida"),
        }
