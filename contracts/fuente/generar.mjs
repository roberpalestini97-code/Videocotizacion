// Genera el contrato desde la fuente: schemas/*.schema.json, openapi.yaml, catalogo-errores.json,
// negativos/*.json y pruebas/vectores/*.json. Uso: node fuente/generar.mjs   (desde contracts/)
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { esquemas } from './esquemas.mjs';
import { catalogo } from './catalogo.mjs';
import * as E from './ejemplos.mjs';
import { construir, parametros, cookieEjemplo, operaciones } from './openapi.mjs';
import { VERSION, id, idEnlace, codigoRef, clone } from './base.mjs';
import { negativos, salidaLlmEjemplo } from './negativos.mjs';
import { vectores } from './vectores.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const YAML = createRequire(join(RAIZ, 'verificacion', 'package.json'))('yaml');
const escribir = (rel, txt) => {
  mkdirSync(dirname(join(RAIZ, rel)), { recursive: true });
  writeFileSync(join(RAIZ, rel), txt);
};
const json = (x) => JSON.stringify(x, null, 2) + '\n';

// ---------- catálogo ----------
esquemas.CodigoError.enum = Object.keys(catalogo);
escribir('catalogo-errores.json', json({ version: VERSION, errores: Object.fromEntries(Object.entries(catalogo).map(([c, [http, titulo, mensaje]]) => [c, { http, titulo, mensaje }])) }));

// ---------- ejemplos dentro de cada esquema (keyword examples) ----------
const ej = {
  IdSesion: [id('ses', 1), id('ses', 'b')], IdCotizacion: [id('cot', 1)], IdAsesor: [id('ase', 1)], IdClaveWidget: [id('cpw', 1)], IdSolicitudArco: [id('arc', 1)], IdRegistro: [id('reg', 1)], IdConsentimiento: [id('cns', 1)],
  IdPublicoEnlace: [idEnlace(1), idEnlace(2)], CodigoReferencia: [codigoRef(1), codigoRef(2)], Centavos: [0, 185000, 9007199254740991], VersionTarifas: [E.VERSION_TARIFAS], Moneda: ['ARS'], CantidadCentesimas: [1250, 100], FechaHora: ['2026-10-08T13:00:00Z'],
  Oficio: E.OFICIOS, ZonaAtendida: E.ZONAS_AT, Zona: E.ZONAS, ModoAvatar: ['3d', 'clips'], EstadoSesion: ['creada', 'cerrada'], MotivoCierre: E.MOTIVOS, Origin: ['https://cotizar.videocotizacion.local', 'https://socio.ejemplo.local:8443'],
  UnidadMedida: ['m2', 'hora'], Telefono: ['+5492235551234'], Email: ['juan@asesores.local'], VersionAviso: ['2026-10-08.1'], CodigoError: ['no_encontrado', 'reautenticacion_requerida'],
  ErrorCampo: [{ campo: '/enlace', problema: 'Formato inválido' }], Error: [E.error('reautenticacion_requerida', 1), E.error('sesion_vencida', 2), E.error('validacion_fallida', 3)],
  Avatar: [E.avatar(0), E.avatar(1)], ReglaFotograma: [E.reglaFotograma()], EnlacePublico: [E.enlacePublico(0)], AvisoPrivacidad: [E.aviso(0)], DesafioEmitido: [E.desafio(0)],
  CrearSesionSolicitud: [E.crearSesionSol(0), E.crearSesionSol(1)], LimitesSesion: [E.limites(0)], SesionCreada: [E.sesionCreada(0)], Sesion: [E.sesion(0, 'creada'), E.sesion(0, 'cerrada')],
  ConsentimientoSolicitud: [E.consentimientoSol(0)], ConsentimientoRegistrado: [E.consentimientoReg(0)], TokenMedios: [E.tokenMedios(0)], CierreSolicitud: [E.cierreSol(0)], ItemCotizacion: [E.item('pintura', 0, 0)],
  Cotizacion: [E.cotizacion('pintura', 'cobo', 0), E.cotizacion('jardineria', 'otra', 1), E.cotizacionPrecioFinal(0)], DerivacionWhatsApp: [E.derivacion(0)], CierreSesion: [E.cierre(0), E.cierre(3)], ContactoSolicitud: [E.contactoSol(0), E.contactoSol(2)],
  ContactoRegistrado: [E.contactoReg(0)], SolicitudArco: [E.arcoSol(0), E.arcoSol(1)], SolicitudArcoRecibida: [E.arcoRec(0)], ConsumoDiario: [E.consumoDiario(0)], Consumo: [E.consumo(3)], ReglaRetencion: [E.retencion().reglas[6]],
  TablaRetencion: [E.retencion()], CatalogoTextos: [E.textos()], Version: [E.version()], DatosExtraidos: [E.datosExtraidos('pintura', 'cobo', 1)], ResumenCotizacion: [E.resumenCot(0), E.resumenCot(5)],
  ListadoCotizaciones: [E.listadoCot(2, true)], SesionDetalle: [E.sesionDetalle('pintura', 'otra', 0)], ContactoCliente: [E.contactoCliente(1)], RegistroLectura: [E.registro(0), E.registro(1)], ListadoRegistros: [E.listadoReg(2)],
  LoginSolicitud: [E.loginSol(0)], LoginPaso: [E.loginPaso(0)], TotpSolicitud: [E.totpSol(0), E.totpSol(2)], SesionPanel: [E.sesionPanel(0)], ReautenticacionSolicitud: [E.reauthSol(0)], ReautenticacionOtorgada: [E.reauthOk()],
  PerfilAsesor: [E.perfil(0)], PerfilActualizacion: [E.perfilAct(0)], CambioContrasenaSolicitud: [E.cambioPass(0)], ClaveWidget: [E.claveWidget(0), E.claveWidget(1, 'revocada')], ClaveWidgetSolicitud: [E.claveWidgetSol(1)],
  ClaveWidgetCreada: [E.claveWidgetCreada(0)], ListadoClavesWidget: [{ items: [E.claveWidget(0)] }], EnlaceCompartir: [E.enlaceCompartir(0)], ExportacionMiCuenta: [E.exportacion(0)],
  'eventos/EncabezadoBinario': [E.encabezado(0), E.encabezado(2)],
};
const llm = salidaLlmEjemplo();
if (llm) {
  ej.RespuestaModelo = [{ turno: 3, registrada_en: '2026-10-08T13:09:00Z', salida: llm }];
  ej.SesionDetalle.push({ ...E.sesionDetalle('pintura', 'cobo', 2), respuestas_modelo: ej.RespuestaModelo });
}
for (const [tipo, f] of Object.entries(E.eventos)) ej['eventos/Evento_' + tipo.replace('.', '_')] = [f(0), f(1)];
ej['eventos/EventoCliente'] = ['sesion.autenticar', 'pizarron.corregir'].map((t) => E.eventos[t](0));
ej['eventos/EventoServidor'] = ['pizarron.actualizado', 'cotizacion.emitida', 'sesion.cerrada'].map((t) => E.eventos[t](0));

rmSync(join(RAIZ, 'schemas'), { recursive: true, force: true });
for (const [nombre, s] of Object.entries(esquemas)) {
  const out = clone(s);
  delete out.$id; // el $id (BASE + ruta) lo asigna quien carga: con $id fijo Redocly falla al validar ejemplos
  if (ej[nombre]) out.examples = ej[nombre];
  escribir(`schemas/${nombre}.schema.json`, json(out));
}

// ---------- OpenAPI ----------
const tablaErrores = Object.entries(catalogo).map(([c, [h, t]]) => `| \`${c}\` | ${h} | ${t} |`).join('\n');
const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'VideoCotización API',
    version: VERSION,
    summary: 'Cotización de mano de obra por videollamada con avatar; API multi-tenant.',
    description: `Contrato **${VERSION}** (borrador, candidato a 1.0.0). Fuente de verdad: \`docs/BRIEF.md\` y ADR 0001–0006.

**Versionado.** Ruta con prefijo \`/v1\`; cambios incompatibles solo en \`/v2\`. Deprecaciones con encabezados \`Deprecation\` y \`Sunset\` y aviso en \`GET /v1/version\`. Los eventos del WebSocket y el encabezado binario NO están congelados (ver \`eventos-sesion.md\`).

**Credenciales.** Clave secreta \`vc_sec_\` (servidor a servidor, nunca desde navegador: con \`Origin\` → 403). Clave pública del widget \`vc_pub_\` (solo crear sesión y leer configuración pública) con \`Origin\` exacto por tenant y \`X-Desafio\`. Token de sesión \`vc_ses_\` (una sola sesión). Panel: cookie \`__Host-vc_panel\` + \`X-CSRF-Token\`, TOTP y reautenticación. El \`tenant_id\` nunca es entrada: sale de la credencial.

**Dinero.** Siempre \`integer\` int64 en centavos con \`moneda\`; precio calculado por Go, presupuesto orientativo expresado como **rango** \`total_min_centavos\`–\`total_max_centavos\` (B1); \`precio_final_centavos\` solo con tarifario validado y rango de un punto. Versión del tarifario: \`tarifas-AAAA@X.Y.Z\` (B2).

**Orden de evaluación** (tabla completa en \`estado-de-congelamiento.md\`, H1): 1) límite por IP (IPv6 por /64) → 2) preflight \`OPTIONS\` → 3) credencial → 4) tipo → 5) clave secreta con Origin → 6) Origin de la clave pública / Origin y CSRF del panel → 7) \`X-Desafio\` → 8) límite por credencial (con clave pública, solo en \`crearSesion\`, ya validados Origin y desafío) → 9) rol y reautenticación → 10) cuerpo → 11) login → 12) recurso → 13) límite por enlace → 14) estado → 15) cupo → éxito. Ningún pedido rechazado antes del paso 8 consume el límite de la credencial.

**CORS** (B6): solo en las rutas que usa el widget (\`x-vc-cors\`), con preflight \`OPTIONS\` declarado; \`Access-Control-Allow-Origin\` exacto, nunca \`*\`, sin credenciales de navegador. El panel es del mismo origen que la API y no tiene CORS.

**Cupo** (H2, H3): contadores mensuales persistentes (tenant, asesor, global) que la retención y el ARCO no borran; \`emitirTokenMedios\` reserva en forma atómica una simultánea y \`duracion_maxima_s\`. Todo 429 y 503 lleva \`Retry-After\` calculado (H4).

**Errores** (\`application/problem+json\`, campo \`codigo\`). Los 401 se distinguen por \`codigo\`:

| codigo | HTTP | título |
|---|---|---|
${tablaErrores}

Montos de los ejemplos: ilustrativos, no son tarifas. Lo legal (Ley 25.326): a validar con abogado.`,
    contact: { name: 'Arquitectura VideoCotización', email: 'arquitectura@videocotizacion.local' },
    license: { name: 'Propietaria', identifier: 'LicenseRef-Propietaria' },
  },
  servers: [{ url: 'https://api.{dominio}', description: 'Dominio a definir (P4).', variables: { dominio: { default: 'videocotizacion.local', description: 'Dominio propio pendiente.' } } }],
  tags: [
    { name: 'Widget', description: 'Rutas del widget con clave pública.' },
    { name: 'Sesiones', description: 'Ciclo de vida de la videocotización.' },
    { name: 'Cotizaciones', description: 'Presupuesto emitido al final.' },
    { name: 'Derivacion', description: 'Derivación a WhatsApp.' },
    { name: 'Privacidad', description: 'Aviso, retención y ARCO (Ley 25.326, a validar con abogado).' },
    { name: 'Consumo', description: 'Cuotas y consumo.' },
    { name: 'Meta', description: 'Versión y textos.' },
    { name: 'Panel', description: 'Panel del asesor: Perfil, Mis cotizaciones, Registros.' },
  ],
  security: [],
  paths: construir(),
  components: {
    securitySchemes: {
      claveSecreta: { type: 'http', scheme: 'bearer', bearerFormat: 'vc_sec_…', description: 'Clave secreta del tenant (R1). Prohibida desde navegador (R2).' },
      tokenSesion: { type: 'http', scheme: 'bearer', bearerFormat: 'vc_ses_…', description: 'Token de una sola sesión, emitido por crearSesion.' },
      clavePublica: { type: 'apiKey', in: 'header', name: 'X-VC-Clave-Publica', description: 'Clave pública del widget (R54), atada a Origin exactos (R55).' },
      desafio: { type: 'apiKey', in: 'header', name: 'X-Desafio', description: 'Desafío resuelto: `<desafio>.<nonce hex 16>`, de un uso (R53).' },
      cookiePanel: { type: 'apiKey', in: 'cookie', name: '__Host-vc_panel', description: 'Sesión del panel (R33).' },
      csrf: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token', description: 'Token CSRF ligado a la sesión del panel (R36).' },
    },
    parameters: parametros,
    headers: {
      RetryAfter: {
        description: 'Espera CALCULADA en segundos (H4), igual a `reintentar_en_s` del cuerpo. limite_de_tasa: hasta que el limitador admita el próximo pedido; intentos_excedidos: bloqueo restante; cuota_agotada: hasta las 00:00 del día 1 del mes siguiente en hora argentina (UTC−3); limite_lecturas_contacto: hasta las 00:00 del día siguiente (hora argentina); simultaneas_agotadas y 503: estimación corta configurable (30 s por defecto). Siempre presente en 429 y 503.',
        schema: { type: 'integer', minimum: 1, maximum: 2678400 },
        examples: { tasa: { summary: '3 s (limitador)', value: 3 }, simultaneas: { summary: '30 s', value: 30 }, cuota: { summary: 'Hasta el 1/11 00:00 ART', value: 2037600 } },
      },
      AccessControlAllowOrigin: { description: 'CORS (B6): el Origin exacto del pedido, nunca `*`. Solo si el Origin quedó validado para la credencial (clave pública: su lista; token de sesión: Origins de las claves públicas activas del tenant de la sesión). Antes de validar la credencial (429 por IP, 401) solo si el Origin está registrado en alguna clave pública activa.', schema: { type: 'string', pattern: '^https://[a-z0-9.-]+(:[0-9]{1,5})?$' }, examples: { widget: { summary: 'Widget', value: 'https://cotizar.videocotizacion.local' } } },
      AccessControlAllowMethods: { description: 'Métodos permitidos en la ruta (preflight).', schema: { type: 'string', pattern: '^(GET|POST)(, (GET|POST))*$' }, examples: { post: { summary: 'POST', value: 'POST' } } },
      AccessControlAllowHeaders: { description: 'Encabezados que el widget puede mandar (preflight). Nunca Cookie ni X-CSRF-Token.', schema: { type: 'string', const: 'Authorization, Content-Type, X-VC-Clave-Publica, X-Desafio, Idempotency-Key' }, examples: { todos: { summary: 'Lista fija', value: 'Authorization, Content-Type, X-VC-Clave-Publica, X-Desafio, Idempotency-Key' } } },
      AccessControlMaxAge: { description: 'Vida del preflight en caché del navegador.', schema: { type: 'integer', const: 600 }, examples: { diez: { summary: '10 min', value: 600 } } },
      AccessControlExposeHeaders: { description: 'Deja leer Retry-After al widget.', schema: { type: 'string', const: 'Retry-After' }, examples: { ra: { summary: 'Retry-After', value: 'Retry-After' } } },
      Vary: { description: 'Siempre en rutas con CORS para que ninguna caché mezcle Origins.', schema: { type: 'string', pattern: '^Origin(, Access-Control-Request-Method, Access-Control-Request-Headers)?$' }, examples: { origin: { summary: 'Origin', value: 'Origin' } } },
      SetCookiePanel: {
        description: 'Cookie de sesión del panel: Secure, HttpOnly, SameSite=Strict, Path=/, sin Domain (R33).',
        schema: { type: 'string', pattern: '^__Host-vc_panel=[A-Za-z0-9_-]{22,}; Path=/; Secure; HttpOnly; SameSite=Strict(; Max-Age=[0-9]+)?$' },
        examples: { cookie: { summary: 'Cookie', value: cookieEjemplo } },
      },
    },
    schemas: Object.fromEntries(Object.keys(esquemas).filter((n) => !n.startsWith('eventos/')).map((n) => [n, { $ref: `./schemas/${n}.schema.json` }])),
  },
};
{
  const usados = new Set([...JSON.stringify(openapi.paths).matchAll(/#\/components\/schemas\/([A-Za-z]+)/g), ...JSON.stringify(parametros).matchAll(/#\/components\/schemas\/([A-Za-z]+)/g)].map((m) => m[1]));
  for (const n of Object.keys(openapi.components.schemas)) if (!usados.has(n)) delete openapi.components.schemas[n];
}
escribir('openapi.yaml', `# GENERADO por fuente/generar.mjs — no editar a mano.\n${YAML.stringify(openapi, { lineWidth: 0, aliasDuplicateObjects: false })}`);

// ---------- negativos y vectores ----------
rmSync(join(RAIZ, 'negativos'), { recursive: true, force: true });
const neg = negativos(ej);
const porEsquema = {};
for (const n of neg) (porEsquema[n.esquema] = porEsquema[n.esquema] || []).push(n);
for (const [esq, lista] of Object.entries(porEsquema)) escribir(`negativos/${esq.replace('/', '__')}.json`, json(lista));

rmSync(join(RAIZ, 'pruebas', 'vectores'), { recursive: true, force: true });
const vec = vectores(operaciones, neg);
const porCat = {};
for (const v of vec) (porCat[v.categoria] = porCat[v.categoria] || []).push(v);
for (const [c, lista] of Object.entries(porCat)) escribir(`pruebas/vectores/${c}.json`, json(lista));

console.log(`esquemas: ${Object.keys(esquemas).length} · operaciones: ${operaciones.length} · negativos: ${neg.length} · vectores: ${vec.length}`);
