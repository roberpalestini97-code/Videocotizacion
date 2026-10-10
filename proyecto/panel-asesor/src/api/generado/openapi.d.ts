// ARCHIVO GENERADO por scripts/generar-contrato.mjs: no editar a mano.
export interface paths {
    "/v1/widget/enlaces/{id_publico}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer la configuración pública del enlace opaco
         * @description Perfil público mínimo del profesional y avatares elegibles (R63). Inexistente, revocado o de otro tenant: mismo 404 (R64).
         */
        get: operations["leerEnlacePublico"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/widget/desafios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Emitir un desafío anti-bots
         * @description Desafío de un uso, ligado a la clave pública y al Origin, que vence en ≤120 s (R53). El widget lo resuelve y lo manda en `X-Desafio` a crearSesion. Mecanismo provisorio (P7).
         */
        post: operations["emitirDesafio"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/widget/avisos/privacidad": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer el aviso de privacidad vigente
         * @description Aviso versionado con los incisos del art. 6 (R11). Texto a validar con abogado.
         */
        get: operations["leerAvisoPrivacidad"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sesiones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Crear una sesión de videocotización
         * @description Con clave pública exige `Origin` de la lista y `X-Desafio` válido (R53–R55); con clave secreta, sin `Origin` (R2). No llama a ningún proveedor ni emite token de medios: primero consentimiento (R10, R61). El tenant sale de la credencial y del enlace (R3).
         */
        post: operations["crearSesion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sesiones/{sesion_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer una sesión por id
         * @description Para el tenant (clave secreta) o para el propio cliente (token de sesión ligado a esa sesión). Otra sesión u otro tenant: 404 (R5).
         */
        get: operations["leerSesion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sesiones/{sesion_id}/consentimiento": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Registrar el consentimiento previo a cámara y micrófono
         * @description Registro solo-anexar (R12). Rechazar no se hace acá: se cierra con `sin_consentimiento` o `sin_camara` y se ofrece WhatsApp (R45).
         */
        post: operations["registrarConsentimiento"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sesiones/{sesion_id}/token-medios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Emitir el token del WebSocket de medios
         * @description Solo con consentimiento registrado (O1, R10). Reserva en forma atómica el cupo de simultáneas (R57) y verifica topes (R56) antes de tocar proveedores (R61). Token de un uso, corto (R32). Sirve también para reconectar.
         */
        post: operations["emitirTokenMedios"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sesiones/{sesion_id}/cierre": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cerrar una sesión
         * @description El servidor también cierra solo (sin_voz, duracion_maxima, cuota_agotada, errores) y lo informa por evento y en la lectura de la sesión (R60).
         */
        post: operations["cerrarSesion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sesiones/{sesion_id}/cotizacion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer la cotización emitida
         * @description Ítems y total en centavos int64 calculados por Go (R15). Una cotización fuera de zona SÍ se emite, con `fuera_de_zona: true` (T24).
         */
        get: operations["leerCotizacion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sesiones/{sesion_id}/derivacion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer la derivación a WhatsApp
         * @description Enlace wa.me al profesional con código de referencia, sin datos personales (R50). Disponible al cerrar.
         */
        get: operations["leerDerivacion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sesiones/{sesion_id}/contacto": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Dejar datos de contacto (opcional)
         * @description Con aviso visible y consentimiento no premarcado y versionado (R68). Solo lo ve el asesor de esa consulta.
         */
        post: operations["registrarContacto"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/arco/solicitudes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Registrar una solicitud ARCO del cliente final
         * @description Acceso, rectificación o supresión (R22–R24). La registra el tenant (clave secreta) en nombre del titular. Respuesta genérica e idéntica haya o no coincidencia. Sin cargo.
         */
        post: operations["crearSolicitudArco"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/politicas/retencion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer la tabla de retención
         * @description Plazos por tipo de dato (R21, R43). Pública. Plazos a validar con abogado.
         */
        get: operations["leerRetencion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/consumo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer consumo y topes del tenant
         * @description Segundos usados, topes, simultáneas y detalle diario (R56, R59). Sin costos de proveedores.
         */
        get: operations["leerConsumo"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/version": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer la versión del contrato
         * @description Contrato 0.1.4-borrador. Solo el OpenAPI es candidato a 1.0.0; eventos en borrador.
         */
        get: operations["leerVersion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/textos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer el catálogo de textos
         * @description Etiquetas y mensajes en es-AR para widget y panel (errores, motivos de cierre, oficios, zonas).
         */
        get: operations["leerCatalogoTextos"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/sesion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer la sesión del panel
         * @description Recupera el CSRF y los vencimientos al recargar.
         */
        get: operations["leerSesionPanel"];
        put?: never;
        /**
         * Ingresar al panel (paso 1: contraseña)
         * @description Mensaje uniforme ante email o contraseña incorrectos (R37); límite progresivo por cuenta e IP. Emite cookie `__Host-vc_panel` preliminar (R33) y un CSRF para el paso TOTP.
         */
        post: operations["iniciarSesionPanel"];
        /**
         * Salir del panel
         * @description Invalida la sesión en el servidor (R34).
         */
        delete: operations["cerrarSesionPanel"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/sesion/totp": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ingresar al panel (paso 2: TOTP)
         * @description TOTP obligatorio sin reuso (R38). Rota el id de sesión (R35).
         */
        post: operations["verificarTotp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/reautenticacion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reautenticarse para acciones sensibles
         * @description Contraseña + TOTP; habilita acciones sensibles por ≤5 min (R39).
         */
        post: operations["reautenticar"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/perfil": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Leer mi perfil
         * @description Perfil mínimo (R40).
         */
        get: operations["leerPerfil"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Actualizar mi perfil
         * @description Cambios parciales.
         */
        patch: operations["actualizarPerfil"];
        trace?: never;
    };
    "/v1/panel/contrasena": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cambiar mi contraseña
         * @description Requiere reautenticación (R39). Invalida las demás sesiones.
         */
        post: operations["cambiarContrasena"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/cotizaciones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar mis cotizaciones
         * @description Solo las consultas del asesor (R41). `contacto_disponible` y `codigo_referencia` están solo en este listado.
         */
        get: operations["listarMisCotizaciones"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/cotizaciones/{sesion_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver el detalle de una consulta
         * @description SesionDetalle sin código de referencia ni derivación (T39). Deja fila en Registros (R69). De otro asesor u otro tenant: 404.
         */
        get: operations["leerMiCotizacion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/cotizaciones/{sesion_id}/contacto": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver el contacto que dejó el cliente
         * @description Solo si `contacto_disponible`. Cada lectura queda registrada; hay límite diario con alerta (R68, R69).
         */
        get: operations["leerContactoCliente"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/registros": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar mis registros de lecturas
         * @description Registro solo-anexar (R69).
         */
        get: operations["listarRegistros"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/consumo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver mi consumo
         * @description Consumo del asesor con detalle diario, sin costos (R52).
         */
        get: operations["leerConsumoPanel"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/enlace": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Ver mi enlace para compartir
         * @description Enlace opaco y texto listo para compartir.
         */
        get: operations["leerEnlaceCompartir"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/enlace/rotacion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Rotar mi enlace
         * @description El enlace viejo deja de funcionar (404, R62). Requiere reautenticación.
         */
        post: operations["rotarEnlace"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/claves-widget": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Listar claves públicas del widget
         * @description Solo administradores del tenant. Nunca devuelve el valor completo.
         */
        get: operations["listarClavesWidget"];
        put?: never;
        /**
         * Crear una clave pública del widget
         * @description El valor se muestra una sola vez (T37). Origin exactos, https, sin comodines (R55). Requiere reautenticación.
         */
        post: operations["crearClaveWidget"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/claves-widget/{clave_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Revocar una clave pública
         * @description Efecto en ≤60 s. Requiere reautenticación.
         */
        delete: operations["revocarClaveWidget"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/panel/mi-cuenta/exportacion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Exportar mis datos
         * @description Derecho de acceso del asesor (R49). Requiere reautenticación; queda registrado.
         */
        post: operations["exportarMiCuenta"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        IdSesion: components["schemas"]["IdSesion.schema"];
        IdClaveWidget: components["schemas"]["IdClaveWidget.schema"];
        IdPublicoEnlace: components["schemas"]["IdPublicoEnlace.schema"];
        Oficio: components["schemas"]["Oficio.schema"];
        Origin: components["schemas"]["Origin.schema"];
        Error: components["schemas"]["Error.schema"];
        EnlacePublico: components["schemas"]["EnlacePublico.schema"];
        AvisoPrivacidad: components["schemas"]["AvisoPrivacidad.schema"];
        DesafioEmitido: components["schemas"]["DesafioEmitido.schema"];
        CrearSesionSolicitud: components["schemas"]["CrearSesionSolicitud.schema"];
        SesionCreada: components["schemas"]["SesionCreada.schema"];
        Sesion: components["schemas"]["Sesion.schema"];
        ConsentimientoSolicitud: components["schemas"]["ConsentimientoSolicitud.schema"];
        ConsentimientoRegistrado: components["schemas"]["ConsentimientoRegistrado.schema"];
        TokenMedios: components["schemas"]["TokenMedios.schema"];
        CierreSolicitud: components["schemas"]["CierreSolicitud.schema"];
        Cotizacion: components["schemas"]["Cotizacion.schema"];
        DerivacionWhatsApp: components["schemas"]["DerivacionWhatsApp.schema"];
        CierreSesion: components["schemas"]["CierreSesion.schema"];
        ContactoSolicitud: components["schemas"]["ContactoSolicitud.schema"];
        ContactoRegistrado: components["schemas"]["ContactoRegistrado.schema"];
        SolicitudArco: components["schemas"]["SolicitudArco.schema"];
        SolicitudArcoRecibida: components["schemas"]["SolicitudArcoRecibida.schema"];
        Consumo: components["schemas"]["Consumo.schema"];
        TablaRetencion: components["schemas"]["TablaRetencion.schema"];
        CatalogoTextos: components["schemas"]["CatalogoTextos.schema"];
        Version: components["schemas"]["Version.schema"];
        ListadoCotizaciones: components["schemas"]["ListadoCotizaciones.schema"];
        SesionDetalle: components["schemas"]["SesionDetalle.schema"];
        ContactoCliente: components["schemas"]["ContactoCliente.schema"];
        ListadoRegistros: components["schemas"]["ListadoRegistros.schema"];
        LoginSolicitud: components["schemas"]["LoginSolicitud.schema"];
        LoginPaso: components["schemas"]["LoginPaso.schema"];
        TotpSolicitud: components["schemas"]["TotpSolicitud.schema"];
        SesionPanel: components["schemas"]["SesionPanel.schema"];
        ReautenticacionSolicitud: components["schemas"]["ReautenticacionSolicitud.schema"];
        ReautenticacionOtorgada: components["schemas"]["ReautenticacionOtorgada.schema"];
        PerfilAsesor: components["schemas"]["PerfilAsesor.schema"];
        PerfilActualizacion: components["schemas"]["PerfilActualizacion.schema"];
        CambioContrasenaSolicitud: components["schemas"]["CambioContrasenaSolicitud.schema"];
        ClaveWidgetSolicitud: components["schemas"]["ClaveWidgetSolicitud.schema"];
        ClaveWidgetCreada: components["schemas"]["ClaveWidgetCreada.schema"];
        ListadoClavesWidget: components["schemas"]["ListadoClavesWidget.schema"];
        EnlaceCompartir: components["schemas"]["EnlaceCompartir.schema"];
        ExportacionMiCuenta: components["schemas"]["ExportacionMiCuenta.schema"];
        /**
         * IdPublicoEnlace
         * @description id_publico del enlace opaco del profesional: 22 caracteres base64url (128 bits aleatorios). Rotable (R62).
         * @example WxoyJSebjQ2qgzlPxgXnjq
         * @example TGV1TOOc-4bD0HVKCPfk07
         */
        "IdPublicoEnlace.schema": string;
        /**
         * Origin
         * @description Origin exacto permitido para una clave pública: https, sin comodines, sin ruta ni barra final (R55).
         * @example https://cotizar.videocotizacion.local
         * @example https://socio.ejemplo.local:8443
         */
        "Origin.schema": string;
        /**
         * Oficio
         * @description Oficio cubierto. reparaciones, mantenimiento y limpieza todavía sin tarifario (T26).
         * @example pintura
         * @example jardineria
         * @example reparaciones
         * @example mantenimiento
         * @example limpieza
         * @enum {string}
         */
        "Oficio.schema": "pintura" | "jardineria" | "reparaciones" | "mantenimiento" | "limpieza";
        /**
         * ZonaAtendida
         * @description Zonas donde trabajan los profesionales (BRIEF).
         * @example mar_chiquita
         * @example cobo
         * @example santa_clara
         * @example parque_lago
         * @enum {string}
         */
        "ZonaAtendida.schema": "mar_chiquita" | "cobo" | "santa_clara" | "parque_lago";
        /**
         * ModoAvatar
         * @description Modo del avatar (BRIEF 1): 3D en vivo con visemas o clips pregrabados.
         * @example 3d
         * @example clips
         * @enum {string}
         */
        "ModoAvatar.schema": "3d" | "clips";
        /**
         * Avatar
         * @description Avatar elegible (apariencia de trabajador constructor).
         * @example {
         *       "avatar_id": "av_obrero_casco",
         *       "nombre": "Juan",
         *       "modos": [
         *         "3d",
         *         "clips"
         *       ],
         *       "descripcion_accesible": "Trabajador con casco amarillo y ropa de obra"
         *     }
         * @example {
         *       "avatar_id": "av_pintora",
         *       "nombre": "Laura",
         *       "modos": [
         *         "3d"
         *       ],
         *       "descripcion_accesible": "Pintora con overol blanco"
         *     }
         */
        "Avatar.schema": {
            avatar_id: string;
            nombre: string;
            modos: components["schemas"]["ModoAvatar.schema"][];
            descripcion_accesible: string;
        };
        /**
         * VersionAviso
         * @description Versión fechada del aviso de privacidad: AAAA-MM-DD.n
         * @example 2026-10-08.1
         */
        "VersionAviso.schema": string;
        /**
         * ReglaFotograma
         * @description Límites de fotogramas (BRIEF 3, R65). El servidor descarta lo que no cumpla. Los fotogramas NO se guardan.
         * @example {
         *       "formato": "image/jpeg",
         *       "lado_max_px": 1024,
         *       "bytes_max": 131072,
         *       "intervalo_min_ms": 3000,
         *       "max_por_sesion": 400
         *     }
         */
        "ReglaFotograma.schema": {
            /** @constant */
            formato: "image/jpeg";
            lado_max_px: number;
            bytes_max: number;
            intervalo_min_ms: number;
            max_por_sesion: number;
        };
        /**
         * EnlacePublico
         * @description Configuración pública del enlace opaco del profesional (R63: perfil público mínimo, sin teléfono ni apellido). Inexistente, revocado u otro tenant → mismo 404 (R64).
         * @example {
         *       "id_publico": "RYZ4c3qAHifF6Rh4XEo3fG",
         *       "profesional": {
         *         "nombre_visible": "Juan P.",
         *         "oficios": [
         *           "pintura"
         *         ],
         *         "zonas": [
         *           "mar_chiquita"
         *         ]
         *       },
         *       "avatares": [
         *         {
         *           "avatar_id": "av_obrero_casco",
         *           "nombre": "Juan",
         *           "modos": [
         *             "3d",
         *             "clips"
         *           ],
         *           "descripcion_accesible": "Trabajador con casco amarillo y ropa de obra"
         *         }
         *       ],
         *       "aviso_privacidad": {
         *         "version": "2026-10-08.1",
         *         "url": "https://cotizar.videocotizacion.local/privacidad/2026-10-08.1"
         *       },
         *       "camara_obligatoria": true,
         *       "fotograma": {
         *         "formato": "image/jpeg",
         *         "lado_max_px": 1024,
         *         "bytes_max": 131072,
         *         "intervalo_min_ms": 3000,
         *         "max_por_sesion": 400
         *       },
         *       "asistente_automatico": true
         *     }
         */
        "EnlacePublico.schema": {
            id_publico: components["schemas"]["IdPublicoEnlace.schema"];
            profesional: {
                nombre_visible: string;
                oficios: components["schemas"]["Oficio.schema"][];
                zonas: components["schemas"]["ZonaAtendida.schema"][];
            };
            avatares: components["schemas"]["Avatar.schema"][];
            aviso_privacidad: {
                version: components["schemas"]["VersionAviso.schema"];
                /** Format: uri */
                url: string;
            };
            /** @constant */
            camara_obligatoria: true;
            fotograma: components["schemas"]["ReglaFotograma.schema"];
            /**
             * @description Se avisa que atiende un asistente automático (R46).
             * @constant
             */
            asistente_automatico: true;
        };
        /**
         * CodigoError
         * @description Código estable del catálogo de errores (catalogo-errores.json define el HTTP y el texto).
         * @example no_encontrado
         * @example reautenticacion_requerida
         * @enum {string}
         */
        "CodigoError.schema": "solicitud_invalida" | "validacion_fallida" | "cuerpo_demasiado_grande" | "tipo_de_contenido_no_soportado" | "credencial_ausente" | "credencial_invalida" | "credenciales_incorrectas" | "totp_invalido" | "sesion_vencida" | "reautenticacion_requerida" | "origen_no_permitido" | "desafio_invalido" | "clave_secreta_desde_navegador" | "alcance_insuficiente" | "csrf_invalido" | "no_encontrado" | "version_retirada" | "estado_invalido" | "consentimiento_requerido" | "sesion_cerrada" | "cotizacion_no_emitida" | "contacto_ya_registrado" | "limite_de_tasa" | "cuota_agotada" | "simultaneas_agotadas" | "intentos_excedidos" | "limite_lecturas_contacto" | "error_interno" | "proveedor_no_disponible" | "servicio_no_disponible";
        /**
         * ErrorCampo
         * @description Error de un campo concreto (JSON Pointer), sin eco del valor recibido.
         * @example {
         *       "campo": "/enlace",
         *       "problema": "Formato inválido"
         *     }
         */
        "ErrorCampo.schema": {
            campo: string;
            problema: string;
        };
        /**
         * Error
         * @description Problema RFC 9457 (application/problem+json) con código del catálogo. Sin trazas ni detalles internos (R31). Distingue los 401: credencial_invalida, sesion_vencida, reautenticacion_requerida, credenciales_incorrectas, totp_invalido.
         * @example {
         *       "type": "https://videocotizacion.local/errores/reautenticacion_requerida",
         *       "title": "Confirmá tu identidad",
         *       "status": 401,
         *       "codigo": "reautenticacion_requerida",
         *       "detail": "Para esta acción tenés que volver a ingresar tu contraseña y código.",
         *       "id_traza": "tr_562881db98122dc8"
         *     }
         * @example {
         *       "type": "https://videocotizacion.local/errores/sesion_vencida",
         *       "title": "Sesión vencida",
         *       "status": 401,
         *       "codigo": "sesion_vencida",
         *       "detail": "Tu sesión venció. Ingresá de nuevo.",
         *       "id_traza": "tr_c16d8a11f4ba1a7d"
         *     }
         * @example {
         *       "type": "https://videocotizacion.local/errores/validacion_fallida",
         *       "title": "Datos inválidos",
         *       "status": 422,
         *       "codigo": "validacion_fallida",
         *       "detail": "Hay datos que no cumplen el formato esperado.",
         *       "id_traza": "tr_53c0a36f10ea3f80",
         *       "errores": [
         *         {
         *           "campo": "/modo_avatar",
         *           "problema": "Debe ser uno de: 3d, clips"
         *         }
         *       ]
         *     }
         */
        "Error.schema": {
            /** Format: uri */
            type: string;
            title: string;
            status: number;
            codigo: components["schemas"]["CodigoError.schema"];
            detail?: string;
            id_traza: string;
            errores?: components["schemas"]["ErrorCampo.schema"][];
            reintentar_en_s?: number;
        };
        /**
         * FechaHora
         * Format: date-time
         * @description Fecha y hora RFC 3339 en UTC (sufijo Z).
         * @example 2026-10-08T13:00:00Z
         */
        "FechaHora.schema": string;
        /**
         * DesafioEmitido
         * @description Desafío anti-bots (R53): un solo uso, vence en ≤120 s, ligado a clave pública + Origin. Mecanismo PROVISORIO (P7).
         * @example {
         *       "desafio": "dsf_KNUl317y39WaG4rBFjMfm4OxyKdm1uaWKlYzmaQcNNz",
         *       "mecanismo": "prueba_de_trabajo_sha256",
         *       "dificultad_bits": 16,
         *       "vence_en": "2026-10-08T13:02:00Z",
         *       "vence_en_s": 120,
         *       "provisorio": true
         *     }
         */
        "DesafioEmitido.schema": {
            desafio: string;
            /** @enum {string} */
            mecanismo: "prueba_de_trabajo_sha256";
            dificultad_bits: number;
            vence_en: components["schemas"]["FechaHora.schema"];
            vence_en_s: number;
            /** @constant */
            provisorio: true;
        };
        /**
         * AvisoPrivacidad
         * @description Aviso de privacidad versionado (R11). El texto y los incisos se validan con abogado.
         * @example {
         *       "version": "2026-10-08.1",
         *       "vigente_desde": "2026-10-08",
         *       "url": "https://cotizar.videocotizacion.local/privacidad/2026-10-08.1",
         *       "resumen": "Usamos tu imagen y tu voz solo durante la llamada para cotizar el trabajo; no guardamos fotogramas ni audio.",
         *       "incisos": [
         *         "finalidad",
         *         "destinatarios",
         *         "responsable",
         *         "obligatoriedad",
         *         "consecuencias",
         *         "derechos_arco",
         *         "transferencia_internacional",
         *         "autoridad_de_control"
         *       ],
         *       "a_validar_con_abogado": true
         *     }
         */
        "AvisoPrivacidad.schema": {
            version: components["schemas"]["VersionAviso.schema"];
            /** Format: date */
            vigente_desde: string;
            /** Format: uri */
            url: string;
            resumen: string;
            incisos: ("finalidad" | "destinatarios" | "responsable" | "obligatoriedad" | "consecuencias" | "derechos_arco" | "transferencia_internacional" | "autoridad_de_control")[];
            /** @constant */
            a_validar_con_abogado: true;
        };
        /**
         * CrearSesionSolicitud
         * @description Pedido de crearSesion. No acepta tenant_id (R3): el tenant sale de la credencial y del enlace.
         * @example {
         *       "enlace": "RYZ4c3qAHifF6Rh4XEo3fG",
         *       "modo_avatar": "3d",
         *       "avatar_id": "av_obrero_casco"
         *     }
         * @example {
         *       "enlace": "WxoyJSebjQ2qgzlPxgXnjq",
         *       "modo_avatar": "clips",
         *       "idioma": "es-AR"
         *     }
         */
        "CrearSesionSolicitud.schema": {
            enlace: components["schemas"]["IdPublicoEnlace.schema"];
            modo_avatar: components["schemas"]["ModoAvatar.schema"];
            avatar_id?: string;
            /** @constant */
            idioma?: "es-AR";
            /** @description Referencia del tercero, sin datos personales (R28). */
            referencia_externa?: string;
        };
        /**
         * IdSesion
         * @description Id opaco de sesión de videocotización: prefijo "ses_" + 26 caracteres Crockford aleatorios (≥128 bits). R7.
         * @example ses_SX2NE9K3Z89ZMZHZHV6ZR2J79H
         * @example ses_27MSYZJHMWMQA3D5Y4N74QMWKX
         */
        "IdSesion.schema": string;
        /**
         * LimitesSesion
         * @description Límites de la sesión (R60, R65, R66). Valores provisorios (P8).
         * @example {
         *       "sin_voz_s": 20,
         *       "duracion_maxima_s": 900,
         *       "caracteres_max_por_turno": 500,
         *       "turnos_llm_max": 60,
         *       "fotograma": {
         *         "formato": "image/jpeg",
         *         "lado_max_px": 1024,
         *         "bytes_max": 131072,
         *         "intervalo_min_ms": 3000,
         *         "max_por_sesion": 400
         *       }
         *     }
         */
        "LimitesSesion.schema": {
            sin_voz_s: number;
            duracion_maxima_s: number;
            caracteres_max_por_turno: number;
            turnos_llm_max: number;
            fotograma: components["schemas"]["ReglaFotograma.schema"];
        };
        /**
         * SesionCreada
         * @description Respuesta de crearSesion. NO incluye token de medios: primero consentimiento (R10, O1).
         * @example {
         *       "sesion_id": "ses_FFPS51S06FXAT3HXHKKKAS7A38",
         *       "estado": "creada",
         *       "token_sesion": {
         *         "valor": "vc_ses_zqH_QeT8gzh36yFkxFok1WZ00X8bLivXDJYsocQursD",
         *         "vence_en": "2026-10-08T14:00:00Z"
         *       },
         *       "consentimiento": {
         *         "requerido": true,
         *         "aviso_version": "2026-10-08.1",
         *         "aviso_url": "https://cotizar.videocotizacion.local/privacidad/2026-10-08.1"
         *       },
         *       "limites": {
         *         "sin_voz_s": 20,
         *         "duracion_maxima_s": 900,
         *         "caracteres_max_por_turno": 500,
         *         "turnos_llm_max": 60,
         *         "fotograma": {
         *           "formato": "image/jpeg",
         *           "lado_max_px": 1024,
         *           "bytes_max": 131072,
         *           "intervalo_min_ms": 3000,
         *           "max_por_sesion": 400
         *         }
         *       },
         *       "creada_en": "2026-10-08T13:00:00Z"
         *     }
         */
        "SesionCreada.schema": {
            sesion_id: components["schemas"]["IdSesion.schema"];
            /** @constant */
            estado: "creada";
            token_sesion: {
                valor: string;
                vence_en: components["schemas"]["FechaHora.schema"];
            };
            consentimiento: {
                /** @constant */
                requerido: true;
                aviso_version: components["schemas"]["VersionAviso.schema"];
                /** Format: uri */
                aviso_url: string;
            };
            limites: components["schemas"]["LimitesSesion.schema"];
            creada_en: components["schemas"]["FechaHora.schema"];
        };
        /**
         * EstadoSesion
         * @description Estado de la sesión.
         * @example creada
         * @example cerrada
         * @enum {string}
         */
        "EstadoSesion.schema": "creada" | "consentida" | "en_curso" | "cerrada";
        /**
         * MotivoCierre
         * @description Motivo de cierre (R60 + ADR 0006, conciliados): cliente_cerro = cliente_colgo del ADR; error_interno + error_proveedor = "error" de R60.
         * @example completada
         * @example cliente_cerro
         * @example sin_voz
         * @example sin_camara
         * @example sin_consentimiento
         * @example duracion_maxima
         * @example cuota_agotada
         * @example desafio_invalido
         * @example error_proveedor
         * @example error_interno
         * @enum {string}
         */
        "MotivoCierre.schema": "completada" | "cliente_cerro" | "sin_voz" | "sin_camara" | "sin_consentimiento" | "duracion_maxima" | "cuota_agotada" | "desafio_invalido" | "error_proveedor" | "error_interno";
        /**
         * IdCotizacion
         * @description Id opaco de cotización emitida: prefijo "cot_" + 26 caracteres Crockford aleatorios (≥128 bits). R7.
         * @example cot_VMWQAPA4T64WSNDTZDQ544FGRK
         */
        "IdCotizacion.schema": string;
        /**
         * Sesion
         * @description Lectura de una sesión por id (tenant con clave secreta o el propio cliente con token de sesión).
         * @example {
         *       "sesion_id": "ses_FFPS51S06FXAT3HXHKKKAS7A38",
         *       "estado": "creada",
         *       "modo_avatar": "3d",
         *       "creada_en": "2026-10-08T13:00:00Z",
         *       "duracion_s": 0
         *     }
         * @example {
         *       "sesion_id": "ses_FFPS51S06FXAT3HXHKKKAS7A38",
         *       "estado": "cerrada",
         *       "modo_avatar": "3d",
         *       "creada_en": "2026-10-08T13:00:00Z",
         *       "duracion_s": 600,
         *       "consentida_en": "2026-10-08T13:01:00Z",
         *       "cerrada_en": "2026-10-08T13:15:00Z",
         *       "motivo_cierre": "completada",
         *       "cotizacion_id": "cot_9DQCFQZZ7H1RQ0CKK4EQF7C54A"
         *     }
         */
        "Sesion.schema": {
            sesion_id: components["schemas"]["IdSesion.schema"];
            estado: components["schemas"]["EstadoSesion.schema"];
            modo_avatar: components["schemas"]["ModoAvatar.schema"];
            creada_en: components["schemas"]["FechaHora.schema"];
            consentida_en?: components["schemas"]["FechaHora.schema"];
            cerrada_en?: components["schemas"]["FechaHora.schema"];
            motivo_cierre?: components["schemas"]["MotivoCierre.schema"];
            duracion_s: number;
            cotizacion_id?: components["schemas"]["IdCotizacion.schema"];
        };
        /**
         * ConsentimientoSolicitud
         * @description Consentimiento previo a cámara y micrófono (R10, R46, R61). Todos los campos deben ser true; rechazar = cerrar con sin_consentimiento o sin_camara (R45).
         * @example {
         *       "aviso_version": "2026-10-08.1",
         *       "acepta_camara_y_microfono": true,
         *       "acepta_tratamiento": true,
         *       "declara_mayor_de_18": true,
         *       "informado_asistente_automatico": true
         *     }
         */
        "ConsentimientoSolicitud.schema": {
            aviso_version: components["schemas"]["VersionAviso.schema"];
            /** @constant */
            acepta_camara_y_microfono: true;
            /** @constant */
            acepta_tratamiento: true;
            /** @constant */
            declara_mayor_de_18: true;
            /** @constant */
            informado_asistente_automatico: true;
        };
        /**
         * IdConsentimiento
         * @description Id opaco de consentimiento registrado (solo-anexar): prefijo "cns_" + 26 caracteres Crockford aleatorios (≥128 bits). R7.
         * @example cns_VZ0RPKKMGFKXQVXDC2EP0WAFF3
         */
        "IdConsentimiento.schema": string;
        /**
         * ConsentimientoRegistrado
         * @description Consentimiento registrado en tabla solo-anexar (R12).
         * @example {
         *       "consentimiento_id": "cns_M4D399VWAKXGCWFXMS45D8EN72",
         *       "sesion_id": "ses_FFPS51S06FXAT3HXHKKKAS7A38",
         *       "aviso_version": "2026-10-08.1",
         *       "registrado_en": "2026-10-08T13:01:00Z",
         *       "estado_sesion": "consentida"
         *     }
         */
        "ConsentimientoRegistrado.schema": {
            consentimiento_id: components["schemas"]["IdConsentimiento.schema"];
            sesion_id: components["schemas"]["IdSesion.schema"];
            aviso_version: components["schemas"]["VersionAviso.schema"];
            registrado_en: components["schemas"]["FechaHora.schema"];
            /** @constant */
            estado_sesion: "consentida";
        };
        /**
         * TokenMedios
         * @description Token del WebSocket de medios (R32): corto, un solo uso, ligado a la sesión; se envía en el primer mensaje, no en la URL. Emitirlo reserva el cupo de simultáneas (R57, R61).
         * @example {
         *       "token": "vc_med_xfPOtNSkPoyQuG8-Hp-vvmkKqCHw8sBFoy1kvqQCEC6",
         *       "ws_url": "wss://api.videocotizacion.local/v1/sesiones/ses_FFPS51S06FXAT3HXHKKKAS7A38/medios",
         *       "vence_en": "2026-10-08T13:02:00Z",
         *       "vence_en_s": 30,
         *       "un_solo_uso": true,
         *       "protocolo_eventos": "vc-eventos.borrador.1"
         *     }
         */
        "TokenMedios.schema": {
            token: string;
            ws_url: string;
            vence_en: components["schemas"]["FechaHora.schema"];
            vence_en_s: number;
            /** @constant */
            un_solo_uso: true;
            /**
             * @description Eventos NO CONGELADOS (eventos-sesion.md).
             * @constant
             */
            protocolo_eventos: "vc-eventos.borrador.1";
        };
        /**
         * CierreSolicitud
         * @description Cierre pedido por el cliente o el tenant.
         * @example {
         *       "motivo": "cliente_cerro"
         *     }
         */
        "CierreSolicitud.schema": {
            /** @enum {string} */
            motivo: "cliente_cerro" | "sin_consentimiento" | "sin_camara";
        };
        /**
         * CodigoReferencia
         * @description Código de referencia de la derivación a WhatsApp: no predecible (50 bits), sin datos personales (R50). Único por tenant.
         * @example VC-JFGD-X4DDYV
         * @example VC-ABTP-61NNQ8
         */
        "CodigoReferencia.schema": string;
        /**
         * DerivacionWhatsApp
         * @description Derivación a WhatsApp con el profesional (BRIEF 6). La URL lleva el número del profesional y un texto con SOLO el código de referencia (R50). El backend no envía mensajes.
         * @example {
         *       "codigo_referencia": "VC-6X0B-5RD4NC",
         *       "url_wa_me": "https://wa.me/5492235550101?text=Hola%2C%20quiero%20seguir%20con%20mi%20videocotizaci%C3%B3n%20VC-6X0B-5RD4NC",
         *       "texto_prellenado": "Hola, quiero seguir con mi videocotización VC-6X0B-5RD4NC",
         *       "generada_en": "2026-10-08T13:25:00Z"
         *     }
         */
        "DerivacionWhatsApp.schema": {
            codigo_referencia: components["schemas"]["CodigoReferencia.schema"];
            url_wa_me: string;
            texto_prellenado: string;
            generada_en: components["schemas"]["FechaHora.schema"];
        };
        /**
         * CierreSesion
         * @description Resultado del cierre. Con sin_consentimiento/sin_camara la derivación es la alternativa por WhatsApp (R45).
         * @example {
         *       "sesion_id": "ses_FFPS51S06FXAT3HXHKKKAS7A38",
         *       "estado": "cerrada",
         *       "motivo_cierre": "completada",
         *       "cerrada_en": "2026-10-08T13:15:00Z",
         *       "duracion_s": 300,
         *       "cotizacion_id": "cot_9DQCFQZZ7H1RQ0CKK4EQF7C54A",
         *       "derivacion": {
         *         "codigo_referencia": "VC-6X0B-5RD4NC",
         *         "url_wa_me": "https://wa.me/5492235550101?text=Hola%2C%20quiero%20seguir%20con%20mi%20videocotizaci%C3%B3n%20VC-6X0B-5RD4NC",
         *         "texto_prellenado": "Hola, quiero seguir con mi videocotización VC-6X0B-5RD4NC",
         *         "generada_en": "2026-10-08T13:25:00Z"
         *       }
         *     }
         * @example {
         *       "sesion_id": "ses_W0JF1HAKEBZYPS0YTDTXMNF5M3",
         *       "estado": "cerrada",
         *       "motivo_cierre": "sin_camara",
         *       "cerrada_en": "2026-10-08T13:15:00Z",
         *       "duracion_s": 0,
         *       "derivacion": {
         *         "codigo_referencia": "VC-RP7C-E5RAF5",
         *         "url_wa_me": "https://wa.me/5492235550101?text=Hola%2C%20quiero%20seguir%20con%20mi%20videocotizaci%C3%B3n%20VC-RP7C-E5RAF5",
         *         "texto_prellenado": "Hola, quiero seguir con mi videocotización VC-RP7C-E5RAF5",
         *         "generada_en": "2026-10-08T13:28:00Z"
         *       }
         *     }
         */
        "CierreSesion.schema": {
            sesion_id: components["schemas"]["IdSesion.schema"];
            /** @constant */
            estado: "cerrada";
            motivo_cierre: components["schemas"]["MotivoCierre.schema"];
            cerrada_en: components["schemas"]["FechaHora.schema"];
            duracion_s: number;
            cotizacion_id?: components["schemas"]["IdCotizacion.schema"];
            derivacion?: components["schemas"]["DerivacionWhatsApp.schema"];
        };
        /**
         * Moneda
         * @description Código ISO 4217. Hoy solo ARS; USD reservado para tenants externos.
         * @example ARS
         * @enum {string}
         */
        "Moneda.schema": "ARS" | "USD";
        /**
         * Zona
         * @description Zona del trabajo. "otra" = fuera de zona: la cotización SÍ se emite, marcada (corrige T24).
         * @example mar_chiquita
         * @example cobo
         * @example santa_clara
         * @example parque_lago
         * @example otra
         * @enum {string}
         */
        "Zona.schema": "mar_chiquita" | "cobo" | "santa_clara" | "parque_lago" | "otra";
        /**
         * UnidadMedida
         * @description Unidad de cada ítem.
         * @example m2
         * @example hora
         * @enum {string}
         */
        "UnidadMedida.schema": "m2" | "ml" | "unidad" | "hora" | "jornada" | "visita" | "global";
        /**
         * CantidadCentesimas
         * Format: int64
         * @description Cantidad normalizada a centésimas de la unidad (p. ej. 12,5 m² = 1250). Entero: sin float (N1 de T16).
         * @example 1250
         * @example 100
         */
        "CantidadCentesimas.schema": number;
        /**
         * Centavos
         * Format: int64
         * @description Monto en centavos de la moneda indicada. Entero int64 no negativo; tope práctico 2^53−1 para clientes JavaScript. Nunca decimal (O04, G01).
         * @example 0
         * @example 185000
         * @example 9007199254740991
         */
        "Centavos.schema": number;
        /**
         * ItemCotizacion
         * @description Ítem del presupuesto. importe_centavos = (cantidad_centesimas × precio_unitario_centavos + 50) div 100 (redondeo mitad hacia arriba, enteros). Calculado por Go desde tarifas, nunca por el LLM.
         * @example {
         *       "tipo": "mano_de_obra",
         *       "codigo_tarea": "pintura_interior",
         *       "descripcion": "Pintura interior látex, dos manos",
         *       "unidad": "m2",
         *       "cantidad_centesimas": 1250,
         *       "precio_unitario_centavos": 185000,
         *       "importe_centavos": 2312500
         *     }
         */
        "ItemCotizacion.schema": {
            /** @enum {string} */
            tipo: "mano_de_obra" | "traslado" | "recargo";
            codigo_tarea: string;
            descripcion: string;
            unidad: components["schemas"]["UnidadMedida.schema"];
            cantidad_centesimas: components["schemas"]["CantidadCentesimas.schema"];
            precio_unitario_centavos: components["schemas"]["Centavos.schema"];
            importe_centavos: components["schemas"]["Centavos.schema"];
        };
        /**
         * Cotizacion
         * @description Presupuesto orientativo emitido al final (BRIEF 5). total_centavos = suma de importes. zona "otra" ⇒ fuera_de_zona true y se emite igual (T24).
         * @example {
         *       "cotizacion_id": "cot_N601R3XEE3HYJYTD08YWEGKTCC",
         *       "sesion_id": "ses_W8RCA6RS2S6PMFH9E6K5KRECAQ",
         *       "emitida_en": "2026-10-08T13:20:00Z",
         *       "moneda": "ARS",
         *       "oficio": "pintura",
         *       "zona": "cobo",
         *       "fuera_de_zona": false,
         *       "items": [
         *         {
         *           "tipo": "mano_de_obra",
         *           "codigo_tarea": "pintura_interior",
         *           "descripcion": "Pintura interior látex, dos manos",
         *           "unidad": "m2",
         *           "cantidad_centesimas": 1250,
         *           "precio_unitario_centavos": 185000,
         *           "importe_centavos": 2312500
         *         }
         *       ],
         *       "total_centavos": 2312500,
         *       "orientativa": true,
         *       "leyenda": "Presupuesto orientativo: el profesional lo confirma al ver el trabajo.",
         *       "tarifas": {
         *         "version": "2026.1",
         *         "estado": "referencia_publica_sin_validar"
         *       },
         *       "validez_dias": 15
         *     }
         * @example {
         *       "cotizacion_id": "cot_ZJ88AH2DQE77V1P5HHDAVF2QTS",
         *       "sesion_id": "ses_RVP4JPJJ38VTRF0V8WABZMDF9J",
         *       "emitida_en": "2026-10-08T13:21:00Z",
         *       "moneda": "ARS",
         *       "oficio": "jardineria",
         *       "zona": "otra",
         *       "fuera_de_zona": true,
         *       "items": [
         *         {
         *           "tipo": "mano_de_obra",
         *           "codigo_tarea": "corte_cesped",
         *           "descripcion": "Corte de césped y bordeado",
         *           "unidad": "m2",
         *           "cantidad_centesimas": 1625,
         *           "precio_unitario_centavos": 30007,
         *           "importe_centavos": 487614
         *         },
         *         {
         *           "tipo": "mano_de_obra",
         *           "codigo_tarea": "poda",
         *           "descripcion": "Poda de árbol mediano",
         *           "unidad": "unidad",
         *           "cantidad_centesimas": 300,
         *           "precio_unitario_centavos": 4500014,
         *           "importe_centavos": 13500042
         *         },
         *         {
         *           "tipo": "traslado",
         *           "codigo_tarea": "traslado_fuera_de_zona",
         *           "descripcion": "Traslado fuera de zona (a confirmar por el asesor)",
         *           "unidad": "global",
         *           "cantidad_centesimas": 100,
         *           "precio_unitario_centavos": 1500001,
         *           "importe_centavos": 1500001
         *         }
         *       ],
         *       "total_centavos": 15487657,
         *       "orientativa": true,
         *       "leyenda": "Presupuesto orientativo fuera de zona: el profesional confirma traslado y precio final.",
         *       "tarifas": {
         *         "version": "2026.1",
         *         "estado": "referencia_publica_sin_validar"
         *       },
         *       "validez_dias": 15
         *     }
         */
        "Cotizacion.schema": {
            cotizacion_id: components["schemas"]["IdCotizacion.schema"];
            sesion_id: components["schemas"]["IdSesion.schema"];
            emitida_en: components["schemas"]["FechaHora.schema"];
            moneda: components["schemas"]["Moneda.schema"];
            oficio: components["schemas"]["Oficio.schema"];
            zona: components["schemas"]["Zona.schema"];
            fuera_de_zona: boolean;
            items: components["schemas"]["ItemCotizacion.schema"][];
            total_centavos: components["schemas"]["Centavos.schema"];
            /** @constant */
            orientativa: true;
            leyenda: string;
            tarifas: {
                version: string;
                /** @enum {string} */
                estado: "referencia_publica_sin_validar" | "validada";
            };
            validez_dias: number;
        };
        /**
         * Telefono
         * @description Teléfono en formato E.164.
         * @example +5492235551234
         */
        "Telefono.schema": string;
        /**
         * Email
         * Format: email
         * @description Correo electrónico.
         * @example juan@asesores.local
         */
        "Email.schema": string;
        /**
         * ContactoSolicitud
         * @description Contacto opcional del cliente con aviso y consentimiento específicos (R68). Al menos teléfono o email. Sin publicidad.
         * @example {
         *       "nombre": "Marta",
         *       "consentimiento": {
         *         "aviso_version": "2026-10-08.1",
         *         "acepta_ser_contactado": true,
         *         "finalidad": "que_el_profesional_te_contacte"
         *       },
         *       "telefono": "+5492235551000"
         *     }
         * @example {
         *       "nombre": "Ana López",
         *       "consentimiento": {
         *         "aviso_version": "2026-10-08.1",
         *         "acepta_ser_contactado": true,
         *         "finalidad": "que_el_profesional_te_contacte"
         *       },
         *       "email": "cliente2@correo.local"
         *     }
         */
        "ContactoSolicitud.schema": {
            nombre: string;
            telefono?: components["schemas"]["Telefono.schema"];
            email?: components["schemas"]["Email.schema"];
            /** @enum {string} */
            preferencia?: "whatsapp" | "llamada" | "email";
            consentimiento: {
                aviso_version: components["schemas"]["VersionAviso.schema"];
                /**
                 * @description Casilla NO premarcada en el front (R68).
                 * @constant
                 */
                acepta_ser_contactado: true;
                /** @constant */
                finalidad: "que_el_profesional_te_contacte";
            };
        } | {
            telefono: unknown;
        } | {
            email: unknown;
        };
        /**
         * ContactoRegistrado
         * @description Confirmación del contacto: no repite los datos personales.
         * @example {
         *       "sesion_id": "ses_FFPS51S06FXAT3HXHKKKAS7A38",
         *       "registrado_en": "2026-10-08T13:16:00Z",
         *       "aviso_version": "2026-10-08.1",
         *       "retencion_dias": 90
         *     }
         */
        "ContactoRegistrado.schema": {
            sesion_id: components["schemas"]["IdSesion.schema"];
            registrado_en: components["schemas"]["FechaHora.schema"];
            aviso_version: components["schemas"]["VersionAviso.schema"];
            retencion_dias: number;
        };
        /**
         * SolicitudArco
         * @description Solicitud de acceso, rectificación o supresión del cliente final (R22–R24). Identificación con dos factores: código de referencia + contacto.
         * @example {
         *       "tipo": "acceso",
         *       "codigo_referencia": "VC-6X0B-5RD4NC",
         *       "verificacion": {
         *         "telefono": "+5492235552000"
         *       }
         *     }
         * @example {
         *       "tipo": "rectificacion",
         *       "codigo_referencia": "VC-JFGD-X4DDYV",
         *       "verificacion": {
         *         "email": "cliente1@correo.local"
         *       },
         *       "detalle": "El metraje anotado era 40 m², no 60 m²."
         *     }
         */
        "SolicitudArco.schema": {
            /** @enum {string} */
            tipo: "acceso" | "rectificacion" | "supresion";
            codigo_referencia: components["schemas"]["CodigoReferencia.schema"];
            verificacion: {
                telefono?: components["schemas"]["Telefono.schema"];
                email?: components["schemas"]["Email.schema"];
            };
            detalle?: string;
        };
        /**
         * IdSolicitudArco
         * @description Id opaco de solicitud ARCO: prefijo "arc_" + 26 caracteres Crockford aleatorios (≥128 bits). R7.
         * @example arc_BVKHPCMY8G5DGM0YX8ST4K017E
         */
        "IdSolicitudArco.schema": string;
        /**
         * SolicitudArcoRecibida
         * @description Acuse genérico e idéntico haya o no coincidencia (R24). Sin cargo (art. 19). Plazos a validar con abogado.
         * @example {
         *       "solicitud_id": "arc_FYKETHGSSBDVH2B6JPQHGKJG29",
         *       "estado": "recibida",
         *       "recibida_en": "2026-10-08T13:30:00Z",
         *       "plazo_vence_en": "2026-10-18T13:30:00Z",
         *       "mensaje": "Recibimos tu solicitud. Si los datos coinciden, te respondemos dentro del plazo legal."
         *     }
         */
        "SolicitudArcoRecibida.schema": {
            solicitud_id: components["schemas"]["IdSolicitudArco.schema"];
            /** @constant */
            estado: "recibida";
            recibida_en: components["schemas"]["FechaHora.schema"];
            plazo_vence_en: components["schemas"]["FechaHora.schema"];
            mensaje: string;
        };
        /**
         * ReglaRetencion
         * @description Regla de retención por tipo de dato (R21, R43). plazo_dias 0 y persistido false = nunca se guarda.
         * @example {
         *       "tipo_dato": "fotogramas",
         *       "finalidad": "Extraer datos del trabajo en memoria",
         *       "persistido": false,
         *       "plazo_dias": 0,
         *       "configurable": false
         *     }
         */
        "ReglaRetencion.schema": {
            /** @enum {string} */
            tipo_dato: "consulta_y_presupuesto" | "contacto_cliente" | "registro_lecturas" | "consentimientos" | "solicitudes_arco" | "fotogramas" | "audio" | "transcripcion_completa" | "perfil_asesor";
            finalidad: string;
            persistido: boolean;
            plazo_dias: number;
            configurable: boolean;
        };
        /**
         * TablaRetencion
         * @description Tabla de retención vigente (R21). Plazos propuestos, a validar con abogado.
         * @example {
         *       "version": "2026-10-08.1",
         *       "a_validar_con_abogado": true,
         *       "reglas": [
         *         {
         *           "tipo_dato": "consulta_y_presupuesto",
         *           "finalidad": "Backoffice y seguimiento del presupuesto",
         *           "persistido": true,
         *           "plazo_dias": 365,
         *           "configurable": true
         *         },
         *         {
         *           "tipo_dato": "contacto_cliente",
         *           "finalidad": "Que el profesional te contacte",
         *           "persistido": true,
         *           "plazo_dias": 90,
         *           "configurable": true
         *         },
         *         {
         *           "tipo_dato": "registro_lecturas",
         *           "finalidad": "Trazabilidad de accesos",
         *           "persistido": true,
         *           "plazo_dias": 730,
         *           "configurable": true
         *         },
         *         {
         *           "tipo_dato": "consentimientos",
         *           "finalidad": "Prueba del consentimiento",
         *           "persistido": true,
         *           "plazo_dias": 730,
         *           "configurable": true
         *         },
         *         {
         *           "tipo_dato": "solicitudes_arco",
         *           "finalidad": "Constancia de derechos ARCO (anonimizada)",
         *           "persistido": true,
         *           "plazo_dias": 730,
         *           "configurable": true
         *         },
         *         {
         *           "tipo_dato": "perfil_asesor",
         *           "finalidad": "Operar el panel",
         *           "persistido": true,
         *           "plazo_dias": 365,
         *           "configurable": true
         *         },
         *         {
         *           "tipo_dato": "fotogramas",
         *           "finalidad": "Extraer datos del trabajo en memoria",
         *           "persistido": false,
         *           "plazo_dias": 0,
         *           "configurable": false
         *         },
         *         {
         *           "tipo_dato": "audio",
         *           "finalidad": "Transcripción en memoria",
         *           "persistido": false,
         *           "plazo_dias": 0,
         *           "configurable": false
         *         },
         *         {
         *           "tipo_dato": "transcripcion_completa",
         *           "finalidad": "No se guarda (ADR 0004)",
         *           "persistido": false,
         *           "plazo_dias": 0,
         *           "configurable": false
         *         }
         *       ]
         *     }
         */
        "TablaRetencion.schema": {
            version: string;
            /** @constant */
            a_validar_con_abogado: true;
            reglas: components["schemas"]["ReglaRetencion.schema"][];
        };
        /**
         * ConsumoDiario
         * @description Consumo de un día (contrato 0.1.3).
         * @example {
         *       "fecha": "2026-10-08",
         *       "segundos": 1800,
         *       "sesiones": 3,
         *       "cotizaciones_emitidas": 2
         *     }
         */
        "ConsumoDiario.schema": {
            /** Format: date */
            fecha: string;
            segundos: number;
            sesiones: number;
            cotizaciones_emitidas: number;
        };
        /**
         * Consumo
         * @description Consumo y topes (BRIEF 7, R56, R59). Sin montos: no expone costos de proveedores ni de otros tenants (R52).
         * @example {
         *       "ambito": "tenant",
         *       "periodo": "2026-10",
         *       "segundos_usados": 30000,
         *       "segundos_tope": 30000,
         *       "simultaneas_en_curso": 3,
         *       "simultaneas_tope": 5,
         *       "alerta": "p100",
         *       "diario": [
         *         {
         *           "fecha": "2026-10-08",
         *           "segundos": 1800,
         *           "sesiones": 3,
         *           "cotizaciones_emitidas": 2
         *         },
         *         {
         *           "fecha": "2026-10-07",
         *           "segundos": 1837,
         *           "sesiones": 4,
         *           "cotizaciones_emitidas": 3
         *         },
         *         {
         *           "fecha": "2026-10-06",
         *           "segundos": 1874,
         *           "sesiones": 5,
         *           "cotizaciones_emitidas": 4
         *         }
         *       ],
         *       "actualizado_en": "2026-10-08T13:05:00Z"
         *     }
         */
        "Consumo.schema": {
            /** @enum {string} */
            ambito: "tenant" | "asesor";
            periodo: string;
            segundos_usados: number;
            segundos_tope: number;
            simultaneas_en_curso: number;
            simultaneas_tope: number;
            /** @enum {string} */
            alerta: "ninguna" | "p50" | "p80" | "p100";
            diario: components["schemas"]["ConsumoDiario.schema"][];
            actualizado_en: components["schemas"]["FechaHora.schema"];
        };
        /**
         * Version
         * @description Versión del contrato. Solo el OpenAPI es candidato a 1.0.0; los eventos de sesión siguen en borrador.
         * @example {
         *       "api": "0.1.4-borrador",
         *       "estado_api": "borrador",
         *       "eventos_sesion": {
         *         "version": "vc-eventos.borrador.1",
         *         "estado": "borrador"
         *       },
         *       "deprecaciones": []
         *     }
         */
        "Version.schema": {
            api: string;
            /** @enum {string} */
            estado_api: "borrador" | "congelado";
            eventos_sesion: {
                /** @constant */
                version: "vc-eventos.borrador.1";
                /** @constant */
                estado: "borrador";
            };
            deprecaciones: {
                operacion: string;
                /** Format: date */
                desde: string;
                /** Format: date */
                retiro: string;
            }[];
        };
        /**
         * CatalogoTextos
         * @description Catálogo de textos y etiquetas para widget y panel (es-AR): error.<codigo>, motivo.<motivo>, oficio.<oficio>, zona.<zona>, etc.
         * @example {
         *       "version": "1.3.0",
         *       "idioma": "es-AR",
         *       "textos": {
         *         "widget.boton_iniciar": "Iniciar VideoCotización",
         *         "widget.asistente_automatico": "Te atiende un asistente automático.",
         *         "widget.presupuesto_orientativo": "Presupuesto orientativo: lo confirma el profesional.",
         *         "panel.menu.perfil": "Perfil",
         *         "panel.menu.mis_cotizaciones": "Mis cotizaciones",
         *         "panel.menu.registros": "Registros",
         *         "panel.contacto_disponible": "Dejó contacto",
         *         "error.solicitud_invalida": "No pudimos leer el pedido. Revisá los datos e intentá de nuevo.",
         *         "error.validacion_fallida": "Hay datos que no cumplen el formato esperado.",
         *         "error.cuerpo_demasiado_grande": "El pedido supera el tamaño máximo permitido.",
         *         "error.tipo_de_contenido_no_soportado": "El formato enviado no está soportado.",
         *         "error.credencial_ausente": "Falta la credencial de acceso.",
         *         "error.credencial_invalida": "La credencial no es válida o fue revocada.",
         *         "error.credenciales_incorrectas": "El email o la contraseña no son correctos.",
         *         "error.totp_invalido": "El código de verificación no es correcto o ya se usó.",
         *         "error.sesion_vencida": "Tu sesión venció. Ingresá de nuevo.",
         *         "error.reautenticacion_requerida": "Para esta acción tenés que volver a ingresar tu contraseña y código.",
         *         "error.origen_no_permitido": "Este sitio no está autorizado para usar la clave.",
         *         "error.desafio_invalido": "No pudimos verificar el navegador. Recargá la página e intentá de nuevo.",
         *         "error.clave_secreta_desde_navegador": "La clave secreta no se puede usar desde un navegador.",
         *         "error.alcance_insuficiente": "La credencial no permite esta operación.",
         *         "error.csrf_invalido": "No pudimos verificar el pedido. Recargá el panel.",
         *         "error.no_encontrado": "No encontramos lo que buscás.",
         *         "error.version_retirada": "Esta versión de la API ya no está disponible.",
         *         "error.estado_invalido": "La operación no corresponde en el estado actual.",
         *         "error.consentimiento_requerido": "Antes de empezar tenés que aceptar el aviso de privacidad.",
         *         "error.sesion_cerrada": "La videocotización ya terminó.",
         *         "error.cotizacion_no_emitida": "El presupuesto todavía no se emitió.",
         *         "error.contacto_ya_registrado": "Ya dejaste tus datos de contacto para esta consulta.",
         *         "error.limite_de_tasa": "Hiciste muchos pedidos seguidos. Esperá un momento.",
         *         "error.cuota_agotada": "Por ahora no hay cupo para videocotizaciones. Escribinos por WhatsApp.",
         *         "error.simultaneas_agotadas": "En este momento hay muchas videocotizaciones en curso. Probá en unos minutos.",
         *         "error.intentos_excedidos": "Hubo demasiados intentos. Esperá antes de volver a probar.",
         *         "error.limite_lecturas_contacto": "Llegaste al límite diario de lecturas de contactos.",
         *         "error.error_interno": "Tuvimos un problema. Intentá de nuevo más tarde.",
         *         "error.proveedor_no_disponible": "Un servicio que usamos no responde. Intentá de nuevo en unos minutos.",
         *         "error.servicio_no_disponible": "El servicio no está disponible en este momento.",
         *         "motivo.completada": "Completada",
         *         "motivo.cliente_cerro": "El cliente cortó",
         *         "motivo.sin_voz": "Cortada por silencio",
         *         "motivo.sin_camara": "Sin cámara",
         *         "motivo.sin_consentimiento": "Sin consentimiento",
         *         "motivo.duracion_maxima": "Duración máxima",
         *         "motivo.cuota_agotada": "Cupo agotado",
         *         "motivo.desafio_invalido": "Verificación fallida",
         *         "motivo.error_proveedor": "Falla de un servicio externo",
         *         "motivo.error_interno": "Error interno",
         *         "oficio.pintura": "Pintura",
         *         "oficio.jardineria": "Jardinería",
         *         "oficio.reparaciones": "Reparaciones",
         *         "oficio.mantenimiento": "Mantenimiento",
         *         "oficio.limpieza": "Limpieza",
         *         "zona.mar_chiquita": "Mar Chiquita",
         *         "zona.cobo": "Cobo",
         *         "zona.santa_clara": "Santa Clara del Mar",
         *         "zona.parque_lago": "Parque Lago",
         *         "zona.otra": "fuera de zona"
         *       }
         *     }
         */
        "CatalogoTextos.schema": {
            version: string;
            /** @constant */
            idioma: "es-AR";
            textos: {
                [key: string]: string;
            };
        };
        /**
         * IdAsesor
         * @description Id opaco de asesor/profesional del panel: prefijo "ase_" + 26 caracteres Crockford aleatorios (≥128 bits). R7.
         * @example ase_3JQ9QRPYDHR9HN9R6SQDKPSSW5
         */
        "IdAsesor.schema": string;
        /**
         * SesionPanel
         * @description Sesión del panel tras TOTP (id rotado, R35). Vencimientos por inactividad y absoluto (R34).
         * @example {
         *       "asesor": {
         *         "asesor_id": "ase_5M2N9BKVB4MKP71EPBCDBWS8EV",
         *         "nombre_visible": "Juan P.",
         *         "rol": "asesor"
         *       },
         *       "csrf_token": "rCcAVgku2ce_lHlEGHVjb0BzZaWS3a3Bgz4Crace5rv",
         *       "vence_inactividad_en": "2026-10-08T13:30:00Z",
         *       "vence_absoluto_en": "2026-10-09T01:00:00Z"
         *     }
         */
        "SesionPanel.schema": {
            asesor: {
                asesor_id: components["schemas"]["IdAsesor.schema"];
                nombre_visible: string;
                /** @enum {string} */
                rol: "asesor" | "administrador";
            };
            csrf_token: string;
            vence_inactividad_en: components["schemas"]["FechaHora.schema"];
            vence_absoluto_en: components["schemas"]["FechaHora.schema"];
            reautenticado_hasta?: components["schemas"]["FechaHora.schema"];
        };
        /**
         * LoginSolicitud
         * @description Primer paso del login del panel. Mensaje de error uniforme (R37).
         * @example {
         *       "email": "juan@asesores.local",
         *       "contrasena": "una-frase-larga-de-prueba-0"
         *     }
         */
        "LoginSolicitud.schema": {
            email: components["schemas"]["Email.schema"];
            contrasena: string;
        };
        /**
         * LoginPaso
         * @description Contraseña correcta: falta TOTP (R38). Se emite cookie __Host-vc_panel preliminar y un CSRF para el paso siguiente.
         * @example {
         *       "paso": "totp",
         *       "csrf_token": "1XSJcMMHC-cb3dy6BpcSlzubanTcfMpSi7NJNQzCB1U",
         *       "vence_en": "2026-10-08T13:05:00Z"
         *     }
         */
        "LoginPaso.schema": {
            /** @constant */
            paso: "totp";
            csrf_token: string;
            vence_en: components["schemas"]["FechaHora.schema"];
        };
        /**
         * TotpSolicitud
         * @description Código TOTP de 6 dígitos o código de recuperación de un uso (exactamente uno).
         * @example {
         *       "codigo": "123456"
         *     }
         * @example {
         *       "codigo_recuperacion": "AB12-CD34-EF56"
         *     }
         */
        "TotpSolicitud.schema": {
            codigo?: string;
            codigo_recuperacion?: string;
        } & ({
            codigo: unknown;
        } | {
            codigo_recuperacion: unknown;
        });
        /**
         * ReautenticacionSolicitud
         * @description Reautenticación (R39): contraseña + TOTP.
         * @example {
         *       "contrasena": "una-frase-larga-de-prueba-0",
         *       "codigo_totp": "654321"
         *     }
         */
        "ReautenticacionSolicitud.schema": {
            contrasena: string;
            codigo_totp: string;
        };
        /**
         * ReautenticacionOtorgada
         * @description Ventana de reautenticación (≤5 min).
         * @example {
         *       "valida_hasta": "2026-10-08T13:05:00Z",
         *       "valida_s": 300
         *     }
         */
        "ReautenticacionOtorgada.schema": {
            valida_hasta: components["schemas"]["FechaHora.schema"];
            valida_s: number;
        };
        /**
         * PerfilAsesor
         * @description Perfil mínimo del asesor (R40): sin DNI ni domicilio.
         * @example {
         *       "asesor_id": "ase_5M2N9BKVB4MKP71EPBCDBWS8EV",
         *       "rol": "asesor",
         *       "nombre_visible": "Juan P.",
         *       "email": "juan@asesores.local",
         *       "whatsapp": "+5492235550101",
         *       "oficios": [
         *         "pintura"
         *       ],
         *       "zonas": [
         *         "mar_chiquita"
         *       ],
         *       "totp_activo": true,
         *       "consentimiento_asesor": {
         *         "version": "2026-10-08.1",
         *         "aceptado_en": "2026-10-01T14:20:00Z"
         *       },
         *       "creado_en": "2026-10-01T14:20:00Z"
         *     }
         */
        "PerfilAsesor.schema": {
            asesor_id: components["schemas"]["IdAsesor.schema"];
            /** @enum {string} */
            rol: "asesor" | "administrador";
            nombre_visible: string;
            email: components["schemas"]["Email.schema"];
            whatsapp: components["schemas"]["Telefono.schema"];
            oficios: components["schemas"]["Oficio.schema"][];
            zonas: components["schemas"]["ZonaAtendida.schema"][];
            /** @constant */
            totp_activo: true;
            consentimiento_asesor: {
                version: components["schemas"]["VersionAviso.schema"];
                aceptado_en: components["schemas"]["FechaHora.schema"];
            };
            creado_en: components["schemas"]["FechaHora.schema"];
        };
        /**
         * PerfilActualizacion
         * @description Cambios parciales del perfil (al menos uno). Email y contraseña se cambian por rutas con reautenticación.
         * @example {
         *       "nombre_visible": "Juan Pérez"
         *     }
         */
        "PerfilActualizacion.schema": {
            nombre_visible?: string;
            whatsapp?: components["schemas"]["Telefono.schema"];
            oficios?: components["schemas"]["Oficio.schema"][];
            zonas?: components["schemas"]["ZonaAtendida.schema"][];
        };
        /**
         * CambioContrasenaSolicitud
         * @description Cambio de contraseña (requiere reautenticación previa).
         * @example {
         *       "contrasena_nueva": "otra-frase-bien-larga-0"
         *     }
         */
        "CambioContrasenaSolicitud.schema": {
            contrasena_nueva: string;
        };
        /**
         * ResumenCotizacion
         * @description Fila de "Mis cotizaciones". contacto_disponible y codigo_referencia viven SOLO acá (T39).
         * @example {
         *       "sesion_id": "ses_CT0CFF9WSKXF5C89H033AAEKVQ",
         *       "creada_en": "2026-10-08T13:00:00Z",
         *       "estado": "cerrada",
         *       "motivo_cierre": "completada",
         *       "oficio": "pintura",
         *       "zona": "mar_chiquita",
         *       "fuera_de_zona": false,
         *       "contacto_disponible": true,
         *       "resumen": "pintura en Mar Chiquita",
         *       "total": {
         *         "cotizacion_id": "cot_S5YHKWR4GFN4QEJAEMHWTDH0CE",
         *         "total_centavos": 2312500,
         *         "moneda": "ARS"
         *       },
         *       "codigo_referencia": "VC-6X0B-5RD4NC"
         *     }
         * @example {
         *       "sesion_id": "ses_Y2B1C87BRRVXZ22MPVG3Q3ZY9Q",
         *       "creada_en": "2026-10-08T05:30:00Z",
         *       "estado": "cerrada",
         *       "motivo_cierre": "sin_voz",
         *       "oficio": "pintura",
         *       "zona": "mar_chiquita",
         *       "fuera_de_zona": false,
         *       "contacto_disponible": false,
         *       "resumen": "pintura en Mar Chiquita"
         *     }
         */
        "ResumenCotizacion.schema": {
            sesion_id: components["schemas"]["IdSesion.schema"];
            creada_en: components["schemas"]["FechaHora.schema"];
            estado: components["schemas"]["EstadoSesion.schema"];
            motivo_cierre?: components["schemas"]["MotivoCierre.schema"];
            oficio?: components["schemas"]["Oficio.schema"];
            zona?: components["schemas"]["Zona.schema"];
            fuera_de_zona: boolean;
            total?: {
                cotizacion_id: components["schemas"]["IdCotizacion.schema"];
                total_centavos: components["schemas"]["Centavos.schema"];
                moneda: components["schemas"]["Moneda.schema"];
            };
            codigo_referencia?: components["schemas"]["CodigoReferencia.schema"];
            contacto_disponible: boolean;
            resumen: string;
        };
        /**
         * ListadoCotizaciones
         * @description Página de "Mis cotizaciones" (paginación por cursor).
         * @example {
         *       "items": [
         *         {
         *           "sesion_id": "ses_CT0CFF9WSKXF5C89H033AAEKVQ",
         *           "creada_en": "2026-10-08T13:00:00Z",
         *           "estado": "cerrada",
         *           "motivo_cierre": "completada",
         *           "oficio": "pintura",
         *           "zona": "mar_chiquita",
         *           "fuera_de_zona": false,
         *           "contacto_disponible": true,
         *           "resumen": "pintura en Mar Chiquita",
         *           "total": {
         *             "cotizacion_id": "cot_S5YHKWR4GFN4QEJAEMHWTDH0CE",
         *             "total_centavos": 2312500,
         *             "moneda": "ARS"
         *           },
         *           "codigo_referencia": "VC-6X0B-5RD4NC"
         *         },
         *         {
         *           "sesion_id": "ses_0NCA1Z4BJFKFFH4GBDK9N45TJR",
         *           "creada_en": "2026-10-08T11:30:00Z",
         *           "estado": "cerrada",
         *           "motivo_cierre": "completada",
         *           "oficio": "jardineria",
         *           "zona": "santa_clara",
         *           "fuera_de_zona": false,
         *           "contacto_disponible": false,
         *           "resumen": "jardineria en Santa Clara del Mar",
         *           "total": {
         *             "cotizacion_id": "cot_N673TX2ERF818D58BNBSH3VKHA",
         *             "total_centavos": 13987656,
         *             "moneda": "ARS"
         *           },
         *           "codigo_referencia": "VC-JFGD-X4DDYV"
         *         }
         *       ],
         *       "siguiente_cursor": "sT8wj58x5xAIWhIXBYt3bgkz"
         *     }
         */
        "ListadoCotizaciones.schema": {
            items: components["schemas"]["ResumenCotizacion.schema"][];
            siguiente_cursor?: string;
        };
        /**
         * DatosExtraidos
         * @description Datos de la consulta ya validados y normalizados por Go a partir de la salida del LLM (R42, R48). Sin montos (O03) ni campos sobre personas (R47).
         * @example {
         *       "oficio": "pintura",
         *       "zona": "cobo",
         *       "fuera_de_zona": false,
         *       "faltantes": [],
         *       "corregido_por_cliente": true,
         *       "tarea": "pintura_interior",
         *       "superficie_centesimas_m2": 1625,
         *       "interior_exterior": "exterior",
         *       "altura": "hasta_3m",
         *       "estado_superficie": "regular",
         *       "urgencia": "media",
         *       "plazo": "esta_semana",
         *       "observaciones": "El cliente mostró manchas de humedad en la pared norte."
         *     }
         */
        "DatosExtraidos.schema": {
            oficio: components["schemas"]["Oficio.schema"];
            tarea?: string;
            zona: components["schemas"]["Zona.schema"];
            fuera_de_zona: boolean;
            superficie_centesimas_m2?: components["schemas"]["CantidadCentesimas.schema"];
            cantidad_unidades?: number;
            /** @enum {string} */
            interior_exterior?: "interior" | "exterior" | "ambos" | "no_aplica";
            /** @enum {string} */
            altura?: "planta_baja" | "hasta_3m" | "entre_3_y_6m" | "mas_de_6m" | "no_aplica";
            /** @enum {string} */
            estado_superficie?: "bueno" | "regular" | "malo" | "con_humedad" | "descascarado" | "con_hongos" | "no_aplica" | "sin_definir";
            /** @enum {string} */
            urgencia?: "baja" | "media" | "alta" | "sin_definir";
            /** @enum {string} */
            plazo?: "inmediato" | "esta_semana" | "este_mes" | "mas_de_un_mes" | "flexible" | "sin_definir";
            observaciones?: string;
            faltantes: string[];
            corregido_por_cliente: boolean;
        };
        /**
         * Salida estructurada del LLM de VideoCotizacion (T05)
         * @description Lo que el LLM devuelve en cada turno. NO contiene montos ni precios: el precio lo calcula Go desde tarifas/ (ADR 0002). additionalProperties:false impide colar campos como precio/monto.
         */
        "esquema-salida-llm.schema": {
            /** @constant */
            version: "1.0";
            /**
             * @description Rubro principal detectado.
             * @enum {unknown}
             */
            oficio: "pintura" | "jardineria" | "paisajismo" | "mantenimiento" | "reparaciones" | "limpieza" | "otro" | "sin_definir";
            trabajo: {
                /** @enum {unknown} */
                tipo: "pintura_interior" | "pintura_exterior" | "pintura_fachada_altura" | "impermeabilizacion_techo" | "pintura_rejas_aberturas" | "corte_cesped" | "poda" | "desmalezado" | "mantenimiento_jardin_periodico" | "parquizacion" | "diseno_paisajismo" | "riego" | "limpieza_terreno" | "limpieza_final_obra" | "reparacion_general" | "otro" | "sin_definir";
                descripcion: string;
                /** @default false */
                requiere_planos: boolean;
                /**
                 * @default sin_definir
                 * @enum {unknown}
                 */
                complejidad: "simple" | "media" | "tecnica" | "sin_definir";
                jornadas_estimadas?: number | null;
            };
            medidas: {
                concepto: string;
                cantidad: number;
                /** @enum {unknown} */
                unidad: "m2" | "ml" | "m3" | "unidad" | "ambiente" | "arbol" | "jornada" | "ha";
                /** @enum {unknown} */
                origen: "dicho_por_cliente" | "visto_en_camara" | "estimado" | "plano";
            }[];
            altura: {
                metros_max: number | null;
                /** @enum {unknown} */
                requiere_andamio: "si" | "no" | "sin_definir";
                /**
                 * @default sin_definir
                 * @enum {unknown}
                 */
                medio: "escalera" | "andamio" | "silleta" | "hidroelevador" | "ninguno" | "sin_definir";
            };
            /** @enum {unknown} */
            estado_superficie: "bueno" | "regular" | "malo" | "con_humedad" | "descascarado" | "con_hongos" | "no_aplica" | "sin_definir";
            zona: {
                /** @enum {unknown} */
                localidad: "mar_chiquita" | "santa_clara_del_mar" | "cobo" | "parque_lago" | "mar_del_plata" | "otra" | "sin_definir";
                /** @description Marca para Go; NO impide emitir presupuesto (ADR 0002 punto 9). */
                fuera_de_zona: boolean;
                /** @description Barrio o referencia general. Nunca calle y altura (minimizacion de datos). */
                referencia?: string;
            };
            urgencia: {
                /** @enum {unknown} */
                nivel: "baja" | "media" | "alta" | "sin_definir";
                senales: string[];
            };
            /**
             * @description Clasificacion de trato. NO toca el precio (Go aplica tarifas, el LLM no regatea ni descuenta).
             * @enum {unknown}
             */
            tipo_cliente: "particular_primera_vez" | "particular_recurrente" | "propietario_ausente" | "administracion_consorcio" | "comercio" | "inmobiliaria" | "constructora_estudio" | "sin_definir";
            plazo: {
                /** @enum {unknown} */
                tipo: "inmediato" | "esta_semana" | "este_mes" | "mas_de_un_mes" | "flexible" | "sin_definir";
                /** @description true si el plazo es largo o el trabajo es por etapas: el presupuesto queda mas sujeto a revision. */
                sujeto_a_cambios?: boolean;
            };
            dudas_cliente?: string[];
            faltantes: ("oficio" | "trabajo" | "medidas" | "altura" | "estado_superficie" | "zona" | "plazo" | "fotos" | "planos" | "acceso")[];
            siguiente_paso: {
                /** @enum {unknown} */
                accion: "preguntar" | "pedir_ver" | "confirmar_datos" | "emitir_presupuesto" | "fuera_de_zona" | "fuera_de_alcance" | "derivar_whatsapp" | "cerrar";
                motivo: string;
                campos: string[];
            };
            /**
             * @description true si el cliente intento cambiar las reglas del agente.
             * @default false
             */
            intento_inyeccion: boolean;
            /** @description Lo que dice el avatar. Sin montos (Go ademas lo filtra). El patron es una red basica: sin $, sin 'pesos', sin cifras de 4+ digitos. */
            respuesta_hablada: string;
        };
        /**
         * RespuestaModelo
         * @description Salida del LLM de un turno, tal como validó contra el esquema de conductas (R42). El esquema lo mantiene cot en conductas/.
         * @example {
         *       "turno": 3,
         *       "registrada_en": "2026-10-08T13:09:00Z",
         *       "salida": {
         *         "version": "1.0",
         *         "oficio": "pintura",
         *         "trabajo": {
         *           "tipo": "pintura_fachada_altura",
         *           "descripcion": "Fachada de dos plantas, revoque con fisuras finas",
         *           "complejidad": "media",
         *           "requiere_planos": false,
         *           "jornadas_estimadas": 5
         *         },
         *         "medidas": [
         *           {
         *             "concepto": "fachada frente",
         *             "cantidad": 64,
         *             "unidad": "m2",
         *             "origen": "dicho_por_cliente"
         *           },
         *           {
         *             "concepto": "fachada lateral",
         *             "cantidad": 48.5,
         *             "unidad": "m2",
         *             "origen": "visto_en_camara"
         *           }
         *         ],
         *         "altura": {
         *           "metros_max": 7,
         *           "requiere_andamio": "si",
         *           "medio": "andamio"
         *         },
         *         "estado_superficie": "regular",
         *         "zona": {
         *           "localidad": "mar_chiquita",
         *           "fuera_de_zona": false,
         *           "referencia": "cerca de la laguna"
         *         },
         *         "urgencia": {
         *           "nivel": "media",
         *           "senales": [
         *             "quiere terminar antes del verano"
         *           ]
         *         },
         *         "tipo_cliente": "particular_recurrente",
         *         "plazo": {
         *           "tipo": "este_mes",
         *           "sujeto_a_cambios": false
         *         },
         *         "faltantes": [],
         *         "siguiente_paso": {
         *           "accion": "emitir_presupuesto",
         *           "motivo": "Datos completos: superficie, altura, estado y zona",
         *           "campos": [
         *             "medidas",
         *             "altura",
         *             "estado_superficie",
         *             "zona"
         *           ]
         *         },
         *         "respuesta_hablada": "Perfecto, con esto ya tengo todo. Te armo el presupuesto orientativo con andamio incluido y te lo muestro al final."
         *       }
         *     }
         */
        "RespuestaModelo.schema": {
            turno: number;
            registrada_en: components["schemas"]["FechaHora.schema"];
            salida: components["schemas"]["esquema-salida-llm.schema"];
        };
        /**
         * SesionDetalle
         * @description Detalle de una consulta para el asesor. SIN código de referencia, SIN derivación y SIN contacto_disponible (T39). Leerlo deja fila en el registro de lecturas (R69).
         * @example {
         *       "sesion_id": "ses_XSC3X2V37K672NXJ3YBRKTJ4PC",
         *       "estado": "cerrada",
         *       "modo_avatar": "3d",
         *       "creada_en": "2026-10-08T13:00:00Z",
         *       "cerrada_en": "2026-10-08T13:14:00Z",
         *       "motivo_cierre": "completada",
         *       "duracion_s": 780,
         *       "datos_extraidos": {
         *         "oficio": "pintura",
         *         "zona": "otra",
         *         "fuera_de_zona": true,
         *         "faltantes": [],
         *         "corregido_por_cliente": false,
         *         "tarea": "pintura_interior",
         *         "superficie_centesimas_m2": 1250,
         *         "interior_exterior": "interior",
         *         "altura": "planta_baja",
         *         "estado_superficie": "bueno",
         *         "urgencia": "baja",
         *         "plazo": "inmediato"
         *       },
         *       "resumen": "Consulta de pintura en fuera de zona (fuera de zona, se emitió igual).",
         *       "versiones": {
         *         "tarifas": "2026.1",
         *         "prompt": "conducta_pintura@755b9690b387",
         *         "esquema_salida": "1.0.0"
         *       },
         *       "cotizacion": {
         *         "cotizacion_id": "cot_GZSK8TSNY38HM5VJRA3WX60M8T",
         *         "sesion_id": "ses_XSC3X2V37K672NXJ3YBRKTJ4PC",
         *         "emitida_en": "2026-10-08T13:20:00Z",
         *         "moneda": "ARS",
         *         "oficio": "pintura",
         *         "zona": "otra",
         *         "fuera_de_zona": true,
         *         "items": [
         *           {
         *             "tipo": "mano_de_obra",
         *             "codigo_tarea": "pintura_interior",
         *             "descripcion": "Pintura interior látex, dos manos",
         *             "unidad": "m2",
         *             "cantidad_centesimas": 1250,
         *             "precio_unitario_centavos": 185000,
         *             "importe_centavos": 2312500
         *           },
         *           {
         *             "tipo": "traslado",
         *             "codigo_tarea": "traslado_fuera_de_zona",
         *             "descripcion": "Traslado fuera de zona (a confirmar por el asesor)",
         *             "unidad": "global",
         *             "cantidad_centesimas": 100,
         *             "precio_unitario_centavos": 1500000,
         *             "importe_centavos": 1500000
         *           }
         *         ],
         *         "total_centavos": 3812500,
         *         "orientativa": true,
         *         "leyenda": "Presupuesto orientativo fuera de zona: el profesional confirma traslado y precio final.",
         *         "tarifas": {
         *           "version": "2026.1",
         *           "estado": "referencia_publica_sin_validar"
         *         },
         *         "validez_dias": 15
         *       }
         *     }
         * @example {
         *       "sesion_id": "ses_1BS3WDJNVQAFG86V2QZDA17ASV",
         *       "estado": "cerrada",
         *       "modo_avatar": "3d",
         *       "creada_en": "2026-10-08T13:00:00Z",
         *       "cerrada_en": "2026-10-08T13:14:00Z",
         *       "motivo_cierre": "completada",
         *       "duracion_s": 782,
         *       "datos_extraidos": {
         *         "oficio": "pintura",
         *         "zona": "cobo",
         *         "fuera_de_zona": false,
         *         "faltantes": [],
         *         "corregido_por_cliente": false,
         *         "tarea": "pintura_interior",
         *         "superficie_centesimas_m2": 2000,
         *         "interior_exterior": "ambos",
         *         "altura": "entre_3_y_6m",
         *         "estado_superficie": "con_humedad",
         *         "urgencia": "alta",
         *         "plazo": "este_mes"
         *       },
         *       "resumen": "Consulta de pintura en Cobo.",
         *       "versiones": {
         *         "tarifas": "2026.1",
         *         "prompt": "conducta_pintura@755b9690b387",
         *         "esquema_salida": "1.0.0"
         *       },
         *       "cotizacion": {
         *         "cotizacion_id": "cot_QFWB65XX87FMF7EGZTGNWR58NV",
         *         "sesion_id": "ses_1BS3WDJNVQAFG86V2QZDA17ASV",
         *         "emitida_en": "2026-10-08T13:22:00Z",
         *         "moneda": "ARS",
         *         "oficio": "pintura",
         *         "zona": "cobo",
         *         "fuera_de_zona": false,
         *         "items": [
         *           {
         *             "tipo": "mano_de_obra",
         *             "codigo_tarea": "pintura_interior",
         *             "descripcion": "Pintura interior látex, dos manos",
         *             "unidad": "m2",
         *             "cantidad_centesimas": 2000,
         *             "precio_unitario_centavos": 185014,
         *             "importe_centavos": 3700280
         *           },
         *           {
         *             "tipo": "mano_de_obra",
         *             "codigo_tarea": "preparacion_superficie",
         *             "descripcion": "Lijado y enduido de paredes",
         *             "unidad": "m2",
         *             "cantidad_centesimas": 2375,
         *             "precio_unitario_centavos": 90021,
         *             "importe_centavos": 2137999
         *           },
         *           {
         *             "tipo": "mano_de_obra",
         *             "codigo_tarea": "pintura_exterior",
         *             "descripcion": "Pintura exterior acrílica",
         *             "unidad": "m2",
         *             "cantidad_centesimas": 2750,
         *             "precio_unitario_centavos": 240028,
         *             "importe_centavos": 6600770
         *           }
         *         ],
         *         "total_centavos": 12439049,
         *         "orientativa": true,
         *         "leyenda": "Presupuesto orientativo: el profesional lo confirma al ver el trabajo.",
         *         "tarifas": {
         *           "version": "2026.1",
         *           "estado": "referencia_publica_sin_validar"
         *         },
         *         "validez_dias": 15
         *       },
         *       "respuestas_modelo": [
         *         {
         *           "turno": 3,
         *           "registrada_en": "2026-10-08T13:09:00Z",
         *           "salida": {
         *             "version": "1.0",
         *             "oficio": "pintura",
         *             "trabajo": {
         *               "tipo": "pintura_fachada_altura",
         *               "descripcion": "Fachada de dos plantas, revoque con fisuras finas",
         *               "complejidad": "media",
         *               "requiere_planos": false,
         *               "jornadas_estimadas": 5
         *             },
         *             "medidas": [
         *               {
         *                 "concepto": "fachada frente",
         *                 "cantidad": 64,
         *                 "unidad": "m2",
         *                 "origen": "dicho_por_cliente"
         *               },
         *               {
         *                 "concepto": "fachada lateral",
         *                 "cantidad": 48.5,
         *                 "unidad": "m2",
         *                 "origen": "visto_en_camara"
         *               }
         *             ],
         *             "altura": {
         *               "metros_max": 7,
         *               "requiere_andamio": "si",
         *               "medio": "andamio"
         *             },
         *             "estado_superficie": "regular",
         *             "zona": {
         *               "localidad": "mar_chiquita",
         *               "fuera_de_zona": false,
         *               "referencia": "cerca de la laguna"
         *             },
         *             "urgencia": {
         *               "nivel": "media",
         *               "senales": [
         *                 "quiere terminar antes del verano"
         *               ]
         *             },
         *             "tipo_cliente": "particular_recurrente",
         *             "plazo": {
         *               "tipo": "este_mes",
         *               "sujeto_a_cambios": false
         *             },
         *             "faltantes": [],
         *             "siguiente_paso": {
         *               "accion": "emitir_presupuesto",
         *               "motivo": "Datos completos: superficie, altura, estado y zona",
         *               "campos": [
         *                 "medidas",
         *                 "altura",
         *                 "estado_superficie",
         *                 "zona"
         *               ]
         *             },
         *             "respuesta_hablada": "Perfecto, con esto ya tengo todo. Te armo el presupuesto orientativo con andamio incluido y te lo muestro al final."
         *           }
         *         }
         *       ]
         *     }
         */
        "SesionDetalle.schema": {
            sesion_id: components["schemas"]["IdSesion.schema"];
            estado: components["schemas"]["EstadoSesion.schema"];
            modo_avatar: components["schemas"]["ModoAvatar.schema"];
            creada_en: components["schemas"]["FechaHora.schema"];
            cerrada_en?: components["schemas"]["FechaHora.schema"];
            motivo_cierre?: components["schemas"]["MotivoCierre.schema"];
            duracion_s: number;
            datos_extraidos?: components["schemas"]["DatosExtraidos.schema"];
            cotizacion?: components["schemas"]["Cotizacion.schema"];
            resumen: string;
            versiones: {
                tarifas: string;
                prompt: string;
                esquema_salida: string;
            };
            respuestas_modelo?: components["schemas"]["RespuestaModelo.schema"][];
        };
        /**
         * IdRegistro
         * @description Id opaco de fila del registro de lecturas: prefijo "reg_" + 26 caracteres Crockford aleatorios (≥128 bits). R7.
         * @example reg_4C5GRPHASN3K3ETR76NMDDTFP6
         */
        "IdRegistro.schema": string;
        /**
         * ContactoCliente
         * @description Contacto del cliente: solo para el asesor de esa consulta y si hubo consentimiento (R68). Cada lectura queda registrada y tiene límite diario (R69).
         * @example {
         *       "sesion_id": "ses_SX2NE9K3Z89ZMZHZHV6ZR2J79H",
         *       "nombre": "Carlos",
         *       "consentido_en": "2026-10-08T13:16:00Z",
         *       "aviso_version": "2026-10-08.1",
         *       "lectura": {
         *         "registro_id": "reg_916KPKQ91R99GN90D0SN9M59QR",
         *         "lecturas_restantes_hoy": 19
         *       },
         *       "telefono": "+5492235551001",
         *       "email": "cliente1@correo.local",
         *       "preferencia": "llamada"
         *     }
         */
        "ContactoCliente.schema": {
            sesion_id: components["schemas"]["IdSesion.schema"];
            nombre: string;
            telefono?: components["schemas"]["Telefono.schema"];
            email?: components["schemas"]["Email.schema"];
            /** @enum {string} */
            preferencia?: "whatsapp" | "llamada" | "email";
            consentido_en: components["schemas"]["FechaHora.schema"];
            aviso_version: components["schemas"]["VersionAviso.schema"];
            lectura: {
                registro_id: components["schemas"]["IdRegistro.schema"];
                lecturas_restantes_hoy: number;
            };
        };
        /**
         * RegistroLectura
         * @description Fila del registro solo-anexar (R69, R70): solo ids, sin datos personales.
         * @example {
         *       "registro_id": "reg_MQR6KABWWFZXSKRH3NTB1ZW122",
         *       "ocurrido_en": "2026-10-08T13:00:00Z",
         *       "asesor_id": "ase_5M2N9BKVB4MKP71EPBCDBWS8EV",
         *       "accion": "ver_detalle",
         *       "recurso_id": "ses_FFPS51S06FXAT3HXHKKKAS7A38"
         *     }
         * @example {
         *       "registro_id": "reg_4C5GRPHASN3K3ETR76NMDDTFP6",
         *       "ocurrido_en": "2026-10-08T12:53:00Z",
         *       "asesor_id": "ase_3JQ9QRPYDHR9HN9R6SQDKPSSW5",
         *       "accion": "ver_contacto",
         *       "recurso_id": "ses_SX2NE9K3Z89ZMZHZHV6ZR2J79H"
         *     }
         */
        "RegistroLectura.schema": {
            registro_id: components["schemas"]["IdRegistro.schema"];
            ocurrido_en: components["schemas"]["FechaHora.schema"];
            asesor_id: components["schemas"]["IdAsesor.schema"];
            /** @enum {string} */
            accion: "ver_detalle" | "ver_contacto" | "exportar_mi_cuenta" | "rotar_enlace" | "crear_clave_widget" | "revocar_clave_widget" | "inicio_sesion" | "cambio_contrasena";
            recurso_id?: string;
        };
        /**
         * ListadoRegistros
         * @description Página de "Registros".
         * @example {
         *       "items": [
         *         {
         *           "registro_id": "reg_MQR6KABWWFZXSKRH3NTB1ZW122",
         *           "ocurrido_en": "2026-10-08T13:00:00Z",
         *           "asesor_id": "ase_5M2N9BKVB4MKP71EPBCDBWS8EV",
         *           "accion": "ver_detalle",
         *           "recurso_id": "ses_FFPS51S06FXAT3HXHKKKAS7A38"
         *         },
         *         {
         *           "registro_id": "reg_4C5GRPHASN3K3ETR76NMDDTFP6",
         *           "ocurrido_en": "2026-10-08T12:53:00Z",
         *           "asesor_id": "ase_3JQ9QRPYDHR9HN9R6SQDKPSSW5",
         *           "accion": "ver_contacto",
         *           "recurso_id": "ses_SX2NE9K3Z89ZMZHZHV6ZR2J79H"
         *         }
         *       ]
         *     }
         */
        "ListadoRegistros.schema": {
            items: components["schemas"]["RegistroLectura.schema"][];
            siguiente_cursor?: string;
        };
        /**
         * EnlaceCompartir
         * @description Enlace opaco del profesional y texto listo para compartir.
         * @example {
         *       "id_publico": "RYZ4c3qAHifF6Rh4XEo3fG",
         *       "url": "https://cotizar.videocotizacion.local/c/RYZ4c3qAHifF6Rh4XEo3fG",
         *       "texto_compartir": "Pedí tu presupuesto por videollamada: https://cotizar.videocotizacion.local/c/RYZ4c3qAHifF6Rh4XEo3fG"
         *     }
         */
        "EnlaceCompartir.schema": {
            id_publico: components["schemas"]["IdPublicoEnlace.schema"];
            url: string;
            texto_compartir: string;
            rotado_en?: components["schemas"]["FechaHora.schema"];
        };
        /**
         * IdClaveWidget
         * @description Id opaco de clave pública del widget (id de gestión, no el secreto): prefijo "cpw_" + 26 caracteres Crockford aleatorios (≥128 bits). R7.
         * @example cpw_ZKWA18CB675A5VQR44CQD0NDXA
         */
        "IdClaveWidget.schema": string;
        /**
         * ClaveWidget
         * @description Clave pública del widget (vista de gestión, sin el secreto).
         * @example {
         *       "clave_id": "cpw_F47FE4NAE2YBQ039R346YGWPPB",
         *       "nombre": "Sitio principal",
         *       "prefijo": "vc_pub_NlwcBG",
         *       "origins": [
         *         "https://cotizar.videocotizacion.local"
         *       ],
         *       "estado": "activa",
         *       "creada_en": "2026-10-05T01:40:00Z"
         *     }
         * @example {
         *       "clave_id": "cpw_ZKWA18CB675A5VQR44CQD0NDXA",
         *       "nombre": "Landing jardinería",
         *       "prefijo": "vc_pub__Sm50i",
         *       "origins": [
         *         "https://cotizar.videocotizacion.local",
         *         "https://www.videocotizacion.local"
         *       ],
         *       "estado": "revocada",
         *       "creada_en": "2026-10-05T01:39:00Z",
         *       "revocada_en": "2026-10-08T12:50:00Z",
         *       "ultimo_uso_en": "2026-10-08T12:00:00Z"
         *     }
         */
        "ClaveWidget.schema": {
            clave_id: components["schemas"]["IdClaveWidget.schema"];
            nombre: string;
            prefijo: string;
            origins: components["schemas"]["Origin.schema"][];
            /** @enum {string} */
            estado: "activa" | "revocada";
            creada_en: components["schemas"]["FechaHora.schema"];
            revocada_en?: components["schemas"]["FechaHora.schema"];
            ultimo_uso_en?: components["schemas"]["FechaHora.schema"];
        };
        /**
         * ListadoClavesWidget
         * @description Claves públicas del tenant.
         * @example {
         *       "items": [
         *         {
         *           "clave_id": "cpw_F47FE4NAE2YBQ039R346YGWPPB",
         *           "nombre": "Sitio principal",
         *           "prefijo": "vc_pub_NlwcBG",
         *           "origins": [
         *             "https://cotizar.videocotizacion.local"
         *           ],
         *           "estado": "activa",
         *           "creada_en": "2026-10-05T01:40:00Z"
         *         }
         *       ]
         *     }
         */
        "ListadoClavesWidget.schema": {
            items: components["schemas"]["ClaveWidget.schema"][];
        };
        /**
         * ClaveWidgetSolicitud
         * @description Alta de clave pública con su lista de Origin exactos (R54, R55).
         * @example {
         *       "nombre": "Landing jardinería",
         *       "origins": [
         *         "https://cotizar.videocotizacion.local",
         *         "https://socio.ejemplo.local:8443"
         *       ]
         *     }
         */
        "ClaveWidgetSolicitud.schema": {
            nombre: string;
            origins: components["schemas"]["Origin.schema"][];
        };
        /**
         * ClaveWidgetCreada
         * @description Alta de clave: el valor completo se muestra UNA sola vez (secreto único, T37); después solo el prefijo.
         * @example {
         *       "clave": {
         *         "clave_id": "cpw_F47FE4NAE2YBQ039R346YGWPPB",
         *         "nombre": "Sitio principal",
         *         "prefijo": "vc_pub_NlwcBG",
         *         "origins": [
         *           "https://cotizar.videocotizacion.local"
         *         ],
         *         "estado": "activa",
         *         "creada_en": "2026-10-05T01:40:00Z"
         *       },
         *       "valor": "vc_pub_NlwcBGzvreOVir5L_PAP9tzo0DeWwXpwIKaHN-Md",
         *       "se_muestra_una_sola_vez": true
         *     }
         */
        "ClaveWidgetCreada.schema": {
            clave: components["schemas"]["ClaveWidget.schema"];
            valor: string;
            /** @constant */
            se_muestra_una_sola_vez: true;
        };
        /**
         * ExportacionMiCuenta
         * @description Exportación de los datos propios del asesor (R49).
         * @example {
         *       "formato_version": "1",
         *       "generada_en": "2026-10-08T13:03:00Z",
         *       "perfil": {
         *         "asesor_id": "ase_5M2N9BKVB4MKP71EPBCDBWS8EV",
         *         "rol": "asesor",
         *         "nombre_visible": "Juan P.",
         *         "email": "juan@asesores.local",
         *         "whatsapp": "+5492235550101",
         *         "oficios": [
         *           "pintura"
         *         ],
         *         "zonas": [
         *           "mar_chiquita"
         *         ],
         *         "totp_activo": true,
         *         "consentimiento_asesor": {
         *           "version": "2026-10-08.1",
         *           "aceptado_en": "2026-10-01T14:20:00Z"
         *         },
         *         "creado_en": "2026-10-01T14:20:00Z"
         *       },
         *       "lecturas": [
         *         {
         *           "registro_id": "reg_MQR6KABWWFZXSKRH3NTB1ZW122",
         *           "ocurrido_en": "2026-10-08T13:00:00Z",
         *           "asesor_id": "ase_5M2N9BKVB4MKP71EPBCDBWS8EV",
         *           "accion": "ver_detalle",
         *           "recurso_id": "ses_FFPS51S06FXAT3HXHKKKAS7A38"
         *         },
         *         {
         *           "registro_id": "reg_4C5GRPHASN3K3ETR76NMDDTFP6",
         *           "ocurrido_en": "2026-10-08T12:53:00Z",
         *           "asesor_id": "ase_3JQ9QRPYDHR9HN9R6SQDKPSSW5",
         *           "accion": "ver_contacto",
         *           "recurso_id": "ses_SX2NE9K3Z89ZMZHZHV6ZR2J79H"
         *         }
         *       ],
         *       "consumo": {
         *         "ambito": "asesor",
         *         "periodo": "2026-10",
         *         "segundos_usados": 0,
         *         "segundos_tope": 30000,
         *         "simultaneas_en_curso": 0,
         *         "simultaneas_tope": 5,
         *         "alerta": "ninguna",
         *         "diario": [],
         *         "actualizado_en": "2026-10-08T13:05:00Z"
         *       }
         *     }
         */
        "ExportacionMiCuenta.schema": {
            /** @constant */
            formato_version: "1";
            generada_en: components["schemas"]["FechaHora.schema"];
            perfil: components["schemas"]["PerfilAsesor.schema"];
            lecturas: components["schemas"]["RegistroLectura.schema"][];
            consumo: components["schemas"]["Consumo.schema"];
        };
    };
    responses: never;
    parameters: {
        /** @description Id de la sesión. */
        sesion_id: components["schemas"]["IdSesion.schema"];
        /** @description id_publico del enlace opaco del profesional. */
        id_publico: components["schemas"]["IdPublicoEnlace.schema"];
        /** @description Id de gestión de la clave pública. */
        clave_id: components["schemas"]["IdClaveWidget.schema"];
        /** @description Origin del navegador; debe estar en la lista exacta de la clave pública (R55). */
        Origin: components["schemas"]["Origin.schema"];
        /** @description Obligatorio con clave pública. Con clave secreta su presencia provoca 403 clave_secreta_desde_navegador (R2). */
        OriginOpcional: components["schemas"]["Origin.schema"];
        /** @description Reintento seguro de crearSesion (24 h). */
        IdempotencyKey: string;
        /** @description Cursor opaco de la página siguiente. */
        cursor: string;
        /** @description Tamaño de página (1–100, por defecto 20). */
        limite: number;
        /** @description Filtro por oficio. */
        oficio: components["schemas"]["Oficio.schema"];
        /** @description Desde (fecha, inclusive). */
        desde: string;
        /** @description Hasta (fecha, inclusive). */
        hasta: string;
        /** @description Mes AAAA-MM (por defecto el actual). */
        periodo: string;
    };
    requestBodies: never;
    headers: {
        /** @description Segundos hasta poder reintentar (R8, R57). */
        RetryAfter: number;
        /** @description Cookie de sesión del panel: Secure, HttpOnly, SameSite=Strict, Path=/, sin Domain (R33). */
        SetCookiePanel: string;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    leerEnlacePublico: {
        parameters: {
            query?: never;
            header: {
                /** @description Origin del navegador; debe estar en la lista exacta de la clave pública (R55). */
                Origin: components["parameters"]["Origin"];
            };
            path: {
                /** @description id_publico del enlace opaco del profesional. */
                id_publico: components["parameters"]["id_publico"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnlacePublico.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    emitirDesafio: {
        parameters: {
            query?: never;
            header: {
                /** @description Origin del navegador; debe estar en la lista exacta de la clave pública (R55). */
                Origin: components["parameters"]["Origin"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DesafioEmitido.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerAvisoPrivacidad: {
        parameters: {
            query?: never;
            header?: {
                /** @description Obligatorio con clave pública. Con clave secreta su presencia provoca 403 clave_secreta_desde_navegador (R2). */
                Origin?: components["parameters"]["OriginOpcional"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AvisoPrivacidad.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    crearSesion: {
        parameters: {
            query?: never;
            header?: {
                /** @description Obligatorio con clave pública. Con clave secreta su presencia provoca 403 clave_secreta_desde_navegador (R2). */
                Origin?: components["parameters"]["OriginOpcional"];
                /** @description Reintento seguro de crearSesion (24 h). */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrearSesionSolicitud.schema"];
            };
        };
        responses: {
            /** @description Creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SesionCreada.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerSesion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de la sesión. */
                sesion_id: components["parameters"]["sesion_id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Sesion.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    registrarConsentimiento: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de la sesión. */
                sesion_id: components["parameters"]["sesion_id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConsentimientoSolicitud.schema"];
            };
        };
        responses: {
            /** @description Creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConsentimientoRegistrado.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Conflicto de estado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    emitirTokenMedios: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de la sesión. */
                sesion_id: components["parameters"]["sesion_id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokenMedios.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Conflicto de estado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No disponible */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    cerrarSesion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de la sesión. */
                sesion_id: components["parameters"]["sesion_id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CierreSolicitud.schema"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CierreSesion.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Conflicto de estado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerCotizacion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de la sesión. */
                sesion_id: components["parameters"]["sesion_id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Cotizacion.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Conflicto de estado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerDerivacion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de la sesión. */
                sesion_id: components["parameters"]["sesion_id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DerivacionWhatsApp.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Conflicto de estado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    registrarContacto: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de la sesión. */
                sesion_id: components["parameters"]["sesion_id"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContactoSolicitud.schema"];
            };
        };
        responses: {
            /** @description Creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactoRegistrado.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Conflicto de estado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    crearSolicitudArco: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SolicitudArco.schema"];
            };
        };
        responses: {
            /** @description Aceptado */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SolicitudArcoRecibida.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerRetencion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TablaRetencion.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerConsumo: {
        parameters: {
            query?: {
                /** @description Mes AAAA-MM (por defecto el actual). */
                periodo?: components["parameters"]["periodo"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Consumo.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerVersion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Version.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerCatalogoTextos: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogoTextos.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerSesionPanel: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SesionPanel.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    iniciarSesionPanel: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginSolicitud.schema"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    "Set-Cookie": components["headers"]["SetCookiePanel"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginPaso.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    cerrarSesionPanel: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sin contenido */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    verificarTotp: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TotpSolicitud.schema"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    "Set-Cookie": components["headers"]["SetCookiePanel"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SesionPanel.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    reautenticar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReautenticacionSolicitud.schema"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReautenticacionOtorgada.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerPerfil: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PerfilAsesor.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    actualizarPerfil: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PerfilActualizacion.schema"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PerfilAsesor.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    cambiarContrasena: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CambioContrasenaSolicitud.schema"];
            };
        };
        responses: {
            /** @description Sin contenido */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    listarMisCotizaciones: {
        parameters: {
            query?: {
                /** @description Cursor opaco de la página siguiente. */
                cursor?: components["parameters"]["cursor"];
                /** @description Tamaño de página (1–100, por defecto 20). */
                limite?: components["parameters"]["limite"];
                /** @description Filtro por oficio. */
                oficio?: components["parameters"]["oficio"];
                /** @description Desde (fecha, inclusive). */
                desde?: components["parameters"]["desde"];
                /** @description Hasta (fecha, inclusive). */
                hasta?: components["parameters"]["hasta"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListadoCotizaciones.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerMiCotizacion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de la sesión. */
                sesion_id: components["parameters"]["sesion_id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SesionDetalle.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerContactoCliente: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de la sesión. */
                sesion_id: components["parameters"]["sesion_id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ContactoCliente.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    listarRegistros: {
        parameters: {
            query?: {
                /** @description Cursor opaco de la página siguiente. */
                cursor?: components["parameters"]["cursor"];
                /** @description Tamaño de página (1–100, por defecto 20). */
                limite?: components["parameters"]["limite"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListadoRegistros.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerConsumoPanel: {
        parameters: {
            query?: {
                /** @description Mes AAAA-MM (por defecto el actual). */
                periodo?: components["parameters"]["periodo"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Consumo.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    leerEnlaceCompartir: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnlaceCompartir.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    rotarEnlace: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnlaceCompartir.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    listarClavesWidget: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListadoClavesWidget.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    crearClaveWidget: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClaveWidgetSolicitud.schema"];
            };
        };
        responses: {
            /** @description Creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClaveWidgetCreada.schema"];
                };
            };
            /** @description Solicitud inválida */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Pedido demasiado grande */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Tipo no soportado */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Datos inválidos */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    revocarClaveWidget: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Id de gestión de la clave pública. */
                clave_id: components["parameters"]["clave_id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sin contenido */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description No encontrado (idéntico para inexistente y ajeno) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
    exportarMiCuenta: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExportacionMiCuenta.schema"];
                };
            };
            /** @description No autenticado (ver `codigo`) */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Prohibido (ver `codigo`) */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Límite o cupo (ver `codigo`) */
            429: {
                headers: {
                    "Retry-After": components["headers"]["RetryAfter"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
            /** @description Error interno */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Error.schema"];
                };
            };
        };
    };
}
