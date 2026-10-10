package cotizador

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMapaDatosExtraidosEjemplo01(t *testing.T) {
	raw := leerConducta(t, "ejemplos", "01-pintura-interior-pide-medidas.json")
	s, err := DecodificarSalidaLLM(raw)
	if err != nil {
		t.Fatal(err)
	}
	m, err := MapaDatosExtraidos(s)
	if err != nil {
		t.Fatal(err)
	}
	if m["oficio"] != "pintura" || m["zona"] != "santa_clara" || m["fuera_de_zona"] != false {
		t.Fatalf("zona/oficio: %+v", m)
	}
	falt := m["faltantes"].([]any)
	if len(falt) != 2 {
		t.Fatalf("faltantes: %+v", falt)
	}
	if m["tarea"] != "pintura_interior" || m["interior_exterior"] != "interior" {
		t.Fatalf("tarea: %+v", m)
	}
	if m["altura"] != "hasta_3m" {
		t.Fatalf("altura: %v", m["altura"])
	}
}

func TestMapaDatosExtraidosEjemplo05PaisajismoNormalizado(t *testing.T) {
	raw := leerConducta(t, "ejemplos", "05-paisajismo-tecnico-planos-largo-plazo.json")
	s, err := DecodificarSalidaLLM(raw)
	if err != nil {
		t.Fatal(err)
	}
	m, err := MapaDatosExtraidos(s)
	if err != nil {
		t.Fatal(err)
	}
	if m["oficio"] != "jardineria" {
		t.Fatalf("S4 paisajismo→jardineria: %+v", m)
	}
	if m["tarea"] != "diseno_paisajismo" {
		t.Fatalf("tarea: %+v", m)
	}
}

// TestMapaDatosExtraidosEjemplosConductas recorre los 12 ejemplos T06: todos
// decodifican; 11 producen DatosExtraidos (08-fuera-de-alcance-gas tiene oficio otro).
func TestMapaDatosExtraidosEjemplosConductas(t *testing.T) {
	archivos, err := filepath.Glob(filepath.Join("..", "..", "..", "conductas", "ejemplos", "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(archivos) != 12 {
		t.Fatalf("esperaba 12 ejemplos, hay %d", len(archivos))
	}
	for _, ruta := range archivos {
		nombre := filepath.Base(ruta)
		raw, err := os.ReadFile(ruta)
		if err != nil {
			t.Fatal(err)
		}
		s, err := DecodificarSalidaLLM(raw)
		if err != nil {
			t.Fatalf("%s: decodificar: %v", nombre, err)
		}
		_, err = MapaDatosExtraidos(s)
		if nombre == "08-fuera-de-alcance-gas.json" {
			if err == nil {
				t.Fatalf("%s: oficio otro no debe mapear a DatosExtraidos", nombre)
			}
			continue
		}
		if err != nil {
			t.Fatalf("%s: MapaDatosExtraidos: %v", nombre, err)
		}
		if nombre == "05-paisajismo-tecnico-planos-largo-plazo.json" && s.Oficio == "paisajismo" {
			m, _ := MapaDatosExtraidos(s)
			if m["oficio"] != "jardineria" {
				t.Fatalf("%s: S4 paisajismo→jardineria: %+v", nombre, m)
			}
		}
	}
}
