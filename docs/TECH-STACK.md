# Aviation Clarity™ Technical Stack

## Application
- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS

## Data
- Supabase PostgreSQL
- Row Level Security
- Supabase Auth
- Storage for generated assets

## AI
- OpenAI API
- Structured outputs / JSON schemas
- Retrieval-augmented generation over approved aviation sources
- Agent orchestration with explicit workflow state

## Infrastructure
- GitHub — source control and CI
- Vercel — hosting, preview deployments, production
- Infisical — secrets management

## Commerce
- Stripe Checkout
- Stripe webhooks
- Product catalog stored in Supabase

## Growth
- PostHog analytics
- Search Console / Bing Webmaster Tools
- Email provider adapter

## Media
- Image/video generation provider adapters
- Object storage/CDN

## Engineering standards
- Strict TypeScript
- Zod-style runtime validation at external boundaries
- Unit tests for domain logic
- API integration tests
- End-to-end smoke tests for critical paths
- No secrets in repository
- Environment-specific configuration

## Architecture principle
Business logic must remain provider-agnostic. AI, database, payments, analytics, email, and media integrations use adapters so providers can be replaced without rewriting core product logic.
