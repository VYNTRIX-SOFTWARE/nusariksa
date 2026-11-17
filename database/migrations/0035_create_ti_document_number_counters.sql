-- Institution-scoped, transactional record numbering. Sequence allocations
-- participate in the same transaction as record creation.
CREATE TABLE ti_document_number_counters(
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  document_kind text NOT NULL CHECK(document_kind IN ('asset','incident')),
  document_year integer NOT NULL CHECK(document_year BETWEEN 2000 AND 9999),
  last_number integer NOT NULL CHECK(last_number BETWEEN 1 AND 999999),
  PRIMARY KEY(institution_id,document_kind,document_year)
);
