# DayOne100 Tools

Tools for student entrepreneurs at Team Academy Amsterdam, live at **https://tools.dayone100.nl**.

| Tool | Address | What it does |
| --- | --- | --- |
| Idea Check | `/ideacheck/` | Score business ideas, test hypotheses, talk to the AI Business Coach |
| Teacher view | `/ideacheck/teacher.html` | Every student's progress, class codes, CSV export, delete all student data |
| Purpose Finder | `/purpose/` | Values, strengths (with anonymous feedback from 3 to 5 people via a link), interests (guided questions), and market (past paid work and who pays for each interest), combined into a sweet spot that can be sent to Idea Check. Same login; answers are private to the student, the teacher view only shows progress |

## How it fits together

- **GitHub Pages** hosts the pages from this repository. Every change to `main` goes live within a few minutes.
- **Supabase** (EU, Frankfurt) holds the logins, the class codes and each student's work. Students only see their own work. The teacher sees everything.
- **Claude API** answers the AI coach, through the `coach` function in Supabase. The API key lives only in Supabase's secrets.

## Files

| File | What it is |
| --- | --- |
| `config.js` | The Supabase Project URL and anon key. Both are public by design |
| `ideacheck/index.html` | The Idea Check tool with login and cloud saving |
| `ideacheck/teacher.html` | The teacher view |
| `supabase/schema.sql` | Tables, access rules, class-code check, delete function. Run once |
| `supabase/functions/coach/index.ts` | The AI function. Deploy as `coach` |
| `.github/workflows/keep-awake.yml` | Pings Supabase every 3 days so the free plan does not pause |
| `CNAME` | The custom domain for GitHub Pages |

## Setup, once

### 1. Supabase

1. **SQL Editor:** paste all of `supabase/schema.sql` and click Run.
2. **Project Settings > API:** copy the Project URL and the anon public key into `config.js` (or send them to Claude).
3. **Authentication > Providers:** keep Email on. Turn off "Confirm email" for the pilot. The built-in mail only sends a few emails an hour.
4. **Authentication > URL Configuration:** set Site URL to `https://tools.dayone100.nl/ideacheck/`.
5. **Edge Functions > Secrets:** add `ANTHROPIC_API_KEY` with your Claude API key. Optional: `DAILY_LIMIT` (default 40 AI calls per student per day) and `ANTHROPIC_MODEL` (default `claude-haiku-5-5`).
6. **Edge Functions:** create a function named `coach`, paste `supabase/functions/coach/index.ts`, and deploy.

### 2. GitHub Pages and the subdomain

1. **Repository Settings > Pages:** Source "Deploy from a branch", branch `main`, folder `/ (root)`.
2. **Custom domain:** `tools.dayone100.nl` (already in the `CNAME` file).
3. **At your domain registrar:** add a DNS record `CNAME`, name `tools`, pointing to `<your-github-username>.github.io`.
4. When the check turns green, tick **Enforce HTTPS**.

### 3. Make yourself teacher

1. Open `https://tools.dayone100.nl/ideacheck/`, choose Sign up, and use class code `PILOT2026`.
2. In Supabase SQL Editor, run, with your own email:

   ```sql
   update public.profiles set role = 'teacher' where email = 'you@dayone100.nl';
   ```

3. Log out and in again. A "Teacher view" button appears. Create the real class codes there and close `PILOT2026`.

## Every school year

- Create new class codes in the teacher view and close the old ones.
- At the end of the year, use **Delete all student data** in the teacher view.

## Privacy

Stored per student: first name, email, class code, their Idea Check work, and their Purpose Finder answers and the feedback others give them through their link (only after the student ticks the consent box; private to the student, the teacher only sees progress). No grades. Data sits in Supabase's EU (Frankfurt) region and is deleted at the end of each school year.
