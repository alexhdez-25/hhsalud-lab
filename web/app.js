/* H&H Salud Lab — interfaz. Toda la lógica vive en el motor Python (hhsalud/engine.py). */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let S = null;            // estado público devuelto por el motor
  let view = "inicio";
  let sel = null;          // atención seleccionada en clínica
  let ptab = "inicio";     // pestaña de la app del paciente
  let atab = "centro";     // pestaña de administración
  let pick = { day: "Mar 17", time: null };
  let payId = null;
  let edit = null;         // registro en edición (administración)

  const VIEW_NAMES = { inicio: "Inicio", paciente: "Paciente", clinica: "Médico y enfermería", recepcion: "Recepción y caja", direccion: "Dirección y red", admin: "Administración" };
  const money = (n) => (S.config.currency === "DOP" ? "RD$" : S.config.currency + " ") + Number(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pt = (id) => S.patients.find((p) => p.id === id) || { name: "—", allergy: "", chronic: [] };
  const visit = (id) => S.visits.find((v) => v.id === id);
  const svc = (id) => S.services.find((s) => s.id === id) || { name: "Servicio", price: 0, procedure: false };
  const userName = (id) => (S.users.find((u) => u.id === id) || {}).name || "—";
  const prc = (code, title) => `<span class="prc" title="${esc(title)}">${esc(code)}</span>`;
  const arsOf = (p) => (p && p.ars ? (S.ars || []).find((a) => a.id === p.ars) : null);
  const arsChip = (p) => { const a = arsOf(p); return a ? `<span class="chip ok">ARS: ${esc(a.name)}${p.nss ? " · NSS " + esc(p.nss) : ""}</span>` : '<span class="chip">Particular (sin ARS)</span>'; };
  const covOf = (p, s) => { const a = arsOf(p); return a && a.active && s.ars ? { a, amt: Math.round(s.price * a.coverage * 100) / 100 } : null; };
  const stChip = (st) => ({ agendado: '<span class="chip">Agendado</span>', "en espera": '<span class="chip warn">En espera</span>', triaje: '<span class="chip acc">Triaje hecho</span>', atendido: '<span class="chip ok">Atendido</span>' }[st] || esc(st));

  function toast(t, bad) { const el = $("#toast"); el.textContent = t; el.style.background = bad ? "var(--bad)" : ""; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), 4200); }
  function modal(html) { $("#mBody").innerHTML = html; $("#modal").hidden = false; const f = $("#mBody").querySelector("input,select,textarea,button"); f && f.focus(); }
  function closeModal() { $("#modal").hidden = true; }
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  async function act(action, payload, opts = {}) {
    const r = await Api.act(action, payload || {});
    if (!r.ok) { toast(r.error || "No se pudo completar la acción.", true); if (/Sesión/.test(r.error || "")) showLogin(); return false; }
    S = r.state; if (!opts.silent) toast(r.message); if (opts.close) closeModal(); render(); return true;
  }

  // ================================================================ login
  function showLogin(msg) {
    S = null; $("#nav").hidden = true; $("#tools").hidden = true;
    $("#main").innerHTML = `<div class="card login"><img class="logo" src="logo.png" alt="H&amp;H Salud · Cerca de ti, en el Caribe"><h1>Ingresar</h1><p class="sub">H&H Salud Lab · ${Api.mode === "server" ? "servidor local" : "demostración en el navegador"}</p>
      ${msg ? `<div class="rule" style="margin:8px 0">${esc(msg)}</div>` : ""}
      <form id="fLogin" class="grid" style="gap:10px;margin-top:8px">
        <div><label for="lu">Usuario</label><input type="text" id="lu" autocomplete="username" value="admin"></div>
        <div><label for="lp">Contraseña</label><input type="password" id="lp" autocomplete="current-password" value=""></div>
        <button class="btn pri" type="submit">Ingresar</button></form>
      <details style="margin-top:14px"><summary class="sub">Usuarios de demostración</summary>
        <table class="demo"><tr><th>Usuario</th><th>Perfil</th><th>Contraseña</th></tr>
        <tr><td class="mono">admin</td><td>Administración</td><td class="mono">admin123</td></tr>
        <tr><td class="mono">direccion</td><td>Dirección</td><td class="mono">demo123</td></tr>
        <tr><td class="mono">medico</td><td>Médico</td><td class="mono">demo123</td></tr>
        <tr><td class="mono">enfermeria</td><td>Enfermería</td><td class="mono">demo123</td></tr>
        <tr><td class="mono">recepcion</td><td>Recepción y caja</td><td class="mono">demo123</td></tr>
        <tr><td class="mono">paciente</td><td>Paciente</td><td class="mono">demo123</td></tr></table>
        <p class="sub" style="font-size:12px">El administrador puede cambiar estas contraseñas en Administración › Usuarios.</p></details></div>`;
    $("#lp").focus();
    $("#fLogin").addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await Api.login($("#lu").value, $("#lp").value);
      if (!r.ok) { toast(r.error, true); return; }
      S = r.state; view = S.me.views[0]; location.hash = view; start();
    });
  }

  function start() {
    $("#nav").hidden = false; $("#tools").hidden = false;
    $("#meName").textContent = S.me.name; $("#meRole").textContent = S.me.role_name;
    $("#nav").innerHTML = S.me.views.map((v) => `<a href="#${v}" data-r="${v}">${VIEW_NAMES[v]}</a>`).join("");
    route();
  }
  $("#btnOut").addEventListener("click", async () => { await Api.logout(); location.hash = ""; showLogin(); });
  $("#tgPrc").addEventListener("change", (e) => document.body.classList.toggle("showprc", e.target.checked));

  function route() {
    if (!S) return;
    const h = location.hash.replace("#", "");
    view = S.me.views.includes(h) ? h : S.me.views[0];
    document.querySelectorAll("#nav a").forEach((a) => a.setAttribute("aria-current", a.dataset.r === view ? "page" : "false"));
    render();
  }
  window.addEventListener("hashchange", route);

  function render() {
    if (!S) return;
    const R = { inicio: vInicio, paciente: vPaciente, clinica: vClinica, recepcion: vRecepcion, direccion: vDireccion, admin: vAdmin };
    $("#main").innerHTML = R[view]();
    if (view === "direccion") drawTrend();
  }

  // ================================================================ inicio
  function vInicio() {
    const cards = [["paciente", "Paciente", "Agenda con su médico de cabecera, recordatorios, resultados y sus datos."],
      ["recepcion", "Recepción y caja", "Llegada, validación de ARS, copago, e-CF y quejas."], ["clinica", "Médico y enfermería", "Triaje, expediente, consentimiento, receta, referencia y notificación."],
      ["direccion", "Dirección y red", "Ocupación, cumplimiento normativo y red de centros."], ["admin", "Administración", "Centro, usuarios, consultorios, servicios, catálogos, pacientes y datos."]]
      .filter((c) => S.me.views.includes(c[0]));
    return `<div class="card" style="padding:22px"><h1>${esc(S.config.center)}</h1>
      <p class="sub" style="margin:6px 0 0;max-width:760px">Recorrido del sistema tal como operará. Lo que hace cada perfil se refleja en los demás. Active «Ver procesos» para ver el procedimiento y la norma dominicana detrás de cada pantalla.</p></div>
      <div class="home-roles">${cards.map((c) => `<a class="card role-card" href="#${c[0]}"><h2>${c[1]}</h2><span class="sub">${c[2]}</span></a>`).join("")}</div>`;
  }

  // ================================================================ paciente
  const ICON = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    citas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    result: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3h6v4l4 9a3 3 0 0 1-2.7 4H7.7A3 3 0 0 1 5 16l4-9z"/><path d="M8 13h8"/></svg>',
    salud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-8-5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6-8 11-8 11z"/></svg>',
    datos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' };
  function myPatientId() { return S.me.role === "paciente" ? S.me.patient : "P-1042"; }
  function vPaciente() {
    const pid = myPatientId(), p = pt(pid), doc = userName(p.doctor);
    const b = S.visits.filter((v) => v.pid === pid && v.st !== "atendido").slice(-1)[0];
    const tabs = [["inicio", "Inicio"], ["citas", "Citas"], ["result", "Resultados"], ["salud", "Mi salud"], ["datos", "Mis datos"]];
    let h = "";
    if (ptab === "inicio") {
      h = `<div class="card nextcard"><div class="row between"><span style="font-size:11.5px;letter-spacing:.08em;text-transform:uppercase">Próxima cita</span>${prc("PRC-SEG-02", "Recordatorio de control")}</div>
        ${b ? `<p style="margin:6px 0 0;font-family:var(--f-d);font-size:20px;font-weight:600">Hoy · ${b.time}</p><p class="sub" style="margin:2px 0 0">Su médico: ${esc(doc)} · ${esc(b.reason)}</p><div class="row" style="margin-top:8px">${stChip(b.st)}</div>`
          : `<p class="sub" style="margin:6px 0 8px">No tiene citas programadas.</p><button class="btn pri" type="button" data-pt="citas">Agendar cita</button>`}</div>
        ${arsOf(p) ? `<div class="ars"><span>Mi ARS: <b>${esc(arsOf(p).name)}</b></span><span>NSS ${esc(p.nss || "—")}</span></div>` : '<div class="ars"><span>Atención como particular</span><span>Puede registrar su ARS en recepción</span></div>'}
        <div class="card" style="background:var(--soft);border-color:transparent"><h3>Registre su presión</h3>
        <div class="row" style="margin-top:8px"><input type="text" id="bpIn" aria-label="Presión arterial" placeholder="Ej. 128/82" style="flex:1"><button class="btn" type="button" data-a="bp">Guardar</button></div></div>
        <div class="card"><h3>Teleconsulta</h3><p class="sub" style="margin:6px 0 8px">Su médico decide si debe venir en persona.</p><button class="btn" type="button" data-a="tele">Solicitar teleconsulta</button></div>`;
    } else if (ptab === "citas") {
      const days = ["Lun 16", "Mar 17", "Mié 18", "Jue 19"], times = ["07:20", "07:40", "08:00", "08:20", "09:00", "10:20", "11:40", "12:20"];
      const taken = new Set(S.visits.map((v) => v.time));
      const services = S.services.filter((s) => s.active);
      h = `<div class="card"><div class="row between"><h3>Agendar con ${esc(doc)}</h3>${prc("PRC-AGE-01", "Agenda e identificación")}</div>
        <label for="pReason" style="margin-top:10px">Motivo</label><input type="text" id="pReason" value="Control de hipertensión">
        <label for="pSvc" style="margin-top:10px">Servicio</label><select id="pSvc">${services.map((s) => `<option value="${s.id}">${esc(s.name)} · ${money(s.price)}</option>`).join("")}</select>
        <label style="margin-top:10px">Día</label><div class="slots">${days.map((d) => `<button class="slot" type="button" data-day="${d}" aria-pressed="${pick.day === d}">${d}</button>`).join("")}</div>
        <label style="margin-top:10px">Hora (consultas de ${S.config.slot_minutes} min)</label><div class="slots">${times.map((t) => `<button class="slot" type="button" data-time="${t}" aria-pressed="${pick.time === t}" ${taken.has(t) && S.me.role !== "paciente" ? "disabled" : ""}>${t}</button>`).join("")}</div>
        <div class="rule ok" style="margin-top:12px">El precio y su copago con ARS se informan antes de confirmar (Ley 358-05).</div>
        <button class="btn pri" type="button" data-a="book" style="width:100%;margin-top:10px" ${pick.time ? "" : "disabled"}>Confirmar cita</button></div>`;
    } else if (ptab === "result") {
      h = `<div class="card"><div class="row between"><h3>Perfil lipídico · 10 nov</h3><span class="chip ok">Revisado</span></div>
        <table style="margin-top:8px"><tr><th>Prueba</th><th class="num">Valor</th><th class="num">Referencia</th></tr>
        <tr><td>Colesterol total</td><td class="num">212 mg/dL</td><td class="num">&lt; 200</td></tr><tr><td>LDL</td><td class="num">138 mg/dL</td><td class="num">&lt; 130</td></tr>
        <tr><td>HDL</td><td class="num">48 mg/dL</td><td class="num">&gt; 40</td></tr><tr><td>Triglicéridos</td><td class="num">160 mg/dL</td><td class="num">&lt; 150</td></tr></table>
        <p class="note" style="margin-top:10px">Comentario de su médico: «Valores un poco altos. Lo revisamos en su control.»</p>${prc("PRC-LAB-03", "Resultado revisado por el médico en ≤ 24 h")}</div>`;
    } else if (ptab === "salud") {
      h = `<div class="card"><h3>Mis registros de presión</h3><table><tr><th>Fecha</th><th class="num">Presión</th></tr>${(p.bp || []).map((r) => `<tr><td>${esc(r[0])}</td><td class="num">${esc(r[1])}</td></tr>`).join("") || '<tr><td colspan="2" class="sub">Sin registros</td></tr>'}</table></div>
        <div class="card"><h3>Alergias y condiciones</h3><p style="margin:4px 0 0">${p.allergy ? `<span class="chip bad">Alergia: ${esc(p.allergy)}</span>` : '<span class="chip">Sin alergias registradas</span>'} ${(p.chronic || []).map((c) => `<span class="chip acc">${esc(c)}</span>`).join(" ")}</p></div>`;
    } else {
      const reqs = (S.data_requests || []).filter((r) => r.pid === pid);
      h = `<div class="card"><div class="row between"><h3>Mis consentimientos</h3>${prc("PRC-DAT-01", "Ley 172-13 sobre Protección de Datos de Carácter Personal")}</div>
        <div class="li"><span>Atención y expediente clínico</span><span class="chip ${p.consent_data ? "ok" : "bad"}">${p.consent_data ? "Firmado" : "Pendiente"}</span></div>
        <div class="li"><span>Recordatorios por WhatsApp y SMS</span><span class="chip ${p.consent_reminders ? "ok" : ""}">${p.consent_reminders ? "Activo" : "No autorizado"}</span></div>
        <div class="li"><span>Mensajes de promoción</span><span class="chip ${p.consent_promo ? "ok" : ""}">${p.consent_promo ? "Activo" : "No autorizado"}</span></div></div>
        <div class="card"><h3>Ejercer mis derechos</h3><p class="sub" style="margin:4px 0 8px">Acceso: respuesta en 5 días hábiles. Rectificación o supresión: 10 días hábiles (Ley 172-13).</p>
        ${reqs.map((r) => `<div class="rule ok" style="margin-bottom:6px">${r.id} · ${esc(r.kind)} · ${esc(r.status)} · vence ${esc(r.due)}</div>`).join("")}
        <select id="drType" aria-label="Tipo de solicitud"><option>Acceso a mis datos</option><option>Rectificación</option><option>Cancelación</option><option>Oposición</option></select>
        <button class="btn" type="button" data-a="data_request" style="margin-top:8px">Enviar solicitud</button></div>`;
    }
    const phone = `<div class="phone" role="region" aria-label="App del paciente"><div class="ph-head"><div class="row between" style="align-items:flex-start"><div><div class="sub" style="font-size:12.5px">Buenos días</div><div class="hi">${esc(p.name.split(" ")[0])}</div><div class="tagl">Cerca de ti · Humana · Rápida · Digital</div></div><img src="logo-mark.png" alt=""></div></div>
      <div class="ph-body">${h}</div><div class="ph-tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" aria-selected="${ptab === k}" data-pt="${k}" type="button">${ICON[k]}${t}</button>`).join("")}</div></div>`;
    const side = S.me.role === "paciente" ? "" : `<div class="side card"><h2>Vista del paciente</h2><p class="sub">Como administrador ve la app de la paciente de demostración (${esc(p.name)}). Agende una cita y vaya a Recepción: aparece en la lista del día.</p></div>`;
    return `<div class="phonewrap">${phone}${side}</div>`;
  }

  // ================================================================ clínica
  function vClinica() {
    const room = S.me.room || "C2";
    const list = S.visits.filter((v) => S.me.role !== "medico" || v.room === room);
    if (!sel || !list.find((v) => v.id === sel)) sel = (list.find((v) => v.st !== "atendido") || list[0] || {}).id;
    const v = visit(sel);
    const done = list.filter((x) => x.st === "atendido").length;
    const head = `<div class="row between" style="margin-bottom:14px"><div><h1>${esc((S.rooms.find((r) => r.id === room) || {}).name || "Consultorio")} · ${esc(userName((S.rooms.find((r) => r.id === room) || {}).doctor))}</h1><div class="sub">${esc(S.config.day)}</div></div><span class="chip acc">${done} de ${list.length} atendidos</span></div>`;
    const agenda = `<div class="card"><div class="row between"><h2>Agenda del día</h2>${prc("PRC-AGE-01", "Agenda e identificación")}</div><div class="list" style="margin-top:8px">
      ${list.map((x) => `<div class="li ${sel === x.id ? "sel" : ""}"><div><button class="link" type="button" data-sel="${x.id}">${x.time} · ${esc(pt(x.pid).name)}</button><div class="sub" style="font-size:12.5px">${esc(x.reason)}${svc(x.service).procedure ? " · procedimiento" : ""}</div></div>${stChip(x.st)}</div>`).join("") || '<p class="sub">Sin pacientes.</p>'}</div></div>`;
    let chart = '<div class="card"><p class="sub">Seleccione un paciente.</p></div>';
    if (v) {
      const p = pt(v.pid), closed = v.st === "atendido", isProc = svc(v.service).procedure;
      const cie = S.cie.find((c) => c.code === v.dx);
      const notified = (S.notifications || []).some((n) => n.vid === v.id);
      const canMed = ["medico", "admin"].includes(S.me.role);
      const vit = v.vitals ? `<div class="vitals">${[["PA", v.vitals.pa, "mmHg"], ["FC", v.vitals.fc, "lpm"], ["T°", v.vitals.t, "°C"], ["SatO₂", v.vitals.sat, "%"], ["Peso", v.vitals.peso, "kg"]].map((x) => `<div class="vital"><div class="k">${x[0]} · ${x[2]}</div><div class="v">${esc(x[1])}</div></div>`).join("")}</div>`
        : `<div class="rule">Pendiente de triaje por enfermería.</div>${["enfermeria", "medico", "admin"].includes(S.me.role) ? `<button class="btn" type="button" data-a="triage-open" style="margin-top:8px" ${v.st === "agendado" ? "disabled" : ""}>Registrar triaje</button>` : ""}${v.st === "agendado" ? '<p class="sub" style="font-size:12px">El paciente aún no ha llegado.</p>' : ""}`;
      chart = `<div class="card"><div class="row between"><div><h2>${esc(p.name)}</h2><div class="sub">${p.age} años · ${esc(p.doc)} · ${p.id}</div></div>${prc("EXP-CLÍNICO", "Reglamento Técnico para la Gestión del Expediente Clínico")}</div>
        <div class="row" style="margin:10px 0">${p.allergy ? `<span class="chip bad">Alergia: ${esc(p.allergy)}</span>` : '<span class="chip">Sin alergias conocidas</span>'}${(p.chronic || []).map((c) => `<span class="chip acc">${esc(c)}</span>`).join("")}<span class="chip">${esc(svc(v.service).name)}</span>${arsChip(p)}</div>
        <h3>Signos vitales ${prc("PRC-ENF-01", "Triaje")}</h3><div style="margin-top:6px">${vit}</div>
        <h3 style="margin-top:14px">Nota de consulta ${prc("PRC-MED-01", "Atención médica")}</h3>
        <textarea id="note" aria-label="Nota de consulta" ${closed || !canMed ? "readonly" : ""} placeholder="Subjetivo, objetivo, análisis y plan">${esc(v.note)}</textarea>
        <label for="dx" style="margin-top:8px">Diagnóstico (CIE-10)</label><select id="dx" ${closed || !canMed ? "disabled" : ""}><option value="">Seleccione…</option>${S.cie.map((c) => `<option value="${c.code}" ${v.dx === c.code ? "selected" : ""}>${c.code} · ${esc(c.name)}${c.notifiable ? " (notificable)" : ""}</option>`).join("")}</select>
        ${cie && cie.notifiable ? `<div class="rule" style="margin-top:8px">Diagnóstico de notificación obligatoria. ${notified ? "Ficha SINAVE generada." : canMed ? '<button class="btn sm" type="button" data-a="vig">Generar ficha SINAVE</button>' : ""} ${prc("PRC-VIG-01", "SINAVE: reporte semanal obligatorio, incluido el reporte en cero")}</div>` : ""}
        ${isProc ? `<div class="rule ${v.consent ? "ok" : ""}" style="margin-top:8px">${v.consent ? "Consentimiento informado firmado y archivado." : `Procedimiento: requiere consentimiento informado escrito (Ley 42-01, art. 28). ${canMed ? '<button class="btn sm" type="button" data-a="consent-open">Firmar consentimiento</button>' : ""}`} ${prc("PRC-CON-01", "Consentimiento informado")}</div>` : ""}
        ${canMed ? `<div class="row" style="margin-top:12px"><button class="btn" type="button" data-a="rx-open" ${closed ? "disabled" : ""}>Receta</button><button class="btn" type="button" data-a="lab" ${closed ? "disabled" : ""}>Orden de laboratorio</button><button class="btn" type="button" data-a="ref-open" ${closed ? "disabled" : ""}>Referencia</button><span style="flex:1"></span>
        <button class="btn pri" type="button" data-a="sign" ${closed || !v.vitals || (isProc && !v.consent) ? "disabled" : ""}>${closed ? "Nota firmada" : "Firmar y cerrar consulta"}</button></div>` : '<p class="sub" style="margin-top:10px;font-size:12.5px">Su perfil registra el triaje; la nota la firma el médico.</p>'}</div>`;
    }
    const audit = S.me.role === "enfermeria" ? "" : `<div class="card audit"><div class="row between"><h2>Bitácora</h2>${prc("EXP 6.1.8", "Reglamento del expediente 6.1.8 y 6.1.11: no se altera ni se destruye")}</div>
      <p class="sub" style="font-size:12px;margin:4px 0 8px">Registro de solo adición: no se puede borrar.</p>${S.audit.slice(-40).reverse().map((a) => `<div class="ev">${esc(a[0])} · <b>${esc(a[1])}</b> ${esc(a[2])} <span>(${esc(a[3])})</span></div>`).join("")}</div>`;
    return head + `<div class="ws">${agenda}${chart}${audit}</div>`;
  }

  // ================================================================ recepción
  function vRecepcion() {
    const rows = S.visits.map((v) => {
      const act = v.st === "agendado" ? `<button class="btn sm" type="button" data-arr="${v.id}">Registrar llegada</button>` : v.st === "atendido" && !v.paid ? `<button class="btn sm pri" type="button" data-pay="${v.id}">Cobrar</button>` : v.paid ? '<span class="chip ok">Pagado · e-CF</span>' : '<span class="sub">En atención</span>';
      return `<tr><td class="mono">${v.time}</td><td>${esc(pt(v.pid).name)}${v.source === "app" ? ' <span class="chip acc">desde la app</span>' : ""}</td><td>${esc(v.reason)}</td><td>${stChip(v.st)}</td><td>${act}</td></tr>`;
    }).join("");
    const v = payId && visit(payId);
    let cash;
    if (v) {
      const s = svc(v.service);
      const p = pt(v.pid), cv = covOf(p, s);
      const rows = cv ? `<tr><td>Cubre ${esc(cv.a.name)} (${Math.round(cv.a.coverage * 100)} %)</td><td class="num">− ${money(cv.amt)}</td></tr><tr><th>Copago a cobrar</th><th class="num">${money(s.price - cv.amt)}</th></tr>` : `<tr><th>Total a cobrar</th><th class="num">${money(s.price)}</th></tr>`;
      cash = `<div class="row between"><h2>Cobro · ${esc(p.name)}</h2>${prc("PRC-FAC-01", "e-CF tipo 32 (DGII) y reclamación a la ARS")}</div>
        <div style="margin-top:8px">${arsChip(p)}</div>
        <table style="margin-top:8px"><tr><th>Concepto</th><th class="num">Monto</th></tr><tr><td>${esc(s.name)}</td><td class="num">${money(s.price)}</td></tr>${rows}</table>
        <p class="sub" style="font-size:12px;margin:6px 0 0">${S.config.itbis_exempt ? "Servicio de salud exento de ITBIS." : "Precio con ITBIS incluido."}</p>
        ${cv ? '<label for="payAuth" style="margin-top:10px">N.º de autorización de la ARS</label><input type="text" id="payAuth" placeholder="Ej. 55120899">' : ""}
        <label for="payM" style="margin-top:10px">Forma de pago</label><select id="payM"><option>Tarjeta</option><option>Efectivo</option><option>Transferencia</option></select>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" type="button" data-a="pay-cancel">Cancelar</button><button class="btn pri" type="button" data-a="pay" data-vid="${v.id}">Cobrar y emitir e-CF</button></div>`;
    } else {
      const last = S.visits.filter((x) => x.paid && x.ecf).slice(-1)[0];
      cash = `<div class="row between"><h2>Caja</h2>${prc("PRC-FAC-01", "Comprobante fiscal electrónico (e-CF) con la DGII")}</div>${last ? `<p class="sub" style="margin:6px 0">Último comprobante emitido:</p><div class="dte">${esc(last.ecf)}</div>` : '<p class="sub">Sin cobros pendientes.</p>'}`;
    }
    const items = [...S.claims.map((c) => ({ id: c.id, t: c.type, d: c.text, due: c.due, st: c.status })), ...(S.data_requests || []).map((r) => ({ id: r.id, t: "Datos personales (Ley 172-13)", d: r.kind + " · " + pt(r.pid).name, due: r.due, st: r.status }))];
    const claims = items.map((c) => `<div class="li"><div><b>${esc(c.id)}</b> · ${esc(c.t)}<div class="sub" style="font-size:12.5px">${esc(c.d)} · plazo ${esc(c.due)}</div></div><div class="row"><span class="chip ${c.st === "Respondida" ? "ok" : "warn"}">${esc(c.st)}</span>${c.st !== "Respondida" ? `<button class="btn sm" type="button" data-answer="${c.id}">Marcar respondida</button>` : ""}</div></div>`).join("") || '<p class="sub">Sin registros.</p>';
    const arsName = (id) => ((S.ars || []).find((a) => a.id === id) || {}).name || id;
    const arsList = (S.ars_claims || []).slice().reverse().map((c) => `<div class="li"><div><b>${esc(c.id)}</b> · ${esc(arsName(c.ars))}<div class="sub" style="font-size:12.5px">Atención ${esc(c.vid)} · aut. ${esc(c.auth)} · ${money(c.amount)}</div></div><div class="row"><span class="chip ${c.status === "Pagada" ? "ok" : c.status === "Reclamada" ? "acc" : "warn"}">${esc(c.status)}</span>${c.status !== "Pagada" ? `<button class="btn sm" type="button" data-arsnext="${c.id}">${c.status === "Por reclamar" ? "Marcar reclamada" : "Marcar pagada"}</button>` : ""}</div></div>`).join("") || '<p class="sub">Sin reclamaciones.</p>';
    return `<div class="row between" style="margin-bottom:14px"><div><h1>Recepción y caja</h1><div class="sub">${esc(S.config.center)}</div></div>
      <div class="row"><button class="btn" type="button" data-a="new-open">Paciente nuevo</button><button class="btn" type="button" data-a="book-open">Agendar cita</button><button class="btn" type="button" data-a="claim-open">Registrar queja</button></div></div>
      <div class="ws2"><div class="card"><div class="row between"><h2>Pacientes de hoy</h2>${prc("PRC-AGE-02", "Llegada, identificación y precio")}</div><div class="scroll"><table><tr><th>Hora</th><th>Paciente</th><th>Motivo</th><th>Estado</th><th>Acción</th></tr>${rows}</table></div></div>
      <div class="grid"><div class="card">${cash}</div><div class="card"><div class="row between"><h2>Quejas y solicitudes</h2>${prc("PRC-QJA · PRC-DAT", "Ley 42-01 · DIDA para afiliados del SDSS · Ley 172-13")}</div><div class="list" style="margin-top:6px">${claims}</div></div>
      <div class="card"><div class="row between"><h2>Reclamaciones a ARS</h2>${prc("PRC-ARS-01", "Autorización, reclamación y conciliación con la ARS")}</div><div class="list" style="margin-top:6px">${arsList}</div></div></div></div>`;
  }

  // ================================================================ dirección
  function vDireccion() {
    const k = S.kpis;
    const tiles = [[k.week.toLocaleString("es-DO"), "Consultas esta semana", Math.round(k.occupancy * 100) + "% de ocupación"], [money(k.collected), "Cobrado hoy en caja", "e-CF emitidos: " + k.ecf], [money(k.ars_pending), "Por cobrar a ARS", "Reclamaciones abiertas"],
      [String(k.patients), "Pacientes inscritos", "Médicos activos: " + S.users.filter((u) => u.role === "medico" && u.active).length], [String(k.pending_notif), "Fichas epidemiológicas pendientes", "Plazo 24 h"], [String(k.open_claims + k.open_requests), "Quejas y solicitudes abiertas", "Con plazo legal"]];
    const C = [["Reporte epidemiológico semanal al SINAVE (incluye reporte en cero)", "Semanal", "Médico referente", k.pending_notif ? "warn" : "ok", k.pending_notif ? k.pending_notif + " ficha(s) por enviar" : "Al día"],
      ["Solicitudes de datos personales (Ley 172-13)", "5 / 10 días hábiles", "Responsable de protección de datos", k.open_requests ? "warn" : "ok", k.open_requests ? k.open_requests + " abierta(s)" : "Sin solicitudes"],
      ["Quejas con respuesta escrita", "5 días hábiles (interno)", "Dirección médica", k.open_claims ? "warn" : "ok", k.open_claims + " abierta(s)"],
      ["Reclamaciones a ARS y conciliación", "Mensual", "Recepción y caja", k.ars_pending ? "warn" : "ok", k.ars_pending ? money(k.ars_pending) + " por cobrar" : "Conciliado"],
      ["Comprobantes fiscales electrónicos (e-CF)", "Por transacción", "Caja", "ok", "Emitidos: " + k.ecf],
      ["Manifiestos de desechos infecciosos", "Por retiro", "Coord. de enfermería", "ok", "Transportista habilitado"],
      ["Programa de seguridad y salud en el trabajo (Decreto 522-06)", "Cada 3 años", "Responsable de SST", "ok", "Vigente"],
      ["Habilitación del establecimiento (MISPAS)", "Según vigencia", "Dirección médica", "ok", "Vigente"]];
    return `<div class="row between" style="margin-bottom:14px"><div><h1>Dirección del centro y red</h1><div class="sub">${esc(S.config.center)}</div></div><span class="chip ok">Habilitación MISPAS vigente</span></div>
      <div class="kpis">${tiles.map((x) => `<div class="card kpi"><div class="n">${x[0]}</div><div class="l">${x[1]}</div><div class="sub" style="font-size:12px;margin-top:4px">${x[2]}</div></div>`).join("")}</div>
      <div class="ws2" style="margin-top:16px"><div class="card"><div class="row between"><h2>Calendario de cumplimiento</h2>${prc("04.01 · 04.04", "Calendario de obligaciones y plazos normativos")}</div><div class="scroll"><table><tr><th>Obligación</th><th>Plazo</th><th>Responsable</th><th>Estado</th></tr>${C.map((c) => `<tr><td>${c[0]}</td><td>${c[1]}</td><td>${c[2]}</td><td><span class="chip ${c[3]}">${c[4]}</span></td></tr>`).join("")}</table></div></div>
      <div class="card"><h2>Consultas por semana</h2><p class="sub" style="font-size:12.5px;margin:2px 0 8px">Meta: ${Math.round(S.config.occupancy_goal * 100)}% de ${S.config.weekly_capacity.toLocaleString("es-DO")} consultas por semana.</p><svg class="spark" id="trend" viewBox="0 0 400 140" role="img" aria-label="Consultas semanales" style="height:150px"></svg></div></div>
      <div class="card" style="margin-top:16px"><div class="row between"><h2>Red de centros</h2><span class="sub" style="font-size:12.5px">Coincidencia 1:1 = procedimientos del manual digitalizados</span></div><div class="netmap" style="margin-top:10px">
      ${S.network.map((n) => `<div class="center"><span class="stripe" style="background:var(--${n.tone === "acc" ? "accent" : n.tone})"></span><h3>${esc(n.name)}</h3><div class="sub" style="font-size:12.5px;margin:2px 0 8px">${esc(n.status)} · ${esc(n.detail)}</div><div class="row between" style="font-size:12px"><span>Coincidencia 1:1</span><b>${n.match}%</b></div><div class="bar-h"><span style="width:${n.match}%"></span></div></div>`).join("")}</div></div>`;
  }
  function drawTrend() {
    const svg = $("#trend"); if (!svg) return;
    const wk = S.kpis.week, data = S.week_cons.concat([wk]), W = 400, H = 140, P = 24, max = Math.max(S.config.weekly_capacity * 0.85, ...data);
    const x = (i) => P + (i * (W - 2 * P)) / (data.length - 1), y = (v) => H - 18 - (v / max) * (H - 34), goalV = S.config.weekly_capacity * S.config.occupancy_goal, goal = y(goalV);
    const pts = data.map((v, i) => x(i) + "," + y(v)).join(" ");
    svg.innerHTML = `<defs><linearGradient id="g1" x1="0" x2="1"><stop offset="0" stop-color="#0E7C86"/><stop offset="1" stop-color="#14B8A6"/></linearGradient></defs>
      <line x1="${P}" x2="${W - P}" y1="${goal}" y2="${goal}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="${W - P}" y="${goal - 5}" text-anchor="end" font-size="11" fill="var(--muted)">Meta ${Math.round(goalV).toLocaleString("es-DO")}</text>
      <line x1="${P}" x2="${W - P}" y1="${H - 18}" y2="${H - 18}" stroke="var(--line)"/><polygon points="${x(0)},${H - 18} ${pts} ${x(data.length - 1)},${H - 18}" fill="url(#g1)" opacity=".14"/>
      <polyline points="${pts}" fill="none" stroke="url(#g1)" stroke-width="2.5"/><circle cx="${x(data.length - 1)}" cy="${y(wk)}" r="4.5" fill="#F2665A"/>
      <text x="${x(data.length - 1) - 8}" y="${y(wk) - 9}" text-anchor="end" font-size="12" font-weight="600" fill="var(--ink)">${wk}</text>
      ${data.map((v, i) => `<text x="${x(i)}" y="${H - 3}" text-anchor="middle" font-size="10" fill="var(--muted)">S${i + 1}</text>`).join("")}`;
  }

  // ================================================================ administración
  const ATABS = [["centro", "Centro"], ["usuarios", "Usuarios"], ["consultorios", "Consultorios"], ["servicios", "Servicios y precios"], ["ars", "ARS"], ["cie", "Diagnósticos"], ["medicamentos", "Medicamentos"], ["pacientes", "Pacientes"], ["bitacora", "Bitácora"], ["datos", "Datos"]];
  const yes = (b) => (b ? '<span class="chip ok">Sí</span>' : '<span class="chip">No</span>');
  function vAdmin() {
    const c = S.config;
    let h = "";
    if (atab === "centro") {
      h = `<form class="card" id="fCfg"><h2>Datos del centro</h2><div class="formgrid" style="margin-top:10px">
        <div><label for="cCenter">Nombre del centro</label><input type="text" id="cCenter" value="${esc(c.center)}"></div>
        <div><label for="cAddr">Dirección</label><input type="text" id="cAddr" value="${esc(c.address)}"></div>
        <div><label for="cDay">Fecha de operación mostrada</label><input type="text" id="cDay" value="${esc(c.day)}"></div>
        <div><label for="cSlot">Duración de la consulta (min)</label><input type="number" id="cSlot" min="5" value="${c.slot_minutes}"></div>
        <div><label for="cCap">Capacidad semanal (consultas)</label><input type="number" id="cCap" min="1" value="${c.weekly_capacity}"></div>
        <div><label for="cGoal">Meta de ocupación (%)</label><input type="number" id="cGoal" min="1" max="100" value="${Math.round(c.occupancy_goal * 100)}"></div>
        <div><label for="cIva">Tasa de ITBIS (%)</label><input type="number" id="cIva" min="0" max="30" step="0.5" value="${Math.round(c.itbis_rate * 1000) / 10}"></div>
        <label class="check"><input type="checkbox" id="cIvaInc" ${c.itbis_exempt ? "checked" : ""}> Servicios de salud exentos de ITBIS</label></div>
        <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" type="submit">Guardar configuración</button></div></form>`;
    } else if (atab === "usuarios") {
      h = `<div class="card"><div class="row between"><h2>Usuarios y perfiles</h2><button class="btn pri" type="button" data-adm="user-new">Nuevo usuario</button></div><div class="scroll"><table style="margin-top:8px"><tr><th>Usuario</th><th>Nombre</th><th>Perfil</th><th>Vínculo</th><th>Estado</th><th>Acciones</th></tr>
        ${S.users.map((u) => `<tr><td class="mono">${esc(u.username)}</td><td>${esc(u.name)}</td><td>${esc(S.roles[u.role])}</td><td>${u.patient ? esc(pt(u.patient).name) : u.room ? esc((S.rooms.find((r) => r.id === u.room) || {}).name || "") : ""}</td><td>${u.active ? '<span class="chip ok">Activo</span>' : '<span class="chip bad">Inactivo</span>'}</td>
        <td><button class="btn sm" type="button" data-adm="user-edit" data-id="${u.id}">Editar</button><button class="btn sm" type="button" data-adm="user-pw" data-id="${u.id}">Contraseña</button>${u.id !== S.me.id ? `<button class="btn sm" type="button" data-adm="user-toggle" data-id="${u.id}">${u.active ? "Desactivar" : "Activar"}</button>` : ""}</td></tr>`).join("")}</table></div></div>`;
    } else if (atab === "consultorios") {
      const meds = S.users.filter((u) => u.role === "medico" && u.active);
      h = `<div class="card"><div class="row between"><h2>Consultorios</h2><button class="btn pri" type="button" data-adm="room-new">Nuevo consultorio</button></div><table style="margin-top:8px"><tr><th>Código</th><th>Nombre</th><th>Médico responsable</th><th>Activo</th><th></th></tr>
        ${S.rooms.map((r) => `<tr><td class="mono">${r.id}</td><td>${esc(r.name)}</td><td>${esc(r.doctor ? userName(r.doctor) : "—")}</td><td>${yes(r.active)}</td><td><button class="btn sm" type="button" data-adm="room-edit" data-id="${r.id}">Editar</button></td></tr>`).join("")}</table>
        <p class="sub" style="font-size:12.5px">Médicos activos disponibles: ${meds.map((m) => esc(m.name)).join(", ") || "ninguno"}.</p></div>`;
    } else if (atab === "servicios") {
      h = `<div class="card"><div class="row between"><h2>Servicios y precios</h2><button class="btn pri" type="button" data-adm="svc-new">Nuevo servicio</button></div><table style="margin-top:8px"><tr><th>Servicio</th><th class="num">Precio</th><th>Procedimiento (exige consentimiento)</th><th>Cubierto por ARS</th><th>Activo</th><th></th></tr>
        ${S.services.map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${money(s.price)}</td><td>${yes(s.procedure)}</td><td>${yes(s.ars)}</td><td>${yes(s.active)}</td><td><button class="btn sm" type="button" data-adm="svc-edit" data-id="${s.id}">Editar</button></td></tr>`).join("")}</table>
        <p class="note" style="margin-top:10px">El precio y el copago estimado se muestran al paciente antes de confirmar la cita (Ley 358-05). ${c.itbis_exempt ? "Servicios exentos de ITBIS." : "Los precios incluyen ITBIS."}</p></div>`;
    } else if (atab === "ars") {
      h = `<div class="card"><div class="row between"><h2>Administradoras de Riesgos de Salud (ARS)</h2><button class="btn pri" type="button" data-adm="ars-new">Nueva ARS</button></div><table style="margin-top:8px"><tr><th>ARS</th><th class="num">Cobertura</th><th>Activa</th><th></th></tr>
        ${(S.ars || []).map((a) => `<tr><td>${esc(a.name)}</td><td class="num">${Math.round(a.coverage * 100)} %</td><td>${yes(a.active)}</td><td><button class="btn sm" type="button" data-adm="ars-edit" data-id="${a.id}">Editar</button></td></tr>`).join("")}</table>
        <p class="note" style="margin-top:10px">Porcentajes de demostración. En operación se cargan los del contrato con cada ARS. Caja pide el número de autorización y cobra solo el copago.</p></div>`;
    } else if (atab === "cie") {
      h = `<div class="card"><div class="row between"><h2>Diagnósticos CIE-10</h2><button class="btn pri" type="button" data-adm="cie-new">Nuevo diagnóstico</button></div><table style="margin-top:8px"><tr><th>Código</th><th>Descripción</th><th>Notificación obligatoria</th><th></th></tr>
        ${S.cie.map((x) => `<tr><td class="mono">${esc(x.code)}</td><td>${esc(x.name)}</td><td>${yes(x.notifiable)}</td><td><button class="btn sm" type="button" data-adm="cie-edit" data-id="${esc(x.code)}">Editar</button></td></tr>`).join("")}</table>
        <p class="note" style="margin-top:10px">Un diagnóstico marcado como notificable activa la ficha de notificación al SINAVE en la consulta.</p></div>`;
    } else if (atab === "medicamentos") {
      h = `<div class="card"><div class="row between"><h2>Medicamentos</h2><button class="btn pri" type="button" data-adm="drug-new">Nuevo medicamento</button></div><table style="margin-top:8px"><tr><th>Indicación</th><th>Grupo de alergia</th><th></th></tr>
        ${S.drugs.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.group || "—")}</td><td><button class="btn sm" type="button" data-adm="drug-edit" data-id="${d.id}">Editar</button></td></tr>`).join("")}</table>
        <p class="note" style="margin-top:10px">Si el grupo coincide con la alergia registrada del paciente, la receta se bloquea.</p></div>`;
    } else if (atab === "pacientes") {
      h = `<div class="card"><h2>Pacientes</h2><div class="scroll"><table style="margin-top:8px"><tr><th>Código</th><th>Nombre</th><th>Edad</th><th>Alergia</th><th>ARS</th><th>Médico</th><th>Recordatorios</th><th></th></tr>
        ${S.patients.map((p) => `<tr><td class="mono">${p.id}</td><td>${esc(p.name)}</td><td>${p.age}</td><td>${esc(p.allergy || "—")}</td><td>${esc((arsOf(p) || {}).name || "Particular")}</td><td>${esc(userName(p.doctor))}</td><td>${yes(p.consent_reminders)}</td><td><button class="btn sm" type="button" data-adm="pat-edit" data-id="${p.id}">Editar</button></td></tr>`).join("")}</table></div>
        <p class="sub" style="font-size:12.5px">Los pacientes nuevos se inscriben desde Recepción, con su consentimiento.</p></div>`;
    } else if (atab === "bitacora") {
      h = `<div class="card"><div class="row between"><h2>Bitácora completa</h2><input type="text" id="aFilter" placeholder="Filtrar por persona, acción o código" style="max-width:320px"></div>
        <div class="scroll"><table style="margin-top:8px" id="aTable"><tr><th>Hora</th><th>Quién</th><th>Acción</th><th>Referencia</th></tr>${S.audit.slice().reverse().map((a) => `<tr><td class="mono">${esc(a[0])}</td><td>${esc(a[1])}</td><td>${esc(a[2])}</td><td class="mono">${esc(a[3])}</td></tr>`).join("")}</table></div></div>`;
    } else {
      h = `<div class="card"><h2>Datos</h2><p class="sub">${Api.mode === "server" ? "Los datos se guardan en el archivo instance/hhsalud.db de su PC. Antes de importar o reiniciar se guarda una copia de seguridad automática." : "Demostración en el navegador: los datos se guardan solo en este navegador."}</p>
        <div class="row" style="margin-top:10px"><button class="btn" type="button" data-adm="export">Descargar copia (JSON)</button>
        <label class="btn" for="impFile" style="margin:0;color:var(--ink)">Importar copia…</label><input type="file" id="impFile" accept="application/json,.json" hidden>
        <button class="btn" type="button" data-adm="reset" style="border-color:var(--bad);color:var(--bad)">Restaurar datos de demostración</button></div></div>`;
    }
    return `<div class="row between" style="margin-bottom:10px"><div><h1>Administración</h1><div class="sub">Gestione la configuración, el personal y los catálogos del sistema.</div></div><span class="chip acc">${Api.mode === "server" ? "Servidor local (Python)" : "Python en el navegador"}</span></div>
      <div class="tabs" role="tablist">${ATABS.map(([k, t]) => `<button role="tab" type="button" aria-selected="${atab === k}" data-atab="${k}">${t}</button>`).join("")}</div>${h}`;
  }

  const arsOpts = (sel) => '<option value="">Particular (sin ARS)</option>' + (S.ars || []).filter((a) => a.active || a.id === sel).map((a) => `<option value="${a.id}" ${sel === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("");
  function adminForm(kind, id) {
    edit = { kind, id };
    const roleOpts = (sel) => Object.entries(S.roles).map(([k, v]) => `<option value="${k}" ${sel === k ? "selected" : ""}>${v}</option>`).join("");
    const medOpts = (sel) => '<option value="">— Sin asignar —</option>' + S.users.filter((u) => u.role === "medico").map((u) => `<option value="${u.id}" ${sel === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("");
    const btns = `<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" data-save="${kind}">Guardar</button></div>`;
    if (kind === "user") {
      const u = S.users.find((x) => x.id === id) || { role: "recepcion", active: true };
      modal(`<h2 id="mTitle">${id ? "Editar usuario" : "Nuevo usuario"}</h2><div class="grid" style="gap:10px;margin-top:8px">
        <div><label for="fU">Usuario</label><input type="text" id="fU" value="${esc(u.username || "")}"></div>
        <div><label for="fN">Nombre completo</label><input type="text" id="fN" value="${esc(u.name || "")}"></div>
        <div><label for="fR">Perfil</label><select id="fR">${roleOpts(u.role)}</select></div>
        <div><label for="fRoom">Consultorio (médicos)</label><select id="fRoom"><option value="">—</option>${S.rooms.map((r) => `<option value="${r.id}" ${u.room === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>
        <div><label for="fPat">Paciente vinculado (perfil paciente)</label><select id="fPat"><option value="">—</option>${S.patients.map((p) => `<option value="${p.id}" ${u.patient === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
        ${id ? "" : '<div><label for="fP">Contraseña inicial (mínimo 6)</label><input type="password" id="fP"></div>'}</div>${btns}`);
    } else if (kind === "pw") {
      const u = S.users.find((x) => x.id === id);
      modal(`<h2 id="mTitle">Contraseña de ${esc(u.username)}</h2><label for="fP">Nueva contraseña (mínimo 6)</label><input type="password" id="fP">${btns}`);
    } else if (kind === "room") {
      const r = S.rooms.find((x) => x.id === id) || { active: true };
      modal(`<h2 id="mTitle">${id ? "Editar consultorio" : "Nuevo consultorio"}</h2><label for="fN">Nombre</label><input type="text" id="fN" value="${esc(r.name || "")}">
        <label for="fD" style="margin-top:8px">Médico responsable</label><select id="fD">${medOpts(r.doctor)}</select>
        <label class="check" style="margin-top:10px"><input type="checkbox" id="fA" ${r.active ? "checked" : ""}> Activo</label>${btns}`);
    } else if (kind === "svc") {
      const s = S.services.find((x) => x.id === id) || { active: true, price: 0 };
      modal(`<h2 id="mTitle">${id ? "Editar servicio" : "Nuevo servicio"}</h2><label for="fN">Nombre</label><input type="text" id="fN" value="${esc(s.name || "")}">
        <label for="fPr" style="margin-top:8px">Precio (${esc(S.config.currency)})</label><input type="number" id="fPr" min="0" step="0.01" value="${s.price}">
        <label class="check" style="margin-top:10px"><input type="checkbox" id="fProc" ${s.procedure ? "checked" : ""}> Es un procedimiento (exige consentimiento escrito)</label>
        <label class="check" style="margin-top:6px"><input type="checkbox" id="fArs" ${s.ars ? "checked" : ""}> Cubierto por ARS</label>
        <label class="check" style="margin-top:6px"><input type="checkbox" id="fA" ${s.active ? "checked" : ""}> Activo</label>${btns}`);
    } else if (kind === "cie") {
      const x = S.cie.find((c) => c.code === id) || {};
      modal(`<h2 id="mTitle">${id ? "Editar diagnóstico" : "Nuevo diagnóstico"}</h2><label for="fC">Código CIE-10</label><input type="text" id="fC" value="${esc(x.code || "")}" ${id ? "readonly" : ""}>
        <label for="fN" style="margin-top:8px">Descripción</label><input type="text" id="fN" value="${esc(x.name || "")}">
        <label class="check" style="margin-top:10px"><input type="checkbox" id="fNot" ${x.notifiable ? "checked" : ""}> Notificación obligatoria</label>${btns}`);
    } else if (kind === "drug") {
      const d = S.drugs.find((x) => x.id === id) || {};
      modal(`<h2 id="mTitle">${id ? "Editar medicamento" : "Nuevo medicamento"}</h2><label for="fN">Indicación</label><input type="text" id="fN" value="${esc(d.name || "")}">
        <label for="fG" style="margin-top:8px">Grupo de alergia (por ejemplo, Penicilina, AINE)</label><input type="text" id="fG" value="${esc(d.group || "")}">${btns}`);
    } else if (kind === "ars") {
      const a = (S.ars || []).find((x) => x.id === id) || { active: true, coverage: 0.7 };
      modal(`<h2 id="mTitle">${id ? "Editar ARS" : "Nueva ARS"}</h2><label for="fN">Nombre</label><input type="text" id="fN" value="${esc(a.name || "")}">
        <label for="fCov" style="margin-top:8px">Cobertura de consulta (%)</label><input type="number" id="fCov" min="0" max="100" value="${Math.round(a.coverage * 100)}">
        <label class="check" style="margin-top:10px"><input type="checkbox" id="fA" ${a.active ? "checked" : ""}> Activa</label>${btns}`);
    } else if (kind === "pat") {
      const p = S.patients.find((x) => x.id === id);
      modal(`<h2 id="mTitle">Paciente ${p.id}</h2><div class="grid" style="gap:10px;margin-top:8px">
        <div><label for="fN">Nombre</label><input type="text" id="fN" value="${esc(p.name)}"></div><div><label for="fAge">Edad</label><input type="number" id="fAge" value="${p.age}"></div>
        <div><label for="fAl">Alergia</label><input type="text" id="fAl" value="${esc(p.allergy || "")}"></div><div><label for="fCh">Condiciones (separadas por coma)</label><input type="text" id="fCh" value="${esc((p.chronic || []).join(", "))}"></div>
        <div><label for="fD">Médico de cabecera</label><select id="fD">${medOpts(p.doctor)}</select></div>
        <div><label for="fDoc">Cédula</label><input type="text" id="fDoc" value="${esc(p.doc || "")}"></div>
        <div><label for="fArs">ARS</label><select id="fArs">${arsOpts(p.ars)}</select></div><div><label for="fNss">NSS</label><input type="text" id="fNss" value="${esc(p.nss || "")}"></div>
        <label class="check"><input type="checkbox" id="fRem" ${p.consent_reminders ? "checked" : ""}> Acepta recordatorios</label>
        <label class="check"><input type="checkbox" id="fPro" ${p.consent_promo ? "checked" : ""}> Acepta promoción</label></div>${btns}`);
    }
  }
  const val = (id) => ($("#" + id) ? $("#" + id).value : undefined);
  const chk = (id) => !!($("#" + id) && $("#" + id).checked);
  async function adminSave(kind) {
    const id = edit && edit.id;
    if (kind === "user") return act("user_save", { id, username: val("fU"), name: val("fN"), role: val("fR"), room: val("fRoom"), patient: val("fPat"), password: val("fP") }, { close: true });
    if (kind === "pw") return act("user_pw", { id, password: val("fP") }, { close: true });
    if (kind === "room") return act("room_save", { id, name: val("fN"), doctor: val("fD"), active: chk("fA") }, { close: true });
    if (kind === "svc") return act("service_save", { id, name: val("fN"), price: val("fPr"), procedure: chk("fProc"), ars: chk("fArs"), active: chk("fA") }, { close: true });
    if (kind === "cie") return act("cie_save", { code: val("fC"), name: val("fN"), notifiable: chk("fNot") }, { close: true });
    if (kind === "drug") return act("drug_save", { id, name: val("fN"), group: val("fG") }, { close: true });
    if (kind === "ars") return act("ars_save", { id, name: val("fN"), coverage: Number(val("fCov")) / 100, active: chk("fA") }, { close: true });
    if (kind === "pat") return act("patient_save", { id, name: val("fN"), ars: val("fArs"), nss: val("fNss"), doc: val("fDoc"), age: val("fAge"), allergy: val("fAl"), chronic: val("fCh"), doctor: val("fD"), consent_reminders: chk("fRem"), consent_promo: chk("fPro") }, { close: true });
  }

  // ================================================================ eventos
  $("#main").addEventListener("click", async (e) => {
    const t = e.target.closest("button,[data-pt]"); if (!t || !S) return;
    const d = t.dataset;
    if (d.pt) { ptab = d.pt; render(); return; }
    if (d.day) { pick.day = d.day; render(); return; }
    if (d.time) { pick.time = d.time; render(); return; }
    if (d.sel) { sel = d.sel; await act("open", { vid: sel }, { silent: true }); return; }
    if (d.atab) { atab = d.atab; render(); return; }
    if (d.arr) return act("arrive", { vid: d.arr });
    if (d.pay) { payId = d.pay; render(); return; }
    if (d.answer) return act("claim_status", { id: d.answer, status: "Respondida" });
    if (d.arsnext) return act("ars_status", { id: d.arsnext });
    if (d.adm) {
      const map = { "user-new": ["user"], "user-edit": ["user", d.id], "user-pw": ["pw", d.id], "ars-new": ["ars"], "ars-edit": ["ars", d.id], "room-new": ["room"], "room-edit": ["room", d.id], "svc-new": ["svc"], "svc-edit": ["svc", d.id], "cie-new": ["cie"], "cie-edit": ["cie", d.id], "drug-new": ["drug"], "drug-edit": ["drug", d.id], "pat-edit": ["pat", d.id] };
      if (map[d.adm]) return adminForm(...map[d.adm]);
      if (d.adm === "user-toggle") return act("user_toggle", { id: d.id });
      if (d.adm === "export") { const r = await Api.exportData(); toast(r.ok ? r.message : r.error, !r.ok); return; }
      if (d.adm === "reset") return modal(`<h2 id="mTitle">Restaurar datos de demostración</h2><p>Se reemplazan todos los datos por los de demostración y se cierra la sesión.${Api.mode === "server" ? " Antes se guarda una copia de seguridad en la base de datos." : ""}</p><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="doReset">Restaurar</button></div>`);
    }
    const a = d.a; if (!a) return;
    const v = visit(sel);
    if (a === "bp") return act("bp", { value: val("bpIn"), pid: myPatientId() });
    if (a === "tele") return act("tele", {});
    if (a === "data_request") return act("data_request", { kind: val("drType"), pid: myPatientId() });
    if (a === "book") { const ok = await act("book", { pid: myPatientId(), time: pick.time, day: pick.day, reason: val("pReason"), service: val("pSvc") }); if (ok) { pick.time = null; ptab = "inicio"; render(); } return; }
    if (a === "lab") return act("lab", { vid: sel });
    if (a === "vig") return act("vig", { vid: sel });
    if (a === "sign") return act("sign", { vid: sel, note: val("note"), dx: val("dx") });
    if (a === "pay-cancel") { payId = null; render(); return; }
    if (a === "pay") { const ok = await act("pay", { vid: d.vid, method: val("payM"), auth: val("payAuth") }); if (ok) { payId = null; render(); } return; }
    if (a === "triage-open") return modal(`<h2 id="mTitle">Triaje · ${esc(pt(v.pid).name)}</h2><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <div><label for="tPa">Presión (mmHg)</label><input type="text" id="tPa" value="128/82"></div><div><label for="tFc">Frecuencia cardiaca</label><input type="number" id="tFc" value="84"></div>
      <div><label for="tT">Temperatura (°C)</label><input type="text" id="tT" value="37.2"></div><div><label for="tSat">Saturación (%)</label><input type="number" id="tSat" value="97"></div>
      <div><label for="tPeso">Peso (kg)</label><input type="text" id="tPeso" value="70.2"></div></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="triSave">Guardar triaje</button></div>`);
    if (a === "consent-open") return modal(`<h2 id="mTitle">Consentimiento informado</h2><p class="sub">${esc(svc(v.service).name)} · ${esc(pt(v.pid).name)}</p><div class="note">Se explicó el procedimiento, sus riesgos y alternativas. La persona puede retirar su consentimiento en cualquier momento.</div>
      <label class="check" style="margin-top:10px"><input type="checkbox" id="cOk"> La persona confirma que entendió y acepta</label>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="consSave">Registrar firma</button></div>`);
    if (a === "rx-open") return modal(`<h2 id="mTitle">Receta</h2><label for="rxD">Medicamento</label><select id="rxD">${S.drugs.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>
      ${pt(v.pid).allergy ? `<div class="rule" style="margin-top:8px">Alergia registrada: <b>${esc(pt(v.pid).allergy)}</b>. El sistema bloquea medicamentos de ese grupo.</div>` : ""}
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="rxSave">Emitir receta</button></div>`);
    if (a === "ref-open") return modal(`<h2 id="mTitle">Referencia</h2><label for="rfT">Tipo</label><select id="rfT"><option>Consulta externa especializada</option><option>Urgencia</option><option>Emergencia</option></select>
      <label for="rfR" style="margin-top:8px">Resumen clínico</label><textarea id="rfR">Paciente con ${esc(v.reason.toLowerCase())}.</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="refSave">Emitir y dar seguimiento</button></div>`);
    if (a === "new-open") return modal(`<h2 id="mTitle">Paciente nuevo</h2><div class="grid" style="gap:10px;margin-top:8px"><div><label for="nName">Nombre completo</label><input type="text" id="nName"></div>
      <div><label for="nAge">Edad</label><input type="number" id="nAge" value="30"></div><div><label for="nDocId">Cédula</label><input type="text" id="nDocId" placeholder="000-0000000-0"></div>
      <div><label for="nArs">ARS</label><select id="nArs">${arsOpts("")}</select></div><div><label for="nNss">NSS</label><input type="text" id="nNss"></div><div><label for="nAl">Alergia</label><input type="text" id="nAl"></div>
      <div><label for="nDoc">Médico de cabecera</label><select id="nDoc">${S.users.filter((u) => u.role === "medico" && u.active).map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select></div>
      <div><label for="nTime">Atender hoy a las (opcional)</label><input type="text" id="nTime" placeholder="10:20"></div>
      <label class="check"><input type="checkbox" id="nCons"> Firmó el consentimiento para tratar sus datos de salud</label><label class="check"><input type="checkbox" id="nRem" checked> Acepta recordatorios</label></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="newSave">Inscribir</button></div>`);
    if (a === "book-open") return modal(`<h2 id="mTitle">Agendar cita</h2><label for="bP">Paciente</label><select id="bP">${S.patients.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
      <label for="bS" style="margin-top:8px">Servicio</label><select id="bS">${S.services.filter((s) => s.active).map((s) => `<option value="${s.id}">${esc(s.name)} · ${money(s.price)}</option>`).join("")}</select>
      <label for="bT" style="margin-top:8px">Hora</label><input type="text" id="bT" value="11:40"><label for="bR" style="margin-top:8px">Motivo</label><input type="text" id="bR" value="Consulta">
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="bookSave">Agendar</button></div>`);
    if (a === "claim-open") return modal(`<h2 id="mTitle">Registrar queja o sugerencia</h2><label for="qType">Tipo</label><select id="qType"><option>Queja</option><option>Sugerencia</option><option>Reclamo de cobro</option></select>
      <label for="qTxt" style="margin-top:8px">Descripción</label><textarea id="qTxt"></textarea>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="qSave">Registrar</button></div>`);
  });

  $("#mBody").addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.save) return adminSave(t.dataset.save);
    const opt = { close: true };
    if (t.id === "triSave") return act("triage", { vid: sel, pa: val("tPa"), fc: val("tFc"), t: val("tT"), sat: val("tSat"), peso: val("tPeso") }, opt);
    if (t.id === "consSave") return act("consent", { vid: sel, confirmed: chk("cOk") }, opt);
    if (t.id === "rxSave") return act("rx", { vid: sel, drug: val("rxD") }, opt);
    if (t.id === "refSave") return act("ref", { vid: sel, kind: val("rfT") }, opt);
    if (t.id === "newSave") return act("new_patient", { name: val("nName"), age: val("nAge"), doc: val("nDocId"), ars: val("nArs"), nss: val("nNss"), allergy: val("nAl"), doctor: val("nDoc"), time: val("nTime"), consent_data: chk("nCons"), consent_reminders: chk("nRem") }, opt);
    if (t.id === "bookSave") return act("book", { pid: val("bP"), service: val("bS"), time: val("bT"), reason: val("bR"), day: "hoy" }, opt);
    if (t.id === "qSave") return act("claim", { type: val("qType"), text: val("qTxt") }, opt);
    if (t.id === "doReset") { const r = await Api.reset(); closeModal(); toast(r.ok ? r.message : r.error, !r.ok); if (r.ok) showLogin(); }
  });

  $("#main").addEventListener("submit", (e) => {
    if (e.target.id !== "fCfg") return; e.preventDefault();
    act("cfg", { center: val("cCenter"), address: val("cAddr"), day: val("cDay"), slot_minutes: val("cSlot"), weekly_capacity: val("cCap"), occupancy_goal: Number(val("cGoal")) / 100, itbis_rate: Number(val("cIva")) / 100, itbis_exempt: chk("cIvaInc") });
  });
  $("#main").addEventListener("input", (e) => {
    if (e.target.id !== "aFilter") return; const q = e.target.value.toLowerCase();
    document.querySelectorAll("#aTable tr").forEach((tr, i) => { if (i) tr.hidden = !tr.textContent.toLowerCase().includes(q); });
  });
  $("#main").addEventListener("change", async (e) => {
    if (e.target.id !== "impFile" || !e.target.files[0]) return;
    try { const obj = JSON.parse(await e.target.files[0].text()); const r = await Api.importData(obj); toast(r.ok ? r.message : r.error, !r.ok); if (r.ok) showLogin(); }
    catch (err) { toast("El archivo no es un JSON válido.", true); }
  });

  // ================================================================ arranque
  (async function boot() {
    try {
      await Api.init((m) => { const el = $("#loadMsg"); if (el) el.textContent = m; });
    } catch (err) { $("#loadMsg").textContent = "No se pudo iniciar: " + err.message; return; }
    if (Api.mode === "browser") { const mb = $("#modebar"); mb.hidden = false; mb.textContent = "Demostración en el navegador: el motor Python corre aquí mismo y los datos se guardan solo en este navegador."; }
    const r = await Api.state();
    if (r.ok) { S = r.state; start(); } else showLogin();
  })();
})();
