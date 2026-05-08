-- Create socket table
CREATE TABLE IF NOT EXISTS public.socket_cells(
  id serial NOT NULL PRIMARY KEY,
  cell text NOT NULL UNIQUE
);

-- Insert migration record
INSERT INTO migrations (migration_name) VALUES ('migration_002_create_socket_cells.sql') ON CONFLICT (migration_name) DO NOTHING;