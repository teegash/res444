-- Create a trigger to automatically create user_profiles when a new user signs up
-- This ensures profiles are always created, even if registration fails to create them

-- First, create a function that will be called by the trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, phone_number, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING; -- If profile already exists, do nothing
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

