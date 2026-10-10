-- 0003 · Contadores de consumo y reserva atómica de cupo (H2, H3 y H7 de la
-- revisión T04b1; T44 G2/G3; ADR 0004 §10 y ADR 0005 §4).
--
-- H2: el tope mensual (R56) ya no suma vc.sesiones (que la retención y el ARCO
-- borran). Se lleva en contadores de AGREGADOS (sin datos personales) que la
-- retención y el ARCO no tocan: por tenant, por asesor y global, mensuales
-- (mes calendario de Argentina, UTC−3, que calcula Go) y diarios.
-- H3: emitirTokenMedios reserva con vc.reservar_cupo (bloqueos global → tenant
-- → asesor, saldo efectivo = mínimo de los tres, recorte ≥ 60 s) y el cierre
-- libera con vc.liberar_cupo en su misma transacción. vc_api solo LEE los
-- contadores; los modifican únicamente estas dos funciones SECURITY DEFINER,
-- verificadas al arrancar (dueño, search_path fijo, sin PUBLIC y cuerpo).
-- H7: CHECK del formato de los Origin de las claves públicas.
-- Reversión: 0003_consumo_y_reservas.revertir.sql (manual, rol dueño).

-- Topes propios del asesor (NULL = sin tope propio; ADR 0005 §4).
ALTER TABLE vc.asesores
    ADD COLUMN segundos_mes_tope integer CHECK (segundos_mes_tope BETWEEN 0 AND 100000000),
    ADD COLUMN simultaneas_tope  integer CHECK (simultaneas_tope BETWEEN 1 AND 1000);

CREATE TABLE vc.consumo_mensual (
    tenant_id              uuid    NOT NULL REFERENCES vc.tenants (tenant_id),
    mes                    date    NOT NULL CHECK (extract(day FROM mes) = 1),
    segundos_usados        bigint  NOT NULL DEFAULT 0 CHECK (segundos_usados >= 0),
    segundos_reservados    bigint  NOT NULL DEFAULT 0 CHECK (segundos_reservados >= 0),
    sesiones               integer NOT NULL DEFAULT 0 CHECK (sesiones >= 0),
    cotizaciones_emitidas  integer NOT NULL DEFAULT 0 CHECK (cotizaciones_emitidas >= 0),
    PRIMARY KEY (tenant_id, mes)
);

CREATE TABLE vc.consumo_diario (
    tenant_id              uuid    NOT NULL REFERENCES vc.tenants (tenant_id),
    fecha                  date    NOT NULL,
    segundos               bigint  NOT NULL DEFAULT 0 CHECK (segundos >= 0),
    sesiones               integer NOT NULL DEFAULT 0 CHECK (sesiones >= 0),
    cotizaciones_emitidas  integer NOT NULL DEFAULT 0 CHECK (cotizaciones_emitidas >= 0),
    PRIMARY KEY (tenant_id, fecha)
);

-- Por asesor: dato de una persona identificable; sigue la retención del
-- asesor (ADR 0004 §8, pendiente), no la de las consultas.
CREATE TABLE vc.consumo_asesor_mensual (
    tenant_id              uuid    NOT NULL,
    asesor_id              text COLLATE "C" NOT NULL,
    mes                    date    NOT NULL CHECK (extract(day FROM mes) = 1),
    segundos_usados        bigint  NOT NULL DEFAULT 0 CHECK (segundos_usados >= 0),
    segundos_reservados    bigint  NOT NULL DEFAULT 0 CHECK (segundos_reservados >= 0),
    sesiones               integer NOT NULL DEFAULT 0 CHECK (sesiones >= 0),
    cotizaciones_emitidas  integer NOT NULL DEFAULT 0 CHECK (cotizaciones_emitidas >= 0),
    PRIMARY KEY (tenant_id, asesor_id, mes),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id)
);

CREATE TABLE vc.consumo_asesor_diario (
    tenant_id              uuid    NOT NULL,
    asesor_id              text COLLATE "C" NOT NULL,
    fecha                  date    NOT NULL,
    segundos               bigint  NOT NULL DEFAULT 0 CHECK (segundos >= 0),
    sesiones               integer NOT NULL DEFAULT 0 CHECK (sesiones >= 0),
    cotizaciones_emitidas  integer NOT NULL DEFAULT 0 CHECK (cotizaciones_emitidas >= 0),
    PRIMARY KEY (tenant_id, asesor_id, fecha),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id)
);

-- Una reserva por sesión (ADR 0005 §4). Sin clave foránea a vc.sesiones a
-- propósito: si la sesión se borra (retención, ARCO) la reserva sigue
-- contando hasta cobrarse. Solo ids opacos y tiempos.
CREATE TABLE vc.reservas_cupo (
    tenant_id            uuid        NOT NULL REFERENCES vc.tenants (tenant_id),
    sesion_id            text COLLATE "C" NOT NULL CHECK (sesion_id ~ '^ses_[0-9A-HJKMNP-TV-Z]{26}$'),
    asesor_id            text COLLATE "C" NOT NULL,
    mes                  date        NOT NULL CHECK (extract(day FROM mes) = 1),
    segundos_reservados  integer     NOT NULL CHECK (segundos_reservados BETWEEN 60 AND 86400),
    recortada            boolean     NOT NULL,
    creada_en            timestamptz NOT NULL,
    vence_en             timestamptz NOT NULL,
    liberada_en          timestamptz,
    segundos_cobrados    integer     CHECK (segundos_cobrados BETWEEN 0 AND segundos_reservados),
    PRIMARY KEY (tenant_id, sesion_id),
    FOREIGN KEY (tenant_id, asesor_id) REFERENCES vc.asesores (tenant_id, asesor_id),
    CHECK (vence_en > creada_en),
    CHECK ((liberada_en IS NULL) = (segundos_cobrados IS NULL))
);
CREATE INDEX reservas_cupo_sin_liberar ON vc.reservas_cupo (tenant_id, vence_en) WHERE liberada_en IS NULL;

-- Globales: sin tenant_id (excepción de ADR 0004 §1). vc_api no tiene ningún
-- privilegio; solo las funciones (dueño) las leen y escriben.
CREATE TABLE vc.consumo_global_mensual (
    mes                  date    PRIMARY KEY CHECK (extract(day FROM mes) = 1),
    segundos_usados      bigint  NOT NULL DEFAULT 0 CHECK (segundos_usados >= 0),
    segundos_reservados  bigint  NOT NULL DEFAULT 0 CHECK (segundos_reservados >= 0)
);

CREATE TABLE vc.topes_globales (
    unica           boolean     PRIMARY KEY DEFAULT true CHECK (unica),
    segundos_mes    bigint      NOT NULL CHECK (segundos_mes > 0),
    simultaneas     integer     NOT NULL CHECK (simultaneas > 0),
    actualizado_en  timestamptz NOT NULL
);
-- Valores iniciales PROVISORIOS de ADR 0005 §4 (30 000 s y 5 simultáneas)
-- hasta la cifra de Rober (P2); los cambia `api topes configurar`.
INSERT INTO vc.topes_globales (unica, segundos_mes, simultaneas, actualizado_en) VALUES (true, 30000, 5, now());

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['consumo_mensual', 'consumo_diario', 'consumo_asesor_mensual', 'consumo_asesor_diario',
                             'reservas_cupo', 'consumo_global_mensual', 'topes_globales']
    LOOP
        EXECUTE format('ALTER TABLE vc.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE vc.%I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['consumo_mensual', 'consumo_diario', 'consumo_asesor_mensual', 'consumo_asesor_diario',
                             'reservas_cupo']
    LOOP
        EXECUTE format('CREATE POLICY aislamiento_por_tenant ON vc.%I
                            USING (tenant_id = vc.tenant_actual())
                            WITH CHECK (tenant_id = vc.tenant_actual())', t);
    END LOOP;
END
$$;
-- Solo el dueño (las funciones) ve las tablas globales y cuenta las reservas
-- vigentes de todos los tenants (tope global de simultáneas).
CREATE POLICY dueno_global ON vc.consumo_global_mensual TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY dueno_global ON vc.topes_globales TO CURRENT_USER USING (true) WITH CHECK (true);
CREATE POLICY dueno_cuenta_global ON vc.reservas_cupo FOR SELECT TO CURRENT_USER USING (true);

-- vc.liberar_cupo: cobra los segundos reales (redondeo hacia arriba, nunca
-- más que lo reservado) y devuelve el resto; idempotente. Con p_ahora >=
-- vence_en cobra la reserva completa. Bloquea global → tenant → asesor →
-- reserva, como vc.reservar_cupo.
CREATE FUNCTION vc.liberar_cupo(p_sesion text, p_ahora timestamptz)
    RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$
DECLARE
    v_r vc.reservas_cupo%ROWTYPE;
    v_usados integer;
    v_cot integer;
    v_dia date;
BEGIN
    SELECT * INTO v_r FROM vc.reservas_cupo r
        WHERE r.tenant_id = vc.tenant_actual() AND r.sesion_id = p_sesion AND r.liberada_en IS NULL;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    PERFORM 1 FROM vc.consumo_global_mensual g WHERE g.mes = v_r.mes FOR UPDATE;
    PERFORM 1 FROM vc.consumo_mensual c WHERE c.tenant_id = v_r.tenant_id AND c.mes = v_r.mes FOR UPDATE;
    PERFORM 1 FROM vc.consumo_asesor_mensual c
        WHERE c.tenant_id = v_r.tenant_id AND c.asesor_id = v_r.asesor_id AND c.mes = v_r.mes FOR UPDATE;
    SELECT * INTO v_r FROM vc.reservas_cupo r
        WHERE r.tenant_id = v_r.tenant_id AND r.sesion_id = p_sesion FOR UPDATE;
    IF v_r.liberada_en IS NOT NULL THEN
        RETURN false;
    END IF;
    v_usados := least(greatest(ceil(extract(epoch FROM p_ahora - v_r.creada_en)), 0), v_r.segundos_reservados)::integer;
    v_cot := (SELECT count(*) FROM vc.cotizaciones c WHERE c.tenant_id = v_r.tenant_id AND c.sesion_id = p_sesion)::integer;
    v_dia := (p_ahora AT TIME ZONE INTERVAL '-03:00')::date;
    UPDATE vc.consumo_global_mensual g
        SET segundos_usados = g.segundos_usados + v_usados, segundos_reservados = g.segundos_reservados - v_r.segundos_reservados
        WHERE g.mes = v_r.mes;
    UPDATE vc.consumo_mensual c
        SET segundos_usados = c.segundos_usados + v_usados, segundos_reservados = c.segundos_reservados - v_r.segundos_reservados,
            sesiones = c.sesiones + 1, cotizaciones_emitidas = c.cotizaciones_emitidas + v_cot
        WHERE c.tenant_id = v_r.tenant_id AND c.mes = v_r.mes;
    UPDATE vc.consumo_asesor_mensual c
        SET segundos_usados = c.segundos_usados + v_usados, segundos_reservados = c.segundos_reservados - v_r.segundos_reservados,
            sesiones = c.sesiones + 1, cotizaciones_emitidas = c.cotizaciones_emitidas + v_cot
        WHERE c.tenant_id = v_r.tenant_id AND c.asesor_id = v_r.asesor_id AND c.mes = v_r.mes;
    INSERT INTO vc.consumo_diario AS d (tenant_id, fecha, segundos, sesiones, cotizaciones_emitidas)
        VALUES (v_r.tenant_id, v_dia, v_usados, 1, v_cot)
        ON CONFLICT (tenant_id, fecha) DO UPDATE SET segundos = d.segundos + EXCLUDED.segundos,
            sesiones = d.sesiones + 1, cotizaciones_emitidas = d.cotizaciones_emitidas + EXCLUDED.cotizaciones_emitidas;
    INSERT INTO vc.consumo_asesor_diario AS d (tenant_id, asesor_id, fecha, segundos, sesiones, cotizaciones_emitidas)
        VALUES (v_r.tenant_id, v_r.asesor_id, v_dia, v_usados, 1, v_cot)
        ON CONFLICT (tenant_id, asesor_id, fecha) DO UPDATE SET segundos = d.segundos + EXCLUDED.segundos,
            sesiones = d.sesiones + 1, cotizaciones_emitidas = d.cotizaciones_emitidas + EXCLUDED.cotizaciones_emitidas;
    UPDATE vc.reservas_cupo r SET liberada_en = p_ahora, segundos_cobrados = v_usados
        WHERE r.tenant_id = v_r.tenant_id AND r.sesion_id = p_sesion;
    RETURN true;
END
$$;

-- vc.reservar_cupo: reserva atómica (R56, R57). resultado: reservada,
-- reutilizada (reconexión con reserva vigente), vencida (la reserva de la
-- sesión venció: se cobró completa y la sesión debe cerrarse),
-- cuota_agotada (saldo efectivo < 60 s) o simultaneas_agotadas.
CREATE FUNCTION vc.reservar_cupo(p_tenant uuid, p_asesor text, p_sesion text, p_mes date,
                                 p_ahora timestamptz, p_segundos_max integer)
    RETURNS TABLE (resultado text, segundos integer, recortada boolean, creada_en timestamptz, vence_en timestamptz)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$
DECLARE
    v_r vc.reservas_cupo%ROWTYPE;
    v_g vc.topes_globales%ROWTYPE;
    v_tope_s bigint;
    v_tope_sim integer;
    v_a_tope_s bigint;
    v_a_tope_sim integer;
    v_saldo bigint;
    v_seg integer;
    v_venc record;
BEGIN
    IF p_tenant IS DISTINCT FROM vc.tenant_actual() OR p_segundos_max NOT BETWEEN 60 AND 86400
       OR extract(day FROM p_mes) <> 1 THEN
        RAISE EXCEPTION 'reservar_cupo: argumentos inválidos' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_g FROM vc.topes_globales t WHERE t.unica;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reservar_cupo: faltan los topes globales' USING ERRCODE = '55000';
    END IF;
    SELECT t.segundos_mes_tope, t.simultaneas_tope INTO v_tope_s, v_tope_sim FROM vc.tenants t WHERE t.tenant_id = p_tenant;
    SELECT a.segundos_mes_tope, a.simultaneas_tope INTO v_a_tope_s, v_a_tope_sim FROM vc.asesores a
        WHERE a.tenant_id = p_tenant AND a.asesor_id = p_asesor;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reservar_cupo: asesor desconocido' USING ERRCODE = '22023';
    END IF;
    -- Bloqueos en orden fijo: global → tenant → asesor.
    INSERT INTO vc.consumo_global_mensual (mes) VALUES (p_mes) ON CONFLICT (mes) DO NOTHING;
    PERFORM 1 FROM vc.consumo_global_mensual g WHERE g.mes = p_mes FOR UPDATE;
    INSERT INTO vc.consumo_mensual (tenant_id, mes) VALUES (p_tenant, p_mes) ON CONFLICT (tenant_id, mes) DO NOTHING;
    PERFORM 1 FROM vc.consumo_mensual c WHERE c.tenant_id = p_tenant AND c.mes = p_mes FOR UPDATE;
    INSERT INTO vc.consumo_asesor_mensual (tenant_id, asesor_id, mes) VALUES (p_tenant, p_asesor, p_mes)
        ON CONFLICT (tenant_id, asesor_id, mes) DO NOTHING;
    PERFORM 1 FROM vc.consumo_asesor_mensual c
        WHERE c.tenant_id = p_tenant AND c.asesor_id = p_asesor AND c.mes = p_mes FOR UPDATE;
    -- La reserva de esta sesión: reconexión o vencida.
    SELECT * INTO v_r FROM vc.reservas_cupo r WHERE r.tenant_id = p_tenant AND r.sesion_id = p_sesion;
    IF FOUND THEN
        IF v_r.liberada_en IS NULL AND v_r.vence_en > p_ahora THEN
            RETURN QUERY SELECT 'reutilizada'::text, v_r.segundos_reservados, v_r.recortada, v_r.creada_en, v_r.vence_en;
        ELSE
            PERFORM vc.liberar_cupo(p_sesion, v_r.vence_en);
            RETURN QUERY SELECT 'vencida'::text, v_r.segundos_reservados, v_r.recortada, v_r.creada_en, v_r.vence_en;
        END IF;
        RETURN;
    END IF;
    -- Las reservas vencidas sin liberar del tenant se cobran completas.
    FOR v_venc IN SELECT r.sesion_id, r.vence_en FROM vc.reservas_cupo r
                  WHERE r.tenant_id = p_tenant AND r.liberada_en IS NULL AND r.vence_en <= p_ahora LOOP
        PERFORM vc.liberar_cupo(v_venc.sesion_id, v_venc.vence_en);
    END LOOP;
    -- Saldo efectivo = mínimo de tenant, asesor (si tiene tope) y global.
    SELECT least(
        v_tope_s - (SELECT c.segundos_usados + c.segundos_reservados FROM vc.consumo_mensual c
                    WHERE c.tenant_id = p_tenant AND c.mes = p_mes),
        coalesce(v_a_tope_s - (SELECT c.segundos_usados + c.segundos_reservados FROM vc.consumo_asesor_mensual c
                               WHERE c.tenant_id = p_tenant AND c.asesor_id = p_asesor AND c.mes = p_mes), v_tope_s),
        v_g.segundos_mes - (SELECT g.segundos_usados + g.segundos_reservados FROM vc.consumo_global_mensual g
                            WHERE g.mes = p_mes))
        INTO v_saldo;
    IF v_saldo < 60 THEN
        RETURN QUERY SELECT 'cuota_agotada'::text, 0, false, NULL::timestamptz, NULL::timestamptz;
        RETURN;
    END IF;
    -- Simultáneas: reservas vigentes contadas en vivo (una llamada caída deja
    -- de ocupar lugar al vencer su reserva).
    IF (SELECT count(*) FROM vc.reservas_cupo r WHERE r.tenant_id = p_tenant AND r.liberada_en IS NULL
            AND r.vence_en > p_ahora) >= v_tope_sim
       OR (v_a_tope_sim IS NOT NULL AND (SELECT count(*) FROM vc.reservas_cupo r WHERE r.tenant_id = p_tenant
            AND r.asesor_id = p_asesor AND r.liberada_en IS NULL AND r.vence_en > p_ahora) >= v_a_tope_sim)
       OR (SELECT count(*) FROM vc.reservas_cupo r WHERE r.liberada_en IS NULL AND r.vence_en > p_ahora) >= v_g.simultaneas THEN
        RETURN QUERY SELECT 'simultaneas_agotadas'::text, 0, false, NULL::timestamptz, NULL::timestamptz;
        RETURN;
    END IF;
    v_seg := least(p_segundos_max, v_saldo)::integer;
    INSERT INTO vc.reservas_cupo (tenant_id, sesion_id, asesor_id, mes, segundos_reservados, recortada, creada_en, vence_en)
        VALUES (p_tenant, p_sesion, p_asesor, p_mes, v_seg, v_seg < p_segundos_max, p_ahora,
                p_ahora + make_interval(secs => v_seg + 60));
    UPDATE vc.consumo_global_mensual g SET segundos_reservados = g.segundos_reservados + v_seg WHERE g.mes = p_mes;
    UPDATE vc.consumo_mensual c SET segundos_reservados = c.segundos_reservados + v_seg
        WHERE c.tenant_id = p_tenant AND c.mes = p_mes;
    UPDATE vc.consumo_asesor_mensual c SET segundos_reservados = c.segundos_reservados + v_seg
        WHERE c.tenant_id = p_tenant AND c.asesor_id = p_asesor AND c.mes = p_mes;
    RETURN QUERY SELECT 'reservada'::text, v_seg, v_seg < p_segundos_max, p_ahora, p_ahora + make_interval(secs => v_seg + 60);
END
$$;

-- `api servir` no arranca sin topes globales válidos (falla cerrada, G3).
CREATE FUNCTION vc.topes_globales_vigentes()
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
    AS $$ SELECT EXISTS (SELECT 1 FROM vc.topes_globales t WHERE t.unica AND t.segundos_mes > 0 AND t.simultaneas > 0) $$;

REVOKE ALL ON FUNCTION vc.liberar_cupo(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc.reservar_cupo(uuid, text, text, date, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION vc.topes_globales_vigentes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vc.liberar_cupo(text, timestamptz) TO vc_api;
GRANT EXECUTE ON FUNCTION vc.reservar_cupo(uuid, text, text, date, timestamptz, integer) TO vc_api;
GRANT EXECUTE ON FUNCTION vc.topes_globales_vigentes() TO vc_api;

-- vc_api solo lee los contadores (leerConsumo) y las reservas; sin acceso a
-- las tablas globales.
GRANT SELECT ON vc.consumo_mensual, vc.consumo_diario, vc.consumo_asesor_mensual, vc.consumo_asesor_diario,
                vc.reservas_cupo TO vc_api;

-- H7: Origin exacto https, sin comodines, sin ruta (Origin.schema.json), también
-- en la base. Ningún Origin contiene ',' así que la lista se valida unida.
ALTER TABLE vc.claves_api ADD CONSTRAINT claves_api_origenes_formato CHECK (
    array_position(origenes, NULL) IS NULL
    AND (cardinality(origenes) = 0
         OR array_to_string(origenes, ',') ~
            '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:[0-9]{1,5})?(,https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(:[0-9]{1,5})?)*$')
);
