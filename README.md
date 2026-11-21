# H&H Salud Lab

Versión de laboratorio del sistema de H&H Salud para República Dominicana, con la identidad de marca definida en 05.01 ProductVision (logotipo H&H, degradado azul–verde, «Cerca de ti, en el Caribe»). Muestra cómo opera el sistema en un centro de atención primaria, con datos ficticios: paciente, médico y enfermería, recepción y caja, dirección y red, y una consola de **administración**.

Toda la lógica (reglas clínicas, permisos, cobertura ARS y copago, e-CF, bitácora y administración) está escrita en **Python** en `hhsalud/engine.py`. El mismo motor funciona de dos formas:

| Modo | Dónde | Datos |
|---|---|---|
| **Servidor local** | Su PC, con `python app.py` (Flask) | Base SQLite en `instance/hhsalud.db` |
| **Demostración web** | GitHub Pages, sin servidor: el motor Python corre en el navegador con Pyodide | Solo en el navegador de quien la abre |

## Reglas dominicanas que aplica la demo

- Identificación con **cédula**; afiliación a **ARS** con NSS.
- Precio y **copago estimado** informados al agendar (Ley 358-05). En caja se exige el **número de autorización de la ARS**, se cobra solo el copago y se registra la reclamación a la ARS (por reclamar → reclamada → pagada).
- **e-CF tipo 32** (factura de consumo electrónica, DGII, ambiente de pruebas). Servicios de salud **exentos de ITBIS** (configurable).
- **Consentimiento informado** escrito para procedimientos (Ley 42-01, art. 28).
- Receta bloqueada por **alergia** registrada.
- Diagnósticos de notificación obligatoria generan la **ficha del SINAVE** (reporte semanal, incluido el reporte en cero).
- Derechos sobre datos personales (**Ley 172-13**): acceso en 5 días hábiles; rectificación o supresión en 10.
- Expediente y bitácora de solo adición (Reglamento Técnico para la Gestión del Expediente Clínico).

---

## 1. Ejecutar en su PC

Requisito: **Python 3.10 o superior** ([python.org](https://www.python.org/downloads/); en Windows marque «Add Python to PATH»).

- Windows: doble clic en `iniciar_windows.bat`
- macOS / Linux: `./iniciar.sh`

O manualmente:
```bash
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Se abre el navegador en **http://127.0.0.1:5000**. Otro puerto: `PORT=8080 python app.py` (en Windows: `set PORT=8080` y luego `python app.py`).

### Usuarios de demostración

| Usuario | Perfil | Contraseña |
|---|---|---|
| `admin` | Administración | `admin123` |
| `direccion` | Dirección | `demo123` |
| `medico` | Médico | `demo123` |
| `enfermeria` | Enfermería | `demo123` |
| `recepcion` | Recepción y caja | `demo123` |
| `paciente` | Paciente | `demo123` |

> Cambie la contraseña de `admin` en **Administración › Usuarios › Contraseña** la primera vez que ingrese.

---

## 2. Qué puede hacer el administrador

- **Centro**: nombre, dirección, fecha mostrada, duración de la consulta, capacidad semanal, meta de ocupación, tasa de ITBIS y exención de servicios de salud.
- **Usuarios**: crear, editar perfil, asignar consultorio o paciente vinculado, activar o desactivar y cambiar contraseñas.
- **Consultorios** y médico responsable.
- **Servicios y precios** (RD$): procedimiento (exige consentimiento) y cobertura por ARS.
- **ARS**: catálogo de administradoras con su porcentaje de cobertura (los de la demo son ficticios; en operación se cargan los del contrato).
- **Diagnósticos CIE-10** con marca de notificación obligatoria al SINAVE.
- **Medicamentos** con grupo de alergia.
- **Pacientes**: cédula, ARS, NSS, alergias, condiciones, médico de cabecera y consentimientos.
- **Bitácora** con filtro.
- **Datos**: descargar copia (JSON), importar y restaurar la demo (con copia de seguridad automática en el servidor local).

---

## 3. Publicar la demostración en GitHub

1. Cree un repositorio (por ejemplo `hhsalud-lab`). En el plan gratuito, GitHub Pages requiere que sea **público**.
2. Suba el proyecto:
   ```bash
   git init
   git add .
   git commit -m "H&H Salud Lab"
   git branch -M main
   git remote add origin https://github.com/SU_USUARIO/hhsalud-lab.git
   git push -u origin main
   ```
3. En GitHub: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
4. El flujo `.github/workflows/pages.yml` ejecuta las pruebas y publica el sitio en `https://SU_USUARIO.github.io/hhsalud-lab/`.

La primera carga tarda unos segundos (descarga el intérprete de Python para el navegador). Cada visitante trabaja con su propia copia de los datos.

---

## 4. Estructura

```
app.py                  Servidor local (Flask + SQLite)
hhsalud/engine.py       Motor: reglas, permisos, ARS, e-CF, administración (solo biblioteca estándar)
hhsalud/seed.py         Datos de demostración
web/                    Interfaz (HTML, CSS, JS) compartida por ambos modos
web/bridge.js           Elige el modo: servidor local o Python en el navegador
tests/test_engine.py    Pruebas del motor (python -m unittest discover -s tests)
.github/workflows/      Publicación automática en GitHub Pages
```

## 5. Alcance

Versión de laboratorio con datos ficticios. No debe usarse con datos reales de pacientes: para producción se requieren hospedaje seguro, cifrado, respaldo, certificación como emisor electrónico ante la DGII, integración con las ARS y la habilitación del MISPAS.
