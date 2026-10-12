#!/usr/bin/env node
// Valida tarifas-2026.json: estructura, enteros (sin floats) en montos y que cada monto tenga fuente.
// Uso: node verificar.mjs [ruta/al/archivo.json]   (sin dependencias)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const ruta = process.argv[2] ?? join(aqui, 'tarifas-2026.json');
const fallas = [];
const falla = (m) => fallas.push(m);

let texto, d;
try { texto = readFileSync(ruta, 'utf8'); d = JSON.parse(texto); }
catch (e) { console.error(`FALLA: no se pudo leer o parsear ${ruta}: ${e.message}`); process.exit(1); }

const UNIDADES = new Set(['m2', 'ml', 'unidad', 'visita', 'trabajo', 'mes', 'hora', 'jornal', 'm2_mes']);
const FECHA = /^\d{4}-\d{2}(-\d{2})?$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const esEntero = (n) => typeof n === 'number' && Number.isSafeInteger(n);
const esMonto = (n) => esEntero(n) && n > 0;
const vacio = (s) => typeof s !== 'string' || s.trim() === '';

// 1) Floats: ningun campo *_centavos ni *_bps puede escribirse con punto decimal o exponente.
for (const m of texto.matchAll(/"([a-z0-9_]*(?:centavos|bps)[a-z0-9_]*)"\s*:\s*(-?[0-9.eE+-]+)/g)) {
  if (/[.eE]/.test(m[2])) falla(`float o exponente en ${m[1]}: ${m[2]}`);
}

// 2) Cabecera
if (d.estado !== 'referencia_publica_sin_validar') falla(`estado debe ser "referencia_publica_sin_validar" (es ${JSON.stringify(d.estado)})`);
if (d.moneda !== 'ARS') falla('moneda debe ser ARS');
if (d.unidad_monto !== 'centavos_int64') falla('unidad_monto debe ser centavos_int64');
if (d.uso_en_produccion !== false) falla('uso_en_produccion debe ser false');
if (d.modificable !== true) falla('modificable debe ser true');
if (!d.validado_por_profesional || d.validado_por_profesional.pintor !== false || d.validado_por_profesional.jardinero !== false) falla('validado_por_profesional.pintor y .jardinero deben ser false hasta que haya validacion real');
if (!ISO.test(d.fecha_consulta ?? '')) falla('fecha_consulta debe ser AAAA-MM-DD');
if (vacio(d.advertencia)) falla('falta advertencia');

// 3) Fuentes
const fuentes = d.fuentes ?? {};
if (!Object.keys(fuentes).length) falla('no hay fuentes');
for (const [id, f] of Object.entries(fuentes)) {
  if (!/^https:\/\//.test(f.url ?? '')) falla(`fuente ${id}: url debe ser https`);
  if (!ISO.test(f.fecha_consulta ?? '')) falla(`fuente ${id}: fecha_consulta invalida`);
  if (!FECHA.test(f.fecha_publicacion ?? '')) falla(`fuente ${id}: fecha_publicacion invalida`);
  if (vacio(f.titulo) || vacio(f.publicador) || vacio(f.tipo)) falla(`fuente ${id}: faltan titulo, publicador o tipo`);
}

// 4) Montos con puntos y fuente
const idsVistos = new Set();
const unico = (id, donde) => { if (idsVistos.has(id)) falla(`id repetido: ${id} (${donde})`); idsVistos.add(id); };
const usadas = new Set();

function chequearPuntos(donde, puntos, min, max) {
  if (!Array.isArray(puntos) || !puntos.length) { falla(`${donde}: monto sin puntos de fuente`); return; }
  for (const [i, p] of puntos.entries()) {
    const w = `${donde}.puntos[${i}]`;
    if (!fuentes[p.fuente_id]) falla(`${w}: fuente_id inexistente (${p.fuente_id})`); else usadas.add(p.fuente_id);
    if (!esMonto(p.min_centavos) || !esMonto(p.max_centavos)) falla(`${w}: min/max deben ser enteros positivos en centavos`);
    else if (p.min_centavos > p.max_centavos) falla(`${w}: min > max`);
    if (vacio(p.zona_ref)) falla(`${w}: falta zona_ref`);
  }
  if (!esMonto(min) || !esMonto(max)) { falla(`${donde}: min/max agregados deben ser enteros positivos`); return; }
  if (min > max) falla(`${donde}: min > max`);
  const okp = puntos.every(p => esEntero(p.min_centavos) && esEntero(p.max_centavos));
  if (okp) {
    if (min !== Math.min(...puntos.map(p => p.min_centavos))) falla(`${donde}: min no coincide con el minimo de los puntos`);
    if (max !== Math.max(...puntos.map(p => p.max_centavos))) falla(`${donde}: max no coincide con el maximo de los puntos`);
  }
}

let total = 0, conPrecio = 0;
const porOficio = {};
for (const o of d.oficios ?? []) {
  unico(o.id, 'oficio');
  porOficio[o.id] = { total: 0, conPrecio: 0 };
  for (const t of o.tareas ?? []) {
    const w = `${o.id}/${t.id}`;
    unico(t.id, 'tarea');
    total++; porOficio[o.id].total++;
    if (!UNIDADES.has(t.unidad)) falla(`${w}: unidad no valida (${t.unidad})`);
    if (vacio(t.descripcion)) falla(`${w}: falta descripcion`);
    if (t.precio === null) {
      if (vacio(t.motivo_null)) falla(`${w}: precio null sin motivo_null`);
    } else {
      conPrecio++; porOficio[o.id].conPrecio++;
      if (!vacio(t.motivo_null)) falla(`${w}: tiene precio y motivo_null a la vez`);
      if (!['baja', 'media', 'alta'].includes(t.precio.confianza)) falla(`${w}: confianza invalida`);
      chequearPuntos(w, t.precio.puntos, t.precio.min_centavos, t.precio.max_centavos);
    }
  }
}
if (!total) falla('no hay tareas');

for (const r of d.referencias_salariales_convenio ?? []) {
  unico(r.id, 'referencia salarial');
  if (!UNIDADES.has(r.unidad)) falla(`ref ${r.id}: unidad no valida`);
  chequearPuntos(`ref ${r.id}`, r.puntos, r.min_centavos, r.max_centavos);
  if (r.unidad === 'hora' && 'jornal_8h_min_centavos' in r) {
    if (r.jornal_8h_min_centavos !== r.min_centavos * 8 || r.jornal_8h_max_centavos !== r.max_centavos * 8) falla(`ref ${r.id}: jornal_8h no es 8 x hora`);
  }
}

const motor = d.motor_cotizacion;
if (motor) {
  if (motor.version !== '0.1.0') falla(`motor_cotizacion.version debe ser 0.1.0 (es ${JSON.stringify(motor.version)})`);
  const reglas = motor.reglas_trabajo ?? [];
  if (reglas.length < 14) falla(`motor_cotizacion: se esperan al menos 14 reglas_trabajo, hay ${reglas.length}`);
  const tipos = new Set();
  const RES = new Set(['fija', 'umbral_m2', 'medio_altura']);
  for (const [i, r] of reglas.entries()) {
    const w = `motor_cotizacion.reglas_trabajo[${i}]`;
    if (vacio(r.trabajo_tipo)) falla(`${w}: falta trabajo_tipo`);
    if (tipos.has(r.trabajo_tipo)) falla(`${w}: trabajo_tipo repetido ${r.trabajo_tipo}`);
    tipos.add(r.trabajo_tipo);
    if (!RES.has(r.resolver)) falla(`${w}: resolver invalido (${r.resolver})`);
    if (vacio(r.oficio_contrato)) falla(`${w}: falta oficio_contrato`);
  }
  for (const [slug, zona] of Object.entries(motor.localidades ?? {})) {
    if (vacio(slug) || vacio(zona)) falla('motor_cotizacion.localidades: claves y valores no vacios');
  }
}

for (const f of d.factores_ajuste ?? []) {
  unico(f.id, 'factor');
  const w = `factor ${f.id}`;
  if (f.min_bps === null && f.max_bps === null) {
    if (vacio(f.motivo_null)) falla(`${w}: valor null sin motivo_null`);
  } else {
    if (!esEntero(f.min_bps) || !esEntero(f.max_bps) || f.min_bps < 0 || f.min_bps > f.max_bps) falla(`${w}: min_bps/max_bps deben ser enteros con 0 <= min <= max`);
    if (!Array.isArray(f.fuente_ids) || !f.fuente_ids.length) falla(`${w}: factor con valor sin fuente`);
  }
  for (const id of f.fuente_ids ?? []) { if (!fuentes[id]) falla(`${w}: fuente_id inexistente (${id})`); else usadas.add(id); }
}

// fuentes declaradas que nadie usa: aviso, no falla (hay una de solo contraste)
const sinUso = Object.keys(fuentes).filter(id => !usadas.has(id));

console.log(`Archivo: ${ruta}`);
console.log(`Cobertura: ${conPrecio} de ${total} tareas con precio`);
for (const [id, v] of Object.entries(porOficio)) console.log(`  ${id}: ${v.conPrecio} de ${v.total}`);
console.log(`Fuentes: ${Object.keys(fuentes).length} (${sinUso.length ? 'sin uso en montos: ' + sinUso.join(', ') : 'todas usadas'})`);
if (fallas.length) {
  console.error(`\n${fallas.length} FALLA(S):`);
  for (const f of fallas) console.error(` - ${f}`);
  process.exit(1);
}
console.log('\n0 fallas');
