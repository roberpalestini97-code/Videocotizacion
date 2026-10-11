import { describe, expect, it, vi } from "vitest";
import {
  AvatarVivo,
  type Motor3DPuerto,
  type MotorClipsPuerto,
  type MotoresAvatar,
} from "./avatar-vivo";
import type { AvatarPuerto, ConfigAvatar, EstadoAvatar } from "./avatar";

const cfg3d: ConfigAvatar = {
  avatarId: "ava_test",
  nombre: "Juan",
  foto: "x.png",
  descripcion: "asesor de prueba",
  modoPreferido: "3d",
};

function el(): HTMLElement {
  return { dataset: {} } as HTMLElement;
}

function motores(
  parcial: Partial<MotoresAvatar> & Pick<MotoresAvatar, "intentar3d" | "intentarClips">,
): MotoresAvatar {
  return parcial;
}

describe("AvatarVivo", () => {
  it("usa 3D cuando el motor arranca", () => {
    const d3: Motor3DPuerto = {
      recibirVisemas: vi.fn(),
      iniciarTurno: vi.fn(),
      cortar: vi.fn(),
      destruir: vi.fn(),
    };
    const intentarClips = vi.fn();
    const av = new AvatarVivo(
      motores({
        intentar3d: () => d3,
        intentarClips,
      }),
    );
    const cont = el();
    av.montar(cont, cfg3d);
    expect(av.modo).toBe("3d");
    expect(cont.dataset["avatarModo"]).toBe("3d");
    expect(intentarClips).not.toHaveBeenCalled();

    av.hablar({ turno: 1, texto: "Hola" });
    expect(d3.recibirVisemas).toHaveBeenCalledOnce();
    expect(d3.iniciarTurno).toHaveBeenCalledWith(1, expect.any(Number));
    const items = vi.mocked(d3.recibirVisemas).mock.calls[0]![1];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual(expect.objectContaining({ v: expect.any(String), t_ms: 0 }));

    av.aplicarVisemas(1, [{ v: "O", t_ms: 0, d_ms: 80 }]);
    expect(d3.recibirVisemas).toHaveBeenCalledTimes(2);
    expect(vi.mocked(d3.recibirVisemas).mock.calls[1]![1]).toEqual([{ v: "O", t_ms: 0, d_ms: 80 }]);

    av.callar();
    expect(d3.cortar).toHaveBeenCalledOnce();
    av.desmontar();
    expect(d3.destruir).toHaveBeenCalledOnce();
  });

  it("si visemas llegan antes de hablar, los usa en el turno", () => {
    const d3: Motor3DPuerto = {
      recibirVisemas: vi.fn(),
      iniciarTurno: vi.fn(),
      cortar: vi.fn(),
      destruir: vi.fn(),
    };
    const av = new AvatarVivo(motores({ intentar3d: () => d3, intentarClips: () => failClips() }));
    av.montar(el(), cfg3d);
    av.aplicarVisemas(2, [{ v: "PP", t_ms: 0, d_ms: 70 }]);
    av.hablar({ turno: 2, texto: "mesa" });
    expect(d3.recibirVisemas).toHaveBeenCalledOnce();
    expect(vi.mocked(d3.recibirVisemas).mock.calls[0]![1]).toEqual([
      { v: "PP", t_ms: 0, d_ms: 70 },
    ]);
  });

  it("cae a clips si WebGL no está", () => {
    const clips: MotorClipsPuerto = {
      recibirRespuesta: vi.fn(),
      interrumpir: vi.fn(),
      destruir: vi.fn(),
    };
    const av = new AvatarVivo(
      motores({
        intentar3d: () => {
          const e = new Error("WebGL no disponible: usar modo clips");
          e.name = "ErrorSinWebGL";
          throw e;
        },
        intentarClips: () => clips,
      }),
    );
    av.montar(el(), cfg3d);
    expect(av.modo).toBe("clips");
    av.hablar({ turno: 1, texto: "Buen día", clipId: "clip_saludo" });
    expect(clips.recibirRespuesta).toHaveBeenCalledWith(1, "Buen día", "clip_saludo");
    av.hablar({ turno: 2, texto: "¿zona?", clipId: "no-vale" });
    expect(clips.recibirRespuesta).toHaveBeenLastCalledWith(2, "¿zona?", "clip_saludo");
    av.callar();
    expect(clips.interrumpir).toHaveBeenCalledOnce();
  });

  it("respeta modoPreferido clips y no intenta 3D", () => {
    const intentar3d = vi.fn();
    const clips: MotorClipsPuerto = {
      recibirRespuesta: vi.fn(),
      interrumpir: vi.fn(),
      destruir: vi.fn(),
    };
    const av = new AvatarVivo(motores({ intentar3d, intentarClips: () => clips }));
    av.montar(el(), { ...cfg3d, modoPreferido: "clips" });
    expect(intentar3d).not.toHaveBeenCalled();
    expect(av.modo).toBe("clips");
  });

  it("cae a 2D si clips también falla", () => {
    const fake2d = puertoFalso();
    const av = new AvatarVivo(
      motores({
        intentar3d: () => {
          const e = new Error("sin webgl");
          e.name = "ErrorSinWebGL";
          throw e;
        },
        intentarClips: () => {
          throw new Error("sin canvas");
        },
        crear2d: () => fake2d,
      }),
    );
    const cont = el();
    av.montar(cont, cfg3d);
    expect(av.modo).toBe("placeholder-2d");
    expect(fake2d.montar).toHaveBeenCalledOnce();
    av.hablar({ turno: 3, texto: "ok" });
    expect(fake2d.hablar).toHaveBeenCalledWith({ turno: 3, texto: "ok" });
  });

  it("emite estado al suscribirse y al hablar/callar", () => {
    const d3: Motor3DPuerto = {
      recibirVisemas: vi.fn(),
      iniciarTurno: vi.fn(),
      cortar: vi.fn(),
      destruir: vi.fn(),
    };
    const av = new AvatarVivo(motores({ intentar3d: () => d3, intentarClips: () => failClips() }));
    av.montar(el(), cfg3d);
    const vistos: EstadoAvatar[] = [];
    av.suscribir((e) => vistos.push(e));
    av.hablar({ turno: 1, texto: "Hola" });
    av.callar();
    expect(vistos[0]).toEqual({ hablando: false, visema: "sil", turno: null });
    expect(vistos.some((e) => e.hablando && e.turno === 1)).toBe(true);
    expect(vistos.at(-1)).toEqual({ hablando: false, visema: "sil", turno: 1 });
  });
});

function failClips(): MotorClipsPuerto {
  throw new Error("no debería intentar clips");
}

function puertoFalso(): AvatarPuerto {
  return {
    modo: "placeholder-2d",
    montar: vi.fn(),
    desmontar: vi.fn(),
    hablar: vi.fn(),
    aplicarVisemas: vi.fn(),
    callar: vi.fn(),
    suscribir: vi.fn(() => () => undefined),
  };
}
