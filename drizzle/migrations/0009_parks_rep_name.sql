alter table public.parks add column if not exists rep_name text not null default '';
update public.parks set rep_name = case name
  when 'Haveringland Hall' then 'Ben Cook'
  when 'Carlton Manor' then 'Ben Cook'
  when 'Merry Hill' then 'Ben Cook'
  when 'Walworth Retreat' then 'Jackie Hilditch'
  when 'Harvey''s Nurseries' then 'Cheryl Smith'
  when 'Castle View' then 'Jenna Fowler'
  when 'Coastal Retreat' then 'Melanie Davidson'
  when 'Outhill View' then 'Alison Dallimer'
  when 'Dales View' then 'Bryan Marquis'
  when 'Sun Valley' then 'Claire McCulloch'
  else rep_name end
where rep_name = '';

-- parks is director-writable already via the parks write policy; column inherits table grants.
