import { describe, expect, it } from 'vitest';
import {
  aMinutos,
  enlaceWhatsApp,
  etiquetaPeriodo,
  etiquetaUnidad,
  formatearCantidad,
  formatearDuracion,
  formatearEspera,
  formatearFechaCorta,
  formatearFechaHora,
  formatearHora,
  formatearMoneda,
  mesActual,
  plural,
  ultimosPeriodos,
} from './formato';

describe('dinero y cantidades (enteros, sin float)', () => {
  it('formatea centavos con punto de miles y coma decimal', () => {
    expect(formatearMoneda(2312500, 'ARS')).toBe('$ 23.125,00');
    expect(formatearMoneda(1234567, 'ARS')).toBe('$ 12.345,67');
  });
  it('completa los centavos de una cifra y soporta menos de un peso', () => {
    expect(formatearMoneda(5, 'ARS')).toBe('$ 0,05');
    expect(formatearMoneda(100, 'ARS')).toBe('$ 1,00');
  });
  it('usa US$ para dólares', () => {
    expect(formatearMoneda(150000, 'USD')).toBe('US$ 1.500,00');
  });
  it('no inventa montos negativos', () => {
    expect(formatearMoneda(-500, 'ARS')).toBe('$ 0,00');
  });
  it('formatea millones sin perder precisión', () => {
    expect(formatearMoneda(123456789012, 'ARS')).toBe('$ 1.234.567.890,12');
  });
  it('formatea cantidades en centésimas sin ceros sobrantes', () => {
    expect(formatearCantidad(1250)).toBe('12,5');
    expect(formatearCantidad(1200)).toBe('12');
    expect(formatearCantidad(1625)).toBe('16,25');
    expect(formatearCantidad(105)).toBe('1,05');
    expect(formatearCantidad(123456700)).toBe('1.234.567');
  });
  it('tiene una etiqueta para cada unidad del contrato', () => {
    expect(etiquetaUnidad('m2')).toBe('m²');
    expect(etiquetaUnidad('jornada')).toBe('jornada');
    expect(etiquetaUnidad('global')).toBe('global');
  });
});

describe('fechas en hora argentina', () => {
  it('muestra la fecha y hora en America/Argentina/Buenos_Aires (UTC-3)', () => {
    expect(formatearHora('2026-10-08T13:00:00Z')).toMatch(/^10:00/);
    expect(formatearFechaHora('2026-10-08T13:00:00Z')).toMatch(/8 oct 2026.*10:00/);
  });
  it('no revienta con una fecha inválida', () => {
    expect(formatearFechaHora('no-es-fecha')).toBe('fecha inválida');
    expect(formatearHora('no-es-fecha')).toBe('--:--');
  });
  it('escribe una fecha sin hora con el mes en palabras y sin correrse de día', () => {
    expect(formatearFechaCorta('2026-10-03')).toBe('3 de octubre de 2026');
    expect(formatearFechaCorta('2026-01-01')).toBe('1 de enero de 2026');
    expect(formatearFechaCorta('basura')).toBe('basura');
  });
  it('calcula el mes actual en hora argentina aunque en UTC ya sea el mes siguiente', () => {
    // 2026-11-01T01:00Z es todavía 31 de octubre a las 22:00 en Argentina.
    expect(mesActual(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10');
    expect(mesActual(new Date('2026-11-01T04:00:00Z'))).toBe('2026-11');
  });
  it('lista los últimos períodos cruzando el cambio de año', () => {
    expect(ultimosPeriodos(4, new Date('2026-02-15T12:00:00Z'))).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });
  it('escribe el período como "octubre de 2026"', () => {
    expect(etiquetaPeriodo('2026-10')).toBe('octubre de 2026');
    expect(etiquetaPeriodo('x')).toBe('x');
  });
});

describe('duraciones y esperas', () => {
  it('formatea la duración de una llamada', () => {
    expect(formatearDuracion(45)).toBe('45 s');
    expect(formatearDuracion(120)).toBe('2 min');
    expect(formatearDuracion(125)).toBe('2 min 5 s');
    expect(formatearDuracion(-3)).toBe('0 s');
  });
  it('pasa segundos a minutos hacia abajo', () => {
    expect(aMinutos(30000)).toBe(500);
    expect(aMinutos(119)).toBe(1);
    expect(aMinutos(-5)).toBe(0);
  });
  it('escribe la espera de un 429 de forma que se entienda y nunca la achica', () => {
    expect(formatearEspera(1)).toBe('1 s');
    expect(formatearEspera(45)).toBe('45 s');
    expect(formatearEspera(119.2)).toBe('2 min');
    expect(formatearEspera(600)).toBe('10 min');
    expect(formatearEspera(3599)).toBe('60 min');
    expect(formatearEspera(3600)).toBe('1 h');
    expect(formatearEspera(7200)).toBe('2 h');
    expect(formatearEspera(0)).toBe('1 s');
  });
  it('elige singular o plural', () => {
    expect(plural(1, 'turno', 'turnos')).toBe('turno');
    expect(plural(0, 'turno', 'turnos')).toBe('turnos');
    expect(plural(2, 'turno', 'turnos')).toBe('turnos');
  });
});

describe('enlace de WhatsApp del cliente', () => {
  it('deja solo dígitos: el teléfono viene de un tercero', () => {
    expect(enlaceWhatsApp('+5492235551001')).toBe('https://wa.me/5492235551001');
    expect(enlaceWhatsApp('+54 9 223 "><script>')).toBe('https://wa.me/549223');
  });
});
