-- Park services wording corrections, applied to the live database on 3 November 2026.
-- Emma confirmed the client's wording ("Sewerage and Water") over the spreadsheet's
-- comma version. Migration 0017 stays as the record of what originally ran; this file
-- is the record of the data fixes applied afterwards, and
-- src/lib/forms/park-services.test.ts guards it.
--
-- Applied via the database query tool (data fixes, not a schema migration).

-- Fix 1 (3 Nov 2026): Harvey's Nurseries, the park the client flagged.
UPDATE public.parks
SET services_included = 'Sewerage and Water'
WHERE name = 'Harvey''s Nurseries';

-- Fix 2 (3 Nov 2026): the three parks still on the spreadsheet's comma wording,
-- switched to match on Emma's instruction.
UPDATE public.parks
SET services_included = 'Sewerage and Water'
WHERE name IN ('Haveringland Hall','Merry Hill','Walworth Retreat');

-- Deliberately unchanged:
--   Castle View, Outhill View, Carlton Manor, Coastal Retreat, Sun Valley -> 'Sewerage'
--   Dales View -> '' (Sewerage sits in Additional Charges)
