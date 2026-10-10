# ADR 0001 — Backend en Go modular (puertos y adaptadores, proveedores falsos)

- Estado: Propuesto
- Fecha: 2026-10-08 (rehecho tras la pérdida del entorno; reemplaza la versión de T01)
- Autor: arq · Revisa: rev con un modelo distinto del autor (regla del BRIEF)

## Contexto
VideoCotización necesita un backend que hoy atiende a Rober (~100 profesionales en Mar Chiquita,
Cobo, Santa Clara y Parque Lago) y mañana se venda como API a terceros (ver 0005). Depende de
servicios externos caros y cambiantes (transcripción, LLM, voz, WhatsApp) que no se pueden usar
en pruebas automáticas ni en el entorno de desarrollo. El equipo es chico y trabaja por agentes:
hace falta que cada módulo se pueda escribir, revisar y probar por separado.

## Decisión
1. Un solo binario Go (`api`) desplegado en una VM, con módulos internos por dominio:
   `sesion` (llamada en vivo), `cotizacion` (extracción + cálculo de precio), `clientes`
   (tenants, claves, cuotas), `panel` (asesor) y `almacen` (persistencia).
2. Puertos y adaptadores: cada módulo define interfaces (puertos) en su propio paquete; los
   adaptadores concretos viven aparte (`adaptadores/stt`, `adaptadores/llm`, `adaptadores/tts`,
   `adaptadores/whatsapp`, `almacen/postgres`, `almacen/memoria`).
3. Proveedores falsos para todo lo externo (STT, LLM, TTS, WhatsApp), deterministas y con
   fallas inyectables (latencia, error, respuesta inválida). Son la base de las pruebas.
4. Producción no arranca con almacén en memoria ni con proveedores falsos (corrección H4 de
   T20): la configuración lo valida al inicio y corta con error.
5. Configuración por variables de entorno, validada al arrancar; secretos con un tipo `Secreto`
   que no se imprime en logs ni en `%v` (corrección H1 de T20).
6. Errores con catálogo único (código estable + mensaje en español rioplatense) mapeado al
   contrato OpenAPI (corrección H5 de T20).
7. Subcomandos: `api servir`, `api migrar` (con rol dueño, ver 0004).
8. Contrato primero: las rutas HTTP se escriben contra `contracts/` (OpenAPI 3.1); el contrato
   manda sobre el código.

## Alternativas consideradas
- Microservicios por dominio: más infraestructura y costo para 5 llamadas simultáneas; se
  descarta por ahora. Los módulos con puertos permiten separarlos después si hace falta.
- Node/TypeScript en el backend: el panel ya es TS, pero Go da binario único, concurrencia
  simple para audio en tiempo real y menos dependencias. Se mantiene Go (decisión del BRIEF).
- Llamar a los proveedores directo sin puertos: imposible de probar sin gastar y ata el
  producto a un proveedor (ver 0003).

## Consecuencias
- (+) Cada módulo se prueba con falsos, sin red ni costo; las pruebas corren con `-race`.
- (+) Cambiar de proveedor es escribir un adaptador nuevo, sin tocar el dominio.
- (−) Más interfaces y código de plomería; hay que vigilar que los puertos no copien la API
  de un proveedor puntual.
- (−) Un binario único es un punto único de falla; aceptable para la capacidad inicial.
- Todo cambio que cruce módulos pasa por arq (regla del BRIEF).

## Verificación
- `gofmt -l` vacío, `go vet ./...` limpio, `go test -race ./...` verde.
- Prueba de conformidad de repositorios (H2 de T20): la misma batería corre contra
  `almacen/memoria` y `almacen/postgres` y da los mismos resultados.
- Prueba de arranque: con `ENTORNO=produccion` y almacén en memoria o algún proveedor falso,
  `api servir` termina con código distinto de 0 y mensaje claro.
- Prueba de `Secreto`: formatear la configuración no revela ningún valor secreto.
- Lint de dependencias entre paquetes: el dominio no importa adaptadores.

## Supuestos
- Una sola VM alcanza para 5 llamadas simultáneas (a medir en T13; no probado).
- Docker Compose y TLS hacia la base NO están probados en este entorno (sin daemon de Docker).
- Versión de Go: la estable vigente al reconstruir el esqueleto (a fijar en `go.mod`).
