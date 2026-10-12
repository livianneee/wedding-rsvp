# Rio & Olivia — wedding invitation

A static site (plain HTML/CSS/JS) hosted on **Vercel**, with RSVPs stored in **Supabase**.
A tiny build step (`scripts/build.mjs`, no dependencies) copies the site into `dist/` and writes
`config.js` from environment variables, so Supabase settings are never committed.

| Page | Address |
|---|---|
| Invitation | `https://YOUR-SITE/?i=<guest's private code>` |
| Admin (guests, responses, CSV, invite links) | `https://YOUR-SITE/admin/` |

```
index.html             invitation
admin/                 admin page (index.html, admin.css, admin.js)
scripts/build.mjs      builds dist/ and generates config.js from env variables
.env.example           the env variables (copy to .env.local for local runs)
supabase/setup.sql     database setup: paste into Supabase
vercel.json            build settings + security headers for Vercel
.vercelignore          files Vercel doesn't need to upload
assets/                css, js, fonts, icons, images (originals kept in assets/img/_originals)
```

## How guest links work

Every invitation (a person or a household) gets its own private link, e.g.
`…/?i=3f9a0c…` (32 random characters). Only that link can answer for that guest, so nobody can
change someone else's answer or add fake guests. Opening the site without a valid link shows
"Dear Friend" and asks the visitor to use their personal link.

## Preview on your computer

Needs Node.js (any recent version). With no `.env.local`, the site runs in **demo mode** (nothing is saved).

```bash
node scripts/build.mjs && python3 -m http.server 3000 --bind 127.0.0.1 -d dist
```

Re-run it after changing files. To test against real Supabase locally, copy `.env.example` to
`.env.local` and fill it in (it's git-ignored).

- Invitation as a sample guest: http://localhost:3000/?i=demo
- Invitation without a link: http://localhost:3000/
- Admin with sample data: http://localhost:3000/admin/

## 1. Set up the database (Supabase, about 10 minutes)

1. **Create a project** at supabase.com (free plan). Pick **Southeast Asia (Singapore)**.
2. **Create the tables.** SQL Editor → New query → paste all of `supabase/setup.sql` → **Run**.
   (If you ran an older version before, this removes the old `rsvps` table and its test rows.)
3. **Turn off public sign-ups.** Authentication → Sign In / Providers → switch **Allow new users to sign up** off.
4. **Create the admin login.** Authentication → Users → Add user → Create new user.
   - Email: `kaybidut@example.com` (the admin page turns username `kaybidut` into this).
   - Password: a long, unique password (12+ characters). Tick **Auto Confirm User**.
5. **Make that account an admin.** In the SQL Editor, run:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'kaybidut@example.com'
   on conflict do nothing;
   ```
6. **Note two values for Vercel:** the **Project URL** (the **Connect** button, looks like
   `https://xxxx.supabase.co`) and the **publishable key** (Project Settings → API Keys, starts with
   `sb_publishable_`). **Never** use the secret / `service_role` key: the build refuses it.

**Keep the project awake.** Supabase pauses free projects after about a week without activity,
and a paused project can't save RSVPs. Opening the admin page counts as activity: open it at least
weekly until 30 October, and right before sending invitations.

## 2. Deploy to Vercel

1. Put this folder in a GitHub repository (private is fine).
2. vercel.com → **Add New → Project** → import the repository. Leave the build settings alone:
   `vercel.json` sets them (build `node scripts/build.mjs`, output `dist`).
3. Before deploying, open **Environment Variables** and add:

   | Name | Value | Environments |
   |---|---|---|
   | `SUPABASE_URL` | `https://xxxx.supabase.co` | Production, Preview |
   | `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | Production, Preview |
   | `SITE_URL` | `https://your-domain` (optional; defaults to the Vercel production address) | Production |
   | `ADMIN_EMAIL_DOMAIN` | `example.com` (optional; this is the default) | Production, Preview |

   These values still reach visitors' browsers (that's how the site talks to Supabase), which is
   fine: the publishable key is designed to be public. Env variables keep them out of the repo.
4. **Deploy.** A Production build stops with a clear message if the Supabase variables are missing.
5. After changing an env variable, redeploy (Deployments → ⋯ → Redeploy) so the build picks it up.
6. After Vercel is live, turn off GitHub Pages: repo Settings → Pages → Source: **None**.

## 3. Add guests and send links

1. Open `/admin/`, sign in.
2. **Add guests:** paste one name per line, or **Upload CSV** (first column = name; a "Name" header row is skipped).
3. Use **Copy link** on each row, or **Download CSV** to get every guest's link at once.
4. Send each guest *their own* link. Anyone with a link can answer for that guest, so don't post links in group chats.

Seats: every guest can choose 1–5 people. To change the limit, edit `maxPax` in `scripts/build.mjs`
**and** the two `5`s in `supabase/setup.sql`, then re-run the SQL.

To remove a guest added by mistake: Supabase → Table Editor → `guests` → select the row → Delete.

## Test before sending invitations

1. Add a guest called "Test" in admin, copy its link, open it on your phone, answer.
2. Check admin shows the answer. Change the answer from the same link; admin shows "changed 1×".
3. Delete the "Test" row in Supabase.
