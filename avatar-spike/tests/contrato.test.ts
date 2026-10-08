import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  VISEMAS,
  validarCampoPizarron,
  validarEventoVisemas,
  type EventoAvatarVisemas,
} from '../src/contrato/eventos';
import {
  CARGA_MAX,
  ErrorEncabezado,
  TAM_ENCABEZADO,
  armarTrama,
  codificarEncabezado,
  decodificarEncabezado,
  separarTrama,
} from '../src/contrato/encabezado';

const esquemaVisemas = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../contracts/schemas/eventos/Evento_avatar_visemas.schema.json', import.meta.url)), 'utf8'),
);

describe('copia local del contrato (borrador) vs esquemas de contracts/', () => {
  it('los 15 visemas coinciden con el enum del esquema, en el mismo orden', () => {
    expect([...VISEMAS]).toEqual(esquemaVisemas.properties.datos.properties.items.items.properties.v.enum);
  });
  it('los ejemplos del esquema validan', () => {
    for (const e of esquemaVisemas.examples) expect(validarEventoVisemas(e)).toEqual({ ok: true, errores: [] });
  });
  it('los ejemplos del esquema del pizarrón validan campo por campo', () => {
    const esq = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../contracts/schemas/eventos/Evento_pizarron_actualizado.schema.json', import.meta.url)), 'utf8'),
    );
    for (const e of esq.examples) for (const c of e.datos.campos) expect(validarCampoPizarron(c).ok).toBe(true);
  });
});

describe('validarEventoVisemas', () => {
  const base: EventoAvatarVisemas = {
    v: 1, tipo: 'avatar.visemas', seq: 1, ts: '2026-10-08T13:01:00Z',
    datos: { turno: 1, items: [{ v: 'aa', t_ms: 0, d_ms: 100 }] },
  };
  it('acepta el mínimo válido', () => expect(validarEventoVisemas(base).ok).toBe(true));
  it('rechaza propiedades extra en ítems (additionalProperties: false)', () => {
    const e = { ...base, datos: { turno: 1, items: [{ v: 'aa', t_ms: 0, d_ms: 100, peso: 1 }] } };
    expect(validarEventoVisemas(e).ok).toBe(false);
  });
  it('rechaza d_ms 0, t_ms > 600000, turno 501 y más de 2000 ítems', () => {
    expect(validarEventoVisemas({ ...base, datos: { turno: 1, items: [{ v: 'aa', t_ms: 0, d_ms: 0 }] } }).ok).toBe(false);
    expect(validarEventoVisemas({ ...base, datos: { turno: 1, items: [{ v: 'aa', t_ms: 600_001, d_ms: 1 }] } }).ok).toBe(false);
    expect(validarEventoVisemas({ ...base, datos: { turno: 501, items: base.datos.items } }).ok).toBe(false);
    const muchos = Array.from({ length: 2001 }, (_, i) => ({ v: 'aa' as const, t_ms: i, d_ms: 1 }));
    expect(validarEventoVisemas({ ...base, datos: { turno: 1, items: muchos } }).ok).toBe(false);
  });
  it('rechaza null, tipo equivocado y v ≠ 1', () => {
    expect(validarEventoVisemas(null).ok).toBe(false);
    expect(validarEventoVisemas({ ...base, tipo: 'avatar.respuesta' }).ok).toBe(false);
    expect(validarEventoVisemas({ ...base, v: 2 }).ok).toBe(false);
  });
});

describe('encabezado binario de 20 bytes', () => {
  it('ida y vuelta conserva todos los campos', () => {
    const e = { tipo: 'fotograma_jpeg' as const, flags: 0, seq: 0xfffffffe, ts_ms: 123_456, longitud: CARGA_MAX };
    const b = codificarEncabezado(e);
    expect(b.length).toBe(TAM_ENCABEZADO);
    expect(decodificarEncabezado(b)).toEqual(e);
  });
  it('bytes exactos: magia VC, versión 1, tipo 0x10, big-endian', () => {
    const b = codificarEncabezado({ tipo: 'fotograma_jpeg', flags: 1, seq: 0x01020304, ts_ms: 0x0a0b0c0d, longitud: 0x00010000 });
    expect(Array.from(b)).toEqual([0x56, 0x43, 1, 0x10, 1, 0, 0, 0, 1, 2, 3, 4, 0x0a, 0x0b, 0x0c, 0x0d, 0, 1, 0, 0]);
  });
  it('códigos de tipo del contrato', () => {
    expect(codificarEncabezado({ tipo: 'audio_pcm16_16k', flags: 0, seq: 0, ts_ms: 0, longitud: 0 })[3]).toBe(0x01);
    expect(codificarEncabezado({ tipo: 'audio_opus', flags: 0, seq: 0, ts_ms: 0, longitud: 0 })[3]).toBe(0x02);
    expect(codificarEncabezado({ tipo: 'audio_respuesta_opus', flags: 0, seq: 0, ts_ms: 0, longitud: 0 })[3]).toBe(0x20);
  });
  it('rechaza magia, versión, tipo, flags y reservados inválidos', () => {
    const ok = codificarEncabezado({ tipo: 'audio_opus', flags: 0, seq: 1, ts_ms: 1, longitud: 1 });
    const mal = (i: number, v: number) => {
      const c = ok.slice();
      c[i] = v;
      return c;
    };
    for (const [i, v, codigo] of [[0, 0x57, 'magia'], [2, 2, 'version'], [3, 0x03, 'tipo'], [4, 2, 'flags'], [6, 1, 'reservado']] as const) {
      expect(() => decodificarEncabezado(mal(i, v))).toThrowError(ErrorEncabezado);
      try {
        decodificarEncabezado(mal(i, v));
      } catch (e) {
        expect((e as ErrorEncabezado).codigo).toBe(codigo);
      }
    }
  });
  it('rechaza longitud > 131072 al codificar y al decodificar', () => {
    expect(() => codificarEncabezado({ tipo: 'audio_opus', flags: 0, seq: 0, ts_ms: 0, longitud: CARGA_MAX + 1 })).toThrow(ErrorEncabezado);
    const b = codificarEncabezado({ tipo: 'audio_opus', flags: 0, seq: 0, ts_ms: 0, longitud: 0 });
    new DataView(b.buffer).setUint32(16, CARGA_MAX + 1);
    expect(() => decodificarEncabezado(b)).toThrow(/131072/);
  });
  it('rechaza menos de 20 bytes y seq fuera de uint32', () => {
    expect(() => decodificarEncabezado(new Uint8Array(19))).toThrow(ErrorEncabezado);
    expect(() => codificarEncabezado({ tipo: 'audio_opus', flags: 0, seq: 2 ** 32, ts_ms: 0, longitud: 0 })).toThrow(ErrorEncabezado);
  });
  it('armarTrama + separarTrama; longitud declarada debe coincidir', () => {
    const carga = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const t = armarTrama({ tipo: 'fotograma_jpeg', flags: 0, seq: 9, ts_ms: 3000 }, carga);
    const { encabezado, carga: c2 } = separarTrama(t);
    expect(encabezado.longitud).toBe(6);
    expect(Array.from(c2)).toEqual(Array.from(carga));
    expect(() => separarTrama(t.subarray(0, t.length - 1))).toThrow(/longitud/);
  });
});
