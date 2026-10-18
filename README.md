This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database migrations (PostgreSQL)

`prisma/migrations/` is a PostgreSQL migration history (the old SQLite-era
migrations are kept for reference in `prisma/migrations_legacy_sqlite/`).

- **Fresh database:** `npx prisma migrate deploy`, then `npm run db:seed`.
- **Existing database created with `db push` before v1.17.0:** mark the
  baseline as already applied, then deploy the rest:
  ```
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma   # review first
  npx prisma migrate resolve --applied 20260414000000_postgres_baseline
  npx prisma migrate deploy
  ```
  If the first command shows differences beyond the `review_fixes` migration,
  your database drifted from the baseline — reconcile before deploying.

## Required environment

See `.env.example`. `APP_MASTER_PASSWORD` is required (the app fails closed
without it); set `AUTH_SECRET`, `APP_ENCRYPTION_KEY` and `CRON_SECRET` in
production.
