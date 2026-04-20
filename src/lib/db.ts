import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

// Prisma v7 requires an explicit driver adapter.
// PrismaPg wraps a node-postgres Pool — works with any standard PostgreSQL
// provider (Supabase, Vercel Postgres, Neon, Railway, local Docker, etc.).
//
// Connection-pool tuning:
//   • max: 1   — recommended for serverless (Vercel functions)
//   • max: 10  — good for long-running servers
// If your provider uses PgBouncer, append ?pgbouncer=true&connection_limit=1
// to DATABASE_URL and also set DIRECT_URL for Prisma migrations.

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set")
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Keep the pool small in serverless environments
    max: process.env.NODE_ENV === "production" ? 1 : 10,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
