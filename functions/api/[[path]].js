const ALLOWED_STATE_KEYS = new Set([
  "clients", "stock", "services", "gallery", "barbers", "cuts", "finances",
  "subscribers", "plans", "schedule", "blockedWeekdaySlots",
  "bookingWindowDays", "bookingGraceMinutes"
]);

const encoder = new TextEncoder();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      ...extraHeaders
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function endpointName(context) {
  const parts = Array.isArray(context.params.path)
    ? context.params.path
    : [context.params.path || ""];
  return String(parts.at(-1) || "").replace(/\.php$/i, "");
}

function cookieValue(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

async function createSession(env) {
  const payload = base64UrlEncode(encoder.encode(JSON.stringify({
    sub: env.ADMIN_USERNAME || "admin",
    exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
  })));
  const signature = base64UrlEncode(await hmac(env.SESSION_SECRET, payload));
  return `${payload}.${signature}`;
}

async function isAdmin(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = cookieValue(request, "bdc_session");
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = await hmac(env.SESSION_SECRET, payload);
  const received = base64UrlDecode(signature);
  if (expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ received[i];
  if (diff !== 0) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function requireAdmin(request, env) {
  return (await isAdmin(request, env)) ? null : json({ ok: false, error: "UNAUTHORIZED" }, 401);
}

function requirePost(request) {
  return request.method === "POST" ? null : json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

async function snapshot(db) {
  const [bookingResult, blockResult] = await db.batch([
    db.prepare(`SELECT id, date, time, name, phone, service_name AS serviceName,
      service_price AS servicePrice, created_at AS createdAt
      FROM bookings ORDER BY created_at DESC`),
    db.prepare(`SELECT block_type, date, time, weekday FROM booking_blocks`)
  ]);

  const items = (bookingResult.results || []).map(row => ({
    ...row,
    servicePrice: Number(row.servicePrice || 0)
  }));
  const blockedDates = [];
  const blockedSlots = [];
  const blockedWeekdays = [];
  for (const row of blockResult.results || []) {
    if (row.block_type === "date" && row.date) blockedDates.push(row.date);
    if (row.block_type === "slot" && row.date && row.time) {
      blockedSlots.push({ date: row.date, time: row.time });
    }
    if (row.block_type === "weekday" && row.weekday !== null) {
      blockedWeekdays.push(Number(row.weekday));
    }
  }
  return {
    items,
    blockedDates: [...new Set(blockedDates)],
    blockedSlots,
    blockedWeekdays: [...new Set(blockedWeekdays)]
  };
}

async function handleAuth(context, action) {
  const { request, env } = context;
  if (action === "status") return json({ ok: true, logged: await isAdmin(request, env) });
  if (action === "logout") {
    return json({ ok: true }, 200, {
      "Set-Cookie": "bdc_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
    });
  }
  if (action !== "login") return json({ ok: false, error: "UNKNOWN_ACTION" }, 400);
  const methodError = requirePost(request);
  if (methodError) return methodError;
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ ok: false, error: "SERVER_NOT_CONFIGURED" }, 503);
  }

  const body = await readJson(request);
  const username = String(body.user || "admin").trim();
  const password = String(body.pass || "");
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipKey = base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(ip))));
  const attempt = await env.DB.prepare(
    "SELECT failures, locked_until FROM auth_attempts WHERE client_key = ?"
  ).bind(ipKey).first();
  const now = Math.floor(Date.now() / 1000);
  if (attempt && Number(attempt.locked_until) > now) {
    return json({ ok: false, error: "LOCKED_OUT" }, 429);
  }

  const validUser = username === (env.ADMIN_USERNAME || "admin");
  const validPassword = password === env.ADMIN_PASSWORD;
  if (!validUser || !validPassword) {
    const failures = Number(attempt?.failures || 0) + 1;
    const lockedUntil = failures >= 5 ? now + 3600 : 0;
    await env.DB.prepare(`INSERT INTO auth_attempts (client_key, failures, locked_until, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(client_key) DO UPDATE SET failures = excluded.failures,
      locked_until = excluded.locked_until, updated_at = datetime('now')`)
      .bind(ipKey, failures, lockedUntil).run();
    return json({ ok: false, error: lockedUntil ? "LOCKED_OUT" : "INVALID_CREDENTIALS" }, lockedUntil ? 429 : 401);
  }

  await env.DB.prepare("DELETE FROM auth_attempts WHERE client_key = ?").bind(ipKey).run();
  const session = await createSession(env);
  return json({ ok: true, logged: true, user: username }, 200, {
    "Set-Cookie": `bdc_session=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
  });
}

async function handleBootstrap(context) {
  const { request, env } = context;
  const result = await env.DB.prepare("SELECT state_key, json_value FROM app_state").all();
  const state = {};
  for (const row of result.results || []) {
    if (!ALLOWED_STATE_KEYS.has(row.state_key)) continue;
    try { state[row.state_key] = JSON.parse(row.json_value); } catch { state[row.state_key] = null; }
  }
  return json({ ok: true, logged: await isAdmin(request, env), state });
}

async function handleState(context, action, url) {
  const { request, env } = context;
  if (action === "get") {
    const key = url.searchParams.get("key") || "";
    if (!ALLOWED_STATE_KEYS.has(key)) return json({ ok: false, error: "BAD_KEY" }, 400);
    const row = await env.DB.prepare("SELECT json_value FROM app_state WHERE state_key = ?").bind(key).first();
    return json({ ok: true, key, value: row ? JSON.parse(row.json_value) : null });
  }
  if (action !== "set") return json({ ok: false, error: "UNKNOWN_ACTION" }, 400);
  const authError = await requireAdmin(request, env);
  if (authError) return authError;
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const body = await readJson(request);
  const key = String(body.key || "");
  if (!ALLOWED_STATE_KEYS.has(key)) return json({ ok: false, error: "BAD_KEY" }, 400);
  await env.DB.prepare(`INSERT INTO app_state (state_key, json_value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(state_key) DO UPDATE SET json_value = excluded.json_value, updated_at = datetime('now')`)
    .bind(key, JSON.stringify(body.value ?? null)).run();
  return json({ ok: true });
}

async function handleBookings(context, action) {
  const { request, env } = context;
  if (action === "snapshot") return json({ ok: true, bookings: await snapshot(env.DB) });
  const methodError = requirePost(request);
  if (methodError) return methodError;
  const body = await readJson(request);

  if (action === "create") {
    const booking = {
      id: String(body.id || ""),
      name: String(body.name || "").trim(),
      phone: String(body.phone || "").trim(),
      serviceName: String(body.serviceName || "").trim(),
      servicePrice: Number(body.servicePrice || 0),
      date: String(body.date || ""),
      time: String(body.time || "")
    };
    if (!booking.id || !booking.name || !booking.phone || !booking.serviceName || !booking.date || !booking.time) {
      return json({ ok: false, error: "MISSING_FIELDS" }, 400);
    }
    if (booking.name.length > 100 || booking.phone.length > 20 || booking.serviceName.length > 100) {
      return json({ ok: false, error: "FIELD_TOO_LONG" }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.date) || !/^\d{2}:\d{2}$/.test(booking.time)) {
      return json({ ok: false, error: "BAD_DATE_OR_TIME" }, 400);
    }
    const weekday = new Date(`${booking.date}T12:00:00Z`).getUTCDay();
    const blocked = await env.DB.prepare(`SELECT 1 FROM booking_blocks
      WHERE (block_type = 'date' AND date = ?)
         OR (block_type = 'weekday' AND weekday = ?)
         OR (block_type = 'slot' AND date = ? AND time = ?)
      LIMIT 1`).bind(booking.date, weekday, booking.date, booking.time).first();
    if (blocked) return json({ ok: false, error: "BLOCKED" }, 409);
    try {
      await env.DB.prepare(`INSERT INTO bookings
        (id, date, time, name, phone, service_name, service_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(booking.id, booking.date, booking.time, booking.name, booking.phone,
          booking.serviceName, booking.servicePrice).run();
    } catch {
      return json({ ok: false, error: "SLOT_TAKEN" }, 409);
    }
    if (env.MAKE_WEBHOOK_URL) {
      const payload = {
        id: booking.id, name: booking.name, phone: booking.phone,
        service: booking.serviceName, service_price: booking.servicePrice,
        date: booking.date, time: booking.time,
        appointment_local: `${booking.date} ${booking.time}`,
        timezone_offset: Number(body.timezone_offset || 0)
      };
      context.waitUntil(fetch(env.MAKE_WEBHOOK_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      }).catch(() => undefined));
    }
    return json({ ok: true, bookings: await snapshot(env.DB) });
  }

  const authError = await requireAdmin(request, env);
  if (authError) return authError;
  if (action === "cancel") {
    if (!body.id) return json({ ok: false, error: "MISSING_ID" }, 400);
    await env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(String(body.id)).run();
  } else if (action === "block_date" || action === "unblock_date") {
    const date = String(body.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: "BAD_DATE" }, 400);
    if (action === "block_date") {
      await env.DB.prepare("INSERT OR IGNORE INTO booking_blocks (block_type, date) VALUES ('date', ?)").bind(date).run();
    } else {
      await env.DB.prepare("DELETE FROM booking_blocks WHERE block_type = 'date' AND date = ?").bind(date).run();
    }
  } else if (action === "block_slot" || action === "unblock_slot") {
    const date = String(body.date || "");
    const time = String(body.time || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return json({ ok: false, error: "BAD_DATE_OR_TIME" }, 400);
    }
    if (action === "block_slot") {
      await env.DB.prepare("INSERT OR IGNORE INTO booking_blocks (block_type, date, time) VALUES ('slot', ?, ?)")
        .bind(date, time).run();
    } else {
      await env.DB.prepare("DELETE FROM booking_blocks WHERE block_type = 'slot' AND date = ? AND time = ?")
        .bind(date, time).run();
    }
  } else if (action === "set_weekdays") {
    const days = Array.isArray(body.days) ? [...new Set(body.days.map(Number).filter(day => day >= 0 && day <= 6))] : null;
    if (!days) return json({ ok: false, error: "BAD_DAYS" }, 400);
    const statements = [env.DB.prepare("DELETE FROM booking_blocks WHERE block_type = 'weekday'")];
    for (const day of days) {
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO booking_blocks (block_type, weekday) VALUES ('weekday', ?)").bind(day));
    }
    await env.DB.batch(statements);
  } else {
    return json({ ok: false, error: "UNKNOWN_ACTION" }, 400);
  }
  return json({ ok: true, bookings: await snapshot(env.DB) });
}

export async function onRequest(context) {
  try {
    if (!context.env.DB) return json({ ok: false, error: "DATABASE_NOT_CONFIGURED" }, 503);
    const url = new URL(context.request.url);
    const endpoint = endpointName(context);
    const action = url.searchParams.get("action") || ({ auth: "status", bookings: "snapshot", state: "get" }[endpoint]);
    if (endpoint === "auth") return handleAuth(context, action);
    if (endpoint === "bootstrap") return handleBootstrap(context);
    if (endpoint === "state") return handleState(context, action, url);
    if (endpoint === "bookings") return handleBookings(context, action);
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  } catch (error) {
    console.error("API_ERROR", error);
    return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
  }
}
