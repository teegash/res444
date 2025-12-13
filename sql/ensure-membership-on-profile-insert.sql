-- Auto-create organization membership for a user profile when organization_id is present
-- This keeps organization_members consistent without relying on app-layer race-prone inserts.
CREATE OR REPLACE FUNCTION public.ensure_membership_on_profile_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act if organization_id is set
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insert membership if missing; default role to profile role or tenant
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.id, NEW.organization_id, COALESCE(NEW.role, 'tenant'))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_membership_on_profile_insert ON public.user_profiles;

CREATE TRIGGER trg_ensure_membership_on_profile_insert
AFTER INSERT ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_membership_on_profile_insert();
