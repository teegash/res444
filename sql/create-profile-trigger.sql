-- Create a trigger to automatically create user_profiles when a new user signs up
-- This ensures profiles are always created, even if registration fails to create them

-- First, create a function that will be called by the trigger
-- Updated to also set role from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := NULLIF(NEW.raw_user_meta_data->>'organization_id', '')::uuid;

  -- organization_id is NOT NULL on user_profiles in this schema.
  -- If org id is not provided at signup, do not create the profile here (avoid failing auth user creation).
  -- The app layer must create the profile once it knows the org.
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (id, full_name, phone_number, role, organization_id, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.raw_user_meta_data->>'phone_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', NULL),
    v_org_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    phone_number = COALESCE(EXCLUDED.phone_number, user_profiles.phone_number),
    role = COALESCE(EXCLUDED.role, user_profiles.role),
    organization_id = COALESCE(user_profiles.organization_id, EXCLUDED.organization_id),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger that fires after a new user is inserted into auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.user_profiles TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
