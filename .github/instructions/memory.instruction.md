Agent Memory & Binding Decisions
This file contains persistent decisions and project-specific patterns. Update this file when the user asks to remember a specific pattern.

Database: Exclusively use Mongoose for MongoDB interactions. Do not use Prisma.

Styling: Use standard Tailwind CSS utility classes. Avoid creating custom CSS files unless absolutely necessary.

Date Handling: Use date-fns for all timezone and UTC calculations to ensure consistency between the Next.js frontend and the BullMQ backend.