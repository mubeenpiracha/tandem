-- Initialize the database with required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create user if not exists (for development)
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'tandem') THEN

      CREATE ROLE tandem LOGIN PASSWORD 'tandem123';
   END IF;
END
$do$;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE tandem_dev TO tandem;
GRANT ALL PRIVILEGES ON SCHEMA public TO tandem;