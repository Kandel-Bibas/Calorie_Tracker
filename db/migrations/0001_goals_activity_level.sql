ALTER TABLE goals
  ADD COLUMN activity_level text DEFAULT 'sedentary';

ALTER TABLE goals
  ADD CONSTRAINT goals_al_chk
  CHECK (activity_level IN ('sedentary','light','moderate','active','very_active'));
