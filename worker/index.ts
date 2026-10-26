/* eslint-disable @typescript-eslint/no-explicit-any */
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

interface Env { ASSETS: { fetch(request: Request): Promise<Response> }; POSTGRES_URL: string; SUPABASE_JWT_SECRET?: string; }

type Claims = { sub: string; role: 'admin' | 'student' };
const schema = `create table if not exists users (id uuid primary key, email text unique not null, password_hash text not null, created_at timestamptz not null default now());
create table if not exists profiles (id uuid primary key references users(id) on delete cascade, email text unique not null, role text not null check (role in ('admin','student')), display_name text, must_change_password boolean not null default false, created_at timestamptz not null default now());
create table if not exists time_slots (id uuid primary key, admin_id uuid not null references users(id) on delete cascade, start_at timestamptz not null, end_at timestamptz not null, status text not null default 'open', created_at timestamptz not null default now());
create table if not exists bookings (id uuid primary key, slot_id uuid not null references time_slots(id) on delete cascade, student_id uuid not null references users(id) on delete cascade, status text not null default 'pending', note text, created_at timestamptz not null default now());
create unique index if not exists one_active_booking_per_slot on bookings(slot_id) where status in ('pending','confirmed');`;

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' } }); }
function token(env: Env, claims: Claims) { return jwt.sign(claims, env.SUPABASE_JWT_SECRET ?? 'development-only-secret', { expiresIn: '7d' }); }
function auth(request: Request, env: Env) { const raw = request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''); if (!raw) return null; try { return jwt.verify(raw, env.SUPABASE_JWT_SECRET ?? 'development-only-secret') as Claims; } catch { return null; } }
function id() { return crypto.randomUUID(); }

async function handler(request: Request, env: Env) {
  if (request.method === 'OPTIONS') return json(null, 204);
  if (!env.POSTGRES_URL) return json({ error: 'Postgres is not configured.' }, 500);
  const sql = neon(env.POSTGRES_URL);
  await sql(schema);
  const url = new URL(request.url); const path = url.pathname.replace(/^\/api\/?/, '');
  if (path === 'auth/sign-in' && request.method === 'POST') {
    const { email, password } = await request.json() as { email: string; password: string };
    const rows = await sql`select u.id, u.email, u.password_hash, p.role from users u join profiles p on p.id = u.id where lower(u.email) = lower(${email.trim()})`;
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return json({ error: 'Invalid email or password.' }, 401);
    return json({ token: token(env, { sub: user.id, role: user.role }), user: { id: user.id, email: user.email }, profile: await profile(sql, user.id) });
  }
  if (path === 'auth/sign-out') return json({ ok: true });
  const claims = auth(request, env); if (!claims) return json({ error: 'Not authenticated.' }, 401);
  if (path === 'auth/me') return json({ user: { id: claims.sub }, profile: await profile(sql, claims.sub) });
  if (path === 'auth/change-password' && request.method === 'POST') { const { currentPassword, newPassword } = await request.json() as { currentPassword?: string; newPassword: string }; const rows = await sql`select password_hash from users where id = ${claims.sub}`; if (currentPassword && !(await bcrypt.compare(currentPassword, rows[0]?.password_hash ?? ''))) return json({ error: 'Current password is incorrect.' }, 400); if (newPassword.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400); await sql`update users set password_hash = ${await bcrypt.hash(newPassword, 12)} where id = ${claims.sub}`; await sql`update profiles set must_change_password = false where id = ${claims.sub}`; return json({ ok: true }); }
  if (claims.role !== 'admin' && path === 'admin/students') return json({ error: 'Forbidden.' }, 403);
  if (path === 'admin/students' && request.method === 'GET') return json({ data: await sql`select id,email,display_name,must_change_password,created_at from profiles where role='student' order by created_at desc` });
  if (path === 'admin/students' && request.method === 'POST') { const body = await request.json() as { email: string; password: string; displayName?: string; mustChange?: boolean }; const userId = id(); const hash = await bcrypt.hash(body.password, 12); await sql`insert into users (id,email,password_hash) values (${userId},${body.email.trim().toLowerCase()},${hash})`; await sql`insert into profiles (id,email,role,display_name,must_change_password) values (${userId},${body.email.trim().toLowerCase()},'student',${body.displayName || null},${body.mustChange ?? true})`; return json({ id: userId }); }
  if (path === 'data' && request.method === 'POST') return dataRoute(sql, claims, await request.json() as any);
  return json({ error: 'Not found.' }, 404);
}
async function profile(sql: any, userId: string) { const rows = await sql`select id,email,role,display_name,must_change_password,created_at from profiles where id=${userId}`; return rows[0] ?? null; }
async function dataRoute(sql: any, claims: Claims, body: any) { const table = body.table; if (table === 'profiles') return json({ data: await sql`select id,email,role,display_name,must_change_password,created_at from profiles where id=${claims.role === 'admin' ? claims.sub : claims.sub}` }); if (table === 'time_slots') return json({ data: await sql`select * from time_slots where start_at >= ${body.gte ?? '1970-01-01'} and start_at < ${body.lt ?? '2999-01-01'} order by start_at` }); if (table === 'bookings') return json({ data: await sql`select b.*, row_to_json(s) as slot from bookings b join time_slots s on s.id=b.slot_id where ${claims.role === 'admin' ? sql`true` : sql`b.student_id=${claims.sub}`} order by b.created_at desc` }); return json({ data: [] }); }

export default { async fetch(request: Request, env: Env) { try { if (new URL(request.url).pathname.startsWith('/api/')) return await handler(request, env); return env.ASSETS.fetch(request); } catch (error) { console.error(error); return json({ error: 'Server error.' }, 500); } } };
