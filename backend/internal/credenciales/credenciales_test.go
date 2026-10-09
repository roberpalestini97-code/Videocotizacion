package credenciales

import (
	"bytes"
	"strings"
	"testing"

	"videocotizacion/backend/internal/secreto"
)

func firmador(t *testing.T, clave string) Firmador {
	f, err := NuevoFirmador(secreto.Nuevo(clave))
	if err != nil {
		t.Fatal(err)
	}
	return f
}

func TestNuevaYReconocer(t *testing.T) {
	f := firmador(t, strings.Repeat("k", 32))
	vistos := map[string]bool{}
	for _, tipo := range []Tipo{Secreta, Publica, Sesion} {
		valor, hash, prefijo, err := Nueva(f, tipo)
		if err != nil {
			t.Fatal(err)
		}
		if got, ok := Reconocer(valor); !ok || got != tipo {
			t.Fatalf("%s: reconocido como %q %v", valor, got, ok)
		}
		if len(hash) != 32 || !bytes.Equal(hash, f.Hash(valor)) || len(prefijo) != 11 || !strings.HasPrefix(valor, prefijo) {
			t.Fatalf("hash/prefijo: %x %q", hash, prefijo)
		}
		if vistos[valor] {
			t.Fatal("credencial repetida")
		}
		vistos[valor] = true
	}
	if _, _, _, err := Nueva(f, "otra"); err == nil {
		t.Fatal("tipo desconocido")
	}
}

func TestReconocerRechaza(t *testing.T) {
	for _, v := range []string{"", "vc_sec_", "vc_sec_" + strings.Repeat("A", 42), "vc_sec_" + strings.Repeat("A", 44),
		"vc_xxx_" + strings.Repeat("A", 43), "vc_sec_" + strings.Repeat("+", 43), " vc_sec_" + strings.Repeat("A", 43)} {
		if _, ok := Reconocer(v); ok {
			t.Errorf("%q no debía reconocerse", v)
		}
	}
}

func TestHashDependeDeLaClaveDelServidor(t *testing.T) {
	a, b := firmador(t, strings.Repeat("a", 32)), firmador(t, strings.Repeat("b", 32))
	if bytes.Equal(a.Hash("vc_sec_x"), b.Hash("vc_sec_x")) || !bytes.Equal(a.Hash("x"), a.Hash("x")) {
		t.Fatal("HMAC con clave del servidor, determinista")
	}
	if _, err := NuevoFirmador(secreto.Nuevo("corta")); err != ErrClaveServidor {
		t.Fatalf("clave corta: %v", err)
	}
	if _, err := NuevoFirmador(secreto.Secreto{}); err != ErrClaveServidor {
		t.Fatalf("clave vacía: %v", err)
	}
}
