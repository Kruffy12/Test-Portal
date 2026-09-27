-- ServiCell Phase 2 — run ONLY after the owner confirms everything works.
-- Deletes the backup copy, which includes the old plain-text passwords. After this, rollback is no
-- longer possible (and no longer needed).

drop schema if exists phase2_backup cascade;
insert into public.audit_log (event, actor) values ('PHASE2_BACKUP_DROPPED', 'Phase 2 | plain-text password copy deleted');
