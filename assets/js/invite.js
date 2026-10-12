(() => {
  "use strict";

  const CFG = window.WEDDING_CONFIG || {};
  const MAX_PAX = Number(CFG.maxPax) || 5;
  const FALLBACK_NAME = "Friend";               // shown when the link has no ?to= name
  const DEMO = !CFG.supabaseUrl || !CFG.supabasePublishableKey;

  const $ = (sel) => document.querySelector(sel);

  /* ---------- 1. Who is this invitation for? …/?i=<private token> ---------- */
  const token = (new URLSearchParams(location.search).get("i") || "").trim();
  const VALID_TOKEN = /^[0-9a-f]{32}$/;
  const DEMO_GUEST = { guest_name: "Kevin Tan", attending: null, pax: null };
  let invite = null;                               // { guest_name, attending, pax } once loaded

  const nameInput = $("#guest-name");

  function showGuest(guest) {
    invite = guest;
    document.querySelectorAll("[data-guest-name]").forEach((el) => {
      el.textContent = guest ? guest.guest_name : FALLBACK_NAME;   // textContent: a name can never inject HTML
    });
    if (!guest) {
      $("#rsvp-nolink").hidden = false;
      return;
    }
    nameInput.value = guest.guest_name;
    if (guest.attending === null) {
      form.hidden = false;
    } else {
      // Already answered: show their answer, with "Change my answer" to edit it
      form.querySelector(`input[name="attending"][value="${guest.attending ? "yes" : "no"}"]`).checked = true;
      pax.value = String(guest.pax);
      syncPax();
      showReply(guest.attending, false);
    }
  }

  async function loadInvite() {
    if (DEMO) return showGuest(token === "demo" ? DEMO_GUEST : null);
    if (!VALID_TOKEN.test(token)) return showGuest(null);
    try {
      const rows = await rpc("get_invite", { p_token: token });
      showGuest(rows[0] || null);
    } catch (err) {
      console.error(err);
      // Name stays "Friend"; tell them to retry rather than claiming the link is wrong
      formError.textContent = "We couldn’t load your invitation. Check your connection and reload the page.";
      formError.hidden = false;
      form.hidden = false;
      submitBtn.disabled = true;
    }
  }

  /* ---------- 2. Open invitation ---------- */
  $("#open-invitation").addEventListener("click", () => {
    $("#landing").hidden = true;
    const invite = $("#invite");
    invite.hidden = false;
    invite.classList.add("is-entering");
    window.scrollTo(0, 0);
    $("#hello").focus({ preventScroll: true });
  });

  /* ---------- 3. RSVP form ---------- */
  const form = $("#rsvp-form");
  const pax = $("#pax");
  const submitBtn = $("#rsvp-submit");
  const formError = $("#form-error");

  // Options 0…MAX_PAX come from config so the limit lives in one place.
  pax.innerHTML = "";
  for (let i = 0; i <= MAX_PAX; i++) pax.add(new Option(String(i), String(i)));
  const zeroOption = pax.options[0];
  pax.value = "1";                                 // most invitations are for at least the guest themselves

  const attendance = () => form.querySelector('input[name="attending"]:checked')?.value || null;

  function syncPax() {
    const notComing = attendance() === "no";
    zeroOption.disabled = !notComing;              // 0 only makes sense for "No, can't make it"
    if (notComing) {
      pax.value = "0";
      pax.disabled = true;                         // nobody is coming, so 0 is the only answer
    } else {
      if (pax.value === "0") pax.value = "1";      // switching back from "No"
      pax.disabled = false;
    }
    pax.classList.toggle("is-empty", pax.value === "0");
  }

  function setError(id, control, message) {
    const el = $("#" + id);
    el.textContent = message || "";
    el.hidden = !message;
    if (control) control.setAttribute("aria-invalid", message ? "true" : "false");
  }

  form.addEventListener("change", (e) => {
    syncPax();
    if (e.target.name === "attending") setError("attending-error", null, "");
    if (e.target === pax) setError("pax-error", pax, "");
  });
  syncPax();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.hidden = true;

    if (!invite) return;
    const answer = attendance();
    const count = Number(pax.value);

    const attendMsg = answer ? "" : "Choose whether you’re coming.";
    const paxMsg = answer === "yes" && (count < 1 || count > MAX_PAX)
      ? `Choose how many people are coming (1–${MAX_PAX}).` : "";

    setError("pax-error", pax, paxMsg);
    setError("attending-error", null, attendMsg);

    if (paxMsg || attendMsg) {
      (paxMsg ? pax : form.querySelector('input[name="attending"]')).focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    try {
      const attending = answer === "yes";
      await saveRsvp({ attending, pax: attending ? count : 0 });
      invite = { ...invite, attending, pax: attending ? count : 0 };
      showReply(attending, true);
    } catch (err) {
      console.error(err);
      formError.textContent = "Your answer wasn’t saved. Check your connection and try again.";
      formError.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
    }
  });

  async function rpc(fn, body) {
    const res = await fetch(`${CFG.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.supabasePublishableKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${fn} failed (${res.status}): ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }

  async function saveRsvp({ attending, pax }) {
    if (DEMO) {
      console.warn("[RSVP demo mode] Not saved. Fill in config.js.", { attending, pax });
      await new Promise((r) => setTimeout(r, 400));
      return;
    }
    // Calls submit_rsvp() in Supabase. The token only lets this guest update their own answer.
    await rpc("submit_rsvp", { p_token: token, p_attending: attending, p_pax: pax });
  }

  function showReply(attending, focus) {
    form.hidden = true;
    $("#reply-yes").hidden = !attending;
    $("#reply-no").hidden = attending;
    $("#rsvp-change").hidden = false;
    if (focus) (attending ? $("#reply-yes") : $("#reply-no")).focus();
  }

  $("#rsvp-change").addEventListener("click", () => {
    $("#reply-yes").hidden = true;
    $("#reply-no").hidden = true;
    $("#rsvp-change").hidden = true;
    form.hidden = false;
    form.querySelector('input[name="attending"]:checked')?.focus();
  });

  /* ---------- 4. Tap to copy the account number ---------- */
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const text = btn.dataset.copy;
    const copied = await copyText(text);
    toast(copied ? "Account number copied" : `Copy failed. The number is ${text}`);
  });

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Older browsers / in-app browsers without the Clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  let toastTimer;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  /* ---------- 5. Start ---------- */
  if (DEMO) $("#demo-banner").hidden = false;    // make demo mode impossible to miss
  loadInvite();
})();
