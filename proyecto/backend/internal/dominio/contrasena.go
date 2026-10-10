package dominio

import (
	"bytes"
	"crypto/rand"
	"crypto/subtle"
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"

	"videocotizacion/backend/internal/errores"
)

const (
	// Argon2MemoriaKiB, Argon2Iteraciones y Argon2Paralelismo son los
	// parámetros Argon2id del panel (OWASP, login interactivo): 19 MiB, 2
	// pasadas y 1 hilo. El salt mide 16 bytes y la clave 32. La contraseña
	// en claro no se guarda ni se escribe en un error.
	Argon2MemoriaKiB  uint32 = 19 * 1024
	Argon2Iteraciones uint32 = 2
	Argon2Paralelismo uint8  = 1
	Argon2LargoSal           = 16
	Argon2LargoClave  uint32 = 32
)

// ContrasenaAsesor es el hash Argon2id de un asesor. No forma parte del
// perfil público: el JSON del asesor no lleva estos campos.
type ContrasenaAsesor struct {
	AsesorID    string
	Email       string
	Hash        []byte
	Sal         []byte
	MemoriaKiB  uint32
	Iteraciones uint32
	Paralelismo uint8
	CreadaEn    time.Time
}

// ContrasenaHallada es la fila que devuelve el lookup por email, que todavía
// no conoce el tenant.
type ContrasenaHallada struct {
	TenantID TenantID
	ContrasenaAsesor
}

// IngresoPanel es una cookie del panel guardada solo como HMAC. Preliminar
// es el paso 1 y no autoriza rutas. Si no es preliminar, es la sesión tras el
// TOTP: VenceEn es el vencimiento absoluto y VenceInactividad el de inactividad.
// RevocadaEn distinto de nil deja el id inválido (R35). CSRFCifrado, si está,
// es el token para recargar la sesión: AES-GCM, nunca el claro.
// ReautenticadoHasta, si está y todavía no llegó, habilita las acciones
// sensibles. No alarga VenceEn ni VenceInactividad.
type IngresoPanel struct {
	AsesorID           string
	HashCookie         []byte
	HashCSRF           []byte
	CSRFCifrado        []byte
	EmitidaEn          time.Time
	VenceEn            time.Time
	VenceInactividad   time.Time
	Preliminar         bool
	RevocadaEn         *time.Time
	ReautenticadoHasta *time.Time
}

// EmailDeLogin normaliza el email del panel. El error no repite el valor.
func EmailDeLogin(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !emailValido(email) {
		return "", invalido("/email", "formato inválido")
	}
	return email, nil
}

// NuevaContrasena deriva el hash con los parámetros de arriba y un salt nuevo.
func NuevaContrasena(asesorID, email, clara string) (ContrasenaAsesor, error) {
	email, err := EmailDeLogin(email)
	if err != nil {
		return ContrasenaAsesor{}, err
	}
	if len(clara) < 12 || len(clara) > 256 {
		return ContrasenaAsesor{}, invalido("/contrasena", "largo inválido")
	}
	if !IDValido(asesorID, PrefijoAsesor) {
		return ContrasenaAsesor{}, invalido("/asesor_id", "formato inválido")
	}
	var sal [Argon2LargoSal]byte
	if _, err := rand.Read(sal[:]); err != nil {
		return ContrasenaAsesor{}, errores.Envolver(errores.ErrorInterno, fmt.Errorf("sal"))
	}
	return ContrasenaAsesor{
		AsesorID:    asesorID,
		Email:       email,
		Hash:        derivar(clara, sal[:], Argon2Iteraciones, Argon2MemoriaKiB, Argon2Paralelismo),
		Sal:         bytes.Clone(sal[:]),
		MemoriaKiB:  Argon2MemoriaKiB,
		Iteraciones: Argon2Iteraciones,
		Paralelismo: Argon2Paralelismo,
	}, nil
}

// Validar revisa la fila guardada. No recibe la contraseña en claro.
func (c ContrasenaAsesor) Validar() error {
	var errs []error
	if !IDValido(c.AsesorID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato inválido"))
	}
	if _, err := EmailDeLogin(c.Email); err != nil || c.Email != strings.ToLower(c.Email) {
		errs = append(errs, invalido("/email", "formato inválido"))
	}
	if len(c.Hash) != int(Argon2LargoClave) || len(c.Sal) != Argon2LargoSal {
		errs = append(errs, invalido("/hash", "largo inválido"))
	}
	if c.MemoriaKiB == 0 || c.Iteraciones == 0 || c.Paralelismo == 0 {
		errs = append(errs, invalido("/parametros", "argon2id incompleto"))
	}
	if c.CreadaEn.IsZero() {
		errs = append(errs, invalido("/creada_en", "requerido"))
	}
	return unir(errs)
}

// Coincide verifica la contraseña contra el hash guardado. Si los parámetros
// no sirven, igual corre Argon2id para no acortar el camino.
func (c ContrasenaAsesor) Coincide(clara string) bool {
	memoria, iter, par := c.MemoriaKiB, c.Iteraciones, c.Paralelismo
	sal := c.Sal
	if memoria == 0 || iter == 0 || par == 0 || len(sal) != Argon2LargoSal {
		memoria, iter, par = Argon2MemoriaKiB, Argon2Iteraciones, Argon2Paralelismo
		if len(sal) != Argon2LargoSal {
			sal = make([]byte, Argon2LargoSal)
		}
	}
	sum := derivar(clara, sal, iter, memoria, par)
	esperado := c.Hash
	if len(esperado) != len(sum) {
		esperado = make([]byte, len(sum))
	}
	igual := subtle.ConstantTimeCompare(sum, esperado) == 1
	return igual && len(c.Hash) == len(sum)
}

func (p IngresoPanel) Validar() error {
	var errs []error
	if !IDValido(p.AsesorID, PrefijoAsesor) {
		errs = append(errs, invalido("/asesor_id", "formato inválido"))
	}
	if len(p.HashCookie) != 32 || len(p.HashCSRF) != 32 {
		errs = append(errs, invalido("/hash", "largo inválido"))
	}
	if p.EmitidaEn.IsZero() || !p.VenceEn.After(p.EmitidaEn) {
		errs = append(errs, invalido("/vence_en", "debe ser posterior a emitida_en"))
	}
	return unir(errs)
}

// SesionVigente es la cookie que ya pasó el TOTP y no venció ni se cerró.
// En el instante exacto del vencimiento ya no está vigente.
func (p IngresoPanel) SesionVigente(ahora time.Time) bool {
	if p.Preliminar || p.RevocadaEn != nil || ahora.IsZero() || p.VenceInactividad.IsZero() {
		return false
	}
	return ahora.Before(p.VenceEn) && ahora.Before(p.VenceInactividad)
}

func derivar(clara string, sal []byte, iter, memoria uint32, par uint8) []byte {
	return argon2.IDKey([]byte(clara), sal, iter, memoria, par, Argon2LargoClave)
}

// ContrasenaFicticia es un Argon2id fijo. El login lo verifica cuando el email
// no existe, para que ese camino tarde lo mismo que una contraseña mala.
var (
	ficticiaOnce sync.Once
	ficticia     ContrasenaAsesor
)

func ContrasenaFicticia() ContrasenaAsesor {
	ficticiaOnce.Do(func() {
		sal := []byte{
			0x5a, 0x91, 0x3c, 0x07, 0xe2, 0x44, 0xb8, 0x1d,
			0x6f, 0x20, 0xaa, 0x55, 0x93, 0x0e, 0xc7, 0x18,
		}
		ficticia = ContrasenaAsesor{
			Sal:         sal,
			Hash:        derivar("clave-ficticia-argon2id-del-panel-0000", sal, Argon2Iteraciones, Argon2MemoriaKiB, Argon2Paralelismo),
			MemoriaKiB:  Argon2MemoriaKiB,
			Iteraciones: Argon2Iteraciones,
			Paralelismo: Argon2Paralelismo,
		}
	})
	c := ficticia
	c.Hash = bytes.Clone(ficticia.Hash)
	c.Sal = bytes.Clone(ficticia.Sal)
	return c
}
