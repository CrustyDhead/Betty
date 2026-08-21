-- Office Bets — support multiple subjects per bet ("about Ploy and Sai")
--
-- Replaces the single subject_user_id/subject_name columns with arrays so a
-- bet can be about more than one person. Existing single-subject data is
-- migrated into the new array columns before the old ones are dropped.

alter table bets add column subject_user_ids uuid[] not null default '{}';
alter table bets add column subject_names text[] not null default '{}';

update bets set subject_user_ids = array[subject_user_id] where subject_user_id is not null;
update bets set subject_names = array[subject_name] where subject_name is not null;

alter table bets drop column subject_user_id;
alter table bets drop column subject_name;
