-- A login-less staff member who is not a barber (assistant, cleaner, ...): on payroll and attendance,
-- never offered as "who served this customer". Its own file because Postgres will not let a new enum
-- value be used in the same transaction that adds it.
alter type staff_role add value if not exists 'employee';
