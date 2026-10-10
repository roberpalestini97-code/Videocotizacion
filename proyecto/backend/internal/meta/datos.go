package meta

import (
	"encoding/json"
	"io"
)

type versionAPI struct {
	API           string        `json:"api"`
	EstadoAPI     string        `json:"estado_api"`
	EventosSesion eventosSesion `json:"eventos_sesion"`
	Deprecaciones []deprecacion `json:"deprecaciones"`
}

type eventosSesion struct {
	Version string `json:"version"`
	Estado  string `json:"estado"`
}

type deprecacion struct {
	Operacion string `json:"operacion"`
	Desde     string `json:"desde"`
	Retiro    string `json:"retiro"`
}

func version() versionAPI {
	return versionAPI{
		API:           VersionContrato,
		EstadoAPI:     "borrador",
		EventosSesion: eventosSesion{Version: VersionEventos, Estado: "borrador"},
		Deprecaciones: []deprecacion{},
	}
}

type tabla struct {
	Version            string  `json:"version"`
	AValidarConAbogado bool    `json:"a_validar_con_abogado"`
	Reglas             []regla `json:"reglas"`
}

type regla struct {
	TipoDato     string `json:"tipo_dato"`
	Finalidad    string `json:"finalidad"`
	Persistido   bool   `json:"persistido"`
	PlazoDias    int    `json:"plazo_dias"`
	Configurable bool   `json:"configurable"`
}

func tablaRetencion() tabla {
	return tabla{
		Version:            "2026-10-08.1",
		AValidarConAbogado: true,
		Reglas: []regla{
			{"consulta_y_presupuesto", "Backoffice y seguimiento del presupuesto", true, 365, true},
			{"contacto_cliente", "Que el profesional te contacte", true, 90, true},
			{"registro_lecturas", "Trazabilidad de accesos", true, 730, true},
			{"consentimientos", "Prueba del consentimiento", true, 730, true},
			{"solicitudes_arco", "Constancia de derechos ARCO (anonimizada)", true, 730, true},
			{"perfil_asesor", "Operar el panel", true, 365, true},
			{"fotogramas", "Extraer datos del trabajo en memoria", false, 0, false},
			{"audio", "Transcripción en memoria", false, 0, false},
			{"transcripcion_completa", "No se guarda (ADR 0004)", false, 0, false},
		},
	}
}

type catalogo struct {
	Version string            `json:"version"`
	Idioma  string            `json:"idioma"`
	Textos  map[string]string `json:"textos"`
}

func catalogoTextos() catalogo {
	return catalogo{Version: "1.3.0", Idioma: "es-AR", Textos: map[string]string{
		"widget.boton_iniciar":                 "Iniciar VideoCotización",
		"widget.asistente_automatico":          "Te atiende un asistente automático.",
		"widget.presupuesto_orientativo":       "Presupuesto orientativo: lo confirma el profesional.",
		"panel.menu.perfil":                    "Perfil",
		"panel.menu.mis_cotizaciones":          "Mis cotizaciones",
		"panel.menu.registros":                 "Registros",
		"panel.contacto_disponible":            "Dejó contacto",
		"error.solicitud_invalida":             "No pudimos leer el pedido. Revisá los datos e intentá de nuevo.",
		"error.validacion_fallida":             "Hay datos que no cumplen el formato esperado.",
		"error.cuerpo_demasiado_grande":        "El pedido supera el tamaño máximo permitido.",
		"error.tipo_de_contenido_no_soportado": "El formato enviado no está soportado.",
		"error.credencial_ausente":             "Falta la credencial de acceso.",
		"error.credencial_invalida":            "La credencial no es válida o fue revocada.",
		"error.credenciales_incorrectas":       "El email o la contraseña no son correctos.",
		"error.totp_invalido":                  "El código de verificación no es correcto o ya se usó.",
		"error.sesion_vencida":                 "Tu sesión venció. Ingresá de nuevo.",
		"error.reautenticacion_requerida":      "Para esta acción tenés que volver a ingresar tu contraseña y código.",
		"error.origen_no_permitido":            "Este sitio no está autorizado para usar la clave.",
		"error.desafio_invalido":               "No pudimos verificar el navegador. Recargá la página e intentá de nuevo.",
		"error.clave_secreta_desde_navegador":  "La clave secreta no se puede usar desde un navegador.",
		"error.alcance_insuficiente":           "La credencial no permite esta operación.",
		"error.csrf_invalido":                  "No pudimos verificar el pedido. Recargá el panel.",
		"error.no_encontrado":                  "No encontramos lo que buscás.",
		"error.version_retirada":               "Esta versión de la API ya no está disponible.",
		"error.estado_invalido":                "La operación no corresponde en el estado actual.",
		"error.consentimiento_requerido":       "Antes de empezar tenés que aceptar el aviso de privacidad.",
		"error.sesion_cerrada":                 "La videocotización ya terminó.",
		"error.cotizacion_no_emitida":          "El presupuesto todavía no se emitió.",
		"error.contacto_ya_registrado":         "Ya dejaste tus datos de contacto para esta consulta.",
		"error.limite_de_tasa":                 "Hiciste muchos pedidos seguidos. Esperá un momento.",
		"error.cuota_agotada":                  "Por ahora no hay cupo para videocotizaciones. Escribinos por WhatsApp.",
		"error.simultaneas_agotadas":           "En este momento hay muchas videocotizaciones en curso. Probá en unos minutos.",
		"error.intentos_excedidos":             "Hubo demasiados intentos. Esperá antes de volver a probar.",
		"error.limite_lecturas_contacto":       "Llegaste al límite diario de lecturas de contactos.",
		"error.error_interno":                  "Tuvimos un problema. Intentá de nuevo más tarde.",
		"error.proveedor_no_disponible":        "Un servicio que usamos no responde. Intentá de nuevo en unos minutos.",
		"error.servicio_no_disponible":         "El servicio no está disponible en este momento.",
		"motivo.completada":                    "Completada",
		"motivo.cliente_cerro":                 "El cliente cortó",
		"motivo.sin_voz":                       "Cortada por silencio",
		"motivo.sin_camara":                    "Sin cámara",
		"motivo.sin_consentimiento":            "Sin consentimiento",
		"motivo.duracion_maxima":               "Duración máxima",
		"motivo.cuota_agotada":                 "Cupo agotado",
		"motivo.desafio_invalido":              "Verificación fallida",
		"motivo.error_proveedor":               "Falla de un servicio externo",
		"motivo.error_interno":                 "Error interno",
		"oficio.pintura":                       "Pintura",
		"oficio.jardineria":                    "Jardinería",
		"oficio.reparaciones":                  "Reparaciones",
		"oficio.mantenimiento":                 "Mantenimiento",
		"oficio.limpieza":                      "Limpieza",
		"zona.mar_chiquita":                    "Mar Chiquita",
		"zona.cobo":                            "Cobo",
		"zona.santa_clara":                     "Santa Clara del Mar",
		"zona.parque_lago":                     "Parque Lago",
		"zona.otra":                            "fuera de zona",
	}}
}

func jsonNuevo(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	return enc.Encode(v)
}
