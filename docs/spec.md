Product Specification: Social Media Scheduler
Core Objective
Build a unified dashboard to compose text and media, schedule it for a future date, and automatically publish it to X, LinkedIn, and Instagram.

Database Schema Design (MongoDB)
User Collection: Single document containing the master admin configuration.

SocialIdentity Collection: Stores OAuth Access Tokens, Refresh Tokens, platform identifiers, and token expiration dates securely.

Post Collection:

content: String (the text payload)

mediaUrls: Array of Strings

targetPlatforms: Array of Enums (X, LINKEDIN, INSTAGRAM)

scheduledExecutionTime: Date

status: Enum (DRAFT, SCHEDULED, PUBLISHED, FAILED)

Architectural Flow
Frontend: User drafts a post. Next.js UI dynamically validates character limits per platform (e.g., 280 for X, 3000 for LinkedIn). User selects a scheduled time.

API Route: Next.js receives the payload and saves the Post to MongoDB with status: SCHEDULED.

Queueing: The API calculates the delay (Scheduled Time - Current Time) and pushes the Job ID to BullMQ using the delay option.

Worker Execution: When the delay reaches zero, the BullMQ worker pulls the job.

Dispatch:

If X or LinkedIn: Execute via standard REST API services using stored OAuth tokens.

If Instagram Personal: Spin up a headless Playwright Chromium instance, inject session cookies, and automate DOM clicks to publish.

Reconciliation: Update the MongoDB Post status to PUBLISHED or FAILED.