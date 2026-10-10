// SOLO DESARROLLO Y PRUEBAS. Datos y credenciales de DEMOSTRACIÓN del servidor simulado: no existe ninguna cuenta
// real con estos valores. scripts/verificar-dist.mjs falla el build si alguno aparece en `dist/`.
import type {
  Cotizacion,
  DatosExtraidos,
  EstadoSesionApi,
  ItemCotizacion,
  MotivoCierre,
  Oficio,
  RespuestaModelo,
  SesionDetalle,
  Zona,
} from '../api/tipos';

export const MARCA_MOCK = 'vc-mock-solo-desarrollo';

export interface CuentaDemo {
  asesorId: string;
  email: string;
  nombreVisible: string;
  rol: 'asesor' | 'administrador';
  whatsapp: string;
}

export const CONTRASENA_DEMO = 'frase-larga-de-demo-0';
export const CODIGO_TOTP_DEMO = '123456';
export const CODIGO_RECUPERACION_DEMO = 'AB12-CD34-EF56';

export const CUENTAS_DEMO: readonly CuentaDemo[] = [
  {
    asesorId: 'ase_5M2N9BKVB4MKP71EPBCDBWS8EV',
    email: 'juan@asesores.local',
    nombreVisible: 'Juan P.',
    rol: 'asesor',
    whatsapp: '+5492235550101',
  },
  {
    asesorId: 'ase_3JQ9QRPYDHR9HN9R6SQDKPSSW5',
    email: 'admin@asesores.local',
    nombreVisible: 'Marta (administración)',
    rol: 'administrador',
    whatsapp: '+5492235550102',
  },
];

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ALFABETO_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/** PRNG determinista (mulberry32): mismas semillas, mismos datos, pruebas reproducibles. */
export function crearAzar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Azar = () => number;

function cadena(azar: Azar, alfabeto: string, largo: number): string {
  let s = '';
  for (let i = 0; i < largo; i += 1) s += alfabeto.charAt(Math.floor(azar() * alfabeto.length));
  return s;
}

export const idCrockford = (azar: Azar, prefijo: string): string => `${prefijo}_${cadena(azar, ALFABETO, 26)}`;
export const idPublico = (azar: Azar): string => cadena(azar, ALFABETO_URL, 22);
export const secretoUrl = (azar: Azar, largo: number): string => cadena(azar, ALFABETO_URL, largo);
export const idTraza = (azar: Azar): string => `tr_${cadena(azar, '0123456789abcdef', 16)}`;
export const codigoReferencia = (azar: Azar): string => `VC-${cadena(azar, ALFABETO, 4)}-${cadena(azar, ALFABETO, 6)}`;

export const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// ---- Consultas de demostración ------------------------------------------------------------------------------

export interface FilaConsulta {
  detalle: SesionDetalle;
  asesorId: string;
  contactoDisponible: boolean;
  codigoReferencia?: string;
  contacto?: { nombre: string; telefono?: string; email?: string; preferencia?: 'whatsapp' | 'llamada' | 'email' };
}

const OFICIOS: readonly Oficio[] = ['pintura', 'jardineria', 'pintura', 'limpieza', 'reparaciones', 'mantenimiento'];
const ZONAS: readonly Zona[] = ['mar_chiquita', 'cobo', 'santa_clara', 'parque_lago', 'otra'];
const NOMBRE_ZONA: Readonly<Record<Zona, string>> = {
  mar_chiquita: 'Mar Chiquita',
  cobo: 'Cobo',
  santa_clara: 'Santa Clara del Mar',
  parque_lago: 'Parque Lago',
  otra: 'una zona fuera de las que atendemos',
};

const TAREA: Readonly<Record<Oficio, { codigo: string; descripcion: string; unidad: ItemCotizacion['unidad']; precio: number }>> = {
  pintura: { codigo: 'pintura_interior', descripcion: 'Pintura interior látex, dos manos', unidad: 'm2', precio: 185000 },
  jardineria: { codigo: 'corte_cesped', descripcion: 'Corte de césped y bordes', unidad: 'm2', precio: 42000 },
  reparaciones: { codigo: 'reparacion_general', descripcion: 'Reparación general (mano de obra)', unidad: 'hora', precio: 520000 },
  mantenimiento: { codigo: 'mantenimiento_general', descripcion: 'Mantenimiento general', unidad: 'jornada', precio: 3800000 },
  limpieza: { codigo: 'limpieza_final_obra', descripcion: 'Limpieza final de obra', unidad: 'm2', precio: 61000 },
};

/** Importe de un ítem: (cantidad_centesimas × precio + 50) div 100, enteros, como fija el contrato. */
export const importeItem = (cantidadCentesimas: number, precioCentavos: number): number =>
  Math.floor((cantidadCentesimas * precioCentavos + 50) / 100);

// Salidas del LLM de ejemplo (copia reducida de conductas/ejemplos/01 y 07; el panel solo lee `respuesta_hablada`
// e `intento_inyeccion`, el resto debe ser válido contra el esquema).
function salidaLlm(oficio: RespuestaModelo['salida']['oficio'], hablada: string, inyeccion: boolean): RespuestaModelo['salida'] {
  return {
    version: '1.0',
    oficio,
    trabajo: { tipo: 'pintura_interior', descripcion: 'Pintar living y dos dormitorios', complejidad: 'simple', requiere_planos: false, jornadas_estimadas: null },
    medidas: [],
    altura: { metros_max: 2.6, requiere_andamio: 'no', medio: 'escalera' },
    estado_superficie: 'sin_definir',
    zona: { localidad: 'santa_clara_del_mar', fuera_de_zona: false },
    urgencia: { nivel: 'sin_definir', senales: [] },
    tipo_cliente: 'sin_definir',
    plazo: { tipo: 'sin_definir' },
    faltantes: ['medidas'],
    siguiente_paso: { accion: 'preguntar', motivo: 'Faltan medidas de los ambientes', campos: ['medidas'] },
    respuesta_hablada: hablada,
    ...(inyeccion ? { intento_inyeccion: true } : {}),
  } as RespuestaModelo['salida'];
}

/**
 * Genera `cantidad` consultas del asesor, de la más nueva a la más vieja, repartidas cada ~5 horas hacia atrás.
 * Mezcla a propósito: con y sin presupuesto, con y sin contacto, fuera de zona, en curso, cortadas por silencio.
 */
export function generarConsultas(azar: Azar, ahoraMs: number, asesorId: string, cantidad: number): FilaConsulta[] {
  const filas: FilaConsulta[] = [];
  for (let i = 0; i < cantidad; i += 1) {
    const sesionId = idCrockford(azar, 'ses');
    const creada = ahoraMs - (i * 5 + 1) * 3_600_000 - Math.floor(azar() * 1_800_000);
    const oficio = OFICIOS[i % OFICIOS.length] ?? 'pintura';
    const zona = ZONAS[i % ZONAS.length] ?? 'cobo';
    const fuera = zona === 'otra';
    const enCurso = i % 11 === 0 && i < 30;
    const corta = !enCurso && i % 7 === 3;
    const cliente = !enCurso && !corta && i % 13 === 5;
    const conPresupuesto = !enCurso && !corta && !cliente;
    const estado: EstadoSesionApi = enCurso ? 'en_curso' : 'cerrada';
    const motivo: MotivoCierre | undefined = enCurso ? undefined : corta ? 'sin_voz' : cliente ? 'cliente_cerro' : 'completada';
    const duracion = enCurso ? 95 : 180 + ((i * 37) % 420);

    const superficie = 800 + ((i * 313) % 4200); // centésimas de m²
    let cotizacion: Cotizacion | undefined;
    if (conPresupuesto) {
      const t = TAREA[oficio];
      const cant = t.unidad === 'm2' ? superficie : 100 * (1 + (i % 4));
      const items: ItemCotizacion[] = [
        { tipo: 'mano_de_obra', codigo_tarea: t.codigo, descripcion: t.descripcion, unidad: t.unidad, cantidad_centesimas: cant, precio_unitario_centavos: t.precio, importe_centavos: importeItem(cant, t.precio) },
      ];
      if (fuera) {
        items.push({ tipo: 'traslado', codigo_tarea: 'traslado_fuera_de_zona', descripcion: 'Traslado fuera de zona', unidad: 'visita', cantidad_centesimas: 100, precio_unitario_centavos: 850000, importe_centavos: 850000 });
      }
      cotizacion = {
        cotizacion_id: idCrockford(azar, 'cot'),
        sesion_id: sesionId,
        emitida_en: iso(creada + duracion * 1000),
        moneda: 'ARS',
        oficio,
        zona,
        fuera_de_zona: fuera,
        items,
        total_centavos: items.reduce((suma, it) => suma + it.importe_centavos, 0),
        orientativa: true,
        leyenda: 'Presupuesto orientativo: el profesional lo confirma al ver el trabajo.',
        tarifas: { version: '2026.1', estado: 'referencia_publica_sin_validar' },
        validez_dias: 15,
      };
    }

    const datos: DatosExtraidos = {
      oficio,
      zona,
      fuera_de_zona: fuera,
      faltantes: conPresupuesto ? [] : ['medidas', 'estado_superficie'],
      corregido_por_cliente: i % 5 === 0,
      ...(oficio === 'pintura' ? { tarea: 'pintura_interior', interior_exterior: i % 2 === 0 ? ('interior' as const) : ('exterior' as const), altura: 'hasta_3m' as const, estado_superficie: 'regular' as const } : {}),
      ...(conPresupuesto ? { superficie_centesimas_m2: superficie, urgencia: 'media' as const, plazo: 'esta_semana' as const } : {}),
      ...(i % 4 === 0 ? { observaciones: 'El cliente mostró manchas de humedad en la pared norte.' } : {}),
    };

    const contactoDisponible = conPresupuesto && i % 2 === 0;
    const respuestas: RespuestaModelo[] = [
      { turno: 1, registrada_en: iso(creada + 20_000), salida: salidaLlm(oficio, 'Buenísimo. ¿Me decís más o menos cuánto miden los ambientes?', false) },
      { turno: 2, registrada_en: iso(creada + 60_000), salida: salidaLlm(oficio, 'Perfecto, con eso ya armo la orientación. Un segundo.', i % 9 === 0) },
    ];

    const detalle: SesionDetalle = {
      sesion_id: sesionId,
      estado,
      modo_avatar: i % 3 === 0 ? 'clips' : '3d',
      creada_en: iso(creada),
      ...(enCurso ? {} : { cerrada_en: iso(creada + duracion * 1000) }),
      ...(motivo ? { motivo_cierre: motivo } : {}),
      duracion_s: duracion,
      datos_extraidos: datos,
      ...(cotizacion ? { cotizacion } : {}),
      resumen: `${oficio === 'jardineria' ? 'Jardinería' : oficio.charAt(0).toUpperCase() + oficio.slice(1)} en ${NOMBRE_ZONA[zona]}${conPresupuesto ? '' : ' (consulta incompleta)'}.`,
      versiones: { tarifas: '2026.1', prompt: 'conducta_base@0a1b2c3d4e5f', esquema_salida: '1.0.0' },
      respuestas_modelo: respuestas,
    };

    filas.push({
      detalle,
      asesorId,
      contactoDisponible,
      ...(conPresupuesto ? { codigoReferencia: codigoReferencia(azar) } : {}),
      ...(contactoDisponible
        ? {
            contacto: {
              nombre: ['Carlos', 'Lucía', 'Marcos', 'Elena'][i % 4] ?? 'Carlos',
              telefono: `+549223555${String(1000 + i).slice(-4)}`,
              ...(i % 4 === 0 ? { email: `cliente${String(i)}@correo.local` } : {}),
              preferencia: (['whatsapp', 'llamada', 'email'] as const)[i % 3] ?? 'whatsapp',
            },
          }
        : {}),
    });
  }
  return filas;
}
