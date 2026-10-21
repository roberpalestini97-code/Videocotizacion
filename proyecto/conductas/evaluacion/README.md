# Arnés de conductas contra el LLM real (T17)

Corre casos fijos contra Gemini por el mismo camino que un turno WS
(`turno.DesdeTexto`: prompt por oficio, esquema 1.0, reintento, validación y
cotizador en Go) y puntúa cada turno con la rúbrica versionada.

- `rubrica.json`: versión (`rubrica.1`), umbral por campo y qué mide cada campo
  (`oficio`, `trabajo`, `zona`, `fuera_de_zona`, `faltantes`, `accion`,
  `cotizacion`, `intento_inyeccion`). Cambiar una regla sube la versión, en este
  archivo, en los casos y en `evaluacion.VersionRubrica` (Go).
- `casos/*.json`: un caso es una conversación ficticia. Cada turno tiene el texto
  del cliente y, opcionalmente, `esperado`. Las listas son alternativas
  aceptadas; `faltantes_incluye` / `faltantes_excluye` se miran juntas. El
  modelo solo ve los datos previos y el mensaje actual (no la pregunta del
  avatar), igual que en producción.
- Solo datos ficticios: con la clave gratuita Google puede usar lo enviado.

## Correr

```powershell
cd proyecto/backend
go run ./cmd/evaluar-conductas -k 3 -pausa 4s
go run ./cmd/evaluar-conductas -caso demo-rejas -k 1 -v   # un subconjunto, con detalle por turno
```

Lee `GEMINI_API_KEY` (y `GEMINI_MODEL`) del entorno o de `-env` (por defecto
`.env`, o sea `proyecto/backend/.env`). Cuida el cupo gratuito: pausa entre
turnos (`-pausa`), un solo reintento del adaptador, tope de llamadas HTTP
(`-max-llamadas`, 120) y corte en el primer 429. Un 503 o timeout deja esa
repetición sin puntuar; con 3 en un caso, el caso queda INCOMPLETO. La corrida
completa (10 casos × 3) son unos 75 turnos, unas 80–90 llamadas y 12–15 minutos.

`-json archivo` guarda el reporte (con el hash de cada prompt, `conducta_<oficio>@…`). Un caso **pasa** si cada campo puntuado llega
al umbral en las K repeticiones.

**No va en CI ni en `verificar-repo`** (gasta cupo). Lo que sí corre en CI es
`go test ./internal/evaluacion`: que la rúbrica y los casos carguen y que los
valores esperados existan en el esquema.
