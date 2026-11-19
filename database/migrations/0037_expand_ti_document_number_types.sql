-- Expand the counter domain without changing applied migration 0035.
ALTER TABLE ti_document_number_counters
 DROP CONSTRAINT ti_document_number_counters_document_kind_check;
ALTER TABLE ti_document_number_counters
 ADD CONSTRAINT ti_document_number_counters_document_kind_check
 CHECK(document_kind IN ('asset','incident','risk','finding','vendor','contract','recovery'));
