// A real Postgres, in memory (PGlite), with this project's migrations applied,
// so database rules (who can see or change what, and the triggers) are tested
// for real instead of assumed.
//
// Supabase provides a few things the migrations expect; they are stubbed here
// as small as possible: the two sign-in roles, the login table, "who is
// signed in" (auth.uid()), and the storage tables. Everything else is the
// project's own SQL, run in file order, exactly as written.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  -- Same behaviour as Supabase: read the signed-in user from the request's claims.
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')
    )::uuid
  $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean default false, file_size_limit bigint
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(name, '/')
  $$;
  -- Supabase's default grants: signed-in users reach tables through row-level security.
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  grant all on all tables in schema storage to authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

export interface Rules {
  db: PGlite;
  // Run SQL as a signed-in user (row-level security applies), or as nobody.
  as<T = Record<string, unknown>>(userId: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  // Run SQL as the database owner (like the SQL editor or a migration): no row-level security.
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  // Create a login the way Supabase does; the project's trigger makes the profile.
  signUp(email: string, name?: string): Promise<string>;
  close(): Promise<void>;
}

export async function startRules(upTo?: string): Promise<Rules> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !upTo || f <= upTo);
  for (const f of files) {
    let sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    // Supabase installs this already; PGlite has gen_random_uuid() built in.
    sql = sql.replace(/create extension if not exists pgcrypto;/gi, '');
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    }
  }

  const run = async <T,>(role: 'authenticated' | 'anon' | null, uid: string | null, sql: string, params?: unknown[]) => {
    // One transaction so the role and the signed-in user can't leak into the next call.
    return db.transaction(async (tx) => {
      if (role) {
        await tx.exec(`set local role ${role}`);
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
      }
      const res = await tx.query<T>(sql, params as unknown[]);
      return res.rows;
    });
  };

  return {
    db,
    as: (userId, sql, params) => run(userId ? 'authenticated' : 'anon', userId, sql, params),
    admin: (sql, params) => run(null, null, sql, params),
    async signUp(email, name = '') {
      const rows = await run<{ id: string }>(null, null, `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`, [
        email,
        JSON.stringify({ full_name: name }),
      ]);
      return rows[0].id;
    },
    close: () => db.close(),
  };
}
