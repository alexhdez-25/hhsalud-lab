import datetime, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from hhsalud import engine as eng
from hhsalud.engine import Engine, ActionError
from hhsalud.seed import seed_state, DEMO_PASSWORDS

# Reloj fijo para pruebas: martes a las 06:30 (antes de abrir)
eng.set_clock("2026-11-24T06:30:00")
TODAY = "2026-11-24"


def engine():
    e = Engine(seed_state(datetime.date(2026, 11, 24)))
    e.ensure_passwords(DEMO_PASSWORDS)
    return e


def uid(e, username):
    return e._find("users", "username", username)["id"]


class TestAcceso(unittest.TestCase):
    def test_login_correcto_e_incorrecto(self):
        e = engine()
        self.assertEqual(e.login("admin", "admin123")["role"], "admin")
        with self.assertRaises(ActionError):
            e.login("admin", "mala")

    def test_paciente_solo_ve_lo_suyo(self):
        e = engine()
        st = e.public_state(uid(e, "paciente"))
        self.assertEqual(len(st["patients"]), 1)
        self.assertTrue(all(v["pid"] == st["patients"][0]["id"] for v in st["visits"]))
        self.assertEqual(st["audit"], [])
        self.assertTrue(all("pw" not in u for u in st["users"]))

    def test_permisos(self):
        e = engine()
        with self.assertRaises(ActionError):
            e.do(uid(e, "recepcion"), "sign", {"vid": "V1"})
        with self.assertRaises(ActionError):
            e.do(uid(e, "medico"), "cfg", {"center": "X"})


class TestAdministracion(unittest.TestCase):
    def test_crear_usuario_y_cambiar_contrasena(self):
        e = engine()
        a = uid(e, "admin")
        e.do(a, "user_save", {"username": "Caja2", "name": "Luis Pérez", "role": "recepcion", "password": "secreta1"})
        self.assertEqual(e.login("caja2", "secreta1")["role"], "recepcion")
        nid = uid(e, "caja2")
        e.do(a, "user_pw", {"id": nid, "password": "otra123"})
        self.assertEqual(e.login("caja2", "otra123")["id"], nid)
        e.do(a, "user_toggle", {"id": nid})
        with self.assertRaises(ActionError):
            e.login("caja2", "otra123")

    def test_admin_no_puede_desactivarse(self):
        e = engine()
        a = uid(e, "admin")
        with self.assertRaises(ActionError):
            e.do(a, "user_toggle", {"id": a})

    def test_precio_e_iva(self):
        e = engine()
        a = uid(e, "admin")
        e.do(a, "service_save", {"id": "S-CON", "name": "Consulta general", "price": "2000", "ars": True, "active": True})
        e.do(a, "ars_save", {"id": "ARS-1", "name": "ARS pública", "coverage": 75, "active": True})
        self.assertEqual(e._find("ars", "id", "ARS-1")["coverage"], 0.75)
        e.do(a, "cfg", {"itbis_exempt": False})
        self.assertFalse(e.s["config"]["itbis_exempt"])


class TestReglasClinicas(unittest.TestCase):
    def test_flujo_completo(self):
        e = engine()
        r, enf, med = uid(e, "recepcion"), uid(e, "enfermeria"), uid(e, "medico")
        e.do(r, "new_patient", {"name": "Ana Particular", "age": 30, "consent_data": True})
        e.do(r, "book", {"pid": e.s["patients"][-1]["id"], "time": "12:40", "reason": "Control", "service": "S-CON"})
        v = e.visit("V%d" % e.s["seq"]["visit"])
        with self.assertRaises(ActionError):
            e.do(enf, "triage", {"vid": v["id"], "pa": "120/80"})  # aún no llega
        e.do(r, "arrive", {"vid": v["id"]})
        with self.assertRaises(ActionError):
            e.do(med, "sign", {"vid": v["id"], "note": "x", "dx": "I10"})  # sin triaje
        e.do(enf, "triage", {"vid": v["id"], "pa": "120/80", "fc": 80, "t": "36.8", "sat": 98, "peso": 70})
        e.do(med, "sign", {"vid": v["id"], "note": "Control estable", "dx": "I10"})
        self.assertEqual(v["st"], "atendido")
        e.do(r, "pay", {"vid": v["id"], "method": "Tarjeta"})
        self.assertTrue(v["paid"] and v["ecf"].startswith("e-CF"))
        self.assertIn("exento de ITBIS", v["ecf"])

    def test_copago_ars_exige_autorizacion(self):
        e = engine()
        r, enf, med = uid(e, "recepcion"), uid(e, "enfermeria"), uid(e, "medico")
        e.do(r, "book", {"pid": "P-2210", "time": "12:20", "service": "S-CON"})
        v = e.visit("V%d" % e.s["seq"]["visit"])
        e.do(r, "arrive", {"vid": v["id"]})
        e.do(enf, "triage", {"vid": v["id"], "pa": "130/85"})
        e.do(med, "sign", {"vid": v["id"], "note": "Control", "dx": "I10"})
        with self.assertRaises(ActionError):
            e.do(r, "pay", {"vid": v["id"]})
        e.do(r, "pay", {"vid": v["id"], "auth": "55120900"})
        self.assertEqual(v["ars_amount"], 1200.0)   # 80 % de RD$1,500
        self.assertEqual(v["copay"], 300.0)
        c = e.s["ars_claims"][-1]
        self.assertEqual((c["amount"], c["status"]), (1200.0, "Por reclamar"))
        e.do(r, "ars_status", {"id": c["id"]})
        self.assertEqual(c["status"], "Reclamada")

    def test_alergia_bloquea_receta(self):
        e = engine()
        med = uid(e, "medico")
        p = next(x for x in e.s["patients"] if x["allergy"])
        e.do(uid(e, "recepcion"), "book", {"pid": p["id"], "time": "12:40", "reason": "Dolor", "service": "S-CON"})
        v = e.visit("V%d" % e.s["seq"]["visit"])
        d = next(x for x in e.s["drugs"] if x["group"] and x["group"].lower() in p["allergy"].lower())
        with self.assertRaises(ActionError):
            e.do(med, "rx", {"vid": v["id"], "drug": d["id"]})

    def test_paciente_nuevo_exige_consentimiento(self):
        e = engine()
        with self.assertRaises(ActionError):
            e.do(uid(e, "recepcion"), "new_patient", {"name": "Ana", "age": 30})


class TestAgendaReal(unittest.TestCase):
    def test_cada_paciente_ve_solo_lo_suyo(self):
        e = engine()
        for user, pid in (("paciente", "P-2210"), ("juan.mejia", "P-1874"), ("rosanna.feliz", "P-2305")):
            u = e.login(user, "demo123")
            st = e.public_state(u["id"])
            self.assertEqual([p["id"] for p in st["patients"]], [pid])
            self.assertTrue(all(v["pid"] == pid for v in st["visits"]))

    def test_no_se_agenda_en_el_pasado_ni_en_horario_ocupado(self):
        e = engine()
        r = uid(e, "recepcion")
        eng.set_clock(TODAY + "T10:05:00")
        try:
            with self.assertRaises(ActionError):
                e.do(r, "book", {"pid": "P-2210", "date": TODAY, "time": "09:00"})
            e.do(r, "book", {"pid": "P-2210", "date": TODAY, "time": "10:12"})
            with self.assertRaises(ActionError):
                e.do(r, "book", {"pid": "P-1559", "date": TODAY, "time": "10:12"})
            self.assertNotIn("10:12", e.free_slots(TODAY, "C2"))
            self.assertTrue(all(t > "10:05" for t in e.free_slots(TODAY, "C2")))
        finally:
            eng.set_clock("2026-11-24T06:30:00")

    def test_domingo_y_fuera_de_horario(self):
        e = engine()
        r = uid(e, "recepcion")
        with self.assertRaises(ActionError):
            e.do(r, "book", {"pid": "P-2305", "date": "2026-11-29", "time": "09:00"})  # domingo
        with self.assertRaises(ActionError):
            e.do(r, "book", {"pid": "P-2305", "date": "2026-11-25", "time": "20:00"})

    def test_cancelar_libera_el_horario_y_llegada_solo_el_dia(self):
        e = engine()
        pac = uid(e, "paciente")
        e.do(pac, "book", {"date": "2026-11-26", "time": "09:00"})
        v = e.visit("V%d" % e.s["seq"]["visit"])
        with self.assertRaises(ActionError):
            e.do(uid(e, "recepcion"), "arrive", {"vid": v["id"]})
        e.do(pac, "cancel", {"vid": v["id"]})
        self.assertEqual(v["st"], "cancelada")
        self.assertIn("09:00", e.free_slots("2026-11-26", "C2"))

    def test_paciente_nuevo_con_acceso(self):
        e = engine()
        e.do(uid(e, "recepcion"), "new_patient", {"name": "Ana Rosario", "consent_data": True, "username": "ana.rosario", "password": "clave12"})
        u = e.login("ana.rosario", "clave12")
        st = e.public_state(u["id"])
        self.assertEqual(st["patients"][0]["name"], "Ana Rosario")

    def test_datos_antiguos_se_reemplazan(self):
        s, replaced = eng.upgrade({"version": 1}, seed_state)
        self.assertTrue(replaced)
        self.assertEqual(s["version"], eng.SCHEMA)


if __name__ == "__main__":
    unittest.main()
