package turno

// Evento es un mensaje servidor→cliente (tipo + datos).
type Evento struct {
	Tipo  string
	Datos map[string]any
}
