import { beforeEach, describe, expect, it, vi } from "vitest";
import { ControladorVC, textoMotivoCierre, type Dependencias } from "./controlador";
import { ErrorVC } from "./errores";
import type { OpcionesMedios } from "./medios";
import type { AvatarPuerto } from "./avatar";
import type {
  Cotizacion,
  DerivacionWhatsApp,
  EnlacePublico,
  EventoServidor,
  SesionCreada,
} from "./tipos";
import { REGLA_POR_DEFECTO } from "./fotogramas";

const ID_ENLACE = "RYZ4c3qAHifF6Rh4XEo3fG";
const ID_SESION = "ses_01HZX3K9Q8V7M2N4P5R6S7T8W9";

const enlace = {
  id_publico: ID_ENLACE,
  profesional: { nombre_visible: "Juan P.", oficios: ["pintura"], zonas: ["mar_chiquita"] },
  avatares: [
    {
      avatar_id: "av_obrero_casco",
      nombre: "Juan",
      modos: ["3d", "clips"],
      descripcion_accesible: "Trabajador con casco",
    },
    {
      avatar_id: "av_obrera",
      nombre: "Marta",
      modos: ["clips"],
      descripcion_accesible: "Trabajadora",
    },
  ],
  aviso_privacidad: { version: "2026-10-08.1", url: "https://x.test/p" },
  camara_obligatoria: true,
  fotograma: REGLA_POR_DEFECTO,
  asistente_automatico: true,
} as unknown as EnlacePublico;

const sesion = {
  sesion_id: ID_SESION,
  estado: "creada",
  token_sesion: { valor: "vc_ses_" + "A".repeat(43), vence_en: "2026-10-10T13:00:00Z" },
  consentimiento: { requerido: true, aviso_version: "2026-10-08.1", aviso_url: "https://x.test/p" },
  limites: {
    sin_voz_s: 30,
    duracion_maxima_s: 600,
    caracteres_max_por_turno: 500,
    turnos_llm_max: 40,
    fotograma: REGLA_POR_DEFECTO,
  },
  creada_en: "2026-10-10T12:00:00Z",
} as unknown as SesionCreada;

const cotizacion = {
  cotizacion_id: "cot_x",
  total_centavos: 12_345_600,
  moneda: "ARS",
  items: [],
  orientativa: true,
  fuera_de_zona: false,
} as unknown as Cotizacion;
const derivacion: DerivacionWhatsApp = {
  codigo_referencia: "VC-AB12-CD34EF",
  url_wa_me: "https://wa.me/5492236000000?text=VC-AB12-CD34EF",
  texto_prellenado: "VC-AB12-CD34EF",
  generada_en: "2026-10-10T12:10:00Z",
} as DerivacionWhatsApp;

const CONSENTIMIENTO = {
  acepta_camara_y_microfono: true,
  acepta_tratamiento: true,
  declara_mayor_de_18: true,
  informado_asistente_automatico: true,
};

const ev = <T extends EventoServidor["tipo"]>(
  tipo: T,
  datos: Extract<EventoServidor, { tipo: T }>["datos"],
) => ({ v: 1, tipo, seq: 0, ts: "2026-10-10T12:00:00Z", datos }) as EventoServidor;

function armar(over: Partial<Dependencias> = {}) {
  const pista = { stop: vi.fn(), onended: null as null | (() => void) };
  const stream = {
    getTracks: () => [pista],
    getVideoTracks: () => [pista],
  } as unknown as MediaStream;
  let opciones!: OpcionesMedios;
  const medios = {
    conectar: vi.fn(),
    cerrar: vi.fn(),
    enviarTexto: vi.fn((_t: string) => true),
    enviarTrama: vi.fn(() => true),
    corregirPizarron: vi.fn(() => true),
  };
  const muestreador = { iniciar: vi.fn(), detener: vi.fn(), enviados: 0 };
  const avatar: AvatarPuerto = {
    modo: "placeholder-2d",
    montar: vi.fn(),
    desmontar: vi.fn(),
    hablar: vi.fn(),
    aplicarVisemas: vi.fn(),
    callar: vi.fn(),
    suscribir: vi.fn(() => () => undefined),
  };
  let terminarVoz: () => void = () => undefined;
  const voz = {
    disponible: () => true,
    hablar: vi.fn((_t: string, cb?: { onFin?: () => void }) => {
      terminarVoz = () => cb?.onFin?.();
    }),
    cancelar: vi.fn(),
  };
  const reconocedor = {
    disponible: () => true,
    iniciar: vi.fn(),
    detener: vi.fn(),
    pausar: vi.fn(),
  };
  const cliente = {
    leerEnlace: vi.fn(async () => enlace),
    leerAviso: vi.fn(async () => ({
      version: "2026-10-08.1",
      resumen: "Aviso",
      incisos: [],
      a_validar_con_abogado: true,
    })),
    leerTextos: vi.fn(async () => ({ version: "0.1.0", idioma: "es-AR", textos: {} })),
    crearSesion: vi.fn(async (_s: unknown) => sesion),
    registrarConsentimiento: vi.fn(async () => ({})),
    emitirTokenMedios: vi.fn(async () => ({})),
    cerrarSesion: vi.fn(async () => ({})),
    leerCotizacion: vi.fn(async () => cotizacion),
    leerDerivacion: vi.fn(async () => derivacion),
  };
  const pedirMedios = vi.fn(async () => stream);
  const deps = {
    config: {
      apiBase: "https://api.test",
      clavePublica: "vc_pub_x",
      mock: false,
      enlaceDemo: undefined,
    },
    cliente,
    pedirMedios,
    crearMedios: vi.fn((o: OpcionesMedios) => {
      opciones = o;
      return medios;
    }),
    crearMuestreador: vi.fn(() => muestreador),
    voz,
    reconocedor,
    avatar,
    setInterval: () => 1,
    clearInterval: () => undefined,
    ...over,
  } as unknown as Dependencias;
  const c = new ControladorVC(deps);
  return {
    c,
    cliente,
    medios,
    muestreador,
    avatar,
    voz,
    reconocedor,
    pedirMedios,
    pista,
    deps,
    servidor: (e: EventoServidor) => opciones.onEvento(e),
    estadoMedios: (...a: Parameters<OpcionesMedios["onEstado"]>) => opciones.onEstado(...a),
    opciones: () => opciones,
    terminarVoz: () => terminarVoz(),
  };
}

async function hastaLlamada(t: ReturnType<typeof armar>) {
  await t.c.abrir(ID_ENLACE);
  await t.c.continuar();
  await t.c.aceptarConsentimiento(CONSENTIMIENTO);
  t.estadoMedios("lista", { intento: 0 });
}

beforeEach(() => vi.useRealTimers());

describe("ControladorVC: flujo completo", () => {
  it("enlace → sesión → consentimiento → cámara → llamada → cotización con derivación", async () => {
    const t = armar();
    await t.c.abrir(ID_ENLACE);
    expect(t.c.getState().flujo.fase).toBe("enlace");
    expect(t.c.getState().avatarId).toBe("av_obrero_casco");
    expect(t.cliente.leerEnlace).toHaveBeenCalledWith(ID_ENLACE);

    await t.c.continuar();
    expect(t.cliente.crearSesion).toHaveBeenCalledWith({
      enlace: ID_ENLACE,
      modo_avatar: "3d",
      avatar_id: "av_obrero_casco",
      idioma: "es-AR",
    });
    expect(t.c.getState().flujo.fase).toBe("consentimiento");
    expect(t.pedirMedios).not.toHaveBeenCalled(); // NADA de cámara antes del consentimiento

    await t.c.aceptarConsentimiento(CONSENTIMIENTO);
    expect(t.cliente.registrarConsentimiento).toHaveBeenCalledWith(
      ID_SESION,
      sesion.token_sesion.valor,
      {
        aviso_version: "2026-10-08.1",
        ...CONSENTIMIENTO,
      },
    );
    expect(t.cliente.registrarConsentimiento.mock.invocationCallOrder[0]!).toBeLessThan(
      t.pedirMedios.mock.invocationCallOrder[0]!,
    );
    expect(t.c.getState().flujo.fase).toBe("conectando");
    expect(t.medios.conectar).toHaveBeenCalled();

    t.estadoMedios("lista", { intento: 0 });
    expect(t.c.getState().flujo.fase).toBe("llamada");
    expect(t.muestreador.iniciar).toHaveBeenCalled();
    expect(t.reconocedor.iniciar).toHaveBeenCalled();

    t.servidor(ev("cotizacion.emitida", { cotizacion, derivacion }));
    const s = t.c.getState();
    expect(s.flujo.fase).toBe("resultado");
    expect(s.cotizacion?.total_centavos).toBe(12_345_600);
    expect(s.derivacion?.url_wa_me).toMatch(/^https:\/\/wa\.me\//);

    t.servidor(ev("sesion.cerrada", { motivo_cierre: "completada", duracion_s: 120 }));
    await vi.waitFor(() => expect(t.pista.stop).toHaveBeenCalled()); // se libera la cámara
    expect(t.c.getState().flujo.motivoCierre).toBe("completada");
  });

  it("el precio NO existe en el estado antes de cotizacion.emitida", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(ev("avatar.respuesta", { turno: 1, texto: "Contame del trabajo" }));
    t.servidor(
      ev("pizarron.actualizado", {
        version: 1,
        campos: [{ clave: "oficio", etiqueta: "Oficio", valor: "pintura", estado: "anotado" }],
      }),
    );
    const s = t.c.getState();
    expect(s.cotizacion).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/total_centavos/);
    expect(s.flujo.fase).toBe("llamada");
  });

  it("elegir un avatar solo clips usa modo clips", async () => {
    const t = armar();
    await t.c.abrir(ID_ENLACE);
    t.c.elegirAvatar("av_obrera");
    await t.c.continuar();
    expect(t.cliente.crearSesion.mock.calls[0]![0]).toMatchObject({
      modo_avatar: "clips",
      avatar_id: "av_obrera",
    });
    t.c.elegirAvatar("av_no_existe");
    expect(t.c.getState().avatarId).toBe("av_obrera");
  });

  it("sin los cuatro consentimientos en true no registra nada ni toca la cámara", async () => {
    const t = armar();
    await t.c.abrir(ID_ENLACE);
    await t.c.continuar();
    await t.c.aceptarConsentimiento({ ...CONSENTIMIENTO, declara_mayor_de_18: false });
    expect(t.cliente.registrarConsentimiento).not.toHaveBeenCalled();
    expect(t.pedirMedios).not.toHaveBeenCalled();
    expect(t.c.getState().flujo.fase).toBe("consentimiento");
  });

  it("rechazar el aviso: cierra con sin_consentimiento y jamás pide cámara", async () => {
    const t = armar();
    await t.c.abrir(ID_ENLACE);
    await t.c.continuar();
    await t.c.rechazarConsentimiento();
    expect(t.cliente.cerrarSesion).toHaveBeenCalledWith(ID_SESION, sesion.token_sesion.valor, {
      motivo: "sin_consentimiento",
    });
    expect(t.pedirMedios).not.toHaveBeenCalled();
    expect(t.c.getState().flujo).toEqual({ fase: "cerrada", motivoCierre: "sin_consentimiento" });
    expect(textoMotivoCierre("sin_consentimiento")).toMatch(/ni la cámara ni el micrófono/);
  });
});

describe("cámara obligatoria", () => {
  it("si la niega: explica que se necesita, cierra con sin_camara y NO sigue", async () => {
    const t = armar({
      pedirMedios: vi.fn(async () =>
        Promise.reject(new DOMException("denegado", "NotAllowedError")),
      ),
    });
    await t.c.abrir(ID_ENLACE);
    await t.c.continuar();
    await t.c.aceptarConsentimiento(CONSENTIMIENTO);
    const s = t.c.getState();
    expect(s.flujo.fase).toBe("camara_denegada");
    expect(s.error?.mensaje).toMatch(/necesitamos/i);
    expect(t.deps.crearMedios).not.toHaveBeenCalled();
    expect(t.cliente.emitirTokenMedios).not.toHaveBeenCalled();
    expect(t.cliente.cerrarSesion).toHaveBeenCalledWith(ID_SESION, expect.any(String), {
      motivo: "sin_camara",
    });
  });

  it("sin dispositivo de cámara: error propio, tampoco sigue", async () => {
    const t = armar({
      pedirMedios: vi.fn(async () => Promise.reject(new DOMException("no hay", "NotFoundError"))),
    });
    await t.c.abrir(ID_ENLACE);
    await t.c.continuar();
    await t.c.aceptarConsentimiento(CONSENTIMIENTO);
    expect(t.c.getState().flujo.fase).toBe("error");
    expect(t.c.getState().error?.codigo).toBe("camara_no_disponible");
    expect(t.deps.crearMedios).not.toHaveBeenCalled();
  });

  it("si la cámara se corta en plena llamada, se cierra la llamada con sin_camara", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.pista.onended?.();
    await vi.waitFor(() => expect(t.c.getState().flujo.fase).toBe("cerrada"));
    expect(t.c.getState().flujo.motivoCierre).toBe("sin_camara");
    expect(t.medios.cerrar).toHaveBeenCalled();
  });
});

describe("errores del catálogo con mensajes claros", () => {
  const cases: [string, ErrorVC, RegExp, boolean][] = [
    ["cuota agotada", new ErrorVC("cuota_agotada", { status: 429 }), /no hay cupo/, false],
    [
      "desafío inválido",
      new ErrorVC("desafio_invalido", { status: 403 }),
      /verificar el navegador/,
      true,
    ],
    ["sesión vencida", new ErrorVC("sesion_vencida", { status: 401 }), /venció/, false],
  ];
  it.each(cases)("crearSesion → %s", async (_n, err, texto, reintentable) => {
    const t = armar();
    t.cliente.crearSesion.mockRejectedValueOnce(err);
    await t.c.abrir(ID_ENLACE);
    await t.c.continuar();
    const s = t.c.getState();
    expect(s.flujo).toEqual({ fase: "error", falloEn: "creando_sesion" });
    expect(s.error?.mensaje).toMatch(texto);
    expect(s.error?.reintentable).toBe(reintentable);
  });

  it("desafío inválido: reintentar crea una sesión nueva (otro desafío)", async () => {
    const t = armar();
    t.cliente.crearSesion.mockRejectedValueOnce(new ErrorVC("desafio_invalido", { status: 403 }));
    await t.c.abrir(ID_ENLACE);
    await t.c.continuar();
    t.c.reintentar();
    await vi.waitFor(() => expect(t.c.getState().flujo.fase).toBe("consentimiento"));
    expect(t.cliente.crearSesion).toHaveBeenCalledTimes(2);
  });

  it("enlace inexistente o revocado", async () => {
    const t = armar();
    t.cliente.leerEnlace.mockRejectedValueOnce(new ErrorVC("no_encontrado", { status: 404 }));
    await t.c.abrir(ID_ENLACE);
    expect(t.c.getState().flujo.fase).toBe("error");
    expect(t.c.getState().error?.mensaje).toMatch(/enlace/);
  });

  it("sin enlace en la URL o sin configuración, no sale a la red", async () => {
    const a = armar();
    await a.c.abrir(undefined);
    expect(a.c.getState().error?.codigo).toBe("enlace_ausente");
    expect(a.cliente.leerEnlace).not.toHaveBeenCalled();
    const b = armar({
      config: { apiBase: "", clavePublica: "", mock: false, enlaceDemo: undefined },
    });
    await b.c.abrir(ID_ENLACE);
    expect(b.c.getState().error?.codigo).toBe("config_incompleta");
    expect(b.cliente.leerEnlace).not.toHaveBeenCalled();
  });

  it("cupo de simultáneas agotado al pedir el token de medios: error con espera, sin quedar la cámara prendida", async () => {
    const t = armar();
    await t.c.abrir(ID_ENLACE);
    await t.c.continuar();
    await t.c.aceptarConsentimiento(CONSENTIMIENTO);
    t.estadoMedios("fallida", {
      intento: 0,
      error: new ErrorVC("simultaneas_agotadas", { status: 429 }),
    });
    await vi.waitFor(() => expect(t.c.getState().flujo.fase).toBe("error"));
    expect(t.c.getState().error?.mensaje).toMatch(/Probá en unos minutos/);
    expect(t.pista.stop).toHaveBeenCalled();
    // es reintentable con la misma sesión: no se la cerró en el servidor
    expect(t.cliente.cerrarSesion).not.toHaveBeenCalled();
    t.c.reintentar();
    await vi.waitFor(() => expect(t.c.getState().flujo.fase).toBe("conectando"));
    expect(t.pedirMedios).toHaveBeenCalledTimes(2);
  });

  it("error recuperable por el socket: aviso no bloqueante, la llamada sigue", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(ev("error", { codigo: "proveedor_no_disponible", mensaje: "x" }));
    expect(t.c.getState().flujo.fase).toBe("llamada");
    expect(t.c.getState().avisoError).toMatch(/no responde/);
  });

  it.each([
    ["sin_voz", /no te escuchamos/],
    ["duracion_maxima", /duración máxima/],
    ["cuota_agotada", /no hay cupo/],
    ["error_proveedor", /servicio/],
  ] as const)("el servidor cierra por %s: la pantalla final lo explica", async (motivo, texto) => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(ev("sesion.cerrada", { motivo_cierre: motivo, duracion_s: 60 }));
    await vi.waitFor(() => expect(t.c.getState().flujo.fase).toBe("cerrada"));
    expect(textoMotivoCierre(t.c.getState().flujo.motivoCierre)).toMatch(texto);
    expect(t.c.getState().cotizacion).toBeUndefined();
  });
});

describe("reconexión", () => {
  it("la caída pasa a 'reconectando' (con el intento) y la recuperación vuelve a 'llamada' sin perder el pizarrón", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(
      ev("pizarron.actualizado", {
        version: 2,
        campos: [{ clave: "zona", etiqueta: "Zona", valor: "Cobo", estado: "anotado" }],
      }),
    );
    t.estadoMedios("reconectando", { intento: 2, proximoEnMs: 2000 });
    expect(t.c.getState().flujo.fase).toBe("reconectando");
    expect(t.c.getState().reconexion).toEqual({ intento: 2, proximoEnMs: 2000 });
    expect(t.muestreador.detener).toHaveBeenCalled(); // sin fotogramas mientras no hay socket
    t.estadoMedios("lista", { intento: 0 });
    expect(t.c.getState().flujo.fase).toBe("llamada");
    expect(t.c.getState().pizarron.campos).toHaveLength(1);
    // el servidor reenvía el último pizarrón tras reconectar: misma versión, no se duplica
    t.servidor(ev("pizarron.actualizado", { version: 2, campos: [] }));
    expect(t.c.getState().pizarron.campos).toHaveLength(1);
  });

  it("si se agotan los intentos: error ws_fallido y se libera el cupo en el servidor", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.estadoMedios("reconectando", { intento: 6 });
    t.estadoMedios("fallida", { intento: 7, error: new ErrorVC("ws_fallido") });
    await vi.waitFor(() => expect(t.c.getState().flujo.fase).toBe("error"));
    expect(t.c.getState().error?.codigo).toBe("ws_fallido");
    await vi.waitFor(() => expect(t.cliente.cerrarSesion).toHaveBeenCalled());
  });
});

describe("conversación, voz, avatar y pizarrón", () => {
  it("el asesor habla (voz + avatar) y se calla al terminar; el reconocedor se pausa mientras tanto", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(
      ev("avatar.respuesta", { turno: 1, texto: "Hola, soy Juan", clip_id: "clip_saludo" }),
    );
    expect(t.avatar.hablar).toHaveBeenCalledWith({
      turno: 1,
      texto: "Hola, soy Juan",
      clipId: "clip_saludo",
    });
    expect(t.voz.hablar).toHaveBeenCalledWith("Hola, soy Juan", expect.any(Object));
    expect(t.reconocedor.pausar).toHaveBeenLastCalledWith(true);
    expect(t.c.getState().asesorHablando).toBe(true);
    t.servidor(ev("avatar.visemas", { turno: 1, items: [{ v: "aa", t_ms: 0, d_ms: 100 }] }));
    expect(t.avatar.aplicarVisemas).toHaveBeenCalledWith(1, [{ v: "aa", t_ms: 0, d_ms: 100 }]);
    t.terminarVoz();
    expect(t.c.getState().asesorHablando).toBe(false);
    expect(t.avatar.callar).toHaveBeenCalled();
    expect(t.reconocedor.pausar).toHaveBeenLastCalledWith(false);
    expect(t.c.getState().mensajes.map((m) => [m.de, m.texto])).toEqual([
      ["asesor", "Hola, soy Juan"],
    ]);
  });

  it("el texto del cliente (voz reconocida) va por texto.enviar y se ve en pantalla; el eco del servidor no duplica", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.c.enviarTexto("quiero pintar mi living");
    expect(t.medios.enviarTexto).toHaveBeenCalledWith("quiero pintar mi living");
    t.servidor(ev("transcripcion.final", { turno: 1, texto: "quiero pintar mi living" }));
    expect(t.c.getState().mensajes.filter((m) => m.de === "cliente")).toHaveLength(1);
  });

  it("el reconocedor del navegador alimenta al servidor con sus resultados finales", async () => {
    const t = armar();
    await hastaLlamada(t);
    const cb = t.reconocedor.iniciar.mock.calls[0]![0] as {
      onParcial: (s: string) => void;
      onFinal: (s: string) => void;
    };
    cb.onParcial("quiero pin");
    expect(t.c.getState().parcial).toBe("quiero pin");
    cb.onFinal("quiero pintar");
    expect(t.medios.enviarTexto).toHaveBeenCalledWith("quiero pintar");
    expect(t.c.getState().parcial).toBe("");
  });

  it("parte los textos de más de 500 caracteres y limpia < >", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.c.enviarTexto(("palabra ".repeat(120) + "<script>").trim());
    const enviados = t.medios.enviarTexto.mock.calls.map((c) => c[0] as string);
    expect(enviados.length).toBeGreaterThanOrEqual(2);
    expect(enviados.every((e) => e.length <= 500 && !/[<>]/.test(e))).toBe(true);
  });

  it("si el cliente interrumpe mientras habla el asesor, se calla", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(ev("avatar.respuesta", { turno: 1, texto: "Te cuento..." }));
    t.c.enviarTexto("dale");
    expect(t.voz.cancelar).toHaveBeenCalled();
    expect(t.c.getState().asesorHablando).toBe(false);
  });

  it("el pizarrón se actualiza en vivo sin cortar la llamada ni el habla", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(ev("avatar.respuesta", { turno: 1, texto: "Anoto" }));
    t.voz.cancelar.mockClear();
    t.servidor(
      ev("pizarron.actualizado", {
        version: 1,
        campos: [{ clave: "tarea", etiqueta: "Tarea", valor: "pintar living", estado: "anotado" }],
      }),
    );
    expect(t.c.getState().pizarron.campos[0]?.valor).toBe("pintar living");
    expect(t.c.getState().asesorHablando).toBe(true);
    expect(t.c.getState().flujo.fase).toBe("llamada");
    expect(t.voz.cancelar).not.toHaveBeenCalled();
  });

  it("corregir el pizarrón manda la versión base vigente", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(ev("pizarron.actualizado", { version: 4, campos: [] }));
    expect(t.c.corregirPizarron("zona", "  Cobo ")).toBe(true);
    expect(t.medios.corregirPizarron).toHaveBeenCalledWith(4, "zona", "Cobo");
  });

  it("acuses de fotogramas: cuenta aceptados y descartados", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(ev("camara.fotograma", { seq_fotograma: 0, resultado: "aceptado" }));
    t.servidor(
      ev("camara.fotograma", { seq_fotograma: 1, resultado: "descartado", motivo: "tamano" }),
    );
    expect(t.c.getState().fotogramas).toMatchObject({ aceptados: 1, descartados: 1 });
  });

  it("los fotogramas salen por el socket (enviarTrama)", async () => {
    const t = armar();
    await hastaLlamada(t);
    const enviar = (
      t.deps.crearMuestreador as unknown as {
        mock: { calls: [unknown, (x: Uint8Array) => boolean][] };
      }
    ).mock.calls[0]![1];
    enviar(Uint8Array.from([1]));
    expect(t.medios.enviarTrama).toHaveBeenCalled();
  });
});

describe("cierre y derivación a WhatsApp", () => {
  it("el cliente corta: cierra socket y sesión, libera cámara y lee la derivación", async () => {
    const t = armar();
    await hastaLlamada(t);
    await t.c.cortar();
    expect(t.medios.cerrar).toHaveBeenCalled();
    expect(t.cliente.cerrarSesion).toHaveBeenCalledWith(ID_SESION, expect.any(String), {
      motivo: "cliente_cerro",
    });
    expect(t.pista.stop).toHaveBeenCalled();
    expect(t.reconocedor.detener).toHaveBeenCalled();
    expect(t.cliente.leerDerivacion).toHaveBeenCalled();
    const s = t.c.getState();
    expect(s.flujo).toEqual({ fase: "cerrada", motivoCierre: "cliente_cerro" });
    expect(s.derivacion?.codigo_referencia).toBe("VC-AB12-CD34EF");
    expect(s.cotizacion).toBeUndefined(); // sin llamada completa no hay precio
  });

  it("completada sin evento de cotización (se perdió el socket): la recupera con leerCotizacion", async () => {
    const t = armar();
    await hastaLlamada(t);
    t.servidor(ev("sesion.cerrada", { motivo_cierre: "completada", duracion_s: 100 }));
    await vi.waitFor(() => expect(t.c.getState().flujo.fase).toBe("resultado"));
    expect(t.cliente.leerCotizacion).toHaveBeenCalled();
    expect(t.cliente.leerDerivacion).toHaveBeenCalled();
    expect(t.c.getState().cotizacion?.total_centavos).toBe(12_345_600);
  });

  it("si leerDerivacion falla al cerrar no rompe: igual muestra el cierre", async () => {
    const t = armar();
    t.cliente.leerDerivacion.mockRejectedValue(
      new ErrorVC("cotizacion_no_emitida", { status: 409 }),
    );
    await hastaLlamada(t);
    await t.c.cortar();
    expect(t.c.getState().flujo.fase).toBe("cerrada");
    expect(t.c.getState().derivacion).toBeUndefined();
  });

  it("cerrar la ventana en plena llamada libera todo y avisa al servidor", async () => {
    const t = armar();
    await hastaLlamada(t);
    await t.c.cerrarVentana();
    expect(t.medios.cerrar).toHaveBeenCalled();
    expect(t.cliente.cerrarSesion).toHaveBeenCalled();
    expect(t.pista.stop).toHaveBeenCalled();
    expect(t.c.getState().flujo.fase).toBe("inactiva");
  });

  it("resultados tardíos de una llamada anterior no pisan una nueva", async () => {
    const t = armar();
    let soltar: (e: EnlacePublico) => void = () => undefined;
    t.cliente.leerEnlace.mockImplementationOnce(() => new Promise((r) => (soltar = r)));
    const lenta = t.c.abrir(ID_ENLACE);
    await t.c.cerrarVentana();
    soltar(enlace);
    await lenta;
    expect(t.c.getState().flujo.fase).toBe("inactiva");
  });
});
