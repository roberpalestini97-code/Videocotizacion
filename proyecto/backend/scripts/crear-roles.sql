-- Crea los roles y la base de VideoCotización (ADR 0004 punto 3). Lo corre UNA
-- vez un administrador del clúster (no la API ni el migrador):
--   psql "$URL_ADMIN" -v ON_ERROR_STOP=1 \
--        -v clave_dueno="$CLAVE_DUENO" -v clave_api="$CLAVE_API" \
--        -f scripts/crear-roles.sql
-- Las claves salen del gestor de secretos (T29); nunca se escriben en el repo.

-- Dueño del esquema: solo lo usa `api migrar`.
CREATE ROLE vc_dueno LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION
    PASSWORD :'clave_dueno';

-- Rol de la API: sin superusuario, sin BYPASSRLS, no dueño de nada y sin
-- heredar otros roles. La API verifica todo esto al arrancar.
CREATE ROLE vc_api LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION NOINHERIT
    PASSWORD :'clave_api';

CREATE DATABASE videocotizacion OWNER vc_dueno ENCODING 'UTF8';
REVOKE ALL ON DATABASE videocotizacion FROM PUBLIC;
GRANT CONNECT ON DATABASE videocotizacion TO vc_api;
