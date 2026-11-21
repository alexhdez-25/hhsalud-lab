import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from hhsalud.engine import Engine, ActionError
from hhsalud.seed import seed_state, DEMO_PASSWORDS


def engine():
    e = Engine(seed_state())
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
        v = e.s["visits"][-1]
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
        v = e.s["visits"][-1]
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
        v = e.s["visits"][-1]
        d = next(x for x in e.s["drugs"] if x["group"] and x["group"].lower() in p["allergy"].lower())
        with self.assertRaises(ActionError):
            e.do(med, "rx", {"vid": v["id"], "drug": d["id"]})

    def test_paciente_nuevo_exige_consentimiento(self):
        e = engine()
        with self.assertRaises(ActionError):
            e.do(uid(e, "recepcion"), "new_patient", {"name": "Ana", "age": 30})


if __name__ == "__main__":
    unittest.main()
