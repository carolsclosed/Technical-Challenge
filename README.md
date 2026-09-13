<!-- markdownlint-disable MD013 -->
# Mesa marketplace

A multi-merchant food-ordering marketplace built with Next.js, TypeScript, Tailwind CSS, Supabase Auth, and PostgreSQL.

Customers can combine products from several stores in one cart. Checkout creates a separate order for each store, and each merchant sees only its own orders. Prices are in EUR and payment is cash on delivery.

## Run locally

Requirements: Node.js 22 or 24, npm, and Docker Desktop.

For the first run:

```bash
npm ci
npm run db:setup
npm run dev
```

Open <http://localhost:3000>. `db:setup` starts Supabase, applies pending migrations, and adds any missing development fixtures without deleting existing local accounts.

For later runs, `db:start` starts the existing database without deleting its data:

```bash
npm run db:start
npm run dev
```

Local tools: [Supabase Studio](http://127.0.0.1:54323) and [Mailpit](http://127.0.0.1:54324).
Authentication emails pass through the running Next.js app, so start `npm run dev`
before testing signup or recovery. Mailpit receives messages only when `.env.local`
uses `SMTP_HOST=127.0.0.1`, `SMTP_PORT=54325`, and `SMTP_ALLOW_LOCAL=true`;
with Gmail SMTP configured, messages go to the real recipient instead.

To intentionally delete and rebuild all local data:

```bash
npm run db:reset
npm run seed:users
npm run db:types
```

## Docker Compose

To run the application and local Supabase together with Docker Desktop:

```bash
docker compose up --build
```

## Architecture and rules

- One Next.js application uses Supabase Auth and PostgreSQL.
- PostgreSQL Row Level Security isolates customers, merchants, and employees.
- Privileged accounts require verified email and TOTP two-factor authentication.
- Database transactions split a multi-store cart into independent store orders.
- Super admins manage merchants; merchant admins manage their business and team.
- Staff and operators have narrower permissions for assigned stores.
- Indexed tenant data and paginated catalog reads support growth across merchants.
- Application data uses the Supabase SDK with RLS and no database RPC calls.
- The only payment method is cash on delivery.

## Local accounts

All seeded accounts use password `LocalMesa!2026`.

| Email | Role |
| --- | --- |
| `superadmin@mesa.test` | Super admin |
| `admin@mesa.test` | Bairro merchant admin |
| `staff@mesa.test` | Bairro staff |
| `operator@mesa.test` | Bairro operator |
| `admin2@mesa.test` | Verde merchant admin |
| `staff2@mesa.test` | Verde staff |
| `operator2@mesa.test` | Verde operator |
| `pending@mesa.test` | Pending merchant applicant |
| `suspended@mesa.test` | Suspended merchant admin |
| `customer@mesa.test` | Customer |
| `customer2@mesa.test` | Customer |

Privileged accounts enroll an authenticator during their first sign-in. These accounts are development fixtures and must not be used in production.

## Tests

```bash
npm run lint && npm run typecheck && npm test
npm run test:db && npm run test:e2e
npm run build
```

Run `npx playwright install chromium` once before the end-to-end tests.
