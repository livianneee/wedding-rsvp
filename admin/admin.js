(() => {
  "use strict";
  const CFG = window.WEDDING_CONFIG || {};
  const URL_BASE = (CFG.supabaseUrl || "").replace(/\/+$/, "");
  const KEY = CFG.supabasePublishableKey || "";
  const DEMO = !URL_BASE || !KEY;
  const SESSION = "rsvp-admin-session";
  const $ = (s) => document.querySelector(s);

  // Invite links point at the site root: config.siteUrl once the domain is set, else wherever this page is served.
  const SITE = (CFG.siteUrl || new URL("../", location.href).href).replace(/\/+$/, "") + "/";
  const linkFor = (token) => `${SITE}?i=${token}`;

  // The message guests receive with their link. {{Name}} and [Invitation Link] are filled in per guest.
  const MESSAGE_TEMPLATE = `Hello {{Name}}!

Plot twist: WE’RE GETTING MARRIED! 💍🤍

And guess what? You’re invited to witness the chaos, the happy tears, and two humans officially becoming each other’s problem forever. 🥹

All the deets are right here 👇🏻
💌 [Invitation Link]

We’d LOVE to have you there to celebrate our big day with us!

With love (and questionable life decisions),
Rio & Olivia 🤍`;
  // Function replacements so a "$" in a name is never treated as a special pattern
  const messageFor = (r) => MESSAGE_TEMPLATE
    .replaceAll("{{Name}}", () => r.guest_name)
    .replaceAll("[Invitation Link]", () => linkFor(r.token));

  let rows = [];
  const selected = new Set();                      // ids of ticked guests; survives sorting and refresh
  let sort = { key: "last_change", dir: -1 };

  /* ---------- Session ---------- */
  const getSession = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION));
      return s && s.exp > Date.now() ? s : null;
    } catch { return null; }
  };
  const setSession = (s) => { try { sessionStorage.setItem(SESSION, JSON.stringify(s)); } catch {} };
  const clearSession = () => { try { sessionStorage.removeItem(SESSION); } catch {} };

  async function api(path, { method = "GET", token, body } = {}) {
    const headers = { apikey: KEY, "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(URL_BASE + path, { method, headers, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && (data.msg || data.message || data.error_description)) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function show(view) {
    $("#login").hidden = view !== "login";
    $("#dashboard").hidden = view !== "dashboard";
    $("#add").hidden = view !== "dashboard";
  }

  function sessionExpired() {
    clearSession();
    rows = [];
    render();
    show("login");
    const errEl = $("#login-error");
    errEl.textContent = "Your session expired. Please sign in again.";
    errEl.hidden = false;
  }

  /* ---------- Sign in ---------- */
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const btn = f.querySelector("button");
    const errEl = $("#login-error");
    errEl.hidden = true;
    btn.disabled = true;
    try {
      const user = f.username.value.trim().toLowerCase();
      const email = user.includes("@") ? user : `${user}@${CFG.adminEmailDomain || "example.com"}`;
      const auth = await api("/auth/v1/token?grant_type=password", {
        method: "POST", body: { email, password: f.password.value },
      });
      const isAdmin = await api("/rest/v1/rpc/is_admin", { method: "POST", token: auth.access_token, body: {} });
      if (!isAdmin) throw Object.assign(new Error("This account can't view responses."), { status: 403 });
      setSession({ token: auth.access_token, exp: Date.now() + (auth.expires_in - 60) * 1000 });
      f.reset();
      show("dashboard");
      load();
    } catch (err) {
      errEl.textContent = err.status === 400 ? "Wrong username or password." : err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("#logout").addEventListener("click", () => {
    clearSession(); rows = []; render(); show(DEMO ? "dashboard" : "login");
  });

  /* ---------- Load + render ---------- */
  // Derived fields used for sorting and display
  const withDerived = (r) => ({
    ...r,
    status: r.attending === null ? 0 : r.attending ? 2 : 1,   // waiting < no < yes
    last_change: r.responded_at || r.created_at,
  });

  async function load() {
    const errEl = $("#load-error");
    errEl.hidden = true;
    if (DEMO) { rows = demoRows().map(withDerived); return render(); }
    const s = getSession();
    if (!s) return sessionExpired();
    try {
      const data = await api(
        "/rest/v1/guests?select=id,guest_name,token,attending,pax,submit_count,created_at,responded_at",
        { token: s.token },
      );
      rows = data.map(withDerived);
      render();
    } catch (err) {
      if (err.status === 401) return sessionExpired();
      errEl.textContent = `Couldn't load guests: ${err.message}`;
      errEl.hidden = false;
    }
  }
  $("#refresh").addEventListener("click", load);

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }) : "";

  function sorted() {
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const x = a[key] ?? -1, y = b[key] ?? -1;
      if (key === "guest_name") return dir * x.localeCompare(y, "en", { sensitivity: "base" });
      return dir * (x > y ? 1 : x < y ? -1 : 0);
    });
  }

  const ANSWERS = [
    ["pill--wait", "Waiting"],
    ["pill--no", "Not attending"],
    ["pill--yes", "Attending"],
  ];

  function cell(text, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;                       // textContent: guest names can never inject HTML
    return td;
  }

  function copyButton(label, text, ariaLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.dataset.copy = text;
    btn.dataset.label = label;
    btn.textContent = label;
    btn.setAttribute("aria-label", ariaLabel);
    return btn;
  }

  function render() {
    const yes = rows.filter((r) => r.attending === true);
    const no = rows.filter((r) => r.attending === false);
    $("#s-guests").textContent = yes.reduce((n, r) => n + r.pax, 0);
    $("#s-yes").textContent = yes.length;
    $("#s-no").textContent = no.length;
    $("#s-wait").textContent = rows.length - yes.length - no.length;
    $("#s-total").textContent = rows.length;

    // Forget ticks for guests that no longer exist (removed elsewhere, or after reload)
    const ids = new Set(rows.map((r) => r.id));
    selected.forEach((id) => { if (!ids.has(id)) selected.delete(id); });

    $("#rows").replaceChildren(...sorted().map((r) => {
      const tr = document.createElement("tr");
      tr.classList.toggle("is-selected", selected.has(r.id));

      const checkTd = document.createElement("td");
      checkTd.className = "check";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.id = r.id;
      box.checked = selected.has(r.id);
      box.setAttribute("aria-label", `Select ${r.guest_name}`);
      checkTd.append(box);

      const ans = document.createElement("td");
      const pill = document.createElement("span");
      const [cls, label] = ANSWERS[r.status];
      pill.className = `pill ${cls}`;
      pill.textContent = label;
      ans.append(pill);

      const when = r.responded_at
        ? fmtDate(r.responded_at) + (r.submit_count > 1 ? ` (changed ${r.submit_count - 1}×)` : "")
        : "";

      const linkTd = document.createElement("td");
      // One button: the message already contains the guest's private link
      linkTd.append(copyButton("Copy invitation", messageFor(r), `Copy invitation message with link for ${r.guest_name}`));

      tr.append(checkTd, cell(r.guest_name), linkTd, ans, cell(r.attending === null ? "" : r.pax, "num"), cell(when));
      return tr;
    }));
    $("#empty").hidden = rows.length > 0;
    syncSelection();

    document.querySelectorAll("th[data-key]").forEach((th) => {
      th.setAttribute("aria-sort", th.dataset.key === sort.key ? (sort.dir === 1 ? "ascending" : "descending") : "none");
    });
  }

  document.querySelectorAll("th[data-key] button").forEach((b) => b.addEventListener("click", () => {
    const key = b.parentElement.dataset.key;
    sort = { key, dir: sort.key === key ? -sort.dir : (key === "guest_name" ? 1 : -1) };
    render();
  }));

  $("#rows").addEventListener("click", async (e) => {
    const btn = e.target.closest(".copy-btn");
    if (!btn) return;
    btn.textContent = (await copyText(btn.dataset.copy)) ? "Copied" : "Copy failed";
    setTimeout(() => { btn.textContent = btn.dataset.label; }, 1500);
  });

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Older / in-app browsers without the Clipboard API (keeps line breaks, unlike prompt())
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.className = "offscreen";
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  /* ---------- Select + remove guests ---------- */
  function syncSelection() {
    const n = selected.size;
    $("#selection-bar").hidden = n === 0;
    $("#selection-count").textContent = `${n} selected`;
    const all = $("#select-all");
    all.checked = n > 0 && n === rows.length;
    all.indeterminate = n > 0 && n < rows.length;
    all.disabled = rows.length === 0;
  }

  $("#rows").addEventListener("change", (e) => {
    const box = e.target.closest('input[type="checkbox"][data-id]');
    if (!box) return;
    const id = Number(box.dataset.id);
    box.checked ? selected.add(id) : selected.delete(id);
    box.closest("tr").classList.toggle("is-selected", box.checked);
    syncSelection();
  });

  $("#select-all").addEventListener("change", (e) => {
    selected.clear();
    if (e.target.checked) rows.forEach((r) => selected.add(r.id));
    render();
  });

  $("#clear-selection").addEventListener("click", () => { selected.clear(); render(); });

  $("#remove-selected").addEventListener("click", async () => {
    const victims = rows.filter((r) => selected.has(r.id));
    if (!victims.length) return;

    const names = victims.map((r) => r.guest_name).sort((a, b) => a.localeCompare(b));
    const shown = names.slice(0, 10).map((n) => `• ${n}`).join("\n") + (names.length > 10 ? `\n…and ${names.length - 10} more` : "");
    const replied = victims.filter((r) => r.attending !== null).length;
    const warning = [
      `Remove ${victims.length} guest${victims.length === 1 ? "" : "s"}?`,
      "",
      shown,
      "",
      replied ? `⚠️ ${replied} of them already replied. Their answers will be deleted too.` : "",
      "Their invitation links will stop working. This can't be undone.",
    ].filter((line, i, all) => line || all[i - 1]).join("\n");
    if (!window.confirm(warning)) return;

    const btn = $("#remove-selected");
    btn.disabled = true;
    const errEl = $("#load-error");
    errEl.hidden = true;
    try {
      let removed;
      if (DEMO) {
        rows = rows.filter((r) => !selected.has(r.id));
        removed = victims.length;
      } else {
        const s = getSession();
        if (!s) return sessionExpired();
        removed = await api("/rest/v1/rpc/admin_remove_guests", {
          method: "POST", token: s.token, body: { p_ids: victims.map((r) => r.id) },
        });
      }
      selected.clear();
      if (DEMO) render(); else await load();
      addMsg("", false);
      toastStatus(`Removed ${removed} guest${removed === 1 ? "" : "s"}.`);
    } catch (err) {
      if (err.status === 401) return sessionExpired();
      errEl.textContent = `Couldn't remove guests: ${err.message}`;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // Short confirmation in the selection bar's place, announced to screen readers
  let statusTimer;
  function toastStatus(text) {
    const el = $("#remove-status");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  /* ---------- CSV download (includes each guest's private link and message) ---------- */
  $("#download").addEventListener("click", () => {
    // Leading = + - @ would run as a formula in Excel; prefix with ' to keep it as text.
    const csvCell = (v) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [["Name", "Answer", "Guests", "Answered at", "Times submitted", "Invite link", "Message"]];
    sorted().forEach((r) => lines.push([
      r.guest_name, ANSWERS[r.status][1], r.attending === null ? "" : r.pax,
      fmtDate(r.responded_at), r.submit_count, linkFor(r.token), messageFor(r),
    ]));
    const csv = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `rsvp-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ---------- Add guests (paste or CSV upload) ---------- */
  // First column of each CSV line; handles "quoted, names" and skips a "Name" header row.
  function namesFromCsv(text) {
    const names = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*"((?:[^"]|"")*)"/) || line.match(/^([^,]*)/);
      const name = (m ? m[1].replace(/""/g, '"') : "").trim();
      if (name) names.push(name);
    }
    if (names.length && /^(guest\s*)?name$/i.test(names[0])) names.shift();
    return names;
  }

  $("#csv-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 512 * 1024) return addMsg("That file is too big (max 512 KB).", true);
    const names = namesFromCsv(await file.text());
    $("#names").value = names.join("\n");
    e.target.value = "";
    addMsg(`Loaded ${names.length} names from ${file.name}. Check them, then press Add guests.`);
  });

  function addMsg(text, isError) {
    const el = $("#add-msg");
    el.textContent = text;
    el.className = `msg ${isError ? "msg--error" : "msg--ok"}`;
    el.hidden = !text;
  }

  $("#add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const names = $("#names").value.split("\n").map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!names.length) return addMsg("Write at least one name.", true);
    const tooLong = names.find((n) => n.length > 80);
    if (tooLong) return addMsg(`This name is longer than 80 characters: ${tooLong.slice(0, 40)}…`, true);
    if (names.length > 500) return addMsg("Add at most 500 guests at a time.", true);

    // Warn about names already on the list: often a mistake, but households can share a name
    const existing = new Set(rows.map((r) => r.guest_name.toLowerCase()));
    const dupes = names.filter((n) => existing.has(n.toLowerCase()));
    if (dupes.length && !window.confirm(`Already on the list: ${dupes.join(", ")}.\nAdd them again with a new link?`)) return;

    const btn = e.currentTarget.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      let added;
      if (DEMO) {
        const nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
        added = names.map((guest_name, i) => ({ id: nextId + i, guest_name, token: demoToken() }));
        rows.push(...added.map((g) => withDerived({
          ...g, attending: null, pax: null, submit_count: 0, created_at: new Date().toISOString(), responded_at: null,
        })));
        render();
      } else {
        const s = getSession();
        if (!s) return sessionExpired();
        added = await api("/rest/v1/rpc/admin_add_guests", { method: "POST", token: s.token, body: { p_names: names } });
        await load();
      }
      $("#names").value = "";
      addMsg(`Added ${added.length} guest${added.length === 1 ? "" : "s"}. Use “Copy invitation” or Download CSV to send their invitations.`);
    } catch (err) {
      if (err.status === 401) return sessionExpired();
      addMsg(`Couldn't add guests: ${err.message}`, true);
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- Demo data (only when config.js is empty) ---------- */
  function demoToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  function demoRows() {
    const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    return [
      { id: 1, guest_name: "Kevin Tan & family", token: "demo", attending: true, pax: 4, submit_count: 1, created_at: ago(90), responded_at: ago(30) },
      { id: 2, guest_name: "Sarah Lim", token: demoToken(), attending: false, pax: 0, submit_count: 2, created_at: ago(90), responded_at: ago(5) },
      { id: 3, guest_name: "Wijaya family", token: demoToken(), attending: null, pax: null, submit_count: 0, created_at: ago(90), responded_at: null },
    ];
  }

  /* ---------- Start ---------- */
  if (DEMO) { $("#demo-banner").hidden = false; show("dashboard"); load(); }
  else if (getSession()) { show("dashboard"); load(); }
  else { show("login"); }
})();
