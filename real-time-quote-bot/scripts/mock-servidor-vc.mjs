/**
 * Servidor FALSO de VideoCotización para desarrollar y probar el front sin backend.
 * Reproduce las rutas del widget/sesión de proyecto/contracts/openapi.yaml (0.1.4-borrador)
 * y el WebSocket de medios `vc-eventos.borrador.1` (proyecto/contracts/eventos-sesion.md).
 *
 *   npm run mock:vc                  # http://localhost:8787
 *   PUERTO=9000 ORIGENES=http://localhost:3000 node scripts/mock-servidor-vc.mjs
 *
 * NO es el backend: no habla con ningún LLM, no guarda nada en disco y los montos son
 * ilustrativos. Sirve para ver el flujo completo y para las pruebas (npm test / e2e:vc).
 *
 * Enlaces de prueba (id_publico, 22 caracteres):
 *   mock_ok_______________  flujo feliz: 3 turnos del cliente → presupuesto → WhatsApp
 *   mock_cuota____________  crearSesion responde 429 cuota_agotada
 *   mock_desafio__________  crearSesion responde 403 desafio_invalido
 *   mock_simultaneas______  token-medios responde 429 simultaneas_agotadas
 *   mock_caida____________  el socket se corta una vez tras la 1.ª respuesta (prueba de reconexión)
 *   mock_sinvoz___________  avisa y cierra por sin_voz
 *   cualquier otro          404 no_encontrado
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

export const CLAVE_PUBLICA_MOCK = "vc_pub_mock_local_no_es_secreta";
export const ENLACES = {
  ok: "mock_ok_______________",
  cuota: "mock_cuota____________",
  desafio: "mock_desafio__________",
  simultaneas: "mock_simultaneas______",
  caida: "mock_caida____________",
  sinvoz: "mock_sinvoz___________",
};

const ALFABETO_ID = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ALFABETO_OPACO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const crockford = (n) => Array.from(randomBytes(n), (b) => ALFABETO_ID[b % 32]).join("");
const opaco = (prefijo, n = 43) =>
  prefijo + Array.from(randomBytes(n), (b) => ALFABETO_OPACO[b % 64]).join("");
const ahora = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const REGLA_FOTOGRAMA = {
  formato: "image/jpeg",
  lado_max_px: 1024,
  bytes_max: 131072,
  intervalo_min_ms: 3000,
  max_por_sesion: 400,
};
const LIMITES = {
  sin_voz_s: 30,
  duracion_maxima_s: 600,
  caracteres_max_por_turno: 500,
  turnos_llm_max: 40,
  fotograma: REGLA_FOTOGRAMA,
};
const AVISO = {
  version: "2026-10-08.1",
  url: "https://cotizar.videocotizacion.local/privacidad/2026-10-08.1",
};
const INCISOS = [
  "finalidad",
  "destinatarios",
  "responsable",
  "obligatoriedad",
  "consecuencias",
  "derechos_arco",
  "transferencia_internacional",
  "autoridad_de_control",
];
const TEXTOS = {
  "error.cuota_agotada": "Por ahora no hay cupo para videocotizaciones. Escribinos por WhatsApp.",
  "error.desafio_invalido":
    "No pudimos verificar el navegador. Recargá la página e intentá de nuevo.",
  "error.simultaneas_agotadas":
    "En este momento hay muchas videocotizaciones en curso. Probá en unos minutos.",
  "error.sesion_vencida": "Tu sesión venció. Ingresá de nuevo.",
  "oficio.pintura": "Pintura",
  "zona.cobo": "Cobo",
  "zona.mar_chiquita": "Mar Chiquita",
};

const CATALOGO = {
  solicitud_invalida: 400,
  validacion_fallida: 422,
  credencial_ausente: 401,
  credencial_invalida: 401,
  sesion_vencida: 401,
  origen_no_permitido: 403,
  desafio_invalido: 403,
  no_encontrado: 404,
  estado_invalido: 409,
  consentimiento_requerido: 409,
  sesion_cerrada: 409,
  cotizacion_no_emitida: 409,
  limite_de_tasa: 429,
  cuota_agotada: 429,
  simultaneas_agotadas: 429,
  error_interno: 500,
};
const MENSAJES = {
  solicitud_invalida: "No pudimos leer el pedido. Revisá los datos e intentá de nuevo.",
  validacion_fallida: "Hay datos que no cumplen el formato esperado.",
  credencial_ausente: "Falta la credencial de acceso.",
  credencial_invalida: "La credencial no es válida o fue revocada.",
  sesion_vencida: "Tu sesión venció. Ingresá de nuevo.",
  origen_no_permitido: "Este sitio no está autorizado para usar la clave.",
  desafio_invalido: "No pudimos verificar el navegador. Recargá la página e intentá de nuevo.",
  no_encontrado: "No encontramos lo que buscás.",
  estado_invalido: "La operación no corresponde en el estado actual.",
  consentimiento_requerido: "Antes de empezar tenés que aceptar el aviso de privacidad.",
  sesion_cerrada: "La videocotización ya terminó.",
  cotizacion_no_emitida: "El presupuesto todavía no se emitió.",
  limite_de_tasa: "Hiciste muchos pedidos seguidos. Esperá un momento.",
  cuota_agotada: "Por ahora no hay cupo para videocotizaciones. Escribinos por WhatsApp.",
  simultaneas_agotadas:
    "En este momento hay muchas videocotizaciones en curso. Probá en unos minutos.",
  error_interno: "Tuvimos un problema. Intentá de nuevo más tarde.",
};

class ErrorHttp extends Error {
  constructor(codigo, extra = {}) {
    super(codigo);
    this.codigo = codigo;
    this.extra = extra;
  }
}

/** Mide el JPEG: devuelve {ancho, alto} leyendo el marcador SOF, o null si no es JPEG válido. */
export function dimensionesJpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8] };
    }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

const GUION = [
  {
    asesor:
      "Perfecto, pintura de interiores. ¿Cuántos metros cuadrados son más o menos y en qué zona estás?",
    pizarron: [
      ["oficio", "Oficio", "Pintura", "anotado"],
      ["tarea", "Tarea", "Pintar el living", "anotado"],
      ["superficie", "Superficie", "", "faltante"],
      ["zona", "Zona", "", "faltante"],
    ],
  },
  {
    asesor: "Anotado. Mostrame con la cámara cómo están las paredes y a qué altura llegan.",
    pizarron: [
      ["oficio", "Oficio", "Pintura", "anotado"],
      ["tarea", "Tarea", "Pintar el living", "anotado"],
      ["superficie", "Superficie", "24 m²", "anotado"],
      ["zona", "Zona", "Cobo", "anotado"],
      ["altura", "Altura", "", "faltante"],
    ],
  },
  {
    asesor: "Listo, con eso ya puedo armar tu presupuesto. Te lo muestro en pantalla.",
    pizarron: [
      ["oficio", "Oficio", "Pintura", "anotado"],
      ["tarea", "Tarea", "Pintar el living", "anotado"],
      ["superficie", "Superficie", "24 m²", "anotado"],
      ["zona", "Zona", "Cobo", "anotado"],
      ["altura", "Altura", "Altura normal (2,6 m)", "anotado"],
    ],
  },
];
const SALUDO = "¡Hola! Soy Rober. Contame: ¿qué trabajo necesitás cotizar?";

function cotizacionMock(sesionId) {
  return {
    cotizacion_id: "cot_" + crockford(26),
    sesion_id: sesionId,
    emitida_en: ahora(),
    moneda: "ARS",
    oficio: "pintura",
    zona: "cobo",
    fuera_de_zona: false,
    items: [
      {
        tipo: "mano_de_obra",
        codigo_tarea: "pintura_interior",
        descripcion: "Pintura interior látex, dos manos",
        unidad: "m2",
        cantidad_centesimas: 2400,
        precio_unitario_centavos: 450000,
        importe_centavos: 10800000,
      },
      {
        tipo: "traslado",
        codigo_tarea: "traslado_zona",
        descripcion: "Traslado a Cobo",
        unidad: "global",
        cantidad_centesimas: 100,
        precio_unitario_centavos: 1500000,
        importe_centavos: 1500000,
      },
    ],
    total_centavos: 12300000,
    orientativa: true,
    leyenda:
      "Presupuesto orientativo: el profesional lo confirma al ver el trabajo. Montos de prueba (servidor simulado).",
    tarifas: { version: "2026.1", estado: "referencia_publica_sin_validar" },
    validez_dias: 15,
  };
}
function derivacionMock() {
  const c = `VC-${crockford(4)}-${crockford(6)}`;
  return {
    codigo_referencia: c,
    url_wa_me: `https://wa.me/5492235550101?text=${encodeURIComponent(`Hola, quiero seguir con mi videocotización ${c}`)}`,
    texto_prellenado: `Hola, quiero seguir con mi videocotización ${c}`,
    generada_en: ahora(),
  };
}

export function iniciarMock({
  puerto = 8787,
  origenes = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
  silencioso = false,
  pausaMs = 250,
} = {}) {
  const log = (...a) => !silencioso && console.log("[mock-vc]", ...a);
  const desafios = new Map(); // id → {usado, bits}
  const sesiones = new Map(); // id → estado
  const tokensMedios = new Map(); // token → sesionId (de un uso)

  const cabecerasCors = (req) => {
    const o = req.headers.origin;
    return o && origenes.includes(o)
      ? {
          "Access-Control-Allow-Origin": o,
          Vary: "Origin",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-VC-Clave-Publica, X-Desafio, Idempotency-Key",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Expose-Headers": "Retry-After",
        }
      : {};
  };
  const responder = (req, res, status, cuerpo, extra = {}) => {
    const tipo = status >= 400 ? "application/problem+json" : "application/json";
    res.writeHead(status, {
      "Content-Type": tipo,
      "Cache-Control": "no-store",
      ...cabecerasCors(req),
      ...extra,
    });
    res.end(JSON.stringify(cuerpo));
  };
  const problema = (e) => {
    const status = CATALOGO[e.codigo] ?? 500;
    const cuerpo = {
      type: `https://videocotizacion.local/errores/${e.codigo}`,
      title: e.codigo,
      status,
      codigo: e.codigo,
      detail: MENSAJES[e.codigo] ?? MENSAJES.error_interno,
      id_traza: "tr_" + randomBytes(8).toString("hex"),
    };
    if (e.extra.reintentar_en_s) cuerpo.reintentar_en_s = e.extra.reintentar_en_s;
    return [status, cuerpo];
  };

  const exigirOrigen = (req) => {
    const o = req.headers.origin;
    if (!o || !origenes.includes(o)) throw new ErrorHttp("origen_no_permitido");
  };
  const exigirClave = (req) => {
    const k = req.headers["x-vc-clave-publica"];
    if (!k) throw new ErrorHttp("credencial_ausente");
    if (k !== CLAVE_PUBLICA_MOCK) throw new ErrorHttp("credencial_invalida");
  };
  const exigirToken = (req, sesionId) => {
    const m = /^Bearer (vc_ses_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? "");
    if (!m) throw new ErrorHttp("credencial_ausente");
    const s = sesiones.get(sesionId);
    if (!s || s.tokenSesion !== m[1]) throw new ErrorHttp("credencial_invalida");
    return s;
  };

  async function leerJson(req) {
    const trozos = [];
    let n = 0;
    for await (const t of req) {
      n += t.length;
      if (n > 16 * 1024) throw new ErrorHttp("solicitud_invalida");
      trozos.push(t);
    }
    try {
      return JSON.parse(Buffer.concat(trozos).toString("utf8") || "{}");
    } catch {
      throw new ErrorHttp("solicitud_invalida");
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, cabecerasCors(req));
        return res.end();
      }
      if (url.pathname === "/__mock/estado") {
        return responder(
          req,
          res,
          200,
          Object.fromEntries([...sesiones].map(([id, s]) => [id, s.registro])),
        );
      }
      if (url.pathname === "/__mock/salud") return responder(req, res, 200, { ok: true });
      const ruta = url.pathname;

      if (req.method === "GET" && ruta === "/v1/textos") {
        return responder(req, res, 200, { version: "0.1.0", idioma: "es-AR", textos: TEXTOS });
      }
      if (req.method === "GET" && ruta === "/v1/version") {
        return responder(req, res, 200, { version: "0.1.4-borrador" });
      }

      let m;
      if (req.method === "GET" && (m = /^\/v1\/widget\/enlaces\/([A-Za-z0-9_-]{22})$/.exec(ruta))) {
        exigirOrigen(req);
        exigirClave(req);
        if (!Object.values(ENLACES).includes(m[1])) throw new ErrorHttp("no_encontrado");
        return responder(req, res, 200, {
          id_publico: m[1],
          profesional: {
            nombre_visible: "Rober",
            oficios: ["pintura"],
            zonas: ["mar_chiquita", "cobo"],
          },
          avatares: [
            {
              avatar_id: "av_obrero_casco",
              nombre: "Rober",
              modos: ["3d", "clips"],
              descripcion_accesible: "Trabajador con casco amarillo y ropa de obra",
            },
          ],
          aviso_privacidad: AVISO,
          camara_obligatoria: true,
          fotograma: REGLA_FOTOGRAMA,
          asistente_automatico: true,
        });
      }

      if (req.method === "POST" && ruta === "/v1/widget/desafios") {
        exigirOrigen(req);
        exigirClave(req);
        const id = opaco("dsf_");
        desafios.set(id, { usado: false, bits: 8, vence: Date.now() + 120_000 });
        return responder(req, res, 201, {
          desafio: id,
          mecanismo: "prueba_de_trabajo_sha256",
          dificultad_bits: 8,
          vence_en: new Date(Date.now() + 120_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
          vence_en_s: 120,
          provisorio: true,
        });
      }

      if (req.method === "GET" && ruta === "/v1/widget/avisos/privacidad") {
        return responder(req, res, 200, {
          version: AVISO.version,
          vigente_desde: "2026-10-08",
          url: AVISO.url,
          resumen:
            "Usamos tu cámara y tu micrófono durante la llamada para entender el trabajo y armar un presupuesto orientativo. Las imágenes no se guardan. (Texto de prueba, a validar con abogado.)",
          incisos: INCISOS,
          a_validar_con_abogado: true,
        });
      }

      if (req.method === "POST" && ruta === "/v1/sesiones") {
        exigirOrigen(req);
        exigirClave(req);
        const cuerpo = await leerJson(req);
        const permitidos = new Set([
          "enlace",
          "modo_avatar",
          "avatar_id",
          "idioma",
          "referencia_externa",
        ]);
        if (
          Object.keys(cuerpo).some((k) => !permitidos.has(k)) ||
          !cuerpo.enlace ||
          !["3d", "clips"].includes(cuerpo.modo_avatar)
        ) {
          throw new ErrorHttp("validacion_fallida");
        }
        // desafío (R53): de un uso, resuelto con la prueba de trabajo
        const xd = req.headers["x-desafio"];
        const dm =
          typeof xd === "string" ? /^(dsf_[A-Za-z0-9_-]{43})\.([0-9a-f]{16})$/.exec(xd) : null;
        const d = dm ? desafios.get(dm[1]) : null;
        if (cuerpo.enlace === ENLACES.desafio) throw new ErrorHttp("desafio_invalido");
        if (!d || d.usado || d.vence < Date.now()) throw new ErrorHttp("desafio_invalido");
        const h = createHash("sha256").update(xd).digest();
        let ceros = 0;
        for (const b of h) {
          if (b === 0) ceros += 8;
          else {
            ceros += Math.clz32(b) - 24;
            break;
          }
        }
        if (ceros < d.bits) throw new ErrorHttp("desafio_invalido");
        d.usado = true;
        if (!Object.values(ENLACES).includes(cuerpo.enlace)) throw new ErrorHttp("no_encontrado");
        if (cuerpo.enlace === ENLACES.cuota)
          throw new ErrorHttp("cuota_agotada", { reintentar_en_s: 3600 });

        const id = "ses_" + crockford(26);
        const tokenSesion = opaco("vc_ses_");
        sesiones.set(id, {
          id,
          tokenSesion,
          enlace: cuerpo.enlace,
          estado: "creada",
          consentido: false,
          cerrada: false,
          cotizacion: null,
          derivacion: null,
          registro: {
            consentimientos: 0,
            autenticaciones: 0,
            textos: [],
            fotogramas: [],
            correcciones: [],
            cierre: null,
            conexiones: 0,
            binarios_invalidos: 0,
          },
        });
        log("sesión", id, "enlace", cuerpo.enlace);
        return responder(req, res, 201, {
          sesion_id: id,
          estado: "creada",
          token_sesion: {
            valor: tokenSesion,
            vence_en: new Date(Date.now() + 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
          },
          consentimiento: { requerido: true, aviso_version: AVISO.version, aviso_url: AVISO.url },
          limites: LIMITES,
          creada_en: ahora(),
        });
      }

      if (
        (m =
          /^\/v1\/sesiones\/(ses_[0-9A-HJKMNP-TV-Z]{26})\/(consentimiento|token-medios|cierre|cotizacion|derivacion)$/.exec(
            ruta,
          ))
      ) {
        const [, id, op] = m;
        const s = exigirToken(req, id);
        if (op === "consentimiento" && req.method === "POST") {
          const c = await leerJson(req);
          const ok = [
            "acepta_camara_y_microfono",
            "acepta_tratamiento",
            "declara_mayor_de_18",
            "informado_asistente_automatico",
          ].every((k) => c[k] === true);
          if (!ok || c.aviso_version !== AVISO.version || Object.keys(c).length !== 5)
            throw new ErrorHttp("validacion_fallida");
          if (s.cerrada) throw new ErrorHttp("sesion_cerrada");
          s.consentido = true;
          s.estado = "consentida";
          s.registro.consentimientos++;
          return responder(req, res, 201, {
            consentimiento_id: "cns_" + crockford(26),
            sesion_id: id,
            aviso_version: AVISO.version,
            registrado_en: ahora(),
            estado_sesion: "consentida",
          });
        }
        if (op === "token-medios" && req.method === "POST") {
          if (s.cerrada) throw new ErrorHttp("sesion_cerrada");
          if (!s.consentido) throw new ErrorHttp("consentimiento_requerido");
          if (s.enlace === ENLACES.simultaneas)
            throw new ErrorHttp("simultaneas_agotadas", { reintentar_en_s: 30 });
          const token = opaco("vc_med_");
          tokensMedios.set(token, id);
          setTimeout(() => tokensMedios.delete(token), 60_000).unref();
          const wsUrl = `ws://localhost:${server.address().port}/v1/sesiones/${id}/medios`;
          return responder(req, res, 201, {
            token,
            ws_url: wsUrl,
            vence_en: new Date(Date.now() + 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
            vence_en_s: 60,
            un_solo_uso: true,
            protocolo_eventos: "vc-eventos.borrador.1",
          });
        }
        if (op === "cierre" && req.method === "POST") {
          const c = await leerJson(req);
          if (!["cliente_cerro", "sin_consentimiento", "sin_camara"].includes(c.motivo))
            throw new ErrorHttp("validacion_fallida");
          s.registro.cierre = c.motivo;
          const cierre = cerrar(s, c.motivo);
          s.sockets?.forEach((w) => w.close(1000));
          return responder(req, res, 200, cierre);
        }
        if (op === "cotizacion" && req.method === "GET") {
          if (!s.cotizacion) throw new ErrorHttp("cotizacion_no_emitida");
          return responder(req, res, 200, s.cotizacion);
        }
        if (op === "derivacion" && req.method === "GET") {
          if (!s.cerrada) throw new ErrorHttp("estado_invalido");
          s.derivacion ??= derivacionMock();
          return responder(req, res, 200, s.derivacion);
        }
      }
      throw new ErrorHttp("no_encontrado");
    } catch (e) {
      if (e instanceof ErrorHttp) {
        const [status, cuerpo] = problema(e);
        return responder(
          req,
          res,
          status,
          cuerpo,
          e.extra.reintentar_en_s ? { "Retry-After": String(e.extra.reintentar_en_s) } : {},
        );
      }
      console.error("[mock-vc] error", e);
      const [status, cuerpo] = problema(new ErrorHttp("error_interno"));
      return responder(req, res, status, cuerpo);
    }
  });

  function cerrar(s, motivo) {
    const duracion = Math.round((Date.now() - (s.inicio ?? Date.now())) / 1000);
    s.cerrada = true;
    s.estado = "cerrada";
    s.derivacion ??= derivacionMock();
    const r = {
      sesion_id: s.id,
      estado: "cerrada",
      motivo_cierre: motivo,
      cerrada_en: ahora(),
      duracion_s: duracion,
    };
    if (s.cotizacion) r.cotizacion_id = s.cotizacion.cotizacion_id;
    r.derivacion = s.derivacion;
    return r;
  }

  // ---------- WebSocket de medios ----------
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 + 131072 + 20 });
  server.on("upgrade", (req, socket, head) => {
    const m = /^\/v1\/sesiones\/(ses_[0-9A-HJKMNP-TV-Z]{26})\/medios$/.exec(
      new URL(req.url ?? "/", "http://x").pathname,
    );
    if (!m) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      const origenOk = req.headers.origin && origenes.includes(req.headers.origin);
      conectar(ws, m[1], origenOk);
    });
  });

  function conectar(ws, sesionId, origenOk) {
    const s = sesiones.get(sesionId);
    if (!origenOk) return ws.close(4403, "origen");
    if (!s) return ws.close(4401, "sesion");
    if (s.cerrada) return ws.close(4409, "cerrada");
    s.registro.conexiones++;
    (s.sockets ??= new Set()).add(ws);
    let seq = 0;
    let autenticado = false;
    const enviar = (tipo, datos) =>
      ws.readyState === 1 &&
      ws.send(JSON.stringify({ v: 1, tipo, seq: seq++, ts: ahora(), datos }));
    const temporizador = setTimeout(() => !autenticado && ws.close(4408, "sin autenticar"), 5000);
    let recibidasBin = 0;
    let ultimoFotograma = 0;

    const hablar = (turno, texto) => {
      enviar("avatar.respuesta", { turno, texto });
      const palabras = texto.split(/\s+/).length;
      const items = [];
      const ciclo = ["aa", "E", "O", "nn", "I", "aa", "U", "sil"];
      for (let i = 0; i < Math.min(palabras * 3, 60); i++)
        items.push({ v: ciclo[i % ciclo.length], t_ms: i * 120, d_ms: 120 });
      enviar("avatar.visemas", { turno, items });
    };
    const pizarron = (campos) => {
      s.versionPizarron = (s.versionPizarron ?? 0) + 1;
      s.ultimoPizarron = campos.map(([clave, etiqueta, valor, estado]) => ({
        clave,
        etiqueta,
        valor: valor || "pendiente",
        estado,
      }));
      enviar("pizarron.actualizado", { version: s.versionPizarron, campos: s.ultimoPizarron });
    };

    ws.on("message", (data, esBinario) => {
      if (esBinario) {
        if (!autenticado) return ws.close(4401, "sin autenticar");
        const b = Buffer.from(data);
        const ok = b.length >= 20 && b[0] === 0x56 && b[1] === 0x43 && b[2] === 1;
        const tipo = ok ? b[3] : -1;
        const long = ok ? b.readUInt32BE(16) : 0;
        const carga = ok ? b.subarray(20) : Buffer.alloc(0);
        const dims = tipo === 0x10 ? dimensionesJpeg(carga) : null;
        const seqF = ok ? b.readUInt32BE(8) : 0;
        recibidasBin++;
        let resultado = "aceptado";
        let motivo;
        const t = Date.now();
        if (!ok || tipo !== 0x10 || long !== carga.length) {
          resultado = "descartado";
          motivo = "formato";
          s.registro.binarios_invalidos++;
        } else if (!dims) {
          resultado = "descartado";
          motivo = "formato";
        } else if (carga.length > REGLA_FOTOGRAMA.bytes_max) {
          resultado = "descartado";
          motivo = "tamano";
        } else if (Math.max(dims.ancho, dims.alto) > REGLA_FOTOGRAMA.lado_max_px) {
          resultado = "descartado";
          motivo = "dimensiones";
        } else if (t - ultimoFotograma < REGLA_FOTOGRAMA.intervalo_min_ms - 150) {
          resultado = "descartado";
          motivo = "frecuencia";
        }
        if (resultado === "aceptado") ultimoFotograma = t;
        // Solo se guardan METADATOS (jamás los bytes del cuadro), como exige el contrato.
        s.registro.fotogramas.push({
          seq: seqF,
          bytes: carga.length,
          ancho: dims?.ancho ?? null,
          alto: dims?.alto ?? null,
          firma_jpeg: !!dims,
          resultado,
          ...(motivo ? { motivo } : {}),
          t,
        });
        enviar("camara.fotograma", {
          seq_fotograma: seqF,
          resultado,
          ...(motivo ? { motivo } : {}),
        });
        return;
      }
      let e;
      try {
        e = JSON.parse(data.toString());
      } catch {
        return ws.close(1003, "json");
      }
      if (!autenticado) {
        if (
          e.tipo !== "sesion.autenticar" ||
          !tokensMedios.has(e.datos?.token_medios) ||
          tokensMedios.get(e.datos.token_medios) !== sesionId
        ) {
          return ws.close(4401, "token");
        }
        tokensMedios.delete(e.datos.token_medios); // de un uso
        autenticado = true;
        clearTimeout(temporizador);
        s.registro.autenticaciones++;
        s.inicio ??= Date.now();
        enviar("sesion.lista", { sesion_id: sesionId, limites: LIMITES });
        if (s.ultimoPizarron)
          enviar("pizarron.actualizado", { version: s.versionPizarron, campos: s.ultimoPizarron });
        if (s.turnoCliente === undefined) {
          s.turnoCliente = 0;
          setTimeout(() => hablar(1, SALUDO), pausaMs);
        }
        if (s.enlace === ENLACES.sinvoz) {
          setTimeout(
            () => enviar("sesion.aviso", { aviso: "sin_voz_proximo", segundos_restantes: 5 }),
            800,
          );
          setTimeout(() => {
            enviar("sesion.cerrada", { motivo_cierre: "sin_voz", duracion_s: 6 });
            cerrar(s, "sin_voz");
            ws.close(1000);
          }, 2500);
        }
        return;
      }
      if (e.tipo === "texto.enviar" && typeof e.datos?.texto === "string") {
        if (e.datos.texto.length > 500) return ws.close(1009, "grande");
        s.registro.textos.push(e.datos.texto);
        s.turnoCliente++;
        const n = s.turnoCliente;
        const paso = GUION[Math.min(n, GUION.length) - 1];
        enviar("transcripcion.final", { turno: n, texto: e.datos.texto });
        setTimeout(() => {
          pizarron(paso.pizarron);
          hablar(n + 1, paso.asesor);
          if (s.enlace === ENLACES.caida && n === 1 && !s.yaCayo) {
            s.yaCayo = true;
            setTimeout(() => ws.terminate(), 400); // corte abrupto (1006)
          }
          if (n >= GUION.length) {
            setTimeout(() => {
              s.cotizacion = cotizacionMock(sesionId);
              s.derivacion = derivacionMock();
              enviar("cotizacion.emitida", { cotizacion: s.cotizacion, derivacion: s.derivacion });
              enviar("sesion.cerrada", {
                motivo_cierre: "completada",
                duracion_s: Math.round((Date.now() - s.inicio) / 1000),
              });
              cerrar(s, "completada");
              setTimeout(() => ws.close(1000), 100);
            }, pausaMs * 2);
          }
        }, pausaMs);
      } else if (e.tipo === "pizarron.corregir") {
        s.registro.correcciones.push(e.datos);
      } else if (e.tipo === "sesion.cerrar") {
        enviar("sesion.cerrada", {
          motivo_cierre: "cliente_cerro",
          duracion_s: Math.round((Date.now() - (s.inicio ?? Date.now())) / 1000),
        });
        cerrar(s, "cliente_cerro");
        ws.close(1000);
      }
    });
    ws.on("close", () => {
      clearTimeout(temporizador);
      s.sockets?.delete(ws);
    });
  }

  return new Promise((resolve) => {
    server.listen(puerto, () => {
      const p = server.address().port;
      log(`escuchando en http://localhost:${p} · orígenes permitidos: ${origenes.join(", ")}`);
      resolve({
        puerto: p,
        url: `http://localhost:${p}`,
        sesiones,
        cerrar: () =>
          new Promise((r) => {
            wss.clients.forEach((c) => c.terminate());
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origenes = (
    process.env.ORIGENES ?? "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173"
  ).split(",");
  await iniciarMock({ puerto: Number(process.env.PUERTO ?? 8787), origenes });
  console.log("[mock-vc] enlaces de prueba:", ENLACES);
}
