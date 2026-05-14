-- Report feedback table (tracks factual accuracy reports from users)

create table report_feedback (
  id          uuid primary key default uuid_generate_v4(),
  lease_id    uuid not null references leases(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  accurate    boolean not null,
  comment     text check (char_length(comment) <= 1000)
);

create index idx_feedback_lease_id on report_feedback(lease_id);
create index idx_feedback_accurate on report_feedback(accurate);
