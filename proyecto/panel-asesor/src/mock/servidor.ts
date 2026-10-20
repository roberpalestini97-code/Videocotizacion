// SOLO DESARROLLO Y PRUEBAS (ver eslint.config.js: nadie de producción puede importar este directorio).
// Servidor simulado EN MEMORIA del contrato 0.1.4-borrador, para `npm run dev` y para las pruebas del panel.
// Qué simula: login con contraseña + TOTP simulado, cookie de sesión y CSRF (en memoria: el navegador no guarda
// nada), vencimientos por inactividad y absoluto, reautenticación (ventana de 5 minutos) para acciones sensibles,
// listado/detalle/contacto de cotizaciones, registros de lecturas, perfil, consumo diario, enlace, claves del
// widget, exportación y catálogo de textos. Qué NO simula: ni Postgres, ni RLS, ni límites de tasa por IP, ni el
// backend real. Una respuesta de este mock que el contrato no admita es un bug del mock: src/test/contrato.test.ts
// valida cada respuesta contra contracts/schemas.
import { MENSAJES_ERROR } from '../api/generado/errores';
import type { CodigoError, ConsumoDiario, Oficio, PerfilAsesor, RegistroLectura, ClaveWidget, AccionRegistro } from '../api/tipos';
import {
  CODIGO_RECUPERACION_DEMO,
  CODIGO_TOTP_DEMO,
  CONTRASENA_DEMO,
  CUENTAS_DEMO,
  MARCA_MOCK,
  crearAzar,
  generarConsultas,
  idCrockford,
  idPublico,
  idTraza,
  iso,
  secretoUrl,
  type CuentaDemo,
  type FilaConsulta,
} from './datos';

export { CODIGO_RECUPERACION_DEMO, CODIGO_TOTP_DEMO, CONTRASENA_DEMO, CUENTAS_DEMO, MARCA_MOCK };

export interface OpcionesMock {
  /** Reloj inyectable (ms desde epoch). */
  ahora?: () => number;
  /** Demora de cada respuesta; 0 = sin temporizadores (lo que usan las pruebas). */
  latenciaMs?: number;
  semilla?: number;
  cantidadConsultas?: number;
  /** Si es true, un código TOTP no se acepta dos veces en el mismo paso de 30 s (R38). */
  rechazarReusoTotp?: boolean;
  limiteLecturasContacto?: number;
  intentosMaximos?: number;
}

export interface FallaInyectada {
  metodo?: string;
  /** Ruta exacta (`/v1/panel/perfil`) o expresión regular. */
  ruta: string | RegExp;
  /** Cuántos pedidos afecta (por defecto 1). */
  veces?: number;
  /** El pedido ni llega: el navegador lo ve como `TypeError`. */
  sinConexion?: boolean;
  status?: number;
  codigo?: CodigoError;
  /** Cuerpo que NO es problem+json (p. ej. una página HTML de un proxy). */
  cuerpoCrudo?: string;
  /** Responde con este JSON (status 200 salvo que se indique otro) en vez de ejecutar la ruta: datos hostiles o raros. */
  respuestaJson?: unknown;
  reintentarEnS?: number;
  campos?: { campo: string; problema: string }[];
}

export interface PedidoRegistrado {
  metodo: string;
  ruta: string;
  consulta: Record<string, string>;
  cuerpo: unknown;
  csrf: string | null;
}

interface SesionServidor {
  fase: 'preliminar' | 'activa';
  cuenta: CuentaDemo;
  csrf: string;
  creadaMs: number;
  ultimoUsoMs: number;
  venceLoginMs: number;
  reautenticadoHastaMs: number;
  intentosTotp: number;
  bloqueadaHastaMs: number;
  vencida: boolean;
  revocada: boolean;
}

const STATUS: Partial<Record<CodigoError, number>> = {
  solicitud_invalida: 400, validacion_fallida: 422, cuerpo_demasiado_grande: 413, tipo_de_contenido_no_soportado: 415,
  credencial_ausente: 401, credencial_invalida: 401, credenciales_incorrectas: 401, totp_invalido: 401, sesion_vencida: 401,
  reautenticacion_requerida: 401, origen_no_permitido: 403, alcance_insuficiente: 403, csrf_invalido: 403, no_encontrado: 404,
  estado_invalido: 409, limite_de_tasa: 429, intentos_excedidos: 429, limite_lecturas_contacto: 429, error_interno: 500,
  servicio_no_disponible: 503,
};
const TITULO: Partial<Record<CodigoError, string>> = {
  solicitud_invalida: 'Solicitud inválida', validacion_fallida: 'Datos inválidos', cuerpo_demasiado_grande: 'Pedido demasiado grande',
  tipo_de_contenido_no_soportado: 'Tipo de contenido no soportado', credencial_ausente: 'Falta la credencial',
  credencial_invalida: 'Credencial inválida', credenciales_incorrectas: 'Datos de ingreso incorrectos', totp_invalido: 'Código incorrecto',
  sesion_vencida: 'Sesión vencida', reautenticacion_requerida: 'Confirmá tu identidad', origen_no_permitido: 'Origen no permitido',
  alcance_insuficiente: 'Sin permiso', csrf_invalido: 'Pedido no verificado', no_encontrado: 'No encontrado', estado_invalido: 'Estado inválido',
  limite_de_tasa: 'Demasiados pedidos', intentos_excedidos: 'Demasiados intentos', limite_lecturas_contacto: 'Límite de lecturas',
  error_interno: 'Error interno', servicio_no_disponible: 'Servicio no disponible',
};

class Salida extends Error {
  constructor(readonly respuesta: Response) {
    super('salida');
  }
}

const MIN = 60_000;
const INACTIVIDAD_MS = 30 * MIN;
const ABSOLUTO_MS = 12 * 60 * MIN;
const LOGIN_MS = 5 * MIN;
const REAUTENTICACION_MS = 5 * MIN;
const OFFSET_AR_MS = -3 * 60 * MIN;
const TOPE_SEGUNDOS = 30_000;

const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATRON_TELEFONO = /^\+[1-9][0-9]{7,14}$/;
const PATRON_ORIGIN = /^https:\/\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:[0-9]{1,5})?$/;
// eslint-disable-next-line no-control-regex
const PATRON_TEXTO = /^[^<>\u0000-\u0008\u000B\u000C\u000E-\u001F]*$/;
const OFICIOS_VALIDOS: readonly string[] = ['pintura', 'jardineria', 'reparaciones', 'mantenimiento', 'limpieza'];
const ZONAS_VALIDAS: readonly string[] = ['mar_chiquita', 'cobo', 'santa_clara', 'parque_lago'];

/** Catálogo de textos del mock. Difiere a propósito de los respaldos del panel en algunas claves. */
export function catalogoDeTextos(): Record<string, string> {
  const errores = Object.fromEntries(Object.entries(MENSAJES_ERROR).map(([codigo, mensaje]) => [`error.${codigo}`, mensaje]));
  return {
    'widget.boton_iniciar': 'Iniciar VideoCotización',
    'panel.menu.perfil': 'Perfil',
    'panel.menu.mis_cotizaciones': 'Mis cotizaciones',
    'panel.menu.registros': 'Registros',
    'panel.contacto_disponible': 'Dejó contacto',
    'motivo.completada': 'Completada',
    'motivo.cliente_cerro': 'El cliente cortó la llamada',
    'motivo.sin_voz': 'Cortada por silencio',
    'motivo.sin_camara': 'Sin cámara',
    'motivo.sin_consentimiento': 'Sin consentimiento',
    'motivo.duracion_maxima': 'Duración máxima',
    'motivo.cuota_agotada': 'Cupo agotado',
    'motivo.desafio_invalido': 'Verificación fallida',
    'motivo.error_proveedor': 'Falla de un servicio externo',
    'motivo.error_interno': 'Error interno',
    'oficio.pintura': 'Pintura',
    'oficio.jardineria': 'Jardinería',
    'oficio.reparaciones': 'Reparaciones',
    'oficio.mantenimiento': 'Mantenimiento',
    'oficio.limpieza': 'Limpieza',
    'zona.mar_chiquita': 'Mar Chiquita',
    'zona.cobo': 'Cobo',
    'zona.santa_clara': 'Santa Clara del Mar',
    'zona.parque_lago': 'Parque Lago',
    'zona.otra': 'fuera de zona',
    ...errores,
  };
}

const fechaAr = (ms: number): string => new Date(ms + OFFSET_AR_MS).toISOString().slice(0, 10);

export function crearServidorMock(opciones: OpcionesMock = {}) {
  const ahora = opciones.ahora ?? (() => Date.now());
  const latenciaMs = opciones.latenciaMs ?? 0;
  const limiteLecturas = opciones.limiteLecturasContacto ?? 20;
  const intentosMax = opciones.intentosMaximos ?? 5;
  const azar = crearAzar(opciones.semilla ?? 20261008);

  // ---- Estado ----
  const contrasenas = new Map<string, string>(CUENTAS_DEMO.map((c) => [c.email, CONTRASENA_DEMO]));
  const perfiles = new Map<string, PerfilAsesor>();
  for (const c of CUENTAS_DEMO) {
    perfiles.set(c.asesorId, {
      asesor_id: c.asesorId,
      rol: c.rol,
      nombre_visible: c.nombreVisible,
      email: c.email,
      whatsapp: c.whatsapp,
      oficios: ['pintura', 'jardineria'],
      zonas: ['mar_chiquita', 'cobo'],
      totp_activo: true,
      consentimiento_asesor: { version: '2026-10-08.1', aceptado_en: iso(ahora() - 7 * 24 * 60 * MIN) },
      creado_en: iso(ahora() - 7 * 24 * 60 * MIN),
    });
  }
  const consultas = new Map<string, FilaConsulta[]>();
  for (const c of CUENTAS_DEMO) {
    consultas.set(c.asesorId, generarConsultas(azar, ahora(), c.asesorId, opciones.cantidadConsultas ?? 45));
  }
  const registros = new Map<string, RegistroLectura[]>();
  const lecturasDeContacto = new Map<string, number>();
  const nuevoRegistro = (asesorId: string, accion: AccionRegistro, recursoId?: string, cuando = ahora()): RegistroLectura => {
    const r: RegistroLectura = { registro_id: idCrockford(azar, 'reg'), ocurrido_en: iso(cuando), asesor_id: asesorId, accion, ...(recursoId ? { recurso_id: recursoId } : {}) };
    const lista = registros.get(asesorId) ?? [];
    lista.unshift(r);
    registros.set(asesorId, lista);
    return r;
  };
  for (const c of CUENTAS_DEMO) {
    for (let d = 3; d >= 1; d -= 1) nuevoRegistro(c.asesorId, 'inicio_sesion', undefined, ahora() - d * 24 * 60 * MIN);
  }
  let enlace = { id: idPublico(azar), rotadoEn: undefined as string | undefined };
  const claves: ClaveWidget[] = [
    { clave_id: idCrockford(azar, 'cpw'), nombre: 'Sitio principal', prefijo: 'vc_pub_NlwcBG', origins: ['https://www.minegocio.com.ar'], estado: 'activa', creada_en: iso(ahora() - 5 * 24 * 60 * MIN), ultimo_uso_en: iso(ahora() - 3 * 60 * MIN) },
    { clave_id: idCrockford(azar, 'cpw'), nombre: 'Sitio viejo', prefijo: 'vc_pub_Zx81Qa', origins: ['https://viejo.minegocio.com.ar'], estado: 'revocada', creada_en: iso(ahora() - 20 * 24 * 60 * MIN), revocada_en: iso(ahora() - 10 * 24 * 60 * MIN) },
  ];
  let textos = catalogoDeTextos();
  let sesion: SesionServidor | null = null;
  let intentosLogin = new Map<string, { n: number; hasta: number }>();
  let ultimoPasoTotp = -1;
  const recuperacion = new Set<string>([CODIGO_RECUPERACION_DEMO]);
  let consumoForzado: Partial<{ segundos_usados: number; segundos_tope: number; simultaneas_en_curso: number; simultaneas_tope: number }> | null = null;
  const fallas: FallaInyectada[] = [];
  const retenidos: { metodo: string | undefined; ruta: string | RegExp; liberar: Promise<void> }[] = [];
  const pedidos: PedidoRegistrado[] = [];

  // ---- Utilidades de respuesta ----
  const json = (status: number, cuerpo: unknown, cabeceras: Record<string, string> = {}): Response =>
    new Response(status === 204 ? null : JSON.stringify(cuerpo), {
      status,
      headers: status === 204 ? cabeceras : { 'Content-Type': 'application/json', ...cabeceras },
    });

  function fallo(codigo: CodigoError, extra: { campos?: { campo: string; problema: string }[]; reintentarEnS?: number; statusForzado?: number } = {}): Salida {
    const status = extra.statusForzado ?? STATUS[codigo] ?? 500;
    const cuerpo = {
      type: `https://videocotizacion.local/errores/${codigo}`,
      title: TITULO[codigo] ?? 'Error',
      status,
      codigo,
      detail: MENSAJES_ERROR[codigo] ?? 'Error.',
      id_traza: idTraza(azar),
      ...(extra.campos ? { errores: extra.campos } : {}),
      ...(extra.reintentarEnS !== undefined ? { reintentar_en_s: extra.reintentarEnS } : {}),
    };
    return new Salida(
      new Response(JSON.stringify(cuerpo), {
        status,
        headers: {
          'Content-Type': 'application/problem+json',
          ...(extra.reintentarEnS !== undefined ? { 'Retry-After': String(extra.reintentarEnS) } : {}),
        },
      }),
    );
  }

  // ---- Autenticación ----
  function exigirSesion(req: { csrf: string | null; metodo: string }, opts: { escribe?: boolean; admin?: boolean; reauth?: boolean } = {}): SesionServidor {
    const ahoraMs = ahora();
    const s = sesion;
    if (!s || s.fase !== 'activa') throw fallo('credencial_ausente');
    if (s.revocada) throw fallo('credencial_invalida');
    if (s.vencida || ahoraMs > s.ultimoUsoMs + INACTIVIDAD_MS || ahoraMs > s.creadaMs + ABSOLUTO_MS) {
      s.vencida = true;
      throw fallo('sesion_vencida');
    }
    if (opts.escribe && (req.csrf === null || req.csrf !== s.csrf)) throw fallo('csrf_invalido');
    if (opts.admin && s.cuenta.rol !== 'administrador') throw fallo('alcance_insuficiente');
    if (opts.reauth && ahoraMs > s.reautenticadoHastaMs) throw fallo('reautenticacion_requerida');
    s.ultimoUsoMs = ahoraMs;
    return s;
  }

  function sesionPanelJson(s: SesionServidor) {
    return {
      asesor: { asesor_id: s.cuenta.asesorId, nombre_visible: perfiles.get(s.cuenta.asesorId)?.nombre_visible ?? s.cuenta.nombreVisible, rol: s.cuenta.rol },
      csrf_token: s.csrf,
      vence_inactividad_en: iso(s.ultimoUsoMs + INACTIVIDAD_MS),
      vence_absoluto_en: iso(s.creadaMs + ABSOLUTO_MS),
      ...(s.reautenticadoHastaMs > ahora() ? { reautenticado_hasta: iso(s.reautenticadoHastaMs) } : {}),
    };
  }

  function esTotpValido(codigo: string): boolean {
    if (codigo !== CODIGO_TOTP_DEMO) return false;
    if (opciones.rechazarReusoTotp) {
      const paso = Math.floor(ahora() / 30_000);
      if (paso === ultimoPasoTotp) return false;
      ultimoPasoTotp = paso;
    }
    return true;
  }

  // ---- Cuerpos ----
  function leerCuerpo(texto: string, tipo: string | null): Record<string, unknown> {
    if (texto.length > 16_384) throw fallo('cuerpo_demasiado_grande');
    if (!tipo?.includes('application/json')) throw fallo('tipo_de_contenido_no_soportado');
    try {
      const v: unknown = JSON.parse(texto);
      if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('no objeto');
      return v as Record<string, unknown>;
    } catch {
      throw fallo('solicitud_invalida');
    }
  }
  const invalido = (campos: { campo: string; problema: string }[]): Salida => fallo('validacion_fallida', { campos });

  function soloClaves(cuerpo: Record<string, unknown>, permitidas: readonly string[]): { campo: string; problema: string }[] {
    return Object.keys(cuerpo).filter((k) => !permitidas.includes(k)).map((k) => ({ campo: `/${k}`, problema: 'Campo no permitido.' }));
  }

  // ---- Paginación ----
  function paginar<T>(items: readonly T[], consulta: Record<string, string>, maximo = 100): { items: T[]; siguiente_cursor?: string } {
    let limite = 20;
    if (consulta.limite !== undefined) {
      limite = Number(consulta.limite);
      if (!Number.isInteger(limite) || limite < 1 || limite > maximo) throw fallo('solicitud_invalida');
    }
    let desde = 0;
    if (consulta.cursor !== undefined) {
      const m = /^cur_(\d{12})$/.exec(consulta.cursor);
      if (!m?.[1]) throw fallo('solicitud_invalida');
      desde = Number(m[1]);
    }
    const pagina = items.slice(desde, desde + limite);
    const sig = desde + limite;
    return { items: pagina, ...(sig < items.length ? { siguiente_cursor: `cur_${String(sig).padStart(12, '0')}` } : {}) };
  }

  // ---- Consumo ----
  function consumoDelPeriodo(periodo: string): unknown {
    const hoy = fechaAr(ahora());
    const [anio, mes] = periodo.split('-').map(Number) as [number, number];
    const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const diario: ConsumoDiario[] = [];
    for (let dia = diasMes; dia >= 1; dia -= 1) {
      const fecha = `${periodo}-${String(dia).padStart(2, '0')}`;
      if (fecha > hoy) continue;
      // Hasta 419 s por día: un mes entero queda bajo el 50 % del tope, así el aviso no depende del día en que corren
      // las pruebas. Los avisos p50/p80/p100 se prueban con forzarConsumo.
      diario.push({ fecha, segundos: 60 + ((dia * 397 + mes * 53) % 360), sesiones: 1 + (dia % 5), cotizaciones_emitidas: dia % 4 });
    }
    const usados = consumoForzado?.segundos_usados ?? diario.reduce((s, d) => s + d.segundos, 0);
    const tope = consumoForzado?.segundos_tope ?? TOPE_SEGUNDOS;
    const pct = tope > 0 ? (usados * 100) / tope : 0;
    const enCurso = [...consultas.values()].flat().filter((f) => f.detalle.estado === 'en_curso').length;
    return {
      ambito: 'asesor',
      periodo,
      segundos_usados: usados,
      segundos_tope: tope,
      simultaneas_en_curso: consumoForzado?.simultaneas_en_curso ?? Math.min(enCurso, 5),
      simultaneas_tope: consumoForzado?.simultaneas_tope ?? 5,
      alerta: pct >= 100 ? 'p100' : pct >= 80 ? 'p80' : pct >= 50 ? 'p50' : 'ninguna',
      diario,
      actualizado_en: iso(ahora()),
    };
  }

  // ---- Rutas ----
  type Req = { metodo: string; consulta: Record<string, string>; texto: string; tipo: string | null; csrf: string | null; params: string[] };
  type Manejador = (r: Req) => Response;
  const rutas: { metodo: string; patron: RegExp; manejar: Manejador }[] = [];
  const ruta = (metodo: string, patron: RegExp, manejar: Manejador): void => {
    rutas.push({ metodo, patron, manejar });
  };
  const propias = (s: SesionServidor): FilaConsulta[] => consultas.get(s.cuenta.asesorId) ?? [];
  const buscar = (s: SesionServidor, id: string): FilaConsulta => {
    const fila = propias(s).find((f) => f.detalle.sesion_id === id);
    if (!fila) throw fallo('no_encontrado');
    return fila;
  };

  ruta('GET', /^\/v1\/textos$/, () => json(200, { version: '1.3.0', idioma: 'es-AR', textos }));

  ruta('POST', /^\/v1\/panel\/sesion$/, (r) => {
    const cuerpo = leerCuerpo(r.texto, r.tipo);
    const extra = soloClaves(cuerpo, ['email', 'contrasena']);
    const email = cuerpo.email;
    const contrasena = cuerpo.contrasena;
    if (typeof email !== 'string' || !PATRON_EMAIL.test(email) || email.length > 254) extra.push({ campo: '/email', problema: 'Correo inválido.' });
    if (typeof contrasena !== 'string' || contrasena.length < 12 || contrasena.length > 256) extra.push({ campo: '/contrasena', problema: 'Entre 12 y 256 caracteres.' });
    if (extra.length > 0) throw invalido(extra);
    const clave = (email as string).toLowerCase();
    const previo = intentosLogin.get(clave);
    if (previo && previo.n >= intentosMax && ahora() < previo.hasta) {
      throw fallo('intentos_excedidos', { reintentarEnS: Math.ceil((previo.hasta - ahora()) / 1000) });
    }
    const cuenta = CUENTAS_DEMO.find((c) => c.email === clave);
    if (!cuenta || contrasenas.get(clave) !== contrasena) {
      const n = (previo && ahora() < previo.hasta ? previo.n : 0) + 1;
      intentosLogin.set(clave, { n, hasta: ahora() + 60_000 });
      if (n >= intentosMax) throw fallo('intentos_excedidos', { reintentarEnS: 60 });
      throw fallo('credenciales_incorrectas');
    }
    intentosLogin.delete(clave);
    const t = ahora();
    sesion = { fase: 'preliminar', cuenta, csrf: secretoUrl(azar, 43), creadaMs: t, ultimoUsoMs: t, venceLoginMs: t + LOGIN_MS, reautenticadoHastaMs: 0, intentosTotp: 0, bloqueadaHastaMs: 0, vencida: false, revocada: false };
    return json(200, { paso: 'totp', csrf_token: sesion.csrf, vence_en: iso(sesion.venceLoginMs) }, { 'Set-Cookie': `__Host-vc_panel=${MARCA_MOCK}; Secure; HttpOnly; SameSite=Strict; Path=/` });
  });

  ruta('GET', /^\/v1\/panel\/sesion$/, (r) => json(200, sesionPanelJson(exigirSesion(r))));

  ruta('DELETE', /^\/v1\/panel\/sesion$/, (r) => {
    exigirSesion(r, { escribe: true });
    sesion = null;
    return json(204, null);
  });

  ruta('POST', /^\/v1\/panel\/sesion\/totp$/, (r) => {
    const s = sesion;
    if (!s) throw fallo('credencial_ausente');
    if (s.fase !== 'preliminar') throw fallo('estado_invalido');
    if (ahora() > s.venceLoginMs) {
      sesion = null;
      throw fallo('sesion_vencida');
    }
    if (r.csrf === null || r.csrf !== s.csrf) throw fallo('csrf_invalido');
    const cuerpo = leerCuerpo(r.texto, r.tipo);
    const extra = soloClaves(cuerpo, ['codigo', 'codigo_recuperacion']);
    const { codigo, codigo_recuperacion: rec } = cuerpo;
    if ((codigo === undefined) === (rec === undefined)) extra.push({ campo: '/', problema: 'Enviá el código o un código de recuperación, no ambos.' });
    else if (codigo !== undefined && (typeof codigo !== 'string' || !/^[0-9]{6}$/.test(codigo))) extra.push({ campo: '/codigo', problema: 'Son 6 números.' });
    else if (rec !== undefined && (typeof rec !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(rec))) extra.push({ campo: '/codigo_recuperacion', problema: 'Formato XXXX-XXXX-XXXX.' });
    if (extra.length > 0) throw invalido(extra);
    if (ahora() < s.bloqueadaHastaMs) throw fallo('intentos_excedidos', { reintentarEnS: Math.ceil((s.bloqueadaHastaMs - ahora()) / 1000) });
    const bien = typeof codigo === 'string' ? esTotpValido(codigo) : typeof rec === 'string' && recuperacion.delete(rec);
    if (!bien) {
      s.intentosTotp += 1;
      if (s.intentosTotp >= intentosMax) {
        s.bloqueadaHastaMs = ahora() + 30_000;
        s.intentosTotp = 0;
        throw fallo('intentos_excedidos', { reintentarEnS: 30 });
      }
      throw fallo('totp_invalido');
    }
    const t = ahora();
    // Rota el id de sesión (R35): sesión nueva, CSRF nuevo.
    sesion = { ...s, fase: 'activa', csrf: secretoUrl(azar, 43), creadaMs: t, ultimoUsoMs: t, reautenticadoHastaMs: 0, intentosTotp: 0 };
    nuevoRegistro(s.cuenta.asesorId, 'inicio_sesion');
    return json(200, sesionPanelJson(sesion), { 'Set-Cookie': `__Host-vc_panel=${MARCA_MOCK}-2; Secure; HttpOnly; SameSite=Strict; Path=/` });
  });

  ruta('POST', /^\/v1\/panel\/reautenticacion$/, (r) => {
    const s = exigirSesion(r, { escribe: true });
    const cuerpo = leerCuerpo(r.texto, r.tipo);
    const extra = soloClaves(cuerpo, ['contrasena', 'codigo_totp']);
    if (typeof cuerpo.contrasena !== 'string' || cuerpo.contrasena.length < 12 || cuerpo.contrasena.length > 256) extra.push({ campo: '/contrasena', problema: 'Entre 12 y 256 caracteres.' });
    if (typeof cuerpo.codigo_totp !== 'string' || !/^[0-9]{6}$/.test(cuerpo.codigo_totp)) extra.push({ campo: '/codigo_totp', problema: 'Son 6 números.' });
    if (extra.length > 0) throw invalido(extra);
    if (contrasenas.get(s.cuenta.email) !== cuerpo.contrasena) throw fallo('credenciales_incorrectas');
    if (!esTotpValido(cuerpo.codigo_totp as string)) throw fallo('totp_invalido');
    s.reautenticadoHastaMs = ahora() + REAUTENTICACION_MS;
    return json(200, { valida_hasta: iso(s.reautenticadoHastaMs), valida_s: REAUTENTICACION_MS / 1000 });
  });

  ruta('GET', /^\/v1\/panel\/perfil$/, (r) => json(200, perfiles.get(exigirSesion(r).cuenta.asesorId)));

  ruta('PATCH', /^\/v1\/panel\/perfil$/, (r) => {
    const s = exigirSesion(r, { escribe: true });
    const cuerpo = leerCuerpo(r.texto, r.tipo);
    const errores = soloClaves(cuerpo, ['nombre_visible', 'whatsapp', 'oficios', 'zonas']);
    if (Object.keys(cuerpo).length === 0) errores.push({ campo: '/', problema: 'Enviá al menos un cambio.' });
    const { nombre_visible: nombre, whatsapp, oficios, zonas } = cuerpo;
    if (nombre !== undefined && (typeof nombre !== 'string' || nombre.length < 1 || nombre.length > 60 || !PATRON_TEXTO.test(nombre))) errores.push({ campo: '/nombre_visible', problema: 'Entre 1 y 60 caracteres, sin < ni >.' });
    if (whatsapp !== undefined && (typeof whatsapp !== 'string' || !PATRON_TELEFONO.test(whatsapp))) errores.push({ campo: '/whatsapp', problema: 'Formato +5492231234567.' });
    const lista = (v: unknown, validos: readonly string[], max: number): boolean =>
      Array.isArray(v) && v.length >= 1 && v.length <= max && new Set(v).size === v.length && v.every((x) => typeof x === 'string' && validos.includes(x));
    if (oficios !== undefined && !lista(oficios, OFICIOS_VALIDOS, 5)) errores.push({ campo: '/oficios', problema: 'Elegí al menos un oficio válido.' });
    if (zonas !== undefined && !lista(zonas, ZONAS_VALIDAS, 4)) errores.push({ campo: '/zonas', problema: 'Elegí al menos una zona válida.' });
    if (errores.length > 0) throw invalido(errores);
    const actual = perfiles.get(s.cuenta.asesorId) as PerfilAsesor;
    const nuevo: PerfilAsesor = {
      ...actual,
      ...(typeof nombre === 'string' ? { nombre_visible: nombre } : {}),
      ...(typeof whatsapp === 'string' ? { whatsapp } : {}),
      ...(oficios !== undefined ? { oficios: oficios as Oficio[] } : {}),
      ...(zonas !== undefined ? { zonas: zonas as PerfilAsesor['zonas'] } : {}),
    };
    perfiles.set(s.cuenta.asesorId, nuevo);
    return json(200, nuevo);
  });

  ruta('POST', /^\/v1\/panel\/contrasena$/, (r) => {
    const s = exigirSesion(r, { escribe: true, reauth: true });
    const cuerpo = leerCuerpo(r.texto, r.tipo);
    const errores = soloClaves(cuerpo, ['contrasena_nueva']);
    const nueva = cuerpo.contrasena_nueva;
    if (typeof nueva !== 'string' || nueva.length < 12 || nueva.length > 256) errores.push({ campo: '/contrasena_nueva', problema: 'Entre 12 y 256 caracteres.' });
    if (errores.length > 0) throw invalido(errores);
    contrasenas.set(s.cuenta.email, nueva as string);
    nuevoRegistro(s.cuenta.asesorId, 'cambio_contrasena');
    return json(204, null);
  });

  ruta('GET', /^\/v1\/panel\/cotizaciones$/, (r) => {
    const s = exigirSesion(r);
    const { oficio, desde, hasta } = r.consulta;
    if (oficio !== undefined && !OFICIOS_VALIDOS.includes(oficio)) throw fallo('solicitud_invalida');
    for (const f of [desde, hasta]) if (f !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(f)) throw fallo('solicitud_invalida');
    const filtradas = propias(s).filter(({ detalle: d }) => {
      const dia = fechaAr(Date.parse(d.creada_en));
      return (oficio === undefined || d.datos_extraidos?.oficio === oficio) && (desde === undefined || dia >= desde) && (hasta === undefined || dia <= hasta);
    });
    const pagina = paginar(filtradas, r.consulta);
    return json(200, {
      ...pagina,
      items: pagina.items.map((f) => ({
        sesion_id: f.detalle.sesion_id,
        creada_en: f.detalle.creada_en,
        estado: f.detalle.estado,
        ...(f.detalle.motivo_cierre ? { motivo_cierre: f.detalle.motivo_cierre } : {}),
        ...(f.detalle.datos_extraidos ? { oficio: f.detalle.datos_extraidos.oficio, zona: f.detalle.datos_extraidos.zona } : {}),
        fuera_de_zona: f.detalle.datos_extraidos?.fuera_de_zona ?? false,
        contacto_disponible: f.contactoDisponible,
        resumen: f.detalle.resumen,
        ...(f.detalle.cotizacion ? { total: { cotizacion_id: f.detalle.cotizacion.cotizacion_id, total_centavos: f.detalle.cotizacion.total_centavos, moneda: f.detalle.cotizacion.moneda } } : {}),
        ...(f.codigoReferencia ? { codigo_referencia: f.codigoReferencia } : {}),
      })),
    });
  });

  ruta('GET', /^\/v1\/panel\/cotizaciones\/([^/]+)$/, (r) => {
    const s = exigirSesion(r);
    const fila = buscar(s, r.params[0] ?? '');
    nuevoRegistro(s.cuenta.asesorId, 'ver_detalle', fila.detalle.sesion_id);
    return json(200, fila.detalle);
  });

  ruta('GET', /^\/v1\/panel\/cotizaciones\/([^/]+)\/contacto$/, (r) => {
    const s = exigirSesion(r);
    const fila = buscar(s, r.params[0] ?? '');
    if (!fila.contactoDisponible || !fila.contacto) throw fallo('no_encontrado');
    const clave = `${s.cuenta.asesorId}|${fechaAr(ahora())}`;
    const leidas = lecturasDeContacto.get(clave) ?? 0;
    if (leidas >= limiteLecturas) throw fallo('limite_lecturas_contacto', { reintentarEnS: 3600 });
    lecturasDeContacto.set(clave, leidas + 1);
    const reg = nuevoRegistro(s.cuenta.asesorId, 'ver_contacto', fila.detalle.sesion_id);
    return json(200, {
      sesion_id: fila.detalle.sesion_id,
      nombre: fila.contacto.nombre,
      ...(fila.contacto.telefono ? { telefono: fila.contacto.telefono } : {}),
      ...(fila.contacto.email ? { email: fila.contacto.email } : {}),
      ...(fila.contacto.preferencia ? { preferencia: fila.contacto.preferencia } : {}),
      consentido_en: fila.detalle.creada_en,
      aviso_version: '2026-10-08.1',
      lectura: { registro_id: reg.registro_id, lecturas_restantes_hoy: limiteLecturas - leidas - 1 },
    });
  });

  ruta('GET', /^\/v1\/panel\/registros$/, (r) => {
    const s = exigirSesion(r);
    return json(200, paginar(registros.get(s.cuenta.asesorId) ?? [], r.consulta));
  });

  ruta('GET', /^\/v1\/panel\/consumo$/, (r) => {
    exigirSesion(r);
    const periodo = r.consulta.periodo ?? fechaAr(ahora()).slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw fallo('solicitud_invalida');
    return json(200, consumoDelPeriodo(periodo));
  });

  const jsonEnlace = () => {
    const url = `https://cotizar.videocotizacion.local/c/${enlace.id}`;
    return { id_publico: enlace.id, url, texto_compartir: `Pedí tu presupuesto por videollamada: ${url}`, ...(enlace.rotadoEn ? { rotado_en: enlace.rotadoEn } : {}) };
  };
  ruta('GET', /^\/v1\/panel\/enlace$/, (r) => {
    exigirSesion(r);
    return json(200, jsonEnlace());
  });
  ruta('POST', /^\/v1\/panel\/enlace\/rotacion$/, (r) => {
    const s = exigirSesion(r, { escribe: true, reauth: true });
    enlace = { id: idPublico(azar), rotadoEn: iso(ahora()) };
    nuevoRegistro(s.cuenta.asesorId, 'rotar_enlace');
    return json(200, jsonEnlace());
  });

  ruta('GET', /^\/v1\/panel\/claves-widget$/, (r) => {
    exigirSesion(r, { admin: true });
    return json(200, { items: claves });
  });
  ruta('POST', /^\/v1\/panel\/claves-widget$/, (r) => {
    const s = exigirSesion(r, { escribe: true, admin: true, reauth: true });
    const cuerpo = leerCuerpo(r.texto, r.tipo);
    const errores = soloClaves(cuerpo, ['nombre', 'origins']);
    const { nombre, origins } = cuerpo;
    if (typeof nombre !== 'string' || nombre.length < 1 || nombre.length > 60 || !PATRON_TEXTO.test(nombre)) errores.push({ campo: '/nombre', problema: 'Entre 1 y 60 caracteres, sin < ni >.' });
    if (!Array.isArray(origins) || origins.length < 1 || origins.length > 10 || new Set(origins).size !== origins.length) errores.push({ campo: '/origins', problema: 'Entre 1 y 10 sitios, sin repetidos.' });
    else {
      const i = origins.findIndex((o) => typeof o !== 'string' || !PATRON_ORIGIN.test(o));
      if (i >= 0) errores.push({ campo: `/origins/${String(i)}`, problema: 'Tiene que ser https, sin barra final ni comodines.' });
    }
    if (errores.length > 0) throw invalido(errores);
    const valor = `vc_pub_${secretoUrl(azar, 40)}`;
    const clave: ClaveWidget = { clave_id: idCrockford(azar, 'cpw'), nombre: nombre as string, prefijo: valor.slice(0, 13), origins: origins as string[], estado: 'activa', creada_en: iso(ahora()) };
    claves.unshift(clave);
    nuevoRegistro(s.cuenta.asesorId, 'crear_clave_widget', clave.clave_id);
    return json(201, { clave, valor, se_muestra_una_sola_vez: true });
  });
  ruta('DELETE', /^\/v1\/panel\/claves-widget\/([^/]+)$/, (r) => {
    const s = exigirSesion(r, { escribe: true, admin: true, reauth: true });
    const clave = claves.find((c) => c.clave_id === r.params[0]);
    if (!clave) throw fallo('no_encontrado');
    clave.estado = 'revocada';
    clave.revocada_en = iso(ahora());
    nuevoRegistro(s.cuenta.asesorId, 'revocar_clave_widget', clave.clave_id);
    return json(204, null);
  });

  ruta('POST', /^\/v1\/panel\/mi-cuenta\/exportacion$/, (r) => {
    const s = exigirSesion(r, { escribe: true, reauth: true });
    nuevoRegistro(s.cuenta.asesorId, 'exportar_mi_cuenta');
    return json(200, {
      formato_version: '1',
      generada_en: iso(ahora()),
      perfil: perfiles.get(s.cuenta.asesorId),
      lecturas: (registros.get(s.cuenta.asesorId) ?? []).slice(0, 100),
      consumo: consumoDelPeriodo(fechaAr(ahora()).slice(0, 7)),
    });
  });

  // ---- fetch simulado ----
  const coincide = (patron: string | RegExp, ruta_: string): boolean => (typeof patron === 'string' ? patron === ruta_ : patron.test(ruta_));

  async function espera(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (ms <= 0) return;
    await new Promise<void>((resolver, rechazar) => {
      const id = setTimeout(resolver, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(id);
        rechazar(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }

  const simulado = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url, 'http://mock.local');
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const cabeceras = new Headers(init?.headers);
    const texto = typeof init?.body === 'string' ? init.body : '';
    const consulta = Object.fromEntries(url.searchParams.entries());
    let cuerpo: unknown = null;
    try {
      cuerpo = texto === '' ? null : JSON.parse(texto);
    } catch {
      cuerpo = texto;
    }
    pedidos.push({ metodo, ruta: url.pathname, consulta, cuerpo, csrf: cabeceras.get('X-CSRF-Token') });
    const signal = init?.signal;

    await espera(latenciaMs, signal);
    for (const ret of retenidos.filter((x) => (x.metodo === undefined || x.metodo === metodo) && coincide(x.ruta, url.pathname))) {
      await Promise.race([
        ret.liberar,
        new Promise<never>((_, rechazar) => {
          signal?.addEventListener('abort', () => {
            rechazar(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }),
      ]);
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const i = fallas.findIndex((f) => (f.metodo === undefined || f.metodo.toUpperCase() === metodo) && coincide(f.ruta, url.pathname));
    const falla = fallas[i];
    if (falla) {
      falla.veces = (falla.veces ?? 1) - 1;
      if (falla.veces <= 0) fallas.splice(i, 1);
      if (falla.sinConexion) throw new TypeError('Failed to fetch');
      if (falla.respuestaJson !== undefined) return json(falla.status ?? 200, falla.respuestaJson);
      if (falla.cuerpoCrudo !== undefined) return new Response(falla.cuerpoCrudo, { status: falla.status ?? 502, headers: { 'Content-Type': 'text/html' } });
      if (falla.codigo) {
        return fallo(falla.codigo, {
          ...(falla.campos ? { campos: falla.campos } : {}),
          ...(falla.reintentarEnS !== undefined ? { reintentarEnS: falla.reintentarEnS } : {}),
          ...(falla.status !== undefined ? { statusForzado: falla.status } : {}),
        }).respuesta;
      }
      return new Response('', { status: falla.status ?? 500 });
    }

    try {
      for (const r of rutas) {
        if (r.metodo !== metodo) continue;
        const m = r.patron.exec(url.pathname);
        if (m) return r.manejar({ metodo, consulta, texto, tipo: cabeceras.get('Content-Type'), csrf: cabeceras.get('X-CSRF-Token'), params: m.slice(1).map(decodeURIComponent) });
      }
      throw fallo('no_encontrado');
    } catch (e) {
      if (e instanceof Salida) return e.respuesta;
      throw e;
    }
  };

  return {
    fetch: simulado,
    pedidos,
    /** Cuentas de demostración (el mock rechaza cualquier otra). */
    cuentas: CUENTAS_DEMO,
    /** El próximo pedido que coincida falla como se indica. */
    inyectarFalla(f: FallaInyectada): void {
      fallas.push({ ...f });
    },
    /** Retiene los pedidos que coincidan hasta llamar a `liberar()` (para probar doble envío y cancelaciones). */
    retener(rutaRetenida: string | RegExp, metodo?: string): { liberar: () => void } {
      let liberar!: () => void;
      const promesa = new Promise<void>((resolver) => {
        liberar = resolver;
      });
      const entrada = { metodo: metodo?.toUpperCase(), ruta: rutaRetenida, liberar: promesa };
      retenidos.push(entrada);
      return {
        liberar: () => {
          retenidos.splice(retenidos.indexOf(entrada), 1);
          liberar();
        },
      };
    },
    /** La sesión pasa a estar vencida: el próximo pedido recibe 401 `sesion_vencida`. */
    vencerSesion(): void {
      if (sesion) sesion.vencida = true;
    },
    /** La sesión pasa a estar revocada (p. ej. cambiaron la contraseña desde otro dispositivo): 401 `credencial_invalida`. */
    revocarSesion(): void {
      if (sesion) sesion.revocada = true;
    },
    /** Cierra la ventana de reautenticación. */
    cerrarVentanaReautenticacion(): void {
      if (sesion) sesion.reautenticadoHastaMs = 0;
    },
    forzarConsumo(c: typeof consumoForzado): void {
      consumoForzado = c;
    },
    fijarTextos(nuevos: Record<string, string>): void {
      textos = { ...nuevos };
    },
    agregarTextos(extra: Record<string, string>): void {
      textos = { ...textos, ...extra };
    },
    /** Las consultas del asesor, para armar aserciones en pruebas. */
    consultasDe(asesorId: string): readonly FilaConsulta[] {
      return consultas.get(asesorId) ?? [];
    },
    registrosDe(asesorId: string): readonly RegistroLectura[] {
      return registros.get(asesorId) ?? [];
    },
    contrasenaDe(email: string): string | undefined {
      return contrasenas.get(email);
    },
    reiniciarIntentos(): void {
      intentosLogin = new Map();
    },
  };
}

export type ServidorMock = ReturnType<typeof crearServidorMock>;

let instancia: ServidorMock | null = null;
/** `fetch` del modo `npm run dev` (VITE_USAR_MOCK=1): una sola instancia con una demora que se note en pantalla. */
export const fetchSimulado: typeof fetch = (...args) => {
  instancia ??= crearServidorMock({ latenciaMs: 200 });
  return instancia.fetch(...args);
};
