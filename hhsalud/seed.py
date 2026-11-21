"""Datos iniciales de la versión lab de H&H Salud. Todos los nombres, montos y porcentajes son ficticios."""


def seed_state():
    return {
        "version": 1,
        "config": {
            "center": "Centro H&H Salud · Santo Domingo Este",
            "address": "Ensanche Ozama, Santo Domingo Este (ficticia)",
            "day": "lunes 23 de noviembre de 2026",
            "currency": "DOP",
            "slot_minutes": 12,
            "itbis_rate": 0.18,
            "itbis_exempt": True,
            "weekly_capacity": 1440,
            "occupancy_goal": 0.80,
        },
        "users": [
            {"id": "U-ADM", "username": "admin", "name": "Administración del sistema", "role": "admin", "active": True, "pw": None},
            {"id": "U-DIR", "username": "direccion", "name": "Dr. Rafael Peña", "role": "direccion", "active": True, "pw": None},
            {"id": "U-MED", "username": "medico", "name": "Dra. Yokasta Almonte", "role": "medico", "active": True, "pw": None, "room": "C2"},
            {"id": "U-ENF", "username": "enfermeria", "name": "Lic. Mildred Rosario", "role": "enfermeria", "active": True, "pw": None},
            {"id": "U-REC", "username": "recepcion", "name": "Yanelis Báez", "role": "recepcion", "active": True, "pw": None},
            {"id": "U-PAC", "username": "paciente", "name": "Carmen Altagracia Reyes", "role": "paciente", "active": True, "pw": None, "patient": "P-2210"},
        ],
        "rooms": [
            {"id": "C1", "name": "Consultorio 1", "doctor": None, "active": True},
            {"id": "C2", "name": "Consultorio 2", "doctor": "U-MED", "active": True},
            {"id": "C3", "name": "Consultorio 3", "doctor": None, "active": True},
            {"id": "C4", "name": "Consultorio 4", "doctor": None, "active": True},
            {"id": "ENF", "name": "Enfermería", "doctor": None, "active": True},
        ],
        "services": [
            {"id": "S-CON", "name": "Consulta de medicina general", "price": 1500.0, "procedure": False, "ars": True, "active": True},
            {"id": "S-OID", "name": "Lavado de oído", "price": 1000.0, "procedure": True, "ars": True, "active": True},
            {"id": "S-CUR", "name": "Curación simple", "price": 800.0, "procedure": True, "ars": True, "active": True},
            {"id": "S-TEL", "name": "Teleconsulta", "price": 1200.0, "procedure": False, "ars": False, "active": True},
        ],
        "ars": [
            {"id": "ARS-1", "name": "ARS pública (régimen subsidiado y contributivo)", "coverage": 0.80, "active": True},
            {"id": "ARS-2", "name": "ARS privada A", "coverage": 0.70, "active": True},
            {"id": "ARS-3", "name": "ARS privada B", "coverage": 0.70, "active": True},
        ],
        "cie": [
            {"code": "J06.9", "name": "Infección aguda de vías respiratorias superiores", "notifiable": False},
            {"code": "I10", "name": "Hipertensión esencial", "notifiable": False},
            {"code": "E11.9", "name": "Diabetes mellitus tipo 2 sin complicaciones", "notifiable": False},
            {"code": "A90", "name": "Dengue sin signos de alarma", "notifiable": True},
            {"code": "A27.9", "name": "Leptospirosis", "notifiable": True},
            {"code": "K29.7", "name": "Gastritis", "notifiable": False},
            {"code": "H61.2", "name": "Cerumen impactado", "notifiable": False},
        ],
        "drugs": [
            {"id": "D1", "name": "Acetaminofén 500 mg cada 8 h por 3 días", "group": ""},
            {"id": "D2", "name": "Ibuprofeno 400 mg cada 8 h por 3 días", "group": "AINE"},
            {"id": "D3", "name": "Amoxicilina 500 mg cada 8 h por 7 días", "group": "Penicilina"},
            {"id": "D4", "name": "Losartán 50 mg una vez al día", "group": ""},
        ],
        "patients": [
            {"id": "P-2210", "name": "Carmen Altagracia Reyes", "age": 41, "doc": "001-…-7", "ars": "ARS-1", "nss": "…4471", "allergy": "Penicilina", "chronic": ["Hipertensión"], "doctor": "U-MED",
             "consent_data": True, "consent_reminders": True, "consent_promo": False, "bp": [["21 nov", "136/88"], ["19 nov", "132/86"], ["17 nov", "130/84"]]},
            {"id": "P-1874", "name": "Juan Bautista Mejía", "age": 63, "doc": "402-…-1", "ars": "ARS-2", "nss": "…1190", "allergy": "", "chronic": ["Diabetes tipo 2"], "doctor": "U-MED",
             "consent_data": True, "consent_reminders": True, "consent_promo": False, "bp": []},
            {"id": "P-2305", "name": "Rosanna Féliz", "age": 26, "doc": "223-…-5", "ars": "", "nss": "", "allergy": "", "chronic": [], "doctor": "U-MED",
             "consent_data": True, "consent_reminders": True, "consent_promo": True, "bp": []},
            {"id": "P-1559", "name": "Ramón Antonio Guzmán", "age": 47, "doc": "001-…-2", "ars": "ARS-1", "nss": "…8023", "allergy": "AINE", "chronic": [], "doctor": "U-MED",
             "consent_data": True, "consent_reminders": False, "consent_promo": False, "bp": []},
            {"id": "P-2388", "name": "Nicole Pérez Santana", "age": 8, "doc": "Menor (tutor)", "ars": "ARS-3", "nss": "…5512", "allergy": "", "chronic": [], "doctor": "U-MED",
             "consent_data": True, "consent_reminders": True, "consent_promo": False, "bp": []},
        ],
        "visits": [
            {"id": "V1", "pid": "P-1874", "time": "07:24", "reason": "Control de diabetes", "service": "S-CON", "st": "atendido", "paid": True,
             "ecf": "e-CF tipo 32 · Factura de consumo electrónica · Ambiente: pruebas\ne-NCF: E320000000214\nCliente: Juan Bautista Mejía\nConsulta de medicina general  RD$1,500.00\nCobertura ARS privada A (aut. 55120871)  RD$1,050.00\nCopago pagado por el paciente  RD$450.00\nServicio de salud exento de ITBIS",
             "ars_amount": 1050.0, "copay": 450.0, "auth": "55120871",
             "vitals": {"pa": "134/84", "fc": 78, "t": "36.6", "sat": 97, "peso": "84.0"}, "dx": "E11.9",
             "note": "Glucosa capilar 152 mg/dL. Adherente a metformina. Se refuerza plan nutricional.", "consent": False, "room": "C2", "source": "recepcion"},
            {"id": "V2", "pid": "P-1559", "time": "07:48", "reason": "Fiebre y dolor de cuerpo", "service": "S-CON", "st": "en espera", "paid": False, "ecf": None,
             "vitals": None, "dx": None, "note": "", "consent": False, "room": "C2", "source": "recepcion"},
            {"id": "V3", "pid": "P-2305", "time": "08:12", "reason": "Dolor de garganta", "service": "S-CON", "st": "triaje", "paid": False, "ecf": None,
             "vitals": {"pa": "110/70", "fc": 90, "t": "38.1", "sat": 98, "peso": "60.2"}, "dx": None, "note": "", "consent": False, "room": "C2", "source": "app"},
            {"id": "V4", "pid": "P-2388", "time": "08:36", "reason": "Lavado de oído", "service": "S-OID", "st": "agendado", "paid": False, "ecf": None,
             "vitals": None, "dx": None, "note": "", "consent": False, "room": "C2", "source": "recepcion"},
        ],
        "ars_claims": [{"id": "RA-0214", "vid": "V1", "ars": "ARS-2", "amount": 1050.0, "auth": "55120871", "status": "Por reclamar"}],
        "claims": [{"id": "Q-018", "type": "Queja", "text": "Espera de 35 minutos sin aviso", "due": "5 días hábiles (plazo interno)", "status": "En análisis"}],
        "data_requests": [],
        "notifications": [],
        "audit": [
            ["07:24:10", "Lic. Mildred Rosario", "registró signos vitales", "V1"],
            ["07:31:02", "Dra. Yokasta Almonte", "abrió el expediente", "P-1874"],
            ["07:38:44", "Dra. Yokasta Almonte", "firmó la nota de consulta", "V1"],
            ["07:40:01", "Yanelis Báez", "emitió e-CF y registró reclamación a la ARS", "V1"],
        ],
        "ecf_count": 214,
        "week_cons": [88, 176, 251, 318, 389, 441, 486, 529],
        "network": [
            {"name": "Centro Santo Domingo Este", "status": "Operando · 9 semanas", "tone": "ok", "match": 92, "detail": "4 consultorios + enfermería"},
            {"name": "Centro Santiago de los Caballeros", "status": "En habilitación del MISPAS", "tone": "warn", "match": 100, "detail": "Segundo centro de la red"},
            {"name": "Expansión Caribe", "status": "Evaluación de mercado", "tone": "acc", "match": 100, "detail": "Modelo replicable fuera de RD"},
        ],
        "seq": {"visit": 4, "patient": 2400, "claim": 18, "datareq": 0, "user": 0, "notif": 0, "arsclaim": 214},
    }


DEMO_PASSWORDS = {
    "admin": "admin123", "direccion": "demo123", "medico": "demo123",
    "enfermeria": "demo123", "recepcion": "demo123", "paciente": "demo123",
}
