-- Só roda automaticamente quando o volume do MySQL é criado do zero
-- (docker-entrypoint-initdb.d). Em volumes já existentes, o banco de teste
-- foi criado manualmente uma vez (ver docs/DECISIONS.md ADR-014).
CREATE DATABASE IF NOT EXISTS logisense_test_db;
GRANT ALL PRIVILEGES ON logisense_test_db.* TO 'logistics'@'%';
FLUSH PRIVILEGES;
