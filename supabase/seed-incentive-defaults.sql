-- Optional starter row so the Revenue & Incentives page has something to
-- show before Admin configures real rules in Settings. Safe to delete/edit
-- any time from the Settings UI — this is not hardcoded into the app.
insert into public.incentive_settings (programme, type, value, effective_from)
select null, 'percentage', 2.0, current_date
where not exists (select 1 from public.incentive_settings);
