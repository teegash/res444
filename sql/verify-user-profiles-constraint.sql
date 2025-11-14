-- Verify that user_profiles.id foreign key constraint exists
-- This is a safe query that checks first before creating

-- First, check if the constraint exists
SELECT 
  constraint_name,
  table_name,
  constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'user_profiles' 
AND constraint_name = 'user_profiles_id_fkey';

-- If the above query returns a row, the constraint exists ✅
-- If it returns no rows, run the query below to create it

-- Safe creation (only creates if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE table_name = 'user_profiles' 
    AND constraint_name = 'user_profiles_id_fkey'
  ) THEN
    ALTER TABLE user_profiles 
    ADD CONSTRAINT user_profiles_id_fkey 
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Constraint user_profiles_id_fkey created successfully';
  ELSE
    RAISE NOTICE 'Constraint user_profiles_id_fkey already exists - no action needed';
  END IF;
END $$;

