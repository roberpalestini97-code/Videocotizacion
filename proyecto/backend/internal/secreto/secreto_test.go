package secreto

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"strings"
	"testing"
)

const valorReal = "postgres://vc_api:Sup3rS3creta@db:5432/vc"

type conExportado struct {
	Nombre string
	Clave  Secreto
}

type conNoExportado struct {
	nombre string
	clave  Secreto
}

type anidado struct {
	Interno conExportado
	ptr     *conNoExportado
}

func TestSecretoNoSeImprimeNunca(t *testing.T) {
	s := Nuevo(valorReal)
	ce := conExportado{Nombre: "base", Clave: s}
	cn := conNoExportado{nombre: "base", clave: s}
	an := anidado{Interno: ce, ptr: &cn}

	var salidas []string
	for _, verbo := range []string{"%v", "%+v", "%#v", "%s", "%q", "%x", "%X", "%T %v", "%10s", "%d"} {
		salidas = append(salidas,
			fmt.Sprintf(verbo, s), fmt.Sprintf(verbo, &s), fmt.Sprintf(verbo, ce), fmt.Sprintf(verbo, &ce),
			fmt.Sprintf(verbo, cn), fmt.Sprintf(verbo, &cn), fmt.Sprintf(verbo, an), fmt.Sprintf(verbo, []Secreto{s}),
			fmt.Sprintf(verbo, map[string]Secreto{"k": s}), fmt.Sprintf(verbo, []any{cn}))
	}
	salidas = append(salidas, fmt.Sprint(s, ce, cn), fmt.Sprintln(an), s.String(), s.GoString())

	j1, _ := json.Marshal(ce)
	j2, _ := json.Marshal(map[string]any{"s": s, "an": an})
	t1, _ := s.MarshalText()
	salidas = append(salidas, string(j1), string(j2), string(t1))

	var buf bytes.Buffer
	for _, h := range []slog.Handler{slog.NewJSONHandler(&buf, nil), slog.NewTextHandler(&buf, nil)} {
		l := slog.New(h)
		l.Info("config", "clave", s, "struct", ce, "noexp", cn, slog.Any("ptr", &ce), slog.Group("g", "s", s))
	}
	lg := log.New(&buf, "", 0)
	lg.Printf("cfg=%+v %v", ce, cn)
	salidas = append(salidas, buf.String())

	err := fmt.Errorf("conectando con %v: %w", s, errors.New("timeout"))
	salidas = append(salidas, err.Error())

	for _, o := range salidas {
		if strings.Contains(o, "Sup3rS3creta") || strings.Contains(o, "vc_api") || strings.Contains(o, valorReal) {
			t.Fatalf("se filtró el secreto en: %q", o)
		}
		if strings.Contains(o, fmt.Sprintf("%x", valorReal)) || strings.Contains(o, fmt.Sprintf("%X", valorReal)) {
			t.Fatalf("se filtró el secreto en hex: %q", o)
		}
	}
	if !strings.Contains(fmt.Sprintf("%v", ce), Redactado) {
		t.Fatal("se esperaba ver la marca de redactado")
	}
}

func TestRevelarYVacio(t *testing.T) {
	if Nuevo(valorReal).Revelar() != valorReal {
		t.Fatal("Revelar debe devolver el valor real")
	}
	var cero Secreto
	if !cero.Vacio() || cero.Revelar() != "" || !Nuevo("").Vacio() || Nuevo("x").Vacio() {
		t.Fatal("Vacio no funciona")
	}
	if fmt.Sprint(cero) != Redactado {
		t.Fatal("el cero también se redacta")
	}
}
