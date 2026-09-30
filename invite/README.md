# Rio & Olivia — Wedding invitation

A static page (one `index.html`) plus a Google Sheet as the RSVP database.

## 1. Download the images (do this first: links expire ~7 Oct 2026)

```bash
bash fetch-assets.sh
```

This saves 17 images and icons from Figma into `assets/`. If the links have expired, re-export them from Figma using the filenames listed in the script.

## 2. Add the CINCIN font

Put the font file in `assets/fonts/` as `cincin.woff2`, `cincin.otf`, or `cincin.ttf`.
Until it's there, the script headings fall back to *Dancing Script*.
Check the font licence allows web embedding.

## 3. Set up the RSVP database (Google Sheet)

1. Create a new Google Sheet, e.g. "Wedding RSVP".
2. **Extensions → Apps Script**. Delete the sample code and paste all of `apps-script/Code.gs`. Save.
3. **Deploy → New deployment →** type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Authorise when asked, then copy the **Web app URL** (ends in `/exec`).
5. In `index.html`, find `CONFIG` near the bottom and paste it:
   ```js
   rsvpEndpoint: "https://script.google.com/macros/s/XXXX/exec",
   ```

A sheet named **RSVP** is created on the first submission:

| Name | Attendance | Pax | First submitted | Last updated |
|---|---|---|---|---|
| Kevin Tan | Attending | 3 | 30/09/2026 14:02 | 01/10/2026 09:15 |

A guest who submits again updates their own row instead of adding a duplicate. Handy totals:

- Guests attending: `=SUMIF(RSVP!B:B,"Attending",RSVP!C:C)`
- Households declined: `=COUNTIF(RSVP!B:B,"Not attending")`

> If you edit `Code.gs` later, use **Deploy → Manage deployments → Edit → New version**. Otherwise the URL keeps running the old code.

Until `rsvpEndpoint` is set, the form runs in **demo mode**: it shows the response screen but saves nothing.

## 4. Host it

Upload the whole folder (`index.html` + `assets/`) to any static host:

- **Netlify Drop** (easiest): drag the folder onto app.netlify.com/drop
- **Vercel**, **GitHub Pages**, or **Cloudflare Pages** also work

Use HTTPS (all of these do), otherwise tap-to-copy falls back to an older method.

## 5. Make a link per guest

```
https://your-site.netlify.app/?to=Kevin
https://your-site.netlify.app/?to=Kevin%20Tan
```

| Link | Landing | RSVP name field |
|---|---|---|
| `?to=Kevin` | Dear Kevin | "Kevin", locked |
| no `?to=` | Dear Friend | Editable (for a link shared in a group chat) |

Generate links in a spare sheet tab: names in column A, then in B2:
`="https://your-site.netlify.app/?to="&ENCODEURL(A2)`

**Use unique names** (e.g. "Kevin Tan", not two "Kevin"s). The name is how a guest's row is matched.

## Things to know

- **Name lock is cosmetic.** A guest could edit `?to=` in the URL to submit as someone else. For a wedding that's usually fine; the Sheet shows every submission, so oddities are easy to spot.
- **Max 5 pax** is enforced both in the form and in `Code.gs`. Change `maxPax` / `MAX_PAX` in both if needed.
- **Choosing "No"** disables the pax field and stores 0.
