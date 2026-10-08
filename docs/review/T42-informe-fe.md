# T42 - Informe de fe: mock reconstruido y panel adaptado al contrato 0.1.4-borrador (2026-10-08)

Todo en `panel-asesor/`. `contracts/` sin tocar. Huecos del contrato: `docs/review/T42-huecos-del-contrato.md` (H1 a H7).

## Verificado (salida real, corrida final)
- `npm run contrato`: regenera `openapi.d.ts` y `errores.ts`; `contrato:verificar`: ok en ambos (sin diferencias).
- `npm run todo`: contrato:verificar ok, typecheck sin errores, lint sin errores (había 23 al empezar), `vitest run`: 14 archivos, 238 pruebas pasan (~35 s), build ok.
- `verificar-dist: ok (3 archivos, 323 KiB de JS; sin mock, sin credenciales de demo, sin mapas, con CSP)`. Además: sin localStorage/sessionStorage, sin scripts en línea ni recursos externos.
- Mock en memoria `src/mock/{servidor,datos}.ts`: cada respuesta se valida contra `contracts/schemas` (ajv 2020 estricto), incluidos 45 detalles y la salida del LLM (`src/test/contrato.test.ts`).
- Cobertura de las pruebas: ingreso con TOTP y código de recuperación, bloqueos con cuenta regresiva, sesión vencida/revocada/ausente, aviso a 2 min del vencimiento, reautenticación (acierto, contraseña mala, código malo, Escape), foco y teclado (trampa de foco, Tab/Mayús+Tab), listado y filtros, detalle, contacto con tope diario, registros, perfil, consumo, enlace (copiar enlace y texto), claves del widget (secreto una sola vez), exportación, errores, axe por pantalla.
- Mutaciones manuales: 20 en código + 1 a nivel build. Las 21 fueron DETECTADAS y revertidas (copia fuera del repo). Cambio y primera prueba que falló:
  M01 401 `credencial_invalida` no saca de la pantalla (3 pruebas); M02 CSRF en lecturas y no en escrituras (39); M03 centavos sin cero (5); M04 reautenticación con cualquier error (27); M05 Escape no cierra diálogos (4); M06 Mayús+Tab (1); M07 Salir traga errores del servidor (1); M08 cuenta regresiva con hora vieja (2); M09 contacto ofrecido al revés (10); M10 validación de fechas invertida (3); M11 contraseña no se borra tras fallar (2); M12 "Ya la guardé" no borra el secreto (1); M13 perfil manda siempre el nombre (3); M14 el catálogo de la API ya no manda sobre el respaldo en errores (1, prueba nueva); M15 WhatsApp sin filtrar dígitos (2); M16 aviso de vencimiento a 5 min (1, prueba reforzada); M17 reautenticación tratada como sesión vencida (25); M18 redirección abierta `//sitio` (1); M19 "Dejó contacto" en consultas sin contacto (1); M20 porcentaje de consumo redondea para arriba (2). Build: import estático del mock en `main.tsx` hace fallar `npm run build` en verificar-dist (lista el mock y las credenciales de demo).
- Primera tanda: M14 y M16 sobrevivieron; se agregaron/reforzaron pruebas y quedaron detectadas. (El log tenía una etiqueta mal armada: mostraba SOBREVIVIÓ junto a pruebas caídas; el script ya está corregido.)

## Bugs reales hallados por las pruebas
- `useReloj`: la cuenta regresiva arrancaba con la hora vieja de cuando se montó la pantalla (reescrito).
- Regiones duplicadas en Enlace y claves (axe landmark-unique): la lista de claves ahora tiene nombre propio.
- Plurales mal en detalle y listado ("1 lecturas"); `formatearEspera` y `plural` en `util/formato.ts`.
- 401 de sesión: ahora `sesion_vencida`, `credencial_ausente` y `credencial_invalida` suben a Ingresar y sueltan la acción pendiente de reautenticar.

## Decisiones
- CSRF solo en memoria (`AlmacenCsrf`); al recargar se recupera con `GET /v1/panel/sesion`.
- Mock fuera del bundle: `import.meta.env.DEV && VITE_USAR_MOCK==='1'` + import dinámico + regla eslint; `npm run dev` (modo mock, `.env.mock`) usa el mock; `npm run dev:api` usa la API.
- Credenciales de demo (solo mock): `juan@asesores.local` / `admin@asesores.local`, código TOTP y de recuperación en `src/mock/datos.ts`.
- Premisas corregidas: faltaban `scripts/verificar-dist.mjs` y los CSS (los reescribí); "9000 líneas" incluye los tipos generados.

## NO se probó
- Contra un backend real (solo el mock). Con lector de pantalla (solo axe y jsdom). En navegadores reales ni en teléfono; sin contraste real ni foco visible a ojo. Cookie `__Host-` HttpOnly: simulada, no hay navegador que la aplique. Rendimiento con miles de consultas. TOTP real (el código es fijo en el mock).
