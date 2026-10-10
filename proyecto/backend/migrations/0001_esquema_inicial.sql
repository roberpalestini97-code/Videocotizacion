-- 0001 · Esquema inicial (ADR 0004, T04a).
--
-- Se aplica SOLO con `api migrar` y el rol dueño (vc_dueno), nunca con el rol
-- de la API (corrección H3 de T20). Precondición: existen los roles vc_dueno y
-- vc_api (ver scripts/crear-roles.sql) y vc_dueno es dueño de la base.
--
-- Reglas que cumple cada tabla de negocio:
--   * tenant_id uuid NOT NULL, claves primarias e índices que empiezan por
--     tenant_id y claves foráneas compuestas (tenant_id, id) (S04, S07).
--   * ENABLE + FORCE ROW LEVEL SECURITY y una política con USING y WITH CHECK
--     contra vc.tenant_actual(): sin `SET LOCAL app.tenant_id` no se ve ni se
--     escribe nada (falla cerrada, S01, S03).
--   * Dinero en bigint centavos con CHECK >= 0 (S05). Fechas timestamptz (S09).
--   * Nada de fotogramas, audio ni transcripción completa (R43).
-- Reversión: 0001_esquema_inicial.revertir.sql (manual, con el rol dueño).

CREATE SCHEMA vc;
REVOKE ALL ON SCHEMA vc FROM PUBLIC;
GRANT USAGE ON SCHEMA vc TO vc_api;

-- vc_meta.migraciones la crea el migrador; la API solo la lee para verificar
-- al arrancar que la base está al día.
GRANT USAGE ON SCHEMA vc_meta TO vc_api;
GRANT SELECT ON vc_meta.migraciones TO vc_api;

-- Tenant de la transacción. NULLIF cubre el caso de una conexión del pool
-- donde la variable quedó en '' después de un SET LOCAL anterior: sin tenant
-- la política compara contra NULL y no devuelve filas.
CREATE FUNCTION vc.tenant_actual() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- Tenants (catálogo de clientes de la API). También lleva tenant_id y RLS:
-- cada tenant solo se ve a sí mismo.
CREATE TABLE vc.tenants (
    tenant_id          uuid        PRIMARY KEY,
    nombre             text        NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 120),
    simultaneas_tope   integer     NOT NULL CHECK (simultaneas_tope BETWEEN 1 AND 1000),
    segundos_mes_tope  integer     NOT NULL CHECK (segundos_mes_tope BETWEEN 0 AND 100000000),
    retencion_dias     integer     NOT NULL CHECK (retencion_dias BETWEEN 1 AND 3650),
    creado_en          timestamptz NOT NULL
);

CREATE TABLE vc.asesores (
    tenant_id          uuid        NOT NULL REFERENCES vc.tenants (tenant_id),
    asesor_id          text COLLATE "C" NOT NULL CHECK (asesor_id ~ '^ase_[0-9A-HJKMNP-TV-Z]{26}$'),
    rol                text        NOT NULL CHECK (rol IN ('asesor', 'administrador')),
    nombre_visible     text        NOT NULL CHECK (char_length(nombre_visible) BETWEEN 1 AND 60),
    email              text        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
    whatsapp           text        NOT NULL CHECK (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
    oficios            text[]      NOT NULL CHECK (cardinality(oficios) BETWEEN 1 AND 5
                                       AND oficios <@ ARRAY['pintura', 'jardineria', 'reparaciones', 'mantenimiento', 'limpieza']),
    zonas              text[]      NOT NULL CHECK (cardinality(zonas) BETWEEN 1 AND 4
                                       AND zonas <@ ARRAY['mar_chiquita', 'cobo', 'santa_clara', 'parque_lago']),
    creado_en          timestamptz NOT NULL,
    borrar_despues_de  timestamptz,
    PRIMARY KEY (tenant_id, asesor_id)
);

CREATE TABLE vc.sesiones (
    tenant_id          uuid        NOT NULL,
    sesion_id          text COLLATE "C" NOT NULL CHECK (sesion_id ~ '^ses_[0-9A-HJKMNP-TV-Z]{26}$'),
    asesor_id          text COLLATE "C" NOT NULL,
    estado             text        NOT NULL CHECK (estado IN ('creada', 'consentida', 'en_curso', 'cerrada')),
    modo_avatar        text        NOT NULL CHECK (modo_avatar IN ('3d', 'clips')),
    creada_en          timestamptz NOT NULL,
    consentida_en      timestamptz,
    cerrada_en         timestamptz,
    motivo_cierre      text        CHECK (motivo_cierre IN ('completada', 'cliente_cerro', 'sin_voz', 'sin_camara',
                                       'sin_consentimiento', 'duracion_maxima', 'cuota_agotada', 'desafio_invalido',
                                       'error_proveedor', 'error_interno')),
    duracion_s         integer     NOT NULL DEFAULT 0 CHECK (duracion_s BETWEEN 0 AND 86400),
    borrar_despues_de  timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, sesion_id),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id),
    CHECK (borrar_despues_de > creada_en),
    CHECK ((estado = 'cerrada') = (cerrada_en IS NOT NULL AND motivo_cierre IS NOT NULL)),
    CHECK (estado NOT IN ('consentida', 'en_curso') OR consentida_en IS NOT NULL)
);
-- Listado "Mis cotizaciones" por clave (keyset), sin OFFSET (S07).
CREATE INDEX sesiones_por_asesor ON vc.sesiones (tenant_id, asesor_id, creada_en DESC, sesion_id DESC);
-- Borrado programado.
CREATE INDEX sesiones_por_vencimiento ON vc.sesiones (tenant_id, borrar_despues_de);

-- Consentimientos: solo-anexar (R12). La API no tiene UPDATE ni DELETE; se
-- borran únicamente en cascada con su sesión vencida.
CREATE TABLE vc.consentimientos (
    tenant_id          uuid        NOT NULL,
    consentimiento_id  text COLLATE "C" NOT NULL CHECK (consentimiento_id ~ '^cns_[0-9A-HJKMNP-TV-Z]{26}$'),
    sesion_id          text COLLATE "C" NOT NULL,
    aviso_version      text        NOT NULL CHECK (aviso_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$'),
    registrado_en      timestamptz NOT NULL,
    borrar_despues_de  timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, consentimiento_id),
    UNIQUE (tenant_id, sesion_id),
    FOREIGN KEY (tenant_id, sesion_id) REFERENCES vc.sesiones (tenant_id, sesion_id) ON DELETE CASCADE
);

CREATE FUNCTION vc.impedir_modificacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'tabla solo-anexar: % no admite UPDATE', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER consentimientos_solo_anexar BEFORE UPDATE ON vc.consentimientos
    FOR EACH ROW EXECUTE FUNCTION vc.impedir_modificacion();

CREATE TABLE vc.cotizaciones (
    tenant_id          uuid        NOT NULL,
    cotizacion_id      text COLLATE "C" NOT NULL CHECK (cotizacion_id ~ '^cot_[0-9A-HJKMNP-TV-Z]{26}$'),
    sesion_id          text COLLATE "C" NOT NULL,
    emitida_en         timestamptz NOT NULL,
    moneda             text        NOT NULL CHECK (moneda IN ('ARS', 'USD')),
    oficio             text        NOT NULL CHECK (oficio IN ('pintura', 'jardineria', 'reparaciones', 'mantenimiento', 'limpieza')),
    zona               text        NOT NULL CHECK (zona IN ('mar_chiquita', 'cobo', 'santa_clara', 'parque_lago', 'otra')),
    fuera_de_zona      boolean     NOT NULL,
    total_min_centavos bigint      NOT NULL CHECK (total_min_centavos BETWEEN 0 AND 9007199254740991),
    total_max_centavos bigint      NOT NULL CHECK (total_max_centavos BETWEEN total_min_centavos AND 9007199254740991),
    tarifas_version    text        NOT NULL CHECK (tarifas_version ~ '^[0-9A-Za-z.\-]{1,20}$'),
    tarifas_estado     text        NOT NULL CHECK (tarifas_estado IN ('referencia_publica_sin_validar', 'validada')),
    validez_dias       integer     NOT NULL CHECK (validez_dias BETWEEN 1 AND 90),
    leyenda            text        NOT NULL CHECK (char_length(leyenda) BETWEEN 1 AND 300),
    borrar_despues_de  timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, cotizacion_id),
    UNIQUE (tenant_id, sesion_id),
    FOREIGN KEY (tenant_id, sesion_id) REFERENCES vc.sesiones (tenant_id, sesion_id) ON DELETE CASCADE,
    CHECK ((zona = 'otra') = fuera_de_zona),
    CHECK (borrar_despues_de > emitida_en)
);
CREATE INDEX cotizaciones_por_vencimiento ON vc.cotizaciones (tenant_id, borrar_despues_de);

CREATE TABLE vc.items_cotizacion (
    tenant_id                     uuid     NOT NULL,
    cotizacion_id                 text COLLATE "C" NOT NULL,
    orden                         smallint NOT NULL CHECK (orden BETWEEN 0 AND 29),
    tipo                          text     NOT NULL CHECK (tipo IN ('mano_de_obra', 'traslado', 'recargo')),
    codigo_tarea                  text     NOT NULL CHECK (codigo_tarea ~ '^[a-z0-9_]{3,60}$'),
    descripcion                   text     NOT NULL CHECK (char_length(descripcion) BETWEEN 1 AND 200),
    unidad                        text     NOT NULL CHECK (unidad IN ('m2', 'ml', 'unidad', 'hora', 'jornada', 'visita', 'global')),
    cantidad_centesimas           bigint   NOT NULL CHECK (cantidad_centesimas BETWEEN 1 AND 1000000000),
    precio_unitario_min_centavos  bigint   NOT NULL CHECK (precio_unitario_min_centavos >= 0),
    precio_unitario_max_centavos  bigint   NOT NULL CHECK (precio_unitario_max_centavos BETWEEN precio_unitario_min_centavos AND 9007199254740991),
    importe_min_centavos          bigint   NOT NULL CHECK (importe_min_centavos BETWEEN 0 AND 9007199254740991),
    importe_max_centavos          bigint   NOT NULL CHECK (importe_max_centavos BETWEEN importe_min_centavos AND 9007199254740991),
    PRIMARY KEY (tenant_id, cotizacion_id, orden),
    FOREIGN KEY (tenant_id, cotizacion_id) REFERENCES vc.cotizaciones (tenant_id, cotizacion_id) ON DELETE CASCADE
);

-- Constancia del borrado programado: solo cantidades, sin datos personales
-- (ADR 0004 punto 8, R44). Solo-anexar.
CREATE TABLE vc.registro_borrados (
    tenant_id        uuid        NOT NULL REFERENCES vc.tenants (tenant_id),
    registro_id      uuid        NOT NULL DEFAULT gen_random_uuid(),
    ejecutado_en     timestamptz NOT NULL,
    sesiones         bigint      NOT NULL CHECK (sesiones >= 0),
    consentimientos  bigint      NOT NULL CHECK (consentimientos >= 0),
    cotizaciones     bigint      NOT NULL CHECK (cotizaciones >= 0),
    items            bigint      NOT NULL CHECK (items >= 0),
    PRIMARY KEY (tenant_id, registro_id)
);
CREATE TRIGGER registro_borrados_solo_anexar BEFORE UPDATE ON vc.registro_borrados
    FOR EACH ROW EXECUTE FUNCTION vc.impedir_modificacion();

-- RLS forzada y política única por tabla (USING + WITH CHECK).
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['tenants', 'asesores', 'sesiones', 'consentimientos', 'cotizaciones',
                             'items_cotizacion', 'registro_borrados']
    LOOP
        EXECUTE format('ALTER TABLE vc.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE vc.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY aislamiento_por_tenant ON vc.%I
                            USING (tenant_id = vc.tenant_actual())
                            WITH CHECK (tenant_id = vc.tenant_actual())', t);
    END LOOP;
END
$$;

-- Camino explícito y auditado para la tarea global de retención (ADR 0004,
-- consecuencias): la API obtiene SOLO la lista de ids de tenant, sin otros
-- datos, y después borra tenant por tenant con su propio SET LOCAL. La
-- función corre como el dueño, que tiene una política de solo lectura sobre
-- vc.tenants restringida a sí mismo.
CREATE POLICY dueno_lista_tenants ON vc.tenants FOR SELECT TO CURRENT_USER USING (true);
CREATE FUNCTION vc.tenants_para_retencion() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$ SELECT tenant_id FROM vc.tenants ORDER BY tenant_id $$;
REVOKE ALL ON FUNCTION vc.tenants_para_retencion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vc.tenants_para_retencion() TO vc_api;

-- Privilegios mínimos de la API (ADR 0004 punto 3). Sin TRUNCATE, sin
-- REFERENCES, sin DDL; tenant_id nunca se puede actualizar.
GRANT SELECT, INSERT ON vc.tenants TO vc_api;
GRANT SELECT, INSERT ON vc.asesores TO vc_api;
GRANT SELECT, INSERT, DELETE ON vc.sesiones TO vc_api;
GRANT UPDATE (estado, consentida_en, cerrada_en, motivo_cierre, duracion_s) ON vc.sesiones TO vc_api;
GRANT SELECT, INSERT ON vc.consentimientos TO vc_api;
GRANT SELECT, INSERT, DELETE ON vc.cotizaciones TO vc_api;
GRANT SELECT, INSERT ON vc.items_cotizacion TO vc_api;
GRANT SELECT, INSERT ON vc.registro_borrados TO vc_api;
