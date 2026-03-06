import { neon } from "@neondatabase/serverless";

function getSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Configure it in your environment variables.");
  }

  return neon(databaseUrl);
}

export async function dbHealthCheck() {
  const sql = getSqlClient();
  const result = (await sql`SELECT 1 AS ok`) as Array<{ ok: number }>;
  return result[0]?.ok === 1;
}
