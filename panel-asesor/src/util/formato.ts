import type { Moneda, UnidadMedida } from '../api/tipos';

const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

function agruparMiles(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formatea un monto en centavos (entero) sin pasar por float: `1234567` → `$ 12.345,67`.
 * El dinero del contrato es siempre `int64` en centavos (nunca decimal).
 */
export function formatearMoneda(centavos: number, moneda: Moneda): string {
  const c = Math.max(0, Math.trunc(centavos));
  const pesos = Math.trunc(c / 100);
  const resto = String(c % 100).padStart(2, '0');
  const simbolo = moneda === 'USD' ? 'US$' : '$';
  return `${simbolo} ${agruparMiles(String(pesos))},${resto}`;
}

/** Cantidad en centésimas (entera) a texto con coma decimal y sin ceros sobrantes: `1250` → `12,5`. */
export function formatearCantidad(centesimas: number): string {
  const c = Math.max(0, Math.trunc(centesimas));
  const entero = agruparMiles(String(Math.trunc(c / 100)));
  const dec = String(c % 100).padStart(2, '0').replace(/0+$/, '');
  return dec === '' ? entero : `${entero},${dec}`;
}

const UNIDADES: Readonly<Record<UnidadMedida, string>> = {
  m2: 'm²',
  ml: 'ml',
  unidad: 'u.',
  hora: 'h',
  jornada: 'jornada',
  visita: 'visita',
  global: 'global',
};

export function etiquetaUnidad(unidad: UnidadMedida): string {
  return UNIDADES[unidad];
}

const fechaHora = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA_HORARIA });
const soloFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: ZONA_HORARIA });
const soloHora = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: ZONA_HORARIA });

function valida(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatearFechaHora(iso: string): string {
  const d = valida(iso);
  return d ? fechaHora.format(d) : 'fecha inválida';
}

export function formatearHora(iso: string): string {
  const d = valida(iso);
  return d ? soloHora.format(d) : '--:--';
}

/** `2026-10-03` (fecha sin hora, ya en hora local de Argentina) → `3 de octubre de 2026`. */
export function formatearFechaCorta(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return fecha;
  // Mediodía UTC para que ninguna zona horaria corra el día.
  return soloFecha.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)));
}

export function formatearDuracion(segundos: number): string {
  const s = Math.max(0, Math.trunc(segundos));
  const min = Math.trunc(s / 60);
  const resto = s % 60;
  if (min === 0) return `${resto} s`;
  return resto === 0 ? `${min} min` : `${min} min ${resto} s`;
}

/** Segundos a minutos enteros hacia abajo (el consumo se muestra en minutos, como el tope de 500 min/mes). */
export function aMinutos(segundos: number): number {
  return Math.trunc(Math.max(0, segundos) / 60);
}

/** `+5492231234567` → `https://wa.me/5492231234567`. Solo dígitos: el dato viene del cliente final. */
export function enlaceWhatsApp(telefonoE164: string): string {
  return `https://wa.me/${telefonoE164.replace(/\D/g, '')}`;
}

export function mesActual(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: ZONA_HORARIA }).format(ahora);
  return partes.slice(0, 7);
}

/** Últimos `n` períodos AAAA-MM, del más nuevo al más viejo. */
export function ultimosPeriodos(n: number, ahora: Date = new Date()): string[] {
  const actual = mesActual(ahora);
  let anio = Number(actual.slice(0, 4));
  let mes = Number(actual.slice(5, 7));
  const salida: string[] = [];
  for (let i = 0; i < n; i += 1) {
    salida.push(`${anio}-${String(mes).padStart(2, '0')}`);
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
  }
  return salida;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function etiquetaPeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  const nombre = m ? MESES[Number(m[2]) - 1] : undefined;
  return m && nombre ? `${nombre} de ${m[1]}` : periodo;
}
