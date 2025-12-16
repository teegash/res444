-- Seed default rent stage SMS templates per organization.
-- Replace <ORG_ID> with your organization_id before running.

insert into public.sms_templates (organization_id, template_key, content)
values
  ('<ORG_ID>', 'rent_stage_1', 'Reminder: Your rent for {{period_label}} is due on {{due_date}}. Amount: KES {{amount}}.'),
  ('<ORG_ID>', 'rent_stage_2', 'Rent reminder: Please pay KES {{amount}} by {{due_date}} for {{period_label}}.'),
  ('<ORG_ID>', 'rent_stage_3', 'Final reminder: Rent KES {{amount}} is due today ({{due_date}}) for {{period_label}}.'),
  ('<ORG_ID>', 'rent_stage_4', 'Urgent: Your rent is 7 days overdue. Amount: KES {{amount}}. Please pay immediately.'),
  ('<ORG_ID>', 'rent_stage_5', 'Critical notice: confirm your outstanding rent arrears. Please contact management urgently.')
on conflict (organization_id, template_key)
do update set content = excluded.content;
