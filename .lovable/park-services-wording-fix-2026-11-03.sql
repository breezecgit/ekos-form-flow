-- Park services wording correction, applied to the live database on 3 November 2026.
-- Emma confirmed the client's wording ("Sewerage and Water") over the spreadsheet's
-- "Sewerage, Water" for Harvey's Nurseries only. Migration 0017 stays as the record of
-- what originally ran; this file is the record of the data fix applied afterwards, and
-- src/lib/forms/park-services.test.ts guards it.
--
-- Applied via the database query tool (data fix, not a schema migration).

UPDATE public.parks
SET services_included = 'Sewerage and Water'
WHERE name = 'Harvey''s Nurseries';

-- Deliberately unchanged, exactly as the approved spreadsheet has them:
--   Haveringland Hall, Merry Hill, Walworth Retreat -> 'Sewerage, Water'
--   Castle View, Outhill View, Carlton Manor, Coastal Retreat, Sun Valley -> 'Sewerage'
--   Dales View -> '' (Sewerage sits in Additional Charges)
