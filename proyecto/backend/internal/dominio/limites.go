package dominio

import "time"

// MotivoDeLimites decide el corte de una sesión que ya está en_curso.
// La duración máxima gana si también venció el silencio. Sin instante de
// inicio no hay corte: una sesión que no llegó a en_curso no entra acá.
func MotivoDeLimites(enCursoEn, ultimaVoz, ahora time.Time, sinVozS, duracionMaxS int) (MotivoCierre, bool) {
	if enCursoEn.IsZero() || sinVozS < 1 || duracionMaxS < 1 {
		return "", false
	}
	if !ahora.Before(enCursoEn.Add(time.Duration(duracionMaxS) * time.Second)) {
		return MotivoDuracionMaxima, true
	}
	desde := enCursoEn
	if !ultimaVoz.IsZero() {
		desde = ultimaVoz
	}
	if !ahora.Before(desde.Add(time.Duration(sinVozS) * time.Second)) {
		return MotivoSinVoz, true
	}
	return "", false
}
