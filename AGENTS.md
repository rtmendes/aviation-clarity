# Aviation Clarity — Agent Instructions

## Mission
Build the Aviation Clarity AI-native learning, content, product and growth platform.

## Engineering loop
INSPECT → PLAN → IMPLEMENT → TEST → BUILD → VERIFY → COMMIT → UPDATE CHECKLIST → CONTINUE.

## Rules
- Never expose or commit secrets.
- Secrets are supplied at runtime by Infisical or deployment environment.
- GitHub is the source of truth.
- Vercel is the deployment target.
- docs/CHECKLIST.md is canonical project status.
- docs/BUILD-STATUS.md must reflect verified infrastructure state.
- Use strict TypeScript and small testable modules.
- Validate external inputs and provider responses.
- Add tests for domain logic and critical workflows.
- Do not mark infrastructure complete without actual verification.
- Aviation technical, regulatory, operational, aircraft-specific, medical and safety-critical claims require authoritative verification and appropriate qualified review.
- Never present generated aviation content as verified merely because an AI model generated it.
- Prefer provider adapters for AI, database, payments, analytics, email and media.
- Continue through all unblocked checklist items; do not stop after scaffolding.

## Core workflow
INTAKE → RESEARCH → VERIFY → TRANSFORM → GENERATE → QA → APPROVE → PUBLISH → MEASURE → LEARN.

## Core modules
Command Center; Research Lab; Knowledge Base; Aviation Explanation Engine; Agent Studio; Content Factory; Book Factory; Product Factory; QA Center; Content Calendar; Growth/Funnel Engine; Analytics.

## Definition of done
Code exists + tests pass + production build passes + documentation updated + deployment verified where applicable + checklist updated.
