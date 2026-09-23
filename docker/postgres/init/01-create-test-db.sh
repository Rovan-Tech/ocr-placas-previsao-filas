#!/bin/sh
# Banco separado para os testes de migração (pytest), para não mexer nos dados de dev.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
	CREATE DATABASE ${POSTGRES_DB}_test OWNER ${POSTGRES_USER};
SQL
