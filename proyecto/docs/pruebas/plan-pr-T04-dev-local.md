# Plan de prueba — PR `T04-dev-local-semillalocal`

## Gates automáticos (autor)

```powershell
# Desde videocotizacion/
powershell -File proyecto/scripts/verificar-repo.ps1
```

## Dev local manual (Rober)

1. `copy proyecto\backend\.env.example proyecto\backend\.env`
2. Completar `real-time-quote-bot\.env.local` según comentarios en `.env.example` del front.
3. `powershell -File proyecto/scripts/levantar-local.ps1`
4. `http://127.0.0.1:8080/salud` → 200
5. Videollamada: `http://127.0.0.1:5173/c/demoLocalVideocotiz001` con clave pública de semilla (`semillalocal`).

## Qué no cubre este PR

- Docker build/up (T11)
- Producción con proveedores reales sin falsos (T13)
- Revisión independiente PostgreSQL/RLS (T04a/T43)
