# T14 · Matriz de obligaciones Ley 25.326 (versión mínima para el contrato)

Estado: **rehecho tras el reinicio (2026-10-08)**. Autor: seg. Revisión pendiente de otro agente/modelo.
**Nada de esto es asesoramiento legal.** Todo lo marcado **[ABOGADO]** se tiene que validar con un abogado antes de producción. Solo se citan artículos de la Ley 25.326 de los que hay certeza; plazos, resoluciones de la AAIP y criterios de interpretación quedan **[ABOGADO]**.

Órgano de control: Agencia de Acceso a la Información Pública (AAIP). Reglamentación: Decreto 1558/2001 (en el detalle, **[ABOGADO]**).

## Roles supuestos (declarados, **[ABOGADO]**)
- **Responsable** de la base de consultas de sus propios profesionales: Rober (VideoCotización).
- Al venderse como API: el **tercero (tenant) es responsable** de los datos de sus clientes finales y **VideoCotización presta el servicio por cuenta de él** (art. 25).
- Asesores/profesionales: también son titulares de datos (perfil, credenciales, registros).

## Matriz

| # | Obligación | Base | Aplicación en VideoCotización | Requisito verificable | Req. |
|---|---|---|---|---|---|
| 1 | Licitud de la base e inscripción en el registro | Art. 3 y art. 21 | Base de consultas, contactos y asesores | Constancia de inscripción ante la AAIP antes de abrir al público; quién inscribe (Rober, cada tenant o los dos) **[ABOGADO]** | R29 |
| 2 | Consentimiento libre, expreso e informado | Art. 5 | Antes de pedir cámara y micrófono | Sin consentimiento registrado no se emite token de medios ni se llama a ningún proveedor (prueba con proveedores falsos: 0 llamadas) | R10, R12, R61 |
| 3 | Consentimiento por la cámara obligatoria | Art. 5 | Si rechaza la cámara no hay videocotización | La pantalla ofrece WhatsApp como alternativa; la sesión queda cerrada con motivo `sin_consentimiento` | R45 |
| 4 | Consentimiento separado para el contacto | Art. 5 | Formulario de contacto al final | Casilla no premarcada, versión del texto guardada; sin ella el contacto no se guarda | R68 |
| 5 | Información al recabar los datos (finalidad, destinatarios, responsable, si es obligatorio, consecuencias, derechos) | Art. 6 | Aviso antes del consentimiento y en el formulario | El aviso cubre cada inciso del art. 6 (lista de chequeo en prueba de contrato); versión fechada | R11 |
| 6 | Aviso de que atiende un sistema automatizado | **[ABOGADO]** (buena práctica) | Avatar con IA | Texto visible "Te atiende un asistente automático" antes y durante la llamada | R46 |
| 7 | Finalidad determinada; no usar para fines incompatibles | Art. 4 | Cotizar y derivar al profesional | Finalidad declarada por tipo de dato en el contrato; uso para entrenamiento o marketing prohibido por defecto | R13 |
| 8 | Datos adecuados, pertinentes y no excesivos | Art. 4 | Fotogramas, transcripción | Fotogramas y audio nunca se persisten; el modelo de visión describe solo el trabajo, no a las personas | R43, R47 |
| 9 | Datos exactos y actualizados | Art. 4 | Pizarrón en vivo | El cliente puede corregir lo anotado; el resumen guarda la versión final corregida | R48 |
| 10 | Destrucción cuando dejan de ser necesarios | Art. 4 | Consultas, contactos, registros | Job diario de borrado; prueba con reloj falso: registro vencido = 0 filas | R21, R44 |
| 11 | Plazos concretos de retención | **[ABOGADO]** | Propuesta: consulta y presupuesto 12 meses; contacto 90 días; registros de lectura 24 meses | Tabla de retención en el contrato; valores configurables | R21 |
| 12 | Datos sensibles | Art. 2 (definición) y art. 7 | La cámara puede mostrar salud, religión, menores, etc. | No se persisten imágenes; el esquema de extracción no tiene campos sobre personas; validador rechaza campos extra | R14, R43, R47 |
| 13 | Imagen/biometría | **[ABOGADO]** | Video del cliente | No se hace reconocimiento facial ni se extraen rasgos | R47 |
| 14 | Seguridad de los datos | Art. 9 | Toda la plataforma | TLS en tránsito (incluida la base), RLS por tenant, secretos fuera del repo, backups cifrados | R4, R27 |
| 15 | Medidas de seguridad recomendadas por la AAIP | **[ABOGADO]** (resolución vigente) | Toda la plataforma | Mapeo de la norma vigente contra R27–R28 y R69–R70 | R27 |
| 16 | Deber de confidencialidad | Art. 10 | Asesores y operadores | Asesor ve solo sus consultas; aceptación de confidencialidad en el alta del asesor | R40, R41 |
| 17 | Cesión de datos | Art. 11 | Pasar el contacto del cliente al profesional | Si es cesión o no **[ABOGADO]**; mientras tanto, solo con consentimiento del punto 4 | R68 |
| 18 | Prestación de servicios por cuenta de terceros (encargado) | Art. 25 | API vendida a tenants | Contrato con el tenant: finalidad, prohibición de otro uso, destrucción/devolución al terminar | R26 |
| 19 | Transferencia internacional | Art. 12 | STT, LLM y TTS en el exterior | Inventario de proveedores con país, finalidad y retención; sin inventario aprobado no se activa el proveedor | R25 |
| 20 | Países adecuados y cláusulas modelo | **[ABOGADO]** (normativa AAIP) | Proveedores en EE. UU. u otros | Contrato o cláusulas firmadas por proveedor, aprobadas por abogado | R25 |
| 21 | Derecho de acceso | Art. 14 (plazo exacto **[ABOGADO]**) | Cliente final y asesor | Solicitud registrada con fecha; alerta antes de vencer el plazo configurado | R22, R49 |
| 22 | Rectificación, actualización y supresión | Art. 16 (plazo exacto **[ABOGADO]**) | Consulta y contacto | La supresión borra consulta y contacto y deja solo el registro anonimizado de la solicitud | R23, R49 |
| 23 | Sin cargo para el titular | Art. 19 | ARCO | Ninguna ruta ARCO pide pago | R22, R23 |
| 24 | Verificar identidad del solicitante ARCO | **[ABOGADO]** (criterio) | Código de referencia + contacto | Doble factor de identificación; sin él, respuesta genérica sin datos | R24 |
| 25 | Publicidad | Art. 27 | Contacto del cliente | Prohibido usar el contacto para publicidad sin consentimiento específico | R68 |
| 26 | Datos de los asesores | Art. 5 y art. 6 | Alta en el panel | Aviso y consentimiento del asesor; perfil mínimo sin DNI | R40 |
| 27 | Trazabilidad de accesos | Art. 9 y art. 10 (alcance **[ABOGADO]**) | Panel del asesor | Toda lectura de detalle o contacto deja registro inmutable | R69 |
| 28 | Notificación de incidentes | **[ABOGADO]** (la ley no la regula en forma expresa, según lo que sabemos) | Fuga de datos | Plan de respuesta escrito y probado con simulacro | R70 |
| 29 | Menores de edad | **[ABOGADO]** | Cliente que se declara menor | El consentimiento incluye "soy mayor de 18"; si no, se deriva a WhatsApp | R10 |
| 30 | Presupuesto calculado automáticamente | **[ABOGADO]** (el art. 20 trata decisiones judiciales/administrativas; aplicabilidad a dudar) | Precio orientativo | El presupuesto se rotula "orientativo, lo confirma el profesional" | R15, R46 |

## Bloqueantes legales para abrir al público
1, 2, 5, 11, 19/20 y 18 (si hay tenants externos). Ninguno se puede cerrar sin abogado.
