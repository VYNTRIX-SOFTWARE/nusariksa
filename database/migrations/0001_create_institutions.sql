CREATE TABLE institutions (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  kind text NOT NULL CHECK (kind IN ('BPR', 'BPRS')),
  created_at timestamptz NOT NULL DEFAULT now()
);
