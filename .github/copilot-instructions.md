Global Copilot Instructions: Personal Social Media Scheduler
Project Context
This is a single-tenant, personal-use social media scheduling and broadcasting tool designed to bypass commercial SaaS restrictions.

Technology Stack
Frontend & API: Next.js (App Router), React, TypeScript, Tailwind CSS

Database: MongoDB (using Mongoose ODM)

Caching & Queues: Redis

Task Scheduling: BullMQ

Browser Automation: Playwright (strictly for restricted platforms like personal Instagram)

Core Development Rules
Strict TypeScript: Enforce strict mode. All Mongoose schemas, API responses, and BullMQ jobs must have clearly defined TypeScript interfaces.

Error Handling: Implement try/catch blocks for all external API calls. Use BullMQ's exponential backoff settings for HTTP 429 (Too Many Requests) errors.

Security: Never hardcode API keys. Always use process.env. Do not build multi-tenant auth; use a single hardcoded master password via environment variables for access.

Modularity: Isolate all third-party API integration logic into a dedicated services/ directory using the Strategy Design Pattern.

No Hallucinations: Base all logic on the defined docs/spec.md. If a requirement is unclear, ask for clarification before writing code.