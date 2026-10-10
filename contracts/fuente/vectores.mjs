// Vectores de prueba de contrato: escenario → resultado esperado (escrito explícitamente por escenario).
// pruebas/ejecutar.mjs los contrasta con el OpenAPI, el catálogo y una tabla de decisión independiente.
import * as E from './ejemplos.mjs';
import { clone } from './base.mjs';

const TIPO = { claveSecreta: 'secreta', clavePublica: 'publica', tokenSesion: 'sesion', cookiePanel: 'panel' };
// Retry-After esperado por código (H4). Lo contrasta pruebas/ejecutar.mjs con su propia tabla.
const REINTENTO = { limite_de_tasa: 'espera_del_limitador', intentos_excedidos: 'bloqueo_restante', cuota_agotada: 'hasta_el_1_del_mes_ART', limite_lecturas_contacto: 'hasta_medianoche_ART', simultaneas_agotadas: 'estimacion_corta', proveedor_no_disponible: 'estimacion_corta', servicio_no_disponible: 'estimacion_corta' };
const ESTADO_PREVIO = { registrarConsentimiento: 'creada', emitirTokenMedios: 'consentida', cerrarSesion: 'en_curso', registrarContacto: 'cerrada' };

export function vectores(ops, neg) {
  const V = [];
  const add = (categoria, requisitos, descripcion, o, solicitud, esperado) =>
    V.push({ id: `V${String(V.length + 1).padStart(3, '0')}`, categoria, requisitos, descripcion, operacion: o.id, solicitud, esperado });
  const tipos = (o) => [...new Set(o.seg.map((alt) => TIPO[alt[0]]))];
  const inseguro = (o) => o.m !== 'get';
  const exito = (o, k = 0) => {
    const e = { status: o.ok[0] };
    if (o.preflight) e.cors = 'permitido';
    if (o.ok[0] !== 204) e.cuerpo = o.ok[2][k % o.ok[2].length];
    return e;
  };
  const err = (status, codigo, extra = {}) => ({ status, codigo, ...(REINTENTO[codigo] ? { retry_after: REINTENTO[codigo] } : {}), ...extra });
  const base = (o, tipo = tipos(o)[0] || 'ninguna') => {
    const s = { credencial: { tipo, tenant: 'A' } };
    if (tipo === 'sesion') s.credencial.sujeto = 'ses_A1';
    if (tipo === 'panel') s.credencial.sujeto = 'ase_A1';
    s.origin = tipo === 'publica' || o.panel || o.preflight ? 'permitido' : 'ausente';
    if (o.preflight) s.preflight = { metodo: o.preflight.metodos[0], encabezados: ['Authorization', 'Content-Type'] };
    if (o.seg.some((a) => a.includes('desafio')) && tipo === 'publica') s.desafio = 'valido';
    if (o.seg.some((a) => a.includes('csrf'))) s.csrf = true;
    if (o.sensible) s.reautenticado = true;
    if (o.admin) s.rol = 'administrador';
    if (o.recurso) {
      s.recurso = { tenant: 'A', existe: true };
      if (o.recurso === 'sesion') Object.assign(s.recurso, { sujeto: 'ses_A1', estado: ESTADO_PREVIO[o.id] || 'cerrada', cotizacion_emitida: true });
      if (o.recurso === 'sesion_panel') Object.assign(s.recurso, { sujeto: 'ase_A1', contacto_registrado: true });
    }
    if (o.cupo) s.cupo = { cuota: 'disponible', simultaneas: 'disponibles' };
    if (o.login) s.login = { contrasena: 'correcta', totp: 'valido', intentos: 'normales' };
    if (o.body) s.cuerpo = clone(o.body[1][0]);
    return s;
  };
  const costo = (o, e) => (o.id === 'crearSesion' || (o.id === 'emitirTokenMedios' && e.status >= 400) ? { ...e, costo_cero: true } : e);

  for (const o of ops) {
    // 1. Camino feliz por cada tipo de credencial admitido.
    for (const t of tipos(o).length ? tipos(o) : ['ninguna']) add('exito', [], `${o.id} con credencial ${t}`, o, base(o, t), costo(o, exito(o)));

    if (o.seg.length) {
      // 2. Autenticación y autorización.
      add('autenticacion', ['R3'], `${o.id} sin credencial`, o, base(o, 'ninguna'), costo(o, err(401, 'credencial_ausente')));
      if (o.panel) {
        add('autenticacion', ['R34'], `${o.id} con sesión del panel vencida`, o, { ...base(o), credencial: { ...base(o).credencial, estado: 'vencida' } }, err(401, 'sesion_vencida'));
        add('autenticacion', ['R54'], `${o.id} con clave secreta en vez de cookie`, o, { ...base(o), credencial: { tipo: 'secreta', tenant: 'A' } }, err(401, 'credencial_ausente'));
      } else {
        add('autenticacion', ['R1'], `${o.id} con credencial revocada`, o, { ...base(o), credencial: { ...base(o).credencial, estado: 'revocada' } }, costo(o, err(401, 'credencial_invalida')));
        if (!tipos(o).includes('publica')) add('autenticacion', ['R54'], `${o.id} con clave pública (solo crea sesión)`, o, { ...base(o), credencial: { tipo: 'publica', tenant: 'A' }, origin: 'permitido' }, costo(o, err(403, 'alcance_insuficiente')));
        if (!tipos(o).includes('sesion')) add('autenticacion', ['R5'], `${o.id} con token de sesión`, o, { ...base(o), credencial: { tipo: 'sesion', tenant: 'A', sujeto: 'ses_A1' } }, costo(o, err(403, 'alcance_insuficiente')));
      }
      if (tipos(o).includes('secreta')) add('autenticacion', ['R2'], `${o.id} con clave secreta desde navegador (Origin presente)`, o, { ...base(o, 'secreta'), origin: 'permitido' }, costo(o, err(403, 'clave_secreta_desde_navegador')));
      if (tipos(o).includes('publica')) {
        for (const or of ['ajeno', 'ausente', 'comodin']) add('abuso', ['R55'], `${o.id} con clave pública y Origin ${or}`, o, { ...base(o, 'publica'), origin: or }, costo(o, err(403, 'origen_no_permitido')));
      }
      if (o.seg.some((a) => a.includes('csrf'))) {
        add('autenticacion', ['R36'], `${o.id} sin X-CSRF-Token`, o, { ...base(o), csrf: false }, err(403, 'csrf_invalido'));
        add('autenticacion', ['R36'], `${o.id} con Origin ajeno al panel`, o, { ...base(o), origin: 'ajeno' }, err(403, 'origen_no_permitido'));
      }
      if (o.sensible) add('autenticacion', ['R39'], `${o.id} sin reautenticación reciente`, o, { ...base(o), reautenticado: false }, err(401, 'reautenticacion_requerida'));
      if (o.admin) add('autenticacion', ['R54'], `${o.id} con rol asesor (no administrador)`, o, { ...base(o), rol: 'asesor' }, err(403, 'alcance_insuficiente'));
    }
    add('abuso', ['R8', 'R58'], `${o.id} en ráfaga por encima del límite por IP (paso 1)`, o, { ...base(o), tasa_ip: 'excedida' }, costo(o, err(429, 'limite_de_tasa')));
    // H1: el límite por credencial va DESPUÉS de credencial, Origin y desafío.
    if (o.seg.length) {
      for (const t of tipos(o)) {
        const aplica = t !== 'publica' || o.seg.some((a) => a.includes('desafio'));
        add('abuso', ['R8', 'R58', 'H1'], `${o.id}: límite de la credencial ${t} agotado${aplica ? '' : ' (no aplica: con clave pública solo limita crearSesion)'}`, o, { ...base(o, t), tasa_credencial: 'excedida' }, costo(o, aplica ? err(429, 'limite_de_tasa') : exito(o)));
      }
      add('abuso', ['R58', 'H1'], `${o.id}: sin credencial y con el límite de la credencial agotado → 401, no 429`, o, { ...base(o, 'ninguna'), tasa_credencial: 'excedida' }, costo(o, err(401, 'credencial_ausente')));
    }
    if (o.preflight) {
      const pf = (desc, cambio) => add('cors', ['R55', 'B6'], `${o.id}: ${desc}`, o, { ...base(o), ...cambio }, { status: 204, cors: 'ausente' });
      pf('Origin ajeno: 204 sin Access-Control-Allow-*', { origin: 'ajeno' });
      pf('Origin ausente: 204 sin Access-Control-Allow-*', { origin: 'ausente' });
      pf('Origin con comodín: 204 sin Access-Control-Allow-*', { origin: 'comodin' });
      pf('método no permitido', { preflight: { metodo: 'DELETE', encabezados: ['Content-Type'] } });
      pf('pide X-CSRF-Token (encabezado del panel)', { preflight: { metodo: o.preflight.metodos[0], encabezados: ['Content-Type', 'X-CSRF-Token'] } });
      pf('pide Cookie', { preflight: { metodo: o.preflight.metodos[0], encabezados: ['Cookie'] } });
      o.preflight.metodos.slice(1).forEach((m) => add('cors', ['B6'], `${o.id}: método ${m}`, o, { ...base(o), preflight: { metodo: m, encabezados: ['Authorization'] } }, { status: 204, cors: 'permitido' }));
      add('cors', ['B6'], `${o.id}: con X-VC-Clave-Publica, X-Desafio e Idempotency-Key`, o, { ...base(o), preflight: { metodo: o.preflight.metodos[0], encabezados: ['Content-Type', 'X-VC-Clave-Publica', 'X-Desafio', 'Idempotency-Key'] } }, { status: 204, cors: 'permitido' });
    }

    // 3. Aislamiento entre tenants y entre sujetos (R5, R41, R64).
    if (o.recurso) {
      for (const t of tipos(o)) {
        for (const [ct, rt] of [['A', 'B'], ['B', 'A']]) {
          const s = base(o, t);
          s.credencial.tenant = ct;
          s.recurso.tenant = rt;
          add('aislamiento', ['R5', 'R3'], `${o.id}: credencial ${t} del tenant ${ct} sobre recurso del tenant ${rt}`, o, s, costo(o, err(404, 'no_encontrado', { grupo_identico: `${o.id}-404` })));
        }
        const s = base(o, t);
        s.recurso.existe = false;
        add('aislamiento', ['R5', 'R64'], `${o.id}: recurso inexistente (mismo 404 que el ajeno)`, o, s, costo(o, err(404, 'no_encontrado', { grupo_identico: `${o.id}-404` })));
        if ((t === 'sesion' && o.recurso === 'sesion') || (t === 'panel' && o.recurso === 'sesion_panel')) {
          const s2 = base(o, t);
          s2.recurso.sujeto = t === 'sesion' ? 'ses_A2' : 'ase_A2';
          add('aislamiento', t === 'panel' ? ['R41'] : ['R5', 'R32'], `${o.id}: ${t === 'panel' ? 'otro asesor del mismo tenant' : 'token de otra sesión del mismo tenant'}`, o, s2, err(404, 'no_encontrado', { grupo_identico: `${o.id}-404` }));
        }
      }
      if (o.recurso === 'enlace' || o.recurso === 'enlace_cuerpo') {
        const s = base(o);
        s.recurso.revocado = true;
        s.recurso.existe = false;
        add('aislamiento', ['R62', 'R64'], `${o.id}: enlace revocado (rotado) responde igual que inexistente`, o, s, costo(o, err(404, 'no_encontrado', { grupo_identico: `${o.id}-404` })));
      }
    }
    if (o.body) {
      const s = base(o);
      s.cuerpo = { ...s.cuerpo, tenant_id: '7f1c2d4e-0000-4000-8000-00000000000b' };
      add('aislamiento', ['R3'], `${o.id}: tenant_id en el cuerpo se rechaza`, o, s, costo(o, err(422, 'validacion_fallida')));
    }

    // 4. Cuerpos: todos los ejemplos válidos y los negativos del esquema del pedido.
    if (o.body) {
      o.body[1].slice(1).forEach((c, k) => add('cuerpos', [], `${o.id}: pedido válido ${k + 2}`, o, { ...base(o), cuerpo: clone(c) }, costo(o, exito(o, k + 1))));
      neg.filter((x) => x.esquema === o.body[0]).slice(0, 6).forEach((x) => add('cuerpos', ['R9', 'O02'], `${o.id}: ${x.caso}`, o, { ...base(o), cuerpo: clone(x.instancia) }, costo(o, err(422, 'validacion_fallida'))));
    }
  }

  const op = (n) => ops.find((o) => o.id === n);
  // 5. Abuso de costos y orden consentimiento → desafío → cupo → proveedores (R53, R56, R57, R61).
  const cs = op('crearSesion');
  for (const d of ['ausente', 'vencido', 'reusado', 'otro_origin', 'otra_clave']) add('abuso', ['R53', 'R61'], `crearSesion con desafío ${d}`, cs, { ...base(cs, 'publica'), desafio: d }, err(403, 'desafio_invalido', { costo_cero: true }));
  add('abuso', ['R56'], 'crearSesion con cuota mensual agotada', cs, { ...base(cs, 'publica'), cupo: { cuota: 'agotada', simultaneas: 'disponibles' } }, err(429, 'cuota_agotada', { costo_cero: true }));
  add('abuso', ['R57'], 'crearSesion con 5 simultáneas en curso', cs, { ...base(cs, 'publica'), cupo: { cuota: 'disponible', simultaneas: 'agotadas' } }, err(429, 'simultaneas_agotadas', { costo_cero: true }));
  add('abuso', ['R56'], 'crearSesion con clave secreta y cuota agotada', cs, { ...base(cs, 'secreta'), cupo: { cuota: 'agotada', simultaneas: 'disponibles' } }, err(429, 'cuota_agotada', { costo_cero: true }));
  // H1: rechazos anteriores al paso 8 no consumen el límite de la clave pública.
  add('abuso', ['R58', 'H1'], 'crearSesion: límite de la clave agotado y Origin ausente → 403 (el rechazo es anterior y no consume)', cs, { ...base(cs, 'publica'), tasa_credencial: 'excedida', origin: 'ausente' }, err(403, 'origen_no_permitido', { costo_cero: true }));
  add('abuso', ['R58', 'H1'], 'crearSesion: límite de la clave agotado y desafío reusado → 403 desafio_invalido', cs, { ...base(cs, 'publica'), tasa_credencial: 'excedida', desafio: 'reusado' }, err(403, 'desafio_invalido', { costo_cero: true }));
  add('abuso', ['R58', 'H1'], 'crearSesion: clave secreta desde navegador con límite agotado → 403', cs, { ...base(cs, 'secreta'), tasa_credencial: 'excedida', origin: 'permitido' }, err(403, 'clave_secreta_desde_navegador', { costo_cero: true }));
  add('abuso', ['R58'], 'crearSesion: límite por enlace agotado', cs, { ...base(cs, 'publica'), tasa_enlace: 'excedida' }, err(429, 'limite_de_tasa', { costo_cero: true }));
  {
    const s = { ...base(cs, 'publica'), tasa_enlace: 'excedida' };
    s.recurso = { ...s.recurso, existe: false };
    add('abuso', ['R58', 'R64'], 'crearSesion: enlace inexistente con límite por enlace agotado → 404 (el enlace se resuelve antes)', cs, s, err(404, 'no_encontrado', { costo_cero: true, grupo_identico: 'crearSesion-404' }));
  }
  const ed = op('emitirDesafio');
  add('abuso', ['R53', 'H1'], 'emitirDesafio con el límite de la clave agotado por crearSesion: igual emite (solo límite por IP)', ed, { ...base(ed, 'publica'), tasa_credencial: 'excedida' }, exito(ed, 1));
  add('abuso', ['R56', 'H3'], 'crearSesion con tope mensual del asesor agotado', cs, { ...base(cs, 'publica'), cupo: { cuota: 'disponible', simultaneas: 'disponibles', asesor: 'agotada' } }, err(429, 'cuota_agotada', { costo_cero: true }));
  add('abuso', ['R56', 'H3'], 'crearSesion con tope global de gasto agotado (mismo código, sin revelar cuál)', cs, { ...base(cs, 'publica'), cupo: { cuota: 'disponible', simultaneas: 'disponibles', global: 'agotada' } }, err(429, 'cuota_agotada', { costo_cero: true }));
  const tm = op('emitirTokenMedios');
  add('abuso', ['R56', 'H3'], 'emitirTokenMedios con tope mensual del asesor agotado', tm, { ...base(tm), cupo: { cuota: 'disponible', simultaneas: 'disponibles', asesor: 'agotada' } }, err(429, 'cuota_agotada', { costo_cero: true }));
  add('abuso', ['R56', 'H3'], 'emitirTokenMedios con tope global de gasto agotado', tm, { ...base(tm), cupo: { cuota: 'disponible', simultaneas: 'disponibles', global: 'agotada' } }, err(429, 'cuota_agotada', { costo_cero: true }));
  add('abuso', ['R57', 'H3'], 'emitirTokenMedios con simultáneas globales agotadas', tm, { ...base(tm), cupo: { cuota: 'disponible', simultaneas: 'disponibles', simultaneas_global: 'agotadas' } }, err(429, 'simultaneas_agotadas', { costo_cero: true }));
  add('abuso', ['R57', 'H3'], 'emitirTokenMedios con simultáneas del asesor agotadas', tm, { ...base(tm), cupo: { cuota: 'disponible', simultaneas: 'disponibles', simultaneas_asesor: 'agotadas' } }, err(429, 'simultaneas_agotadas', { costo_cero: true }));
  add('abuso', ['R56', 'H3'], 'emitirTokenMedios con saldo menor que duracion_maxima_s (≥ 60 s): reserva recortada', tm, { ...base(tm), cupo: { cuota: 'parcial', simultaneas: 'disponibles' } }, { status: 201, cuerpo: E.tokenMedios(3) });
  {
    const s = { ...base(tm), cupo: { cuota: 'agotada', simultaneas: 'agotadas' } };
    s.recurso = { ...s.recurso, reserva_vigente: true };
    add('abuso', ['R57', 'H3'], 'emitirTokenMedios para reconectar con reserva vigente: misma reserva, sin reservar de nuevo', tm, s, { status: 201, cuerpo: E.tokenMedios(0) });
  }
  const sinCons = base(tm);
  sinCons.recurso.estado = 'creada';
  add('abuso', ['R10', 'R61', 'O1'], 'emitirTokenMedios sin consentimiento: sin token y sin proveedores', tm, sinCons, err(409, 'consentimiento_requerido', { costo_cero: true }));
  add('abuso', ['R56', 'R61'], 'emitirTokenMedios con cuota agotada', tm, { ...base(tm), cupo: { cuota: 'agotada', simultaneas: 'disponibles' } }, err(429, 'cuota_agotada', { costo_cero: true }));
  add('abuso', ['R57'], 'emitirTokenMedios: sexta simultánea', tm, { ...base(tm), cupo: { cuota: 'disponible', simultaneas: 'agotadas' } }, err(429, 'simultaneas_agotadas', { costo_cero: true }));
  const lc = op('leerContactoCliente');
  add('abuso', ['R69'], 'leerContactoCliente por encima del límite diario', lc, { ...base(lc), lecturas_contacto: 'agotadas' }, err(429, 'limite_lecturas_contacto'));
  const sinContacto = base(lc);
  sinContacto.recurso.contacto_registrado = false;
  add('aislamiento', ['R68'], 'leerContactoCliente sin contacto consentido', lc, sinContacto, err(404, 'no_encontrado'));

  // 6. Estados de la sesión.
  const estado = (n, est, codigo, desc, extra = {}) => {
    const o = op(n);
    const s = base(o);
    Object.assign(s.recurso, { estado: est, ...extra });
    add('estado', ['R10', 'R60'], desc, o, s, costo(o, err(409, codigo)));
  };
  estado('registrarConsentimiento', 'consentida', 'estado_invalido', 'consentimiento repetido');
  estado('registrarConsentimiento', 'cerrada', 'sesion_cerrada', 'consentimiento en sesión cerrada');
  estado('emitirTokenMedios', 'cerrada', 'sesion_cerrada', 'token de medios en sesión cerrada');
  estado('cerrarSesion', 'cerrada', 'sesion_cerrada', 'cerrar dos veces');
  estado('leerCotizacion', 'en_curso', 'cotizacion_no_emitida', 'cotización antes del final (precio solo al final)', { cotizacion_emitida: false });
  estado('leerCotizacion', 'cerrada', 'cotizacion_no_emitida', 'sesión cerrada sin presupuesto (sin_voz)', { cotizacion_emitida: false });
  estado('leerDerivacion', 'en_curso', 'estado_invalido', 'derivación antes del cierre');
  estado('registrarContacto', 'creada', 'estado_invalido', 'contacto antes de la conversación');
  estado('registrarContacto', 'cerrada', 'contacto_ya_registrado', 'contacto repetido', { contacto_registrado: true });
  const csOk = base(op('cerrarSesion'));
  csOk.recurso.estado = 'creada';
  csOk.cuerpo = { motivo: 'sin_consentimiento' };
  add('estado', ['R45'], 'rechazo del consentimiento: cierre con sin_consentimiento y alternativa WhatsApp', op('cerrarSesion'), csOk, { status: 200, cuerpo: E.cierre(4) });
  const csCam = clone(csOk);
  csCam.cuerpo = { motivo: 'sin_camara' };
  add('estado', ['R45'], 'sin cámara: cierre con sin_camara y alternativa WhatsApp', op('cerrarSesion'), csCam, { status: 200, cuerpo: E.cierre(3) });

  // 7. Cotización: suma, redondeo y fuera de zona (T24, R15).
  const lcot = op('leerCotizacion');
  E.OFICIOS.forEach((of, a) =>
    E.ZONAS.forEach((z, b) => {
      const c = E.cotizacion(of, z, a * 5 + b + 100);
      add('cotizacion', z === 'otra' ? ['R15', 'T24'] : ['R15'], `cotización ${of} en ${z}${z === 'otra' ? ': fuera de zona SÍ se emite, marcada' : ''}`, lcot, base(lcot), { status: 200, cuerpo: c });
    }),
  );
  const malo = (desc, f, req = ['R15']) => {
    const c = E.cotizacion('pintura', 'cobo', 7);
    f(c);
    add('cotizacion', req, desc, lcot, base(lcot), { status: 200, cuerpo: c, conforme: false });
  };
  malo('total mínimo distinto de la suma de ítems', (c) => (c.total_min_centavos += 1));
  malo('total máximo distinto de la suma de ítems', (c) => (c.total_max_centavos -= 1));
  malo('importe de ítem mal redondeado', (c) => {
    c.items[0].importe_max_centavos += 1;
    c.total_max_centavos += 1;
  });
  malo('fuera de zona sin marca', (c) => (c.zona = 'otra'), ['T24']);
  malo('monto con decimales', (c) => (c.total_min_centavos += 0.5), ['O04']);
  malo('precio unitario negativo', (c) => (c.items[0].precio_unitario_min_centavos = -100), ['O04']);
  malo('rango invertido: mínimo mayor que máximo', (c) => {
    const it = c.items[0];
    Object.assign(c.items[0], E.conRango(it, it.precio_unitario_max_centavos, it.precio_unitario_min_centavos));
    E.totales(c);
  }, ['B1']);
  malo('precio final con tarifas sin validar', (c) => (c.precio_final_centavos = c.total_min_centavos), ['B1']);
  {
    const c = E.cotizacionPrecioFinal(4);
    c.items[0] = E.conRango(c.items[0], c.items[0].precio_unitario_min_centavos, c.items[0].precio_unitario_min_centavos + 100);
    E.totales(c);
    add('cotizacion', ['B1'], 'precio final con un rango que no es un punto', lcot, base(lcot), { status: 200, cuerpo: c, conforme: false });
  }
  add('cotizacion', ['B1'], 'tarifario validado con rango de un punto: lleva precio_final_centavos', lcot, base(lcot), { status: 200, cuerpo: E.cotizacionPrecioFinal(2) });
  const fz = E.cotizacion('jardineria', 'otra', 3);
  add('cotizacion', ['T24'], 'evento final: cotización fuera de zona emitida con derivación', op('cerrarSesion'), base(op('cerrarSesion')), { status: 200, cuerpo: { ...E.cierre(0), cotizacion_id: fz.cotizacion_id } });

  // 8. Derivación (R50).
  const ld = op('leerDerivacion');
  for (let k = 0; k < 6; k++) add('derivacion', ['R50'], `derivación wa.me ${k + 1}`, ld, base(ld), { status: 200, cuerpo: E.derivacion(k + 10) });
  const dMal = (desc, f) => {
    const d = E.derivacion(3);
    f(d);
    add('derivacion', ['R50'], desc, ld, base(ld), { status: 200, cuerpo: d, conforme: false });
  };
  dMal('texto con teléfono del cliente', (d) => {
    d.texto_prellenado = `Hola, soy Marta +5492235551234, ${d.codigo_referencia}`;
    d.url_wa_me = d.url_wa_me.split('?')[0] + '?text=' + encodeURIComponent(d.texto_prellenado);
  });
  dMal('texto con email del cliente', (d) => {
    d.texto_prellenado = `Hola, marta@correo.local ${d.codigo_referencia}`;
    d.url_wa_me = d.url_wa_me.split('?')[0] + '?text=' + encodeURIComponent(d.texto_prellenado);
  });
  dMal('url sin el código de referencia', (d) => (d.url_wa_me = d.url_wa_me.split('?')[0] + '?text=' + encodeURIComponent('Hola')));
  dMal('url y texto prellenado no coinciden', (d) => (d.texto_prellenado = 'Otro texto ' + d.codigo_referencia));

  // 9. Panel: login, TOTP y reautenticación (R37–R39).
  const login = (n, campo, valor, status, codigo, req) => {
    const o = op(n);
    const s = base(o);
    s.login[campo] = valor;
    add('panel', req, `${n} con ${campo} ${valor}`, o, s, err(status, codigo));
  };
  login('iniciarSesionPanel', 'contrasena', 'incorrecta', 401, 'credenciales_incorrectas', ['R37']);
  login('iniciarSesionPanel', 'intentos', 'excedidos', 429, 'intentos_excedidos', ['R37']);
  login('verificarTotp', 'totp', 'invalido', 401, 'totp_invalido', ['R38']);
  login('verificarTotp', 'totp', 'reusado', 401, 'totp_invalido', ['R38']);
  login('verificarTotp', 'intentos', 'excedidos', 429, 'intentos_excedidos', ['R38']);
  login('reautenticar', 'contrasena', 'incorrecta', 401, 'credenciales_incorrectas', ['R39']);
  login('reautenticar', 'totp', 'invalido', 401, 'totp_invalido', ['R39']);
  const ip = op('iniciarSesionPanel');
  add('panel', ['R36'], 'login desde Origin ajeno al panel', ip, { ...base(ip), origin: 'ajeno' }, err(403, 'origen_no_permitido'));

  // 10. Detalle del panel (T39) y contacto.
  const lmc = op('leerMiCotizacion');
  E.OFICIOS.forEach((of, a) => E.ZONAS.forEach((z, b) => add('panel', ['R42', 'R69'], `detalle ${of}/${z}`, lmc, base(lmc), { status: 200, cuerpo: E.sesionDetalle(of, z, a * 5 + b) })));
  add('panel', ['T39'], 'detalle con código de referencia', lmc, base(lmc), { status: 200, cuerpo: { ...E.sesionDetalle('pintura', 'cobo', 0), codigo_referencia: 'VC-ABCD-EFGHJK' }, conforme: false });
  add('panel', ['T39'], 'detalle con contacto_disponible', lmc, base(lmc), { status: 200, cuerpo: { ...E.sesionDetalle('pintura', 'cobo', 0), contacto_disponible: true }, conforme: false });
  return V;
}
