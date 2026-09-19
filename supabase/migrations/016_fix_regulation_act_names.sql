-- Fix swapped regulation labels in the statute corpus.
--
-- scripts/build_regulations.py originally labelled O. Reg. 516/06 as
-- "Maintenance Standards" and O. Reg. 517/06 as "Rent Increase", and tagged
-- their clause types to match. The section text was always correct — only the
-- labels were swapped: 516/06 is the General regulation (mostly rent rules)
-- and 517/06 is Maintenance Standards.
--
-- relevant_clause_types is not read by search_statutes / search_statutes_hybrid,
-- so this does not change retrieval ranking; it corrects the act names shown in
-- citations and the tags any future filter would rely on.

update statutes
set act_name = 'O. Reg. 516/06 — General',
    relevant_clause_types = case
      when section_number in ('4', '8', '8.1', '8.2', '8.3', '8.4') then '{maintenance_repairs}'::clause_type[]
      when section_number = '17' then '{security_deposit}'::clause_type[]
      when section_number = '46' then '{early_termination}'::clause_type[]
      else '{rent_increase}'::clause_type[]
    end
where jurisdiction_code = 'CA-ON'
  and act_name = 'O. Reg. 516/06 — Maintenance Standards';

update statutes
set act_name = 'O. Reg. 517/06 — Maintenance Standards',
    relevant_clause_types = '{maintenance_repairs}'::clause_type[]
where jurisdiction_code = 'CA-ON'
  and act_name = 'O. Reg. 517/06 — Rent Increase';
