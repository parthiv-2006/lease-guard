-- Carry the regulation relabel from 016 into reports generated before it.
--
-- Reports and clause reasoning store the statute act_name as it was at analysis
-- time, so existing reports still cite "O. Reg. 516/06 — Maintenance Standards"
-- and "O. Reg. 517/06 — Rent Increase". Only the label text changes; section
-- numbers, scores and the rest of each report are left exactly as generated.
--
-- The replacements include the regulation number, so they cannot collide with
-- each other or with the correct labels.

update clauses
set risk_reasoning = replace(
      replace(risk_reasoning, 'O. Reg. 516/06 — Maintenance Standards', 'O. Reg. 516/06 — General'),
      'O. Reg. 517/06 — Rent Increase', 'O. Reg. 517/06 — Maintenance Standards')
where risk_reasoning like '%O. Reg. 516/06 — Maintenance Standards%'
   or risk_reasoning like '%O. Reg. 517/06 — Rent Increase%';

update reports
set full_report_json = replace(
      replace(full_report_json::text, 'O. Reg. 516/06 — Maintenance Standards', 'O. Reg. 516/06 — General'),
      'O. Reg. 517/06 — Rent Increase', 'O. Reg. 517/06 — Maintenance Standards')::jsonb
where full_report_json::text like '%O. Reg. 516/06 — Maintenance Standards%'
   or full_report_json::text like '%O. Reg. 517/06 — Rent Increase%';
