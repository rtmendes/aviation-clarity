-- Aviation Clarity — authoritative source registry
--
-- Apply after the migrations:
--   psql "$POSTGRES_URL" -f supabase/seed/authoritative-sources.sql
--
-- These are the documents a reviewer cites when verifying a claim. Only sources
-- whose URL was confirmed to resolve are listed: a citation registry containing
-- dead links is worse than an empty one, because a reviewer trusts it.
--
-- Every URL below returned HTTP 200 on 2026-08-30. Re-check them with
-- `npm run verify:sources` — federal handbook URLs move.
--
-- Idempotent: re-running updates titles and metadata without duplicating rows.

insert into public.sources (title, url, source_type, authority_score, notes) values

-- Regulation. The primary text; nothing outranks it.
('14 CFR Part 61 — Certification: Pilots, Flight Instructors, and Ground Instructors',
 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61',
 'regulation', 1.00,
 'Certification, ratings, currency and instructor privileges. Cite for any claim about what a certificate or rating permits.'),

('14 CFR Part 91 — General Operating and Flight Rules',
 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-91',
 'regulation', 1.00,
 'Operating rules, minimums, equipment and airspace requirements. Cite for any operational limit stated as a rule.'),

('14 CFR Part 67 — Medical Standards and Certification',
 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-67',
 'regulation', 1.00,
 'Medical certificate classes and standards. Cite for aeromedical certification claims; it does not make anyone a physician.'),

('14 CFR Part 141 — Pilot Schools',
 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-H/part-141',
 'regulation', 1.00,
 'Approved school curricula and requirements. Cite for claims about structured training programmes.'),

-- FAA guidance and handbooks.
('FAA-H-8083-25 — Pilot''s Handbook of Aeronautical Knowledge',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak',
 'faa', 1.00,
 'The default citation for foundational aeronautical knowledge: aerodynamics, weather, navigation, systems.'),

('FAA-H-8083-3 — Airplane Flying Handbook',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook',
 'faa', 1.00,
 'Flight manoeuvres and the reasoning behind them. Cite for how and why a manoeuvre behaves as it does.'),

('FAA-H-8083-16 — Instrument Procedures Handbook',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/instrument_procedures_handbook',
 'faa', 1.00,
 'Instrument procedures and the system they operate within.'),

('FAA-H-8083-9 — Aviation Instructor''s Handbook',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/aviation_instructors_handbook',
 'faa', 1.00,
 'Learning theory and instructional technique. The citation for teaching-method claims in the Train the Trainer series.'),

('FAA Handbooks and Manuals — Aviation',
 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation',
 'faa', 0.95,
 'Index of current handbooks. Use to locate a specific handbook when a direct URL has moved; prefer citing the handbook itself.'),

('Aeronautical Information Manual',
 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/',
 'faa', 1.00,
 'Procedures, phraseology and airspace practice. Guidance rather than regulation — cite alongside the rule, not instead of it.'),

('Airman Certification Standards',
 'https://www.faa.gov/training_testing/testing/acs',
 'faa', 1.00,
 'What a checkride actually tests, to what tolerance. The citation for every Pass the Test & Checkride claim.'),

('FAA Advisory Circulars',
 'https://www.faa.gov/regulations_policies/advisory_circulars',
 'faa', 0.95,
 'Acceptable means of compliance. Index — cite the specific AC number once identified.'),

('FAA Safety Briefing',
 'https://www.faa.gov/newsroom/faa-safety-briefing',
 'faa', 0.85,
 'Current safety themes and campaigns. Useful for framing and currency, weaker than a handbook for technical claims.'),

-- Investigative record.
('NTSB Aviation Investigations',
 'https://www.ntsb.gov/investigations/Pages/aviation.aspx',
 'government', 0.95,
 'Accident and incident reports. Cite for scenario and case-study material; never as a source for procedure.')

on conflict (url) do update set
  title = excluded.title,
  source_type = excluded.source_type,
  authority_score = excluded.authority_score,
  notes = excluded.notes,
  checked_at = now();
