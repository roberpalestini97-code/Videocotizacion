import { describe, expect, it } from "vitest";
import {
  ESTADO_INICIAL,
  transicion,
  type EstadoFlujo,
  type EventoFlujo,
  type Fase,
} from "./maquina";

function correr(eventos: EventoFlujo[], desde: EstadoFlujo = ESTADO_INICIAL) {
  return eventos.reduce(transicion, desde);
}
const fase = (eventos: EventoFlujo[]) => correr(eventos).fase;

const HASTA_LLAMADA: EventoFlujo[] = [
  { t: "ABRIR" },
  { t: "ENLACE_OK" },
  { t: "CONTINUAR" },
  { t: "SESION_OK" },
  { t: "ACEPTA" },
  { t: "CAMARA_OK" },
  { t: "MEDIOS_LISTOS" },
];

describe("máquina de estados del flujo", () => {
  it("camino feliz: enlace → sesión → consentimiento → cámara → llamada → resultado", () => {
    const recorrido: Fase[] = [];
    let s = ESTADO_INICIAL;
    for (const e of [
      ...HASTA_LLAMADA,
      { t: "COTIZACION" } as const,
      { t: "SESION_CERRADA", motivo: "completada" } as const,
    ]) {
      s = transicion(s, e);
      recorrido.push(s.fase);
    }
    expect(recorrido).toEqual([
      "cargando_enlace",
      "enlace",
      "creando_sesion",
      "consentimiento",
      "camara",
      "conectando",
      "llamada",
      "resultado",
      "resultado",
    ]);
    expect(s.motivoCierre).toBe("completada");
  });

  it("el consentimiento va ANTES que la cámara: no hay forma de llegar a 'camara' sin ACEPTAR", () => {
    expect(
      fase([
        { t: "ABRIR" },
        { t: "ENLACE_OK" },
        { t: "CONTINUAR" },
        { t: "SESION_OK" },
        { t: "CAMARA_OK" },
      ]),
    ).toBe("consentimiento");
    expect(fase([{ t: "ABRIR" }, { t: "ENLACE_OK" }, { t: "CAMARA_OK" }])).toBe("enlace");
  });

  it("rechazar el aviso cierra con sin_consentimiento y no pasa por la cámara", () => {
    const s = correr([
      { t: "ABRIR" },
      { t: "ENLACE_OK" },
      { t: "CONTINUAR" },
      { t: "SESION_OK" },
      { t: "RECHAZA" },
    ]);
    expect(s).toEqual({ fase: "cerrada", motivoCierre: "sin_consentimiento" });
  });

  it("cámara denegada: queda en camara_denegada con motivo sin_camara y no sigue", () => {
    const s = correr([
      { t: "ABRIR" },
      { t: "ENLACE_OK" },
      { t: "CONTINUAR" },
      { t: "SESION_OK" },
      { t: "ACEPTA" },
      { t: "CAMARA_DENEGADA" },
    ]);
    expect(s).toEqual({ fase: "camara_denegada", motivoCierre: "sin_camara" });
    expect(transicion(s, { t: "MEDIOS_LISTOS" })).toBe(s);
    expect(transicion(s, { t: "CAMARA_OK" })).toBe(s);
  });

  it("caída y recuperación del socket durante la llamada", () => {
    const perdida = correr([...HASTA_LLAMADA, { t: "MEDIOS_PERDIDOS" }]);
    expect(perdida.fase).toBe("reconectando");
    expect(transicion(perdida, { t: "MEDIOS_RECUPERADOS" }).fase).toBe("llamada");
  });

  it("si la conexión falla del todo, error con la fase donde falló; reintentar vuelve a esa fase", () => {
    const e = correr([...HASTA_LLAMADA, { t: "MEDIOS_PERDIDOS" }, { t: "FALLO" }]);
    expect(e).toEqual({ fase: "error", falloEn: "reconectando" });
    expect(transicion(e, { t: "REINTENTAR" }).fase).toBe("conectando");
    const e2 = correr([{ t: "ABRIR" }, { t: "FALLO" }]);
    expect(transicion(e2, { t: "REINTENTAR" }).fase).toBe("cargando_enlace");
    const e3 = correr([{ t: "ABRIR" }, { t: "ENLACE_OK" }, { t: "CONTINUAR" }, { t: "FALLO" }]);
    expect(transicion(e3, { t: "REINTENTAR" }).fase).toBe("creando_sesion");
  });

  it("el servidor cierra (sin_voz, duración, cuota): finalizando → cerrada con el motivo", () => {
    for (const motivo of [
      "sin_voz",
      "duracion_maxima",
      "cuota_agotada",
      "error_proveedor",
    ] as const) {
      const f = correr([...HASTA_LLAMADA, { t: "SESION_CERRADA", motivo }]);
      expect(f).toEqual({ fase: "finalizando", motivoCierre: motivo });
      expect(transicion(f, { t: "FIN_CIERRE" })).toEqual({ fase: "cerrada", motivoCierre: motivo });
    }
  });

  it("si la cotización llega mientras se finaliza, igual se muestra el resultado", () => {
    const f = correr([
      ...HASTA_LLAMADA,
      { t: "SESION_CERRADA", motivo: "completada" },
      { t: "COTIZACION" },
    ]);
    expect(f.fase).toBe("resultado");
  });

  it("el cliente corta", () => {
    expect(correr([...HASTA_LLAMADA, { t: "CLIENTE_CORTA" }])).toEqual({
      fase: "finalizando",
      motivoCierre: "cliente_cerro",
    });
  });

  it("la cotización no puede aparecer antes de la llamada", () => {
    expect(fase([{ t: "ABRIR" }, { t: "ENLACE_OK" }, { t: "COTIZACION" }])).toBe("enlace");
    expect(fase([{ t: "COTIZACION" }])).toBe("inactiva");
  });

  it("CERRAR vuelve a inactiva desde cualquier fase; REINICIAR solo desde estados finales", () => {
    expect(correr([...HASTA_LLAMADA, { t: "CERRAR" }])).toEqual(ESTADO_INICIAL);
    expect(correr([...HASTA_LLAMADA, { t: "REINICIAR" }]).fase).toBe("llamada");
    expect(correr([{ t: "ABRIR" }, { t: "FALLO" }, { t: "REINICIAR" }]).fase).toBe(
      "cargando_enlace",
    );
  });

  it("eventos que no corresponden a la fase se ignoran (mismo objeto)", () => {
    const s = correr([{ t: "ABRIR" }]);
    expect(transicion(s, { t: "ACEPTA" })).toBe(s);
    expect(transicion(s, { t: "MEDIOS_PERDIDOS" })).toBe(s);
    expect(transicion(ESTADO_INICIAL, { t: "FALLO" })).toBe(ESTADO_INICIAL);
  });
});
