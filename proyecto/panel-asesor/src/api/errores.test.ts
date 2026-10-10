import { describe, expect, it } from 'vitest';
import { ErrorApi, codigoPorStatus, comoErrorApi, esAbortado, esCodigoDelContrato, esErrorApi, leerProblema } from './errores';

const problema = { type: 'https://videocotizacion.local/errores/no_encontrado', title: 'No encontrado', status: 404, codigo: 'no_encontrado', id_traza: 'tr_0123456789abcdef' };

describe('errores de la API', () => {
  it('reconoce solo los códigos del contrato', () => {
    expect(esCodigoDelContrato('sesion_vencida')).toBe(true);
    expect(esCodigoDelContrato('limite_lecturas_contacto')).toBe(true);
    expect(esCodigoDelContrato('inventado')).toBe(false);
    expect(esCodigoDelContrato(404)).toBe(false);
  });
  it('lee un problem+json con la forma del contrato', () => {
    expect(leerProblema(problema)).toEqual(problema);
  });
  it('rechaza cuerpos que no son del contrato (HTML de un proxy, null, código desconocido, status ausente)', () => {
    expect(leerProblema(null)).toBeNull();
    expect(leerProblema('<html>502</html>')).toBeNull();
    expect(leerProblema({ ...problema, codigo: 'otro_codigo' })).toBeNull();
    expect(leerProblema({ codigo: 'no_encontrado' })).toBeNull();
  });
  it('traduce el status a un código cuando no hay cuerpo del contrato', () => {
    expect(codigoPorStatus(401)).toBe('credencial_invalida');
    expect(codigoPorStatus(403)).toBe('alcance_insuficiente');
    expect(codigoPorStatus(404)).toBe('no_encontrado');
    expect(codigoPorStatus(429)).toBe('limite_de_tasa');
    expect(codigoPorStatus(503)).toBe('servicio_no_disponible');
    expect(codigoPorStatus(502)).toBe('error_interno');
  });
  it('ErrorApi guarda código, status y datos para soporte, nunca el cuerpo crudo', () => {
    const e = new ErrorApi('validacion_fallida', 422, { idTraza: 'tr_1', campos: [{ campo: '/x', problema: 'mal' }], reintentarEnS: 5 });
    expect(e).toMatchObject({ codigo: 'validacion_fallida', status: 422, idTraza: 'tr_1', reintentarEnS: 5 });
    expect(e.campos).toEqual([{ campo: '/x', problema: 'mal' }]);
    expect(new ErrorApi('error_interno', 500).campos).toEqual([]);
  });
  it('esErrorApi compara el código si se lo piden', () => {
    const e = new ErrorApi('totp_invalido', 401);
    expect(esErrorApi(e)).toBe(true);
    expect(esErrorApi(e, 'totp_invalido')).toBe(true);
    expect(esErrorApi(e, 'sesion_vencida')).toBe(false);
    expect(esErrorApi(new Error('x'))).toBe(false);
  });
  it('lo desconocido que se lance es error_interno, sin detalles', () => {
    const e = comoErrorApi(new TypeError('secreto interno'));
    expect(e).toMatchObject({ codigo: 'error_interno', status: 500 });
    expect(e.message).not.toContain('secreto');
  });
  it('reconoce la cancelación de un pedido', () => {
    expect(esAbortado(new DOMException('x', 'AbortError'))).toBe(true);
    expect(esAbortado(new Error('x'))).toBe(false);
  });
});
