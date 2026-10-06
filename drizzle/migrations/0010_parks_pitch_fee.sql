ALTER TABLE public.parks ADD COLUMN pitch_fee text NOT NULL DEFAULT '';
COMMENT ON COLUMN public.parks.pitch_fee IS 'Initial monthly pitch fee, auto-filled on sales forms';