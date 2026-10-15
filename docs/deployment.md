# Deploying dolu bolu

Vercel hosts the Next.js app and Supabase hosts auth and Postgres (docs/decisions/0012). This is a one-time setup; after it, every push to `main` deploys.

## 1. Supabase

1. **Migrations.** Apply every file in `supabase/migrations` in filename order (SQL editor, or `supabase db push` if you use the CLI). Skip the ones already applied.
2. **Demo cleanup.** Enable the Cron integration (Integrations → Cron, which installs `pg_cron`), then run once in the SQL editor:
   ```sql
   select cron.schedule('delete-expired-demo-accounts', '17 3 * * *', 'select public.delete_expired_demo_accounts()');
   ```
   This deletes demo workspaces older than 7 days, every night at 03:17 UTC. If `pg_cron` was already enabled when you applied `20261017000000_demo_workspaces.sql`, the migration scheduled it for you; `select * from cron.job;` shows it.
3. **Anonymous sign-ins (demo).** Authentication → Sign In / Providers → enable "Allow anonymous sign-ins". Supabase rate-limits these per IP; the app also caps hosted-AI use for demo users (step 3 below).
4. **URL configuration.** Authentication → URL Configuration:
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/callback`, plus `http://localhost:3000/auth/callback` for local development. Add `https://*-<your-vercel-team>.vercel.app/auth/callback` if you want Google sign-in on preview deployments.
5. **Google provider.** Already configured for local use. The Google Cloud OAuth client keeps the Supabase callback (`https://<project-ref>.supabase.co/auth/v1/callback`); nothing changes there for a new domain.

## 2. Vercel

1. Import the GitHub repository (Add New → Project). The framework preset (Next.js) and build command (`npm run build`) are detected automatically.
2. Set environment variables for **Production** (and Preview if you want previews to work):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key |
   | `AI_PROVIDER` | `gemini` |
   | `GEMINI_API_KEY` | server-only key (never `NEXT_PUBLIC_`) |
   | `AI_DAILY_REQUEST_LIMIT` | `50` (per signed-in user per UTC day) |
   | `DEMO_SIGN_IN_ENABLED` | `true` to show "Try a demo workspace" |
   | `AI_DEMO_DAILY_REQUEST_LIMIT` | `10` (per demo user per day) |
   | `AI_DEMO_GLOBAL_DAILY_LIMIT` | `300` (all demo users together per day) |

   Leave `AI_MODEL`, `AI_TIMEOUT_MS`, and `AI_MAX_OUTPUT_TOKENS` unset unless you have a reason to change them.
3. Deploy, then add your domain (Settings → Domains) and update the Supabase Site URL to match.

## 3. Cost and abuse limits

Anyone can start a demo, so hosted-AI spend is bounded in three layers:

- Supabase rate-limits anonymous sign-ins per IP address.
- Each demo user gets `AI_DEMO_DAILY_REQUEST_LIMIT` assistant requests a day.
- All demo users together get `AI_DEMO_GLOBAL_DAILY_LIMIT` a day. When it runs out, the demo still works: the composer explains the limit, and manual entry is always available.

Worst case per day: `AI_DEMO_GLOBAL_DAILY_LIMIT` demo requests plus `AI_DAILY_REQUEST_LIMIT` × signed-in users. Check the Gemini price per request for the configured model to turn that into money. If demo abuse appears, add CAPTCHA to anonymous sign-in (Supabase supports Cloudflare Turnstile and hCaptcha).

## 4. After the first deploy

1. Open the site, choose "Try a demo workspace", and check that the agenda shows a loose end, an interview tomorrow, an OA this week, and a quiet drive.
2. Sign out, sign in with Google, send a message, confirm it, and reload.
3. In "Your data", download an export.
