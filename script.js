const STORAGE_KEYS = {
  admin: "bdc_admin_logged",
  clients: "bdc_clients",
  stock: "bdc_stock",
  services: "bdc_services",
  gallery: "bdc_gallery",
  barbers: "bdc_barbers",
  cuts: "bdc_cuts",
  bookings: "bdc_bookings",
  finances: "bdc_finances",
  subscribers: "bdc_subscribers",
  plans: "bdc_plans",
  schedule: "bdc_schedule",
  blockedWeekdaySlots: "bdc_blocked_weekday_slots",
  bookingWindow: "bdc_booking_window",
  bookingGrace: "bdc_booking_grace"
};


// ================================
// API helpers (Cloudflare Pages Functions)
// ================================
const API_BASE = "/api";
const STATE_KEY_MAP = {
  [STORAGE_KEYS.clients]: "clients",
  [STORAGE_KEYS.stock]: "stock",
  [STORAGE_KEYS.services]: "services",
  [STORAGE_KEYS.gallery]: "gallery",
  [STORAGE_KEYS.barbers]: "barbers",
  [STORAGE_KEYS.cuts]: "cuts",
  [STORAGE_KEYS.finances]: "finances",
  [STORAGE_KEYS.subscribers]: "subscribers",
  [STORAGE_KEYS.plans]: "plans",
  [STORAGE_KEYS.schedule]: "schedule",
  [STORAGE_KEYS.blockedWeekdaySlots]: "blockedWeekdaySlots",
  [STORAGE_KEYS.bookingWindow]: "bookingWindowDays",
  [STORAGE_KEYS.bookingGrace]: "bookingGraceMinutes"
};

const MEM_STORE = Object.create(null);
let BOOTSTRAPPED = false;

async function apiFetchJson(path, opts = {}) {
  const url = path.startsWith("http") ? path : (API_BASE + path);
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { ok: false, error: "BAD_JSON", raw: text }; }
  if (!res.ok) {
    return { ok: false, status: res.status, ...(data || {}) };
  }
  return data;
}

// load/save agora NÃO usam localStorage (nada local persistido).
function load(key, fallback) {
  try {
    return (key in MEM_STORE) ? structuredClone(MEM_STORE[key]) : fallback;
  } catch {
    return (key in MEM_STORE) ? MEM_STORE[key] : fallback;
  }
}

function save(key, value) {
  MEM_STORE[key] = value;

  // bookings e admin são tratados por endpoints próprios (não KV)
  if (key === STORAGE_KEYS.bookings || key === STORAGE_KEYS.admin) return;

  // Só tenta persistir depois do bootstrap
  if (!BOOTSTRAPPED) return;

  const stateKey = STATE_KEY_MAP[key];
  if (!stateKey) return;

  // Persistência no D1 (admin precisa estar logado)
  apiFetchJson("/state.php?action=set", {
    method: "POST",
    body: JSON.stringify({ key: stateKey, value })
  }).catch(() => { });
}


const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function formatDateDMY(value) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/* ================================
   Navegação (tabs)
================================ */
const navButtons = $$(".nav-btn");
const panels = $$(".panel");

function showTab(tabId) {
  panels.forEach(p => p.classList.toggle("is-show", p.id === tabId));
  navButtons.forEach(b => b.classList.toggle("is-active", b.dataset.tab === tabId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navButtons.forEach(btn => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});

/* ================================
   Modal login admin
================================ */
const gearBtn = $("#gearBtn");
const adminEntryBtn = $("#adminEntryBtn");
const adminLogo = $("#adminLogo");
if (adminLogo) {
  adminLogo.addEventListener("contextmenu", (e) => e.preventDefault());
  const img = adminLogo.querySelector("img");
  if (img) img.addEventListener("contextmenu", (e) => e.preventDefault());
}

const loginModal = $("#loginModal");
const adminPass = $("#adminPass");
const loginBtn = $("#loginBtn");
const loginMsg = $("#loginMsg");
const logoutBtn = $("#logoutBtn");

function openModal() {
  loginModal.classList.add("is-open");
  loginModal.setAttribute("aria-hidden", "false");
  adminPass.value = "";
  loginMsg.textContent = "";
  setTimeout(() => adminPass.focus(), 50);
}
function closeModal() {
  loginModal.classList.remove("is-open");
  loginModal.setAttribute("aria-hidden", "true");
  loginMsg.textContent = "";
}

function isAdminOpen() {
  const adminPanel = $("#admin");
  return adminPanel && adminPanel.classList.contains("is-show");
}

function openAdminEntry() {
  if (isAdminOpen()) {
    showTab("inicio");
    return;
  }
  const logged = load(STORAGE_KEYS.admin, false);
  if (logged) {
    showAdmin();
  } else {
    openModal();
  }
}

if (gearBtn) {
  gearBtn.addEventListener("click", openAdminEntry);
}

if (adminEntryBtn) {
  adminEntryBtn.addEventListener("click", openAdminEntry);
}

if (adminLogo) {
  let holdTimer = null;
  let touchActive = false;

  const startHold = () => {
    if (holdTimer) return;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      openAdminEntry();
    }, 1000);
  };
  const cancelHold = () => {
    if (!holdTimer) return;
    clearTimeout(holdTimer);
    holdTimer = null;
  };

  adminLogo.addEventListener("mousedown", () => {
    if (touchActive) return;
    startHold();
  });
  adminLogo.addEventListener("mouseup", cancelHold);
  adminLogo.addEventListener("mouseleave", cancelHold);
  adminLogo.addEventListener("touchstart", () => {
    touchActive = true;
    startHold();
  }, { passive: true });
  adminLogo.addEventListener("touchend", () => {
    touchActive = false;
    cancelHold();
  });
  adminLogo.addEventListener("touchcancel", () => {
    touchActive = false;
    cancelHold();
  });
  adminLogo.addEventListener("touchmove", cancelHold, { passive: true });
}

loginModal.addEventListener("click", (e) => {
  const close = e.target.getAttribute("data-close");
  if (close === "1") closeModal();
});

loginBtn.addEventListener("click", async () => {
  const pass = adminPass.value.trim();
  if (!pass) {
    loginMsg.textContent = "Digite a senha.";
    return;
  }
  loginMsg.textContent = "Entrando...";
  const r = await apiFetchJson("/auth.php?action=login", {
    method: "POST",
    body: JSON.stringify({ user: "admin", pass })
  });
  if (r && r.ok) {
    save(STORAGE_KEYS.admin, true);
    closeModal();
    showAdmin();
    loginMsg.textContent = "";
  } else {
    loginMsg.textContent = "Senha incorreta.";
  }
});


function renderAdminAll() {
  try {
    if (typeof renderClients === "function") renderClients();
    if (typeof renderStock === "function") renderStock();
    if (typeof renderServicesAdmin === "function") renderServicesAdmin();
    if (typeof renderPlansAdmin === "function") renderPlansAdmin();
    if (typeof renderSubscribers === "function") renderSubscribers();
    if (typeof renderBarbers === "function") renderBarbers();
    if (typeof renderCutSelects === "function") renderCutSelects();
    if (typeof renderCuts === "function") renderCuts();
    if (typeof renderCommissionSummary === "function") renderCommissionSummary();
    if (typeof renderCommissionMonth === "function") renderCommissionMonth();
    if (typeof refreshFinanceUI === "function") refreshFinanceUI(activeFinanceMonth || undefined);
    if (typeof renderAdminBookings === "function") renderAdminBookings();
    if (typeof renderBlockedDates === "function") renderBlockedDates();
    if (typeof renderBlockedSlots === "function") renderBlockedSlots();
    if (typeof renderAdminCalendar === "function") renderAdminCalendar();
  } catch (e) {
    console.warn("renderAdminAll falhou:", e);
  }
}

function showAdmin() {
  navButtons.forEach(b => b.classList.remove("is-active"));
  panels.forEach(p => p.classList.remove("is-show"));
  $("#admin").classList.add("is-show");
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Re-render ao abrir o admin (evita painel vazio na primeira entrada)
  setTimeout(renderAdminAll, 0);
}


logoutBtn.addEventListener("click", async () => {
  await apiFetchJson("/auth.php?action=logout", { method: "POST", body: JSON.stringify({}) }).catch(() => { });
  save(STORAGE_KEYS.admin, false);
  showTab("inicio");
});


/* ================================
   Admin: troca de painéis
================================ */
const adminCards = $$(".admin-card");
const adminPanels = $$(".admin-panel");

function showAdminPanel(id) {
  adminPanels.forEach(p => p.classList.toggle("is-show", p.id === id));
}
adminCards.forEach(card => {
  card.addEventListener("click", () => {
    showAdminPanel("admin_" + card.dataset.admin);
  });
});
showAdminPanel("admin_clientes");

/* ================================
   Dados (localStorage)
================================ */
let clients = load(STORAGE_KEYS.clients, []);
let stock = load(STORAGE_KEYS.stock, []);
let services = load(STORAGE_KEYS.services, [
  { name: "Corte", price: 35.00 },
  { name: "Barba", price: 30.00 },
  { name: "Corte + Barba", price: 55.00 }
]);
let gallery = load(STORAGE_KEYS.gallery, []);
let barbers = load(STORAGE_KEYS.barbers, []);
let cuts = load(STORAGE_KEYS.cuts, []);
let bookings = load(STORAGE_KEYS.bookings, {});
let finances = load(STORAGE_KEYS.finances, {});
let subscribers = load(STORAGE_KEYS.subscribers, []);
let plans = load(STORAGE_KEYS.plans, [
  {
    id: "basic",
    name: "Plano Básico",
    price: 79.9,
    period: "mês",
    badge: "",
    featured: false,
    paymentLink: "",
    description: "",
    items: ["2 cortes por mês", "Agendamento prioritário", "Suporte via WhatsApp"]
  },
  {
    id: "premium",
    name: "Plano Premium",
    price: 119.9,
    period: "mês",
    badge: "Mais vendido",
    featured: true,
    paymentLink: "",
    description: "",
    items: ["4 cortes por mês", "Barba inclusa", "Desconto em produtos"]
  },
  {
    id: "vip",
    name: "Plano VIP",
    price: 169.9,
    period: "mês",
    badge: "",
    featured: false,
    paymentLink: "",
    description: "",
    items: ["Cortes ilimitados", "Barba e tratamento", "Horário exclusivo"]
  }
]);

/* ================================
   Helpers
================================ */
function brl(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str) {
  return escapeHtml(str).replaceAll('"', "&quot;");
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return `https://${raw}`;
}

function toBrlInput(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
}

function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}

function formatPhoneBR(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length < 3) {
    return `(${digits}${digits.length === 2 ? ") " : ""}`;
  }
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
}

document.addEventListener("input", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.type !== "tel") return;
  target.value = formatPhoneBR(target.value);
});

/* ================================
   Render: Preços + Select serviço
================================ */
const pricesList = $("#pricesList");
const pricesEmpty = $("#pricesEmpty");
const bookServicesList = $("#bookServicesList");
const addBookServiceBtn = $("#addBookServiceBtn");

function renderPrices() {
  pricesList.innerHTML = "";
  if (!services.length) {
    pricesEmpty.style.display = "block";
    return;
  }
  pricesEmpty.style.display = "none";
  services.forEach(s => {
    const row = document.createElement("div");
    row.className = "price-item";
    row.innerHTML = `<span>${escapeHtml(s.name)}</span><b>${brl(Number(s.price) || 0)}</b>`;
    pricesList.appendChild(row);
  });

  refreshBookServicesSelects();
}

function getServiceOptionsHtml() {
  if (!services.length) return `<option value="">Cadastre um serviço</option>`;
  const options = services.map(s => `<option value="${escapeAttr(s.name)}">${escapeHtml(s.name)} - ${brl(Number(s.price) || 0)}</option>`).join("");
  return `<option value="" disabled selected hidden>Selecione um serviço</option>` + options;
}

function refreshBookServicesSelects() {
  if (!bookServicesList) return;
  const selects = Array.from(bookServicesList.querySelectorAll('.bookServiceSelect'));
  const currentValues = selects.map(s => s.value).filter(Boolean);
  const html = getServiceOptionsHtml();
  selects.forEach(sel => {
    const val = sel.value;
    sel.innerHTML = html;
    sel.disabled = !services.length;
    if (val) sel.value = val;
    Array.from(sel.options).forEach(opt => {
      if (opt.value && opt.value !== val && currentValues.includes(opt.value)) {
        opt.disabled = true;
      }
    });
  });

  if (addBookServiceBtn) {
    const hasEmpty = selects.some(s => !s.value);
    const exhausted = currentValues.length >= services.length;
    addBookServiceBtn.disabled = hasEmpty || exhausted;
  }
}

if (bookServicesList) {
  bookServicesList.addEventListener("change", (e) => {
    if (e.target.classList.contains("bookServiceSelect")) {
      refreshBookServicesSelects();
    }
  });
}

if (addBookServiceBtn) {
  addBookServiceBtn.addEventListener("click", () => {
    if (!bookServicesList) return;
    const row = document.createElement("div");
    row.className = "book-service-row";
    row.style.display = "flex";
    row.style.gap = "5px";
    row.style.marginBottom = "5px";
    const select = document.createElement("select");
    select.className = "bookServiceSelect";
    select.style.flex = "1";
    select.innerHTML = getServiceOptionsHtml();
    select.disabled = !services.length;

    const btn = document.createElement("button");
    btn.className = "icon-btn remove-book-service-btn";
    btn.type = "button";
    btn.title = "Remover";
    btn.innerHTML = `<i class="fa fa-trash"></i>`;
    btn.addEventListener("click", () => {
      row.remove();
      refreshBookServicesSelects();
    });

    row.appendChild(select);
    row.appendChild(btn);
    bookServicesList.appendChild(row);
    refreshBookServicesSelects();
  });
}
renderPrices();

/* ================================
   Planos (assinaturas)
================================ */
const plansGrid = $("#plansGrid");
const plansEmpty = $("#plansEmpty");
const plansTable = $("#plansTable");
const planName = $("#planName");
const planPrice = $("#planPrice");
const planPeriod = $("#planPeriod");
const planBadge = $("#planBadge");
const planPaymentLink = $("#planPaymentLink");
const planFeatured = $("#planFeatured");
const planItems = $("#planItems");
const planDesc = $("#planDesc");
const addPlanBtn = $("#addPlanBtn");

let editingPlanId = null;

function normalizePlans() {
  if (!Array.isArray(plans)) plans = [];
  plans.forEach((p) => {
    if (!Array.isArray(p.items)) p.items = [];
    if (typeof p.description !== "string") p.description = "";
    if (typeof p.featured !== "boolean") p.featured = Boolean(p.featured);
    if (typeof p.paymentLink !== "string") p.paymentLink = "";
  });
}
normalizePlans();

function resolvePlanLink(plan) {
  return normalizeUrl(plan ? plan.paymentLink : "");
}

function renderPlans() {
  if (!plansGrid || !plansEmpty) return;
  plansGrid.innerHTML = "";
  if (!plans.length) {
    plansEmpty.style.display = "block";
    return;
  }
  plansEmpty.style.display = "none";

  plans.forEach((p) => {
    const card = document.createElement("div");
    card.className = "plan-card" + (p.featured ? " featured" : "");
    const badge = p.badge ? `<div class="plan-badge">${escapeHtml(p.badge)}</div>` : "";
    const desc = p.description ? `<p class="plan-desc">${escapeHtml(p.description)}</p>` : "";
    const items = (p.items || [])
      .map(i => `<li>${escapeHtml(i)}</li>`)
      .join("");
    const link = resolvePlanLink(p);
    const action = link
      ? `<a class="btn primary" target="_blank" rel="noopener" href="${escapeAttr(link)}">ASSINAR AGORA</a>`
      : `<button class="btn primary" type="button" disabled>ASSINAR AGORA</button>`;
    card.innerHTML = `
      <div class="plan-top">
        <h4>${escapeHtml(p.name || "")}</h4>
        <div class="plan-price">${brl(Number(p.price) || 0)}<span>/${escapeHtml(p.period || "mês")}</span></div>
        ${badge}
      </div>
      ${desc}
      <ul class="plan-list">${items}</ul>
      <div class="plan-actions">
        ${action}
      </div>
    `;
    plansGrid.appendChild(card);
  });
}

function resetPlanForm() {
  if (planName) planName.value = "";
  if (planPrice) planPrice.value = "";
  if (planPeriod) planPeriod.value = "mês";
  if (planBadge) planBadge.value = "";
  if (planPaymentLink) planPaymentLink.value = "";
  if (planFeatured) planFeatured.value = "0";
  if (planItems) planItems.value = "";
  if (planDesc) planDesc.value = "";
  editingPlanId = null;
  if (addPlanBtn) addPlanBtn.textContent = "ADICIONAR";
}

function fillPlanForm(plan) {
  if (!plan) return;
  if (planName) planName.value = plan.name || "";
  if (planPrice) planPrice.value = toBrlInput(plan.price);
  if (planPeriod) planPeriod.value = plan.period || "mês";
  if (planBadge) planBadge.value = plan.badge || "";
  if (planPaymentLink) planPaymentLink.value = plan.paymentLink || "";
  if (planFeatured) planFeatured.value = plan.featured ? "1" : "0";
  if (planItems) planItems.value = (plan.items || []).join("\n");
  if (planDesc) planDesc.value = plan.description || "";
  editingPlanId = plan.id;
  if (addPlanBtn) addPlanBtn.textContent = "SALVAR";
}

function renderPlansAdmin() {
  if (!plansTable) return;
  plansTable.innerHTML = "";
  if (!plans.length) {
    plansTable.innerHTML = `<div class="t-row"><span class="muted">Sem planos cadastrados</span><span></span><span></span><span></span><span></span></div>`;
    return;
  }

  plans.forEach((p) => {
    const row = document.createElement("div");
    row.className = "t-row";
    row.innerHTML = `
      <span>${escapeHtml(p.name || "")}</span>
      <span>${brl(Number(p.price) || 0)}</span>
      <span>${(p.items || []).length} itens</span>
      <span>${escapeHtml(p.badge || "-")}</span>
      <span class="t-actions">
        <button class="icon-btn" data-edit="${escapeAttr(p.id)}">Editar</button>
        <button class="icon-btn" data-del="${escapeAttr(p.id)}">Excluir</button>
      </span>
    `;

    row.querySelector("[data-edit]").addEventListener("click", () => {
      fillPlanForm(p);
      if (planName) planName.focus();
    });

    row.querySelector("[data-del]").addEventListener("click", () => {
      const ok = confirm(`Excluir o plano ${p.name}?`);
      if (!ok) return;
      plans = plans.filter(x => x.id !== p.id);
      save(STORAGE_KEYS.plans, plans);
      if (editingPlanId === p.id) resetPlanForm();
      renderPlans();
      renderPlansAdmin();
      renderSubscriberPlanSelect(subPlan ? subPlan.value : "");
    });

    plansTable.appendChild(row);
  });
}

if (addPlanBtn) {
  addPlanBtn.addEventListener("click", () => {
    const name = planName ? planName.value.trim() : "";
    const price = Number(planPrice ? planPrice.value : 0);
    const period = planPeriod ? planPeriod.value : "mês";
    const badge = planBadge ? planBadge.value.trim() : "";
    const paymentLink = planPaymentLink ? planPaymentLink.value.trim() : "";
    const featured = planFeatured ? planFeatured.value === "1" : false;
    const items = planItems ? planItems.value.split("\n").map(s => s.trim()).filter(Boolean) : [];
    const description = planDesc ? planDesc.value.trim() : "";

    if (!name || Number.isNaN(price) || price < 0) return;

    if (editingPlanId) {
      const existing = plans.find(x => x.id === editingPlanId);
      if (existing) {
        existing.name = name;
        existing.price = price;
        existing.period = period;
        existing.badge = badge;
        existing.paymentLink = paymentLink;
        existing.featured = featured;
        existing.items = items;
        existing.description = description;
      }
    } else {
      plans.unshift({
        id: uid(),
        name,
        price,
        period,
        badge,
        featured,
        paymentLink,
        items,
        description
      });
    }

    save(STORAGE_KEYS.plans, plans);
    resetPlanForm();
    renderPlans();
    renderPlansAdmin();
    renderSubscriberPlanSelect(subPlan ? subPlan.value : "");
  });
}

renderPlans();
renderPlansAdmin();

/* ================================
   Render: Galeria pública + admin
================================ */
const galleryGrid = $("#galleryGrid");
const galleryEmpty = $("#galleryEmpty");
const adminGalleryGrid = $("#adminGalleryGrid");

function renderGallery() {
  galleryGrid.innerHTML = "";
  adminGalleryGrid.innerHTML = "";

  if (!gallery.length) {
    galleryEmpty.style.display = "block";
  } else {
    galleryEmpty.style.display = "none";
    gallery.forEach((url) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Foto da barbearia";
      img.loading = "lazy";
      galleryGrid.appendChild(img);
    });
  }

  gallery.forEach((url, idx) => {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";

    const img = document.createElement("img");
    img.src = url;
    img.alt = "Foto";
    img.loading = "lazy";

    const btn = document.createElement("button");
    btn.className = "icon-btn";
    btn.textContent = "Remover";
    btn.style.position = "absolute";
    btn.style.right = "10px";
    btn.style.bottom = "10px";
    btn.style.background = "rgba(0,0,0,.45)";

    btn.addEventListener("click", () => {
      gallery.splice(idx, 1);
      save(STORAGE_KEYS.gallery, gallery);
      renderGallery();
    });

    wrap.appendChild(img);
    wrap.appendChild(btn);
    adminGalleryGrid.appendChild(wrap);
  });
}
renderGallery();

const gUrlInput = $("#gUrl");
const gFileInput = $("#gFile");
const addPhotoBtn = $("#addPhotoBtn");
const addPhotoFileBtn = $("#addPhotoFileBtn");

function addGalleryItem(url) {
  if (!url) return;
  gallery.unshift(url);
  save(STORAGE_KEYS.gallery, gallery);
  renderGallery();
}

if (addPhotoBtn) {
  addPhotoBtn.addEventListener("click", () => {
    const url = gUrlInput.value.trim();
    if (!url) return;
    addGalleryItem(url);
    gUrlInput.value = "";
  });
}

if (addPhotoFileBtn && gFileInput) {
  addPhotoFileBtn.addEventListener("click", () => {
    const file = gFileInput.files && gFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      addGalleryItem(dataUrl);
      gFileInput.value = "";
    };
    reader.readAsDataURL(file);
  });
}

/* ================================
   Admin: Clientes
================================ */
const clientsTable = $("#clientsTable");

function renderClients() {
  clientsTable.innerHTML = "";
  if (!clients.length) {
    clientsTable.innerHTML = `<div class="t-row"><span class="muted">Sem clientes cadastrados</span><span></span><span></span></div>`;
    return;
  }

  clients.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "t-row";
    row.innerHTML = `
      <span>${escapeHtml(c.name)}</span>
      <span>${escapeHtml(c.phone)}</span>
      <span class="t-actions">
        <button class="icon-btn" data-del="${idx}">Excluir</button>
      </span>
    `;
    row.querySelector("[data-del]").addEventListener("click", () => {
      clients.splice(idx, 1);
      save(STORAGE_KEYS.clients, clients);
      renderClients();
    });
    clientsTable.appendChild(row);
  });
}
renderClients();

$("#addClientBtn").addEventListener("click", () => {
  const name = $("#cName").value.trim();
  const phone = formatPhoneBR($("#cPhone").value);
  if (!name || !phone) return;

  clients.unshift({ name, phone });
  $("#cName").value = "";
  $("#cPhone").value = "";
  save(STORAGE_KEYS.clients, clients);
  renderClients();
});

/* ================================
   Admin: Estoque
================================ */
const stockTable = $("#stockTable");

function renderStock() {
  stockTable.innerHTML = "";
  if (!stock.length) {
    stockTable.innerHTML = `<div class="t-row"><span class="muted">Sem produtos no estoque</span><span></span><span></span></div>`;
    return;
  }

  stock.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "t-row";
    row.innerHTML = `
      <span>${escapeHtml(p.name)}</span>
      <span>${escapeHtml(String(p.qty))}</span>
      <span class="t-actions">
        <button class="icon-btn" data-minus="${idx}">-</button>
        <button class="icon-btn" data-plus="${idx}">+</button>
        <button class="icon-btn" data-del="${idx}">Excluir</button>
      </span>
    `;

    row.querySelector("[data-minus]").addEventListener("click", () => {
      stock[idx].qty = Math.max(0, (Number(stock[idx].qty) || 0) - 1);
      save(STORAGE_KEYS.stock, stock);
      renderStock();
    });
    row.querySelector("[data-plus]").addEventListener("click", () => {
      stock[idx].qty = (Number(stock[idx].qty) || 0) + 1;
      save(STORAGE_KEYS.stock, stock);
      renderStock();
    });
    row.querySelector("[data-del]").addEventListener("click", () => {
      stock.splice(idx, 1);
      save(STORAGE_KEYS.stock, stock);
      renderStock();
    });

    stockTable.appendChild(row);
  });
}
renderStock();

$("#addProductBtn").addEventListener("click", () => {
  const name = $("#pName").value.trim();
  const qty = Number($("#pQty").value);
  if (!name || Number.isNaN(qty)) return;

  stock.unshift({ name, qty });
  $("#pName").value = "";
  $("#pQty").value = "";
  save(STORAGE_KEYS.stock, stock);
  renderStock();
});

/* ================================
   Admin: Serviços / Preços
================================ */
const servicesTable = $("#servicesTable");

function renderServicesAdmin() {
  servicesTable.innerHTML = "";
  if (!services.length) {
    servicesTable.innerHTML = `<div class="t-row"><span class="muted">Sem serviços</span><span></span><span></span></div>`;
    return;
  }

  services.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "t-row";
    row.innerHTML = `
      <span>${escapeHtml(s.name)}</span>
      <span>${brl(Number(s.price) || 0)}</span>
      <span class="t-actions">
        <button class="icon-btn" data-del="${idx}">Excluir</button>
      </span>
    `;
    row.querySelector("[data-del]").addEventListener("click", () => {
      services.splice(idx, 1);
      save(STORAGE_KEYS.services, services);
      renderServicesAdmin();
      renderPrices();
      renderCutSelects();
    });
    servicesTable.appendChild(row);
  });
}
renderServicesAdmin();

$("#addServiceBtn").addEventListener("click", () => {
  const name = $("#sName").value.trim();
  const price = Number($("#sPrice").value);
  if (!name || Number.isNaN(price)) return;

  services.unshift({ name, price });
  $("#sName").value = "";
  $("#sPrice").value = "";
  save(STORAGE_KEYS.services, services);
  renderServicesAdmin();
  renderPrices();
  renderCutSelects();
});

/* ================================
   Comissão (profissionais + cortes)
================================ */
const barbersTable = $("#barbersTable");
const cutsTable = $("#cutsTable");
const commissionSummary = $("#commissionSummary");
const cutsTotalQty = $("#cutsTotalQty");
const cutsTotalCommission = $("#cutsTotalCommission");
const commissionMonth = $("#commissionMonth");
const commissionMonthBtn = $("#commissionMonthBtn");
const commissionMonthSummary = $("#commissionMonthSummary");
const monthCutsTotalQty = $("#monthCutsTotalQty");
const monthCutsTotalCommission = $("#monthCutsTotalCommission");
const commissionReportToggle = $("#commissionReportToggle");
const commissionReportBody = $("#commissionReportBody");
const commissionReportCard = $("#commissionReportCard");
const commissionBarbersToggle = $("#commissionBarbersToggle");
const commissionBarbersBody = $("#commissionBarbersBody");
const commissionBarbersCard = $("#commissionBarbersCard");
const commissionCutsListToggle = $("#commissionCutsListToggle");
const commissionCutsListBody = $("#commissionCutsListBody");
const commissionCutsListCard = $("#commissionCutsListCard");

const cutBarber = $("#cutBarber");
const cutServicesList = $("#cutServicesList");
const addCutServiceBtn = $("#addCutServiceBtn");
const cutQty = $("#cutQty");
const cutDate = $("#cutDate");

function refreshCutServicesSelects() {
  if (!cutServicesList) return;
  const selects = Array.from(cutServicesList.querySelectorAll('.cutServiceSelect'));
  const currentValues = selects.map(s => s.value).filter(Boolean);
  const html = getServiceOptionsHtml();
  selects.forEach(sel => {
    const val = sel.value;
    sel.innerHTML = html;
    sel.disabled = !services.length;
    if (val) sel.value = val;
    Array.from(sel.options).forEach(opt => {
      if (opt.value && opt.value !== val && currentValues.includes(opt.value)) {
        opt.disabled = true;
      }
    });
  });

  if (addCutServiceBtn) {
    const hasEmpty = selects.some(s => !s.value);
    const exhausted = currentValues.length >= services.length;
    addCutServiceBtn.disabled = hasEmpty || exhausted;
  }
}

if (cutServicesList) {
  cutServicesList.addEventListener("change", (e) => {
    if (e.target.classList.contains("cutServiceSelect")) {
      refreshCutServicesSelects();
    }
  });
}

if (addCutServiceBtn) {
  addCutServiceBtn.addEventListener("click", () => {
    if (!cutServicesList) return;
    const row = document.createElement("div");
    row.className = "cut-service-row";
    row.style.display = "flex";
    row.style.gap = "5px";
    row.style.marginBottom = "5px";
    const select = document.createElement("select");
    select.className = "cutServiceSelect";
    select.style.flex = "1";
    select.innerHTML = getServiceOptionsHtml();
    select.disabled = !services.length;

    const btn = document.createElement("button");
    btn.className = "icon-btn remove-cut-service-btn";
    btn.type = "button";
    btn.title = "Remover";
    btn.innerHTML = `<i class="fa fa-trash"></i>`;
    btn.addEventListener("click", () => {
      row.remove();
      refreshCutServicesSelects();
    });

    row.appendChild(select);
    row.appendChild(btn);
    cutServicesList.appendChild(row);
    refreshCutServicesSelects();
  });
}

function renderCutSelects() {
  if (!cutBarber) return;

  if (!barbers.length) {
    cutBarber.innerHTML = `<option value="">Cadastre um profissional</option>`;
    cutBarber.disabled = true;
  } else {
    cutBarber.disabled = false;
    cutBarber.innerHTML = barbers
      .map(b => `<option value="${escapeAttr(b.id)}">${escapeHtml(b.name)} (${Number(b.percent) || 0}%)</option>`)
      .join("");
  }

  refreshCutServicesSelects();
}

function calcCutCommission(c) {
  const price = Number(c.servicePrice) || 0;
  const qty = Math.max(0, Number(c.qty) || 0);
  const percent = Number(c.percent) || 0;
  return price * qty * (percent / 100);
}

function renderBarbers() {
  if (!barbersTable) return;
  barbersTable.innerHTML = "";
  if (!barbers.length) {
    barbersTable.innerHTML = `<div class="t-row"><span class="muted">Sem profissionais cadastrados</span><span></span><span></span></div>`;
    return;
  }

  barbers.forEach((b) => {
    const row = document.createElement("div");
    row.className = "t-row";
    row.innerHTML = `
      <span>${escapeHtml(b.name)}</span>
      <span>${Number(b.percent) || 0}%</span>
      <span class="t-actions">
        <button class="icon-btn" data-edit="${escapeAttr(b.id)}">Editar %</button>
        <button class="icon-btn" data-del="${escapeAttr(b.id)}">Excluir</button>
      </span>
    `;

    row.querySelector("[data-edit]").addEventListener("click", () => {
      const next = Number(prompt("Novo % de comissão:", String(b.percent)));
      if (Number.isNaN(next)) return;
      b.percent = Math.max(0, Math.min(100, next));
      const updateCuts = confirm("Atualizar os cortes já lançados com o novo %?");
      if (updateCuts) {
        cuts.forEach(c => {
          if (c.barberId === b.id) c.percent = b.percent;
        });
        save(STORAGE_KEYS.cuts, cuts);
      }
      save(STORAGE_KEYS.barbers, barbers);
      renderBarbers();
      renderCutSelects();
      renderCommissionSummary();
      renderCommissionMonth();
    });

    row.querySelector("[data-del]").addEventListener("click", () => {
      const ok = confirm(`Excluir ${b.name} e todos os cortes lançados para ele?`);
      if (!ok) return;
      barbers = barbers.filter(x => x.id !== b.id);
      cuts = cuts.filter(c => c.barberId !== b.id);
      save(STORAGE_KEYS.barbers, barbers);
      save(STORAGE_KEYS.cuts, cuts);
      renderBarbers();
      renderCutSelects();
      renderCuts();
      renderCommissionSummary();
      renderCommissionMonth();
    });

    barbersTable.appendChild(row);
  });
}

function renderCuts() {
  if (!cutsTable) return;
  cutsTable.innerHTML = "";
  if (!cuts.length) {
    cutsTable.innerHTML = `<div class="t-row"><span class="muted">Sem cortes lançados</span><span></span><span></span><span></span><span></span></div>`;
    return;
  }

  cuts.forEach((c) => {
    const row = document.createElement("div");
    row.className = "t-row";
    const comm = calcCutCommission(c);
    const dateInfo = c.date ? `<div class="tiny muted">${escapeHtml(formatDateDMY(c.date))}</div>` : "";
    row.innerHTML = `
      <span>${escapeHtml(c.barberName || "—")}</span>
      <span>
        ${escapeHtml(c.serviceName || "")}
        ${dateInfo}
      </span>
      <span>${Number(c.qty) || 0}</span>
      <span>${brl(comm)}</span>
      <span class="t-actions">
        <button class="icon-btn" data-del="${escapeAttr(c.id)}">Excluir</button>
      </span>
    `;

    row.querySelector("[data-del]").addEventListener("click", () => {
      cuts = cuts.filter(x => x.id !== c.id);
      save(STORAGE_KEYS.cuts, cuts);
      renderCuts();
      renderCommissionSummary();
      renderCommissionMonth();
    });

    cutsTable.appendChild(row);
  });
}

function renderCommissionSummary() {
  let totalQty = 0;
  let totalCommission = 0;
  const canRender = !!commissionSummary;

  if (canRender) commissionSummary.innerHTML = "";

  if (!barbers.length) {
    if (canRender) {
      commissionSummary.innerHTML = `<div class="t-row"><span class="muted">Sem profissionais cadastrados</span><span></span><span></span></div>`;
    }
  } else {
    barbers.forEach((b) => {
      const related = cuts.filter(c => c.barberId === b.id);
      const qty = related.reduce((sum, c) => sum + (Number(c.qty) || 0), 0);
      const comm = related.reduce((sum, c) => sum + calcCutCommission(c), 0);
      totalQty += qty;
      totalCommission += comm;

      if (canRender) {
        const row = document.createElement("div");
        row.className = "t-row";
        row.innerHTML = `
          <span>${escapeHtml(b.name)}</span>
          <span>${qty}</span>
          <span>${brl(comm)}</span>
        `;
        commissionSummary.appendChild(row);
      }
    });
  }

  if (cutsTotalQty) cutsTotalQty.textContent = String(totalQty);
  if (cutsTotalCommission) cutsTotalCommission.textContent = brl(totalCommission);
}

function renderCommissionMonth() {
  if (!commissionMonthSummary) return;

  const monthKey = commissionMonth ? commissionMonth.value : "";
  const monthCuts = monthKey
    ? cuts.filter(c => (c.date || "").slice(0, 7) === monthKey)
    : [];

  commissionMonthSummary.innerHTML = "";

  let totalQty = 0;
  let totalCommission = 0;
  let hasRows = false;

  if (!monthKey) {
    commissionMonthSummary.innerHTML = `<div class="t-row"><span class="muted">Selecione um mês para ver o relatório.</span><span></span><span></span></div>`;
  } else if (!monthCuts.length) {
    commissionMonthSummary.innerHTML = `<div class="t-row"><span class="muted">Sem cortes no mês selecionado.</span><span></span><span></span></div>`;
  } else {
    barbers.forEach((b) => {
      const related = monthCuts.filter(c => c.barberId === b.id);
      const qty = related.reduce((sum, c) => sum + (Number(c.qty) || 0), 0);
      const comm = related.reduce((sum, c) => sum + calcCutCommission(c), 0);
      if (qty === 0 && comm === 0) return;
      totalQty += qty;
      totalCommission += comm;
      hasRows = true;

      const row = document.createElement("div");
      row.className = "t-row";
      row.innerHTML = `
        <span>${escapeHtml(b.name)}</span>
        <span>${qty}</span>
        <span>${brl(comm)}</span>
      `;
      commissionMonthSummary.appendChild(row);
    });
  }

  if (!hasRows && monthKey && monthCuts.length) {
    commissionMonthSummary.innerHTML = `<div class="t-row"><span class="muted">Sem cortes no mês selecionado.</span><span></span><span></span></div>`;
  }

  if (monthCutsTotalQty) monthCutsTotalQty.textContent = String(totalQty);
  if (monthCutsTotalCommission) monthCutsTotalCommission.textContent = brl(totalCommission);
}

$("#addBarberBtn").addEventListener("click", () => {
  const name = $("#bName").value.trim();
  const percent = Number($("#bPercent").value);
  if (!name || Number.isNaN(percent)) return;

  barbers.unshift({ id: uid(), name, percent: Math.max(0, Math.min(100, percent)) });
  $("#bName").value = "";
  $("#bPercent").value = "";
  save(STORAGE_KEYS.barbers, barbers);
  renderBarbers();
  renderCutSelects();
  renderCommissionSummary();
  renderCommissionMonth();
});

$("#addCutBtn").addEventListener("click", () => {
  const barberId = cutBarber.value;
  const qty = Math.max(1, Number(cutQty.value) || 1);
  const date = cutDate.value || "";

  if (!barberId) return;
  const barber = barbers.find(b => b.id === barberId);
  if (!barber || !cutServicesList) return;

  const selects = Array.from(cutServicesList.querySelectorAll('.cutServiceSelect'));
  let added = false;

  selects.forEach(sel => {
    const serviceName = sel.value;
    if (!serviceName) return;
    const service = services.find(s => s.name === serviceName);
    if (!service) return;

    cuts.unshift({
      id: uid(),
      barberId,
      barberName: barber.name,
      serviceName,
      servicePrice: Number(service.price) || 0,
      percent: Number(barber.percent) || 0,
      qty,
      date
    });
    added = true;
  });

  if (!added) return;

  save(STORAGE_KEYS.cuts, cuts);
  if (cutQty) cutQty.value = "1";

  const rows = cutServicesList.querySelectorAll('.cut-service-row');
  for (let i = 1; i < rows.length; i++) rows[i].remove();

  renderCuts();
  renderCommissionSummary();
  renderCommissionMonth();
});

if (cutDate) {
  cutDate.valueAsDate = new Date();
}
if (commissionMonth) {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  commissionMonth.value = `${now.getFullYear()}-${mm}`;
  commissionMonth.addEventListener("change", renderCommissionMonth);
}
if (commissionMonthBtn) {
  commissionMonthBtn.addEventListener("click", renderCommissionMonth);
}
initCollapse(commissionReportToggle, commissionReportBody, commissionReportCard);
initCollapse(commissionBarbersToggle, commissionBarbersBody, commissionBarbersCard);
initCollapse(commissionCutsListToggle, commissionCutsListBody, commissionCutsListCard);
renderBarbers();
renderCutSelects();
renderCuts();
renderCommissionSummary();
renderCommissionMonth();

/* ================================
   Assinantes (planos mensais)
================================ */
const subscribersTable = $("#subscribersTable");
const subName = $("#subName");
const subPhone = $("#subPhone");
const subPlan = $("#subPlan");
const subTotalCuts = $("#subTotalCuts");
const subNotes = $("#subNotes");
const addSubscriberBtn = $("#addSubscriberBtn");
const resetSubscriberCutsBtn = $("#resetSubscriberCutsBtn");

let editingSubscriberId = null;

function renderSubscriberPlanSelect(selectedValue = "") {
  if (!subPlan) return;
  const list = Array.isArray(plans) ? plans.filter(p => p && p.name) : [];
  if (!list.length) {
    subPlan.innerHTML = `<option value="">Cadastre um plano</option>`;
    subPlan.disabled = true;
    return;
  }
  subPlan.disabled = false;
  const names = list.map(p => String(p.name));
  let html = `<option value="">Selecione um plano</option>` + names
    .map(name => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`)
    .join("");
  if (selectedValue && !names.includes(selectedValue)) {
    html += `<option value="${escapeAttr(selectedValue)}">${escapeHtml(selectedValue)} (antigo)</option>`;
  }
  subPlan.innerHTML = html;
  if (selectedValue) subPlan.value = selectedValue;
}

function normalizeSubscribers() {
  if (!Array.isArray(subscribers)) subscribers = [];
  subscribers.forEach((s) => {
    const total = Math.max(0, Number(s.totalCuts) || 0);
    if (typeof s.remainingCuts !== "number") s.remainingCuts = total;
    if (s.remainingCuts > total) s.remainingCuts = total;
  });
}
normalizeSubscribers();

function resetSubscriberForm() {
  if (subName) subName.value = "";
  if (subPhone) subPhone.value = "";
  if (subTotalCuts) subTotalCuts.value = "";
  if (subNotes) subNotes.value = "";
  editingSubscriberId = null;
  if (addSubscriberBtn) addSubscriberBtn.textContent = "ADICIONAR";
  renderSubscriberPlanSelect("");
}

function fillSubscriberForm(sub) {
  if (!sub) return;
  if (subName) subName.value = sub.name || "";
  if (subPhone) subPhone.value = sub.phone || "";
  renderSubscriberPlanSelect(sub.plan || "");
  if (subTotalCuts) subTotalCuts.value = String(sub.totalCuts || "");
  if (subNotes) subNotes.value = sub.notes || "";
  editingSubscriberId = sub.id;
  if (addSubscriberBtn) addSubscriberBtn.textContent = "SALVAR";
}

function renderSubscribers() {
  if (!subscribersTable) return;
  subscribersTable.innerHTML = "";
  if (!subscribers.length) {
    subscribersTable.innerHTML = `<div class="t-row"><span class="muted">Sem assinantes cadastrados</span><span></span><span></span><span></span><span></span><span></span></div>`;
    return;
  }

  subscribers.forEach((s) => {
    const remaining = Math.max(0, Number(s.remainingCuts) || 0);
    const total = Math.max(0, Number(s.totalCuts) || 0);
    const row = document.createElement("div");
    row.className = "t-row";
    row.innerHTML = `
      <span>${escapeHtml(s.name || "")}</span>
      <span>${escapeHtml(s.plan || "-")}</span>
      <span>${remaining} / ${total}</span>
      <span>${escapeHtml(s.phone || "")}</span>
      <span>${escapeHtml(s.notes || "-")}</span>
      <span class="t-actions">
        <button class="icon-btn" data-cut="${escapeAttr(s.id)}">Corte -1</button>
        <button class="icon-btn" data-edit="${escapeAttr(s.id)}">Editar</button>
        <button class="icon-btn" data-del="${escapeAttr(s.id)}">Excluir</button>
      </span>
    `;

    row.querySelector("[data-cut]").addEventListener("click", () => {
      if (s.remainingCuts > 0) {
        s.remainingCuts -= 1;
        save(STORAGE_KEYS.subscribers, subscribers);
        renderSubscribers();
      }
    });

    row.querySelector("[data-edit]").addEventListener("click", () => {
      fillSubscriberForm(s);
      if (subName) subName.focus();
    });

    row.querySelector("[data-del]").addEventListener("click", () => {
      const ok = confirm(`Excluir assinatura de ${s.name}?`);
      if (!ok) return;
      subscribers = subscribers.filter(x => x.id !== s.id);
      save(STORAGE_KEYS.subscribers, subscribers);
      if (editingSubscriberId === s.id) resetSubscriberForm();
      renderSubscribers();
    });

    subscribersTable.appendChild(row);
  });
}
renderSubscribers();
renderSubscriberPlanSelect("");

if (addSubscriberBtn) {
  addSubscriberBtn.addEventListener("click", () => {
    const name = subName ? subName.value.trim() : "";
    const phone = subPhone ? formatPhoneBR(subPhone.value) : "";
    const plan = subPlan ? subPlan.value.trim() : "";
    const totalCuts = Number(subTotalCuts ? subTotalCuts.value : 0);
    const notes = subNotes ? subNotes.value.trim() : "";

    if (!name || !phone || !plan || Number.isNaN(totalCuts) || totalCuts <= 0) return;

    if (editingSubscriberId) {
      const existing = subscribers.find(x => x.id === editingSubscriberId);
      if (existing) {
        existing.name = name;
        existing.phone = phone;
        existing.plan = plan;
        existing.totalCuts = totalCuts;
        existing.remainingCuts = Math.min(existing.remainingCuts, totalCuts);
        existing.notes = notes;
      }
    } else {
      subscribers.unshift({
        id: uid(),
        name,
        phone,
        plan,
        totalCuts,
        remainingCuts: totalCuts,
        notes
      });
    }

    save(STORAGE_KEYS.subscribers, subscribers);
    resetSubscriberForm();
    renderSubscribers();
  });
}

if (resetSubscriberCutsBtn) {
  resetSubscriberCutsBtn.addEventListener("click", () => {
    if (!subscribers.length) return;
    const ok = confirm("Reiniciar cortes do mês para todos os assinantes?");
    if (!ok) return;
    subscribers.forEach(s => {
      const total = Math.max(0, Number(s.totalCuts) || 0);
      s.remainingCuts = total;
    });
    save(STORAGE_KEYS.subscribers, subscribers);
    renderSubscribers();
  });
}

/* ================================
   Caixa (entradas e gastos)
================================ */
const financeMonth = $("#financeMonth");
const financeNextMonthBtn = $("#financeNextMonthBtn");
const finType = $("#finType");
const finCategory = $("#finCategory");
const finDesc = $("#finDesc");
const finAmount = $("#finAmount");
const finDate = $("#finDate");
const addFinanceBtn = $("#addFinanceBtn");
const financeTable = $("#financeTable");
const finTotalIn = $("#finTotalIn");
const finTotalOut = $("#finTotalOut");
const finNet = $("#finNet");
const financeReportBtn = $("#financeReportBtn");
const financeCopyReportBtn = $("#financeCopyReportBtn");
const financeReportText = $("#financeReportText");

let activeFinanceMonth = "";

function normalizeFinances() {
  if (!finances || typeof finances !== "object" || Array.isArray(finances)) {
    finances = {};
  }
}

function monthKeyFromDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  const label = date.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ensureFinanceMonth(key) {
  if (!key) return;
  normalizeFinances();
  if (!finances[key]) {
    finances[key] = [];
    return true;
  }
  return false;
}

function getFinanceMonths() {
  normalizeFinances();
  return Object.keys(finances).sort((a, b) => b.localeCompare(a));
}

function formatFinanceType(type) {
  return type === "entrada" ? "Entrada" : "Saída";
}

function renderFinanceMonths(preferredKey) {
  if (!financeMonth) return;
  const currentKey = monthKeyFromDate();
  const created = ensureFinanceMonth(currentKey);
  if (created) save(STORAGE_KEYS.finances, finances);

  const months = getFinanceMonths();
  financeMonth.innerHTML = months
    .map(key => `<option value="${escapeAttr(key)}">${escapeHtml(monthLabel(key))}</option>`)
    .join("");

  if (preferredKey && finances[preferredKey]) {
    activeFinanceMonth = preferredKey;
  } else if (activeFinanceMonth && finances[activeFinanceMonth]) {
    // mantém o mês atual
  } else {
    activeFinanceMonth = months[0] || currentKey;
  }
  financeMonth.value = activeFinanceMonth;
}

function renderFinanceSummary() {
  if (!finTotalIn || !finTotalOut || !finNet) return;
  const list = finances[activeFinanceMonth] || [];
  const totalIn = list
    .filter(x => x.type === "entrada")
    .reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  const totalOut = list
    .filter(x => x.type === "saida")
    .reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  finTotalIn.textContent = brl(totalIn);
  finTotalOut.textContent = brl(totalOut);
  finNet.textContent = brl(totalIn - totalOut);
}

function renderFinanceTable() {
  if (!financeTable) return;
  financeTable.innerHTML = "";
  const list = finances[activeFinanceMonth] || [];
  if (!list.length) {
    financeTable.innerHTML = `<div class="t-row"><span class="muted">Sem lançamentos</span><span></span><span></span><span></span><span></span><span></span></div>`;
    return;
  }

  list.forEach((item) => {
    const row = document.createElement("div");
    row.className = "t-row";
    row.innerHTML = `
      <span>${escapeHtml(formatDateDMY(item.date || ""))}</span>
      <span>${escapeHtml(formatFinanceType(item.type))}</span>
      <span>${escapeHtml(item.category || "-")}</span>
      <span>${escapeHtml(item.desc || "-")}</span>
      <span>${brl(Number(item.amount) || 0)}</span>
      <span class="t-actions">
        <button class="icon-btn" data-del="${escapeAttr(item.id)}">Excluir</button>
      </span>
    `;
    row.querySelector("[data-del]").addEventListener("click", () => {
      finances[activeFinanceMonth] = (finances[activeFinanceMonth] || []).filter(x => x.id !== item.id);
      save(STORAGE_KEYS.finances, finances);
      renderFinanceTable();
      renderFinanceSummary();
    });
    financeTable.appendChild(row);
  });
}

function buildFinanceReport() {
  const key = activeFinanceMonth;
  const list = (finances[key] || [])
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let totalIn = 0;
  let totalOut = 0;
  list.forEach(x => {
    if (x.type === "entrada") totalIn += Number(x.amount) || 0;
    else totalOut += Number(x.amount) || 0;
  });

  const lines = [];
  lines.push(`Relatório - ${monthLabel(key)}`);
  lines.push(`Total de entradas: ${brl(totalIn)}`);
  lines.push(`Total de saídas: ${brl(totalOut)}`);
  lines.push(`Saldo do mês: ${brl(totalIn - totalOut)}`);
  lines.push("");
  lines.push("Lançamentos:");

  if (!list.length) {
    lines.push("Sem lançamentos.");
  } else {
    list.forEach(item => {
      const date = formatDateDMY(item.date || "");
      const typeLabel = formatFinanceType(item.type);
      const category = item.category || "-";
      const desc = item.desc || "-";
      const amount = brl(Number(item.amount) || 0);
      lines.push(`${date} | ${typeLabel} | ${category} | ${desc} | ${amount}`);
    });
  }

  return lines.join("\n");
}

function ensureReportText() {
  if (!financeReportText) return "";
  if (!financeReportText.value) {
    financeReportText.value = buildFinanceReport();
  }
  return financeReportText.value;
}

function copyReportToClipboard() {
  const text = ensureReportText();
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => { });
    return;
  }
  financeReportText.focus();
  financeReportText.select();
  financeReportText.setSelectionRange(0, financeReportText.value.length);
  try {
    document.execCommand("copy");
  } catch { }
}

function refreshFinanceUI(preferredKey) {
  renderFinanceMonths(preferredKey);
  renderFinanceSummary();
  renderFinanceTable();
}

function bootFinance() {
  if (!financeMonth) return;
  refreshFinanceUI();
  if (finDate) finDate.valueAsDate = new Date();
}

if (financeMonth) {
  financeMonth.addEventListener("change", () => {
    activeFinanceMonth = financeMonth.value;
    renderFinanceSummary();
    renderFinanceTable();
  });
}

if (financeNextMonthBtn) {
  financeNextMonthBtn.addEventListener("click", () => {
    const baseKey = activeFinanceMonth || monthKeyFromDate();
    const [y, m] = baseKey.split("-").map(Number);
    const next = new Date(y, m, 1);
    const nextKey = monthKeyFromDate(next);
    ensureFinanceMonth(nextKey);
    save(STORAGE_KEYS.finances, finances);
    refreshFinanceUI(nextKey);
  });
}

if (addFinanceBtn) {
  addFinanceBtn.addEventListener("click", () => {
    const type = finType ? finType.value : "entrada";
    const category = finCategory ? finCategory.value.trim() : "";
    const desc = finDesc ? finDesc.value.trim() : "";
    const amount = Number(finAmount ? finAmount.value : 0);
    const dateStr = finDate && finDate.value ? finDate.value : new Date().toISOString().slice(0, 10);

    if (!type || Number.isNaN(amount) || amount <= 0) return;

    const key = monthKeyFromDate(dateStr);
    ensureFinanceMonth(key);
    finances[key].unshift({
      id: uid(),
      type,
      category,
      desc,
      amount,
      date: dateStr
    });

    save(STORAGE_KEYS.finances, finances);
    if (finCategory) finCategory.value = "";
    if (finDesc) finDesc.value = "";
    if (finAmount) finAmount.value = "";
    refreshFinanceUI(key);
  });
}

if (financeReportBtn) {
  financeReportBtn.addEventListener("click", () => {
    if (financeReportText) {
      financeReportText.value = buildFinanceReport();
    }
  });
}

if (financeCopyReportBtn) {
  financeCopyReportBtn.addEventListener("click", copyReportToClipboard);
}

bootFinance();
/* ================================
   Agendamento (site)
================================ */
const bookName = $("#bookName");
const bookPhone = $("#bookPhone");
const bookDate = $("#bookDate");
const bookTime = $("#bookTime");
const slotsGrid = $("#slotsGrid");
const bookBtn = $("#bookBtn");
const bookMsg = $("#bookMsg");
const clientCalPrev = $("#clientCalPrev");
const clientCalNext = $("#clientCalNext");
const clientCalLabel = $("#clientCalLabel");
const clientCalendarGrid = $("#clientCalendarGrid");

const adminBookDate = $("#adminBookDate");
const adminTodayBtn = $("#adminTodayBtn");
const adminBookingsTable = $("#adminBookingsTable");
const blockWeekdayInputs = $$(".block-weekday");
const calPrev = $("#calPrev");
const calNext = $("#calNext");
const calLabel = $("#calLabel");
const adminCalendarGrid = $("#adminCalendarGrid");
const blockDate = $("#blockDate");
const blockDateBtn = $("#blockDateBtn");
const blockedDatesTable = $("#blockedDatesTable");
const blockSlotDate = $("#blockSlotDate");
const blockSlotTime = $("#blockSlotTime");
const blockSlotBtn = $("#blockSlotBtn");
const blockedSlotsTable = $("#blockedSlotsTable");

const scheduleMorningStart = $("#scheduleMorningStart");
const scheduleMorningEnd = $("#scheduleMorningEnd");
const scheduleAfternoonStart = $("#scheduleAfternoonStart");
const scheduleAfternoonEnd = $("#scheduleAfternoonEnd");
const scheduleDuration = $("#scheduleDuration");
const scheduleGap = $("#scheduleGap");
const scheduleSaveBtn = $("#scheduleSaveBtn");
const scheduleMsg = $("#scheduleMsg");
const scheduleToggle = $("#scheduleToggle");
const scheduleBody = $("#scheduleBody");
const scheduleCard = $("#scheduleCard");
const bookingWindowDaysInput = $("#bookingWindowDays");
const bookingWindowSaveBtn = $("#bookingWindowSaveBtn");
const bookingWindowMsg = $("#bookingWindowMsg");
const bookingWindowToggle = $("#bookingWindowToggle");
const bookingWindowBody = $("#bookingWindowBody");
const bookingWindowCard = $("#bookingWindowCard");
const bookingGraceMinutesInput = $("#bookingGraceMinutes");
const bookingGraceSaveBtn = $("#bookingGraceSaveBtn");
const bookingGraceMsg = $("#bookingGraceMsg");
const bookingGraceToggle = $("#bookingGraceToggle");
const bookingGraceBody = $("#bookingGraceBody");
const bookingGraceCard = $("#bookingGraceCard");
const blockDatesToggle = $("#blockDatesToggle");
const blockDatesBody = $("#blockDatesBody");
const blockDatesCard = $("#blockDatesCard");
const blockSlotsToggle = $("#blockSlotsToggle");
const blockSlotsBody = $("#blockSlotsBody");
const blockSlotsCard = $("#blockSlotsCard");

const blockWeekdaySlotDay = $("#blockWeekdaySlotDay");
const blockWeekdaySlotTime = $("#blockWeekdaySlotTime");
const blockWeekdaySlotBtn = $("#blockWeekdaySlotBtn");
const blockedWeekdaySlotsTable = $("#blockedWeekdaySlotsTable");
const blockWeekdaySlotsToggle = $("#blockWeekdaySlotsToggle");
const blockWeekdaySlotsBody = $("#blockWeekdaySlotsBody");
const blockWeekdaySlotsCard = $("#blockWeekdaySlotsCard");

const DEFAULT_SCHEDULE = {
  ranges: [
    { start: "09:00", end: "12:00" },
    { start: "14:00", end: "18:00" }
  ],
  duration: 40,
  gap: 10
};

const DEFAULT_BOOKING_WINDOW_DAYS = 30;
const DEFAULT_BOOKING_GRACE_MINUTES = 20;

function normalizeTimeStr(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const [h, m] = raw.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  if (h < 0 || h > 23 || m < 0 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const normalized = normalizeTimeStr(value);
  if (!normalized) return NaN;
  const [h, m] = normalized.split(":").map(Number);
  return (h * 60) + m;
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function cleanRange(startValue, endValue) {
  const start = normalizeTimeStr(startValue);
  const end = normalizeTimeStr(endValue);
  if (!start || !end) return null;
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
  if (endMin < startMin) return null;
  return { start, end };
}

function normalizeSchedule(raw) {
  const ranges = Array.isArray(raw && raw.ranges)
    ? raw.ranges.map(r => cleanRange(r && r.start, r && r.end)).filter(Boolean)
    : [];
  const duration = raw && raw.duration ? Math.max(10, Number(raw.duration)) : 40;
  const gap = raw && raw.gap !== undefined ? Math.max(0, Number(raw.gap)) : 10;
  if (!ranges.length) {
    return { ranges: DEFAULT_SCHEDULE.ranges.map(r => ({ ...r })), duration, gap };
  }
  return { ranges, duration, gap };
}

function buildTimesFromSchedule(data) {
  const ranges = data && Array.isArray(data.ranges) ? data.ranges : [];
  const duration = data && data.duration ? Math.max(10, Number(data.duration)) : 40;
  const gap = data && data.gap !== undefined ? Math.max(0, Number(data.gap)) : 10;
  const step = duration + gap;
  const times = [];
  ranges.forEach((range) => {
    const startMin = timeToMinutes(range.start);
    const endMin = timeToMinutes(range.end);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return;
    for (let t = startMin; t <= endMin; t += step) {
      times.push(minutesToTime(t));
    }
  });
  const unique = Array.from(new Set(times));
  unique.sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  return unique;
}

let schedule = normalizeSchedule(load(STORAGE_KEYS.schedule, DEFAULT_SCHEDULE));
let TIMES = buildTimesFromSchedule(schedule);

function normalizeBookingWindowDays(value) {
  const num = Math.floor(Number(value));
  if (!Number.isFinite(num) || num <= 0) return DEFAULT_BOOKING_WINDOW_DAYS;
  return Math.min(num, 365);
}

let bookingWindowDays = normalizeBookingWindowDays(load(STORAGE_KEYS.bookingWindow, DEFAULT_BOOKING_WINDOW_DAYS));

function normalizeBookingGraceMinutes(value) {
  const num = Math.floor(Number(value));
  if (!Number.isFinite(num) || num < 0) return DEFAULT_BOOKING_GRACE_MINUTES;
  return Math.min(num, 240);
}

let bookingGraceMinutes = normalizeBookingGraceMinutes(load(STORAGE_KEYS.bookingGrace, DEFAULT_BOOKING_GRACE_MINUTES));

function getBookingMaxDate() {
  const max = new Date();
  max.setHours(0, 0, 0, 0);
  max.setDate(max.getDate() + bookingWindowDays);
  return max;
}

function isDateWithinBookingWindow(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const min = new Date();
  min.setHours(0, 0, 0, 0);
  const max = getBookingMaxDate();
  return date >= min && date <= max;
}

function normalizeBookings() {
  let migrated = false;
  if (!bookings || typeof bookings !== "object" || Array.isArray(bookings)) {
    bookings = {};
  }
  const legacyDates = Object.keys(bookings).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (!bookings.items) bookings.items = [];
  if (!bookings.blockedDates) bookings.blockedDates = [];
  if (!bookings.blockedSlots) bookings.blockedSlots = [];
  if (!Array.isArray(bookings.blockedWeekdays)) bookings.blockedWeekdays = [];

  if (legacyDates.length) {
    legacyDates.forEach(dateStr => {
      const times = Array.isArray(bookings[dateStr]) ? bookings[dateStr] : [];
      times.forEach(timeStr => {
        bookings.blockedSlots.push({ date: dateStr, time: timeStr });
      });
      delete bookings[dateStr];
    });
    migrated = true;
  }
  return migrated;
}
const bookingsMigrated = normalizeBookings();
if (bookingsMigrated) {
  save(STORAGE_KEYS.bookings, bookings);
}

async function saveBookings() {
  // Persistência de agendamentos/bloqueios no D1 (endpoints /api/bookings.php).
  // Mantemos por compatibilidade — ações de admin chamam os endpoints e recebem snapshot atualizado.
  return;
}

function dateKeyFromDate(date) {
  if (!(date instanceof Date)) return "";
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isPastDate(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function isPastTimeSlot(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  const todayKey = dateKeyFromDate(new Date());
  if (dateStr !== todayKey) return false;
  const now = new Date();
  const nowMinutes = (now.getHours() * 60) + now.getMinutes();
  const slotMinutes = timeToMinutes(timeStr);
  if (!Number.isFinite(slotMinutes)) return false;
  const grace = Math.max(0, Number(bookingGraceMinutes) || 0);
  return (slotMinutes + grace) <= nowMinutes;
}

function buildAppointmentISO(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const [hh, mm] = String(timeStr).split(":").map(Number);
  const local = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
  if (Number.isNaN(local.getTime())) return "";
  return local.toISOString();
}

function sendBookingToMake(booking) { /* webhook disparado pela Pages Function */ }

let blockedWeekdaySlots = load(STORAGE_KEYS.blockedWeekdaySlots, []);
if (!Array.isArray(blockedWeekdaySlots)) blockedWeekdaySlots = [];

function isWeekdaySlotBlocked(dateStr, timeStr) {
  if (!blockedWeekdaySlots.length) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getDay();
  return blockedWeekdaySlots.some(b => b.day === day && b.time === timeStr);
}

function isDateBlocked(dateStr) {
  if (bookings.blockedDates.includes(dateStr)) return true;
  const date = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(date.getTime())) return false;
  return bookings.blockedWeekdays.includes(date.getDay());
}

function isSlotBlocked(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  if (isDateBlocked(dateStr)) return true;
  if (isWeekdaySlotBlocked(dateStr, timeStr)) return true;
  return bookings.blockedSlots.some(s => s.date === dateStr && s.time === timeStr);
}

function isSlotBooked(dateStr, timeStr) {
  return bookings.items.some(b => b.date === dateStr && b.time === timeStr);
}

function getAvailableTimes(dateStr) {
  if (!dateStr) return [];
  return TIMES.filter(t => !isSlotBlocked(dateStr, t) && !isSlotBooked(dateStr, t) && !isPastTimeSlot(dateStr, t));
}

function renderTimesSelect(dateStr) {
  if (!bookTime) return;
  if (!dateStr) {
    bookTime.innerHTML = `<option value="">Sem horários</option>`;
    bookTime.disabled = true;
    return;
  }
  const dateObj = new Date(String(dateStr) + "T00:00:00");
  if (!isDateWithinBookingWindow(dateObj)) {
    bookTime.innerHTML = `<option value="">Fora do prazo</option>`;
    bookTime.disabled = true;
    return;
  }
  const available = getAvailableTimes(dateStr);
  if (!dateStr || !available.length) {
    bookTime.innerHTML = `<option value="">Sem horários</option>`;
    bookTime.disabled = true;
    return;
  }
  bookTime.disabled = false;
  bookTime.innerHTML = available.map(t => `<option value="${t}">${t}</option>`).join("");
}

function renderSlots() {
  if (!slotsGrid) return;
  slotsGrid.innerHTML = "";
  const dateStr = bookDate ? bookDate.value : "";
  if (!dateStr) {
    slotsGrid.innerHTML = `<div class="muted tiny">Selecione uma data.</div>`;
    return;
  }
  const selectedDate = new Date(dateStr + "T00:00:00");
  if (!isDateWithinBookingWindow(selectedDate)) {
    slotsGrid.innerHTML = `<div class="muted tiny">Data fora do prazo de agendamento.</div>`;
    return;
  }
  if (isDateBlocked(dateStr)) {
    slotsGrid.innerHTML = `<div class="muted tiny">Data bloqueada pelo admin.</div>`;
    return;
  }
  const available = getAvailableTimes(dateStr);
  if (!available.length) {
    slotsGrid.innerHTML = `<div class="muted tiny">Sem horários disponíveis.</div>`;
    return;
  }

  TIMES.forEach(t => {
    const busy = isSlotBlocked(dateStr, t) || isSlotBooked(dateStr, t) || isPastTimeSlot(dateStr, t);
    const div = document.createElement("div");
    div.className = "slot" + (busy ? " is-busy" : "");
    div.textContent = t;
    if (!busy) {
      div.addEventListener("click", () => {
        bookTime.value = t;
        $$(".slot").forEach(s => s.style.outline = "none");
        div.style.outline = "2px solid rgba(255,255,255,.7)";
      });
    }
    slotsGrid.appendChild(div);
  });
}

function setBookMsg(text) {
  if (bookMsg) bookMsg.textContent = text || "";
}

function renderAdminBookings() {
  if (!adminBookingsTable) return;
  adminBookingsTable.innerHTML = "";
  const filterDate = adminBookDate ? adminBookDate.value : "";
  const list = bookings.items
    .filter(b => !filterDate || b.date === filterDate)
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  if (!list.length) {
    adminBookingsTable.innerHTML = `<div class="t-row"><span class="muted">Sem agendamentos</span><span></span><span></span><span></span><span></span><span></span></div>`;
    return;
  }

  list.forEach((b) => {
    const row = document.createElement("div");
    row.className = "t-row";
    row.innerHTML = `
      <span data-label="Data">${escapeHtml(formatDateDMY(b.date))}</span>
      <span data-label="Hora">${escapeHtml(b.time)}</span>
      <span data-label="Cliente">${escapeHtml(b.name)}</span>
      <span data-label="Serviço">${escapeHtml(b.serviceName || "-")}</span>
      <span data-label="WhatsApp">${escapeHtml(b.phone)}</span>
      <span class="t-actions">
        <button class="icon-btn" data-del="${escapeAttr(b.id)}">Excluir</button>
      </span>
    `;
    row.querySelector("[data-del]").addEventListener("click", async () => {
      const r = await apiFetchJson("/bookings.php?action=cancel", {
        method: "POST",
        body: JSON.stringify({ id: b.id })
      });
      if (r && r.ok && r.bookings) bookings = r.bookings;
      renderAdminBookings();
      renderAdminCalendar();
      renderSlots();
      renderTimesSelect(bookDate ? bookDate.value : "");
      renderClientCalendar();
    });
    adminBookingsTable.appendChild(row);
  });
}

function renderBlockedDates() {
  if (!blockedDatesTable) return;
  blockedDatesTable.innerHTML = "";
  const list = bookings.blockedDates.slice().sort();
  if (!list.length) {
    blockedDatesTable.innerHTML = `<div class="t-row"><span class="muted">Nenhuma data bloqueada</span><span></span><span></span></div>`;
    return;
  }
  list.forEach(dateStr => {
    const row = document.createElement("div");
    row.className = "t-row";
    row.innerHTML = `
      <span>${escapeHtml(formatDateDMY(dateStr))}</span>
      <span>Bloqueado</span>
      <span class="t-actions">
        <button class="icon-btn" data-del="${escapeAttr(dateStr)}">Remover</button>
      </span>
    `;
    row.querySelector("[data-del]").addEventListener("click", async () => {
      const r = await apiFetchJson("/bookings.php?action=unblock_date", {
        method: "POST",
        body: JSON.stringify({ date: dateStr })
      });
      if (r && r.ok && r.bookings) bookings = r.bookings;
      renderBlockedDates();
      renderAdminCalendar();
      renderSlots();
      renderTimesSelect(bookDate ? bookDate.value : "");
      renderClientCalendar();
    });
    blockedDatesTable.appendChild(row);
  });
}

function renderBlockedSlots() {
  if (!blockedSlotsTable) return;
  blockedSlotsTable.innerHTML = "";
  const list = bookings.blockedSlots
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  if (!list.length) {
    blockedSlotsTable.innerHTML = `<div class="t-row"><span class="muted">Nenhum horário bloqueado</span><span></span><span></span><span></span></div>`;
    return;
  }
  list.forEach(slot => {
    const row = document.createElement("div");
    row.className = "t-row is-blocked";
    row.innerHTML = `
      <span>${escapeHtml(formatDateDMY(slot.date))}</span>
      <span>${escapeHtml(slot.time)}</span>
      <span>Bloqueado</span>
      <span class="t-actions">
        <button class="icon-btn" data-del="${escapeAttr(slot.date + "_" + slot.time)}">Remover</button>
      </span>
    `;
    row.querySelector("[data-del]").addEventListener("click", async () => {
      const r = await apiFetchJson("/bookings.php?action=unblock_slot", {
        method: "POST",
        body: JSON.stringify({ date: slot.date, time: slot.time })
      });
      if (r && r.ok && r.bookings) bookings = r.bookings;
      renderBlockedSlots();
      renderAdminCalendar();
      renderSlots();
      renderTimesSelect(bookDate ? bookDate.value : "");
      renderClientCalendar();
    });
    blockedSlotsTable.appendChild(row);
  });
}

function renderBlockedWeekdaySlots() {
  if (!blockedWeekdaySlotsTable) return;
  blockedWeekdaySlotsTable.innerHTML = "";
  if (!blockedWeekdaySlots.length) {
    blockedWeekdaySlotsTable.innerHTML = `<div class="t-row"><span class="muted">Nenhum</span><span></span><span></span><span></span></div>`;
    return;
  }
  const daysMap = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  blockedWeekdaySlots.forEach(bk => {
    const row = document.createElement("div");
    row.className = "t-row is-blocked";
    row.innerHTML = `
      <span>${daysMap[bk.day]}</span>
      <span>${bk.time}</span>
      <span>Bloqueado</span>
      <span class="t-actions">
        <button class="icon-btn" data-del="1">Remover</button>
      </span>
    `;
    row.querySelector("[data-del]").addEventListener("click", () => {
      blockedWeekdaySlots = blockedWeekdaySlots.filter(x => !(x.day === bk.day && x.time === bk.time));
      save(STORAGE_KEYS.blockedWeekdaySlots, blockedWeekdaySlots);
      renderBlockedWeekdaySlots();
      renderSlots();
      renderClientCalendar();
      renderAdminCalendar();
    });
    blockedWeekdaySlotsTable.appendChild(row);
  });
}

function renderBlockSlotTimes() {
  const html = TIMES.length ? TIMES.map(t => `<option value="${t}">${t}</option>`).join("") : `<option value="">Sem horários</option>`;
  if (blockSlotTime) {
    blockSlotTime.disabled = !TIMES.length;
    blockSlotTime.innerHTML = html;
  }
  if (blockWeekdaySlotTime) {
    blockWeekdaySlotTime.disabled = !TIMES.length;
    blockWeekdaySlotTime.innerHTML = html;
  }
}

if (blockWeekdaySlotBtn) {
  blockWeekdaySlotBtn.addEventListener("click", () => {
    const day = Number(blockWeekdaySlotDay.value);
    const time = blockWeekdaySlotTime.value;
    if (Number.isNaN(day) || !time) return;
    if (!blockedWeekdaySlots.some(b => b.day === day && b.time === time)) {
      blockedWeekdaySlots.push({ day, time });
      save(STORAGE_KEYS.blockedWeekdaySlots, blockedWeekdaySlots);
    }
    renderBlockedWeekdaySlots();
    renderSlots();
    renderClientCalendar();
    renderAdminCalendar();
  });
}

function updateBookDateLimits() {
  if (!bookDate) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const max = getBookingMaxDate();
  bookDate.min = dateKeyFromDate(today);
  bookDate.max = dateKeyFromDate(max);
  if (bookDate.value) {
    const selected = new Date(bookDate.value + "T00:00:00");
    if (!isDateWithinBookingWindow(selected)) {
      bookDate.value = dateKeyFromDate(max);
    }
  }
}

function setBookingWindowMsg(text) {
  if (!bookingWindowMsg) return;
  bookingWindowMsg.textContent = text || "";
}

function initBookingWindowUI() {
  if (bookingWindowDaysInput) bookingWindowDaysInput.value = String(bookingWindowDays);
  setBookingWindowMsg("");
  initCollapse(bookingWindowToggle, bookingWindowBody, bookingWindowCard);
  if (!bookingWindowSaveBtn) return;
  bookingWindowSaveBtn.addEventListener("click", () => {
    const next = normalizeBookingWindowDays(bookingWindowDaysInput ? bookingWindowDaysInput.value : "");
    bookingWindowDays = next;
    save(STORAGE_KEYS.bookingWindow, bookingWindowDays);
    updateBookDateLimits();
    renderClientCalendar();
    renderTimesSelect(bookDate ? bookDate.value : "");
    renderSlots();
    setBookingWindowMsg("Limite atualizado.");
  });
}

function setBookingGraceMsg(text) {
  if (!bookingGraceMsg) return;
  bookingGraceMsg.textContent = text || "";
}

function initBookingGraceUI() {
  if (bookingGraceMinutesInput) bookingGraceMinutesInput.value = String(bookingGraceMinutes);
  setBookingGraceMsg("");
  initCollapse(bookingGraceToggle, bookingGraceBody, bookingGraceCard);
  if (!bookingGraceSaveBtn) return;
  bookingGraceSaveBtn.addEventListener("click", () => {
    const next = normalizeBookingGraceMinutes(bookingGraceMinutesInput ? bookingGraceMinutesInput.value : "");
    bookingGraceMinutes = next;
    save(STORAGE_KEYS.bookingGrace, bookingGraceMinutes);
    renderTimesSelect(bookDate ? bookDate.value : "");
    renderSlots();
    renderClientCalendar();
    renderAdminCalendar();
    setBookingGraceMsg("Intervalo atualizado.");
  });
}

function applyScheduleToInputs() {
  if (!scheduleMorningStart || !scheduleMorningEnd || !scheduleAfternoonStart || !scheduleAfternoonEnd) return;
  const first = schedule.ranges[0];
  const second = schedule.ranges[1];
  scheduleMorningStart.value = first ? first.start : "";
  scheduleMorningEnd.value = first ? first.end : "";
  scheduleAfternoonStart.value = second ? second.start : "";
  scheduleAfternoonEnd.value = second ? second.end : "";
  if (scheduleDuration) scheduleDuration.value = schedule.duration || 40;
  if (scheduleGap) scheduleGap.value = schedule.gap !== undefined ? schedule.gap : 10;
}

function setScheduleMsg(text) {
  if (!scheduleMsg) return;
  scheduleMsg.textContent = text || "";
}

function setCollapseState(toggleEl, bodyEl, cardEl, isOpen) {
  if (!toggleEl || !bodyEl) return;
  toggleEl.classList.toggle("is-open", isOpen);
  bodyEl.classList.toggle("is-open", isOpen);
  if (cardEl) cardEl.classList.toggle("is-open", isOpen);
  toggleEl.setAttribute("aria-expanded", isOpen ? "true" : "false");
  bodyEl.setAttribute("aria-hidden", isOpen ? "false" : "true");
}

function initCollapse(toggleEl, bodyEl, cardEl) {
  if (!toggleEl || !bodyEl) return;
  setCollapseState(toggleEl, bodyEl, cardEl, false);
  toggleEl.addEventListener("click", () => {
    const isOpen = bodyEl.classList.contains("is-open");
    setCollapseState(toggleEl, bodyEl, cardEl, !isOpen);
  });
}

function refreshTimesFromSchedule() {
  TIMES = buildTimesFromSchedule(schedule);
}

function initScheduleUI() {
  applyScheduleToInputs();
  setScheduleMsg("");
  initCollapse(scheduleToggle, scheduleBody, scheduleCard);
  if (!scheduleSaveBtn) return;
  scheduleSaveBtn.addEventListener("click", () => {
    const ranges = [];
    const morning = cleanRange(scheduleMorningStart ? scheduleMorningStart.value : "", scheduleMorningEnd ? scheduleMorningEnd.value : "");
    const afternoon = cleanRange(scheduleAfternoonStart ? scheduleAfternoonStart.value : "", scheduleAfternoonEnd ? scheduleAfternoonEnd.value : "");
    if (morning) ranges.push(morning);
    if (afternoon) ranges.push(afternoon);
    if (!ranges.length) {
      setScheduleMsg("Defina pelo menos uma faixa de horário válida.");
      return;
    }
    const duration = scheduleDuration && scheduleDuration.value ? Math.max(10, Number(scheduleDuration.value)) : 40;
    const gap = scheduleGap && scheduleGap.value ? Math.max(0, Number(scheduleGap.value)) : 10;
    schedule = { ranges, duration, gap };
    save(STORAGE_KEYS.schedule, schedule);
    refreshTimesFromSchedule();
    renderBlockSlotTimes();
    renderTimesSelect(bookDate ? bookDate.value : "");
    renderSlots();
    renderClientCalendar();
    renderAdminCalendar();
    setScheduleMsg("Horários atualizados.");
  });
}

function initBookingUI() {
  if (bookDate) bookDate.valueAsDate = new Date();
  if (bookDate && bookDate.value) {
    const [y, m] = bookDate.value.split("-").map(Number);
    if (y && m) {
      clientCalendarMonth = new Date(y, m - 1, 1);
    }
  }
  updateBookDateLimits();
  renderTimesSelect(bookDate ? bookDate.value : "");
  renderSlots();
  setBookMsg("");
}

let calendarMonth = new Date();
calendarMonth.setDate(1);

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

let clientCalendarMonth = new Date();
clientCalendarMonth.setDate(1);

function renderClientCalendar() {
  if (!clientCalendarGrid || !clientCalLabel) return;
  const minMonth = new Date();
  minMonth.setDate(1);
  const maxMonth = new Date(getBookingMaxDate().getFullYear(), getBookingMaxDate().getMonth(), 1);
  const monthKey = (d) => (d.getFullYear() * 12) + d.getMonth();
  if (monthKey(clientCalendarMonth) < monthKey(minMonth)) {
    clientCalendarMonth = new Date(minMonth.getFullYear(), minMonth.getMonth(), 1);
  }
  if (monthKey(clientCalendarMonth) > monthKey(maxMonth)) {
    clientCalendarMonth = new Date(maxMonth.getFullYear(), maxMonth.getMonth(), 1);
  }
  if (clientCalPrev) {
    clientCalPrev.disabled = monthKey(clientCalendarMonth) <= monthKey(minMonth);
  }
  if (clientCalNext) {
    clientCalNext.disabled = monthKey(clientCalendarMonth) >= monthKey(maxMonth);
  }
  const month = clientCalendarMonth.getMonth();
  const year = clientCalendarMonth.getFullYear();
  const label = clientCalendarMonth.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  clientCalLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  clientCalendarGrid.innerHTML = "";

  WEEKDAYS.forEach(day => {
    const head = document.createElement("div");
    head.className = "calendar-cell is-empty";
    head.style.cursor = "default";
    head.innerHTML = `<div class="calendar-day">${day}</div>`;
    clientCalendarGrid.appendChild(head);
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const offset = firstDay.getDay();

  for (let i = 0; i < offset; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-cell is-empty";
    clientCalendarGrid.appendChild(empty);
  }

  const selectedKey = bookDate ? bookDate.value : "";
  const todayKey = dateKeyFromDate(new Date());

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const dateKey = dateKeyFromDate(date);
    const blocked = isDateBlocked(dateKey);
    const available = getAvailableTimes(dateKey).length > 0;
    const beyondLimit = !isDateWithinBookingWindow(date);
    const disabled = blocked || isPastDate(date) || !available || beyondLimit;

    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    if (blocked) cell.classList.add("is-blocked");
    if (!blocked && !available) cell.classList.add("is-booked");
    if (disabled) cell.classList.add("is-disabled");
    if (selectedKey && dateKey === selectedKey) cell.style.outline = "2px solid rgba(255,255,255,.75)";

    let meta = "Livre";
    if (blocked) meta = "Bloq";
    else if (!available) meta = "Lotado";
    if (isPastDate(date)) meta = "Passado";

    cell.innerHTML = `
      <div class="calendar-day">${day}</div>
      <div class="calendar-meta">${meta}</div>
    `;

    if (!disabled) {
      cell.addEventListener("click", () => {
        if (bookDate) {
          bookDate.value = dateKey;
        }
        renderTimesSelect(dateKey);
        renderSlots();
        setBookMsg("");
        renderClientCalendar();
      });
    }

    clientCalendarGrid.appendChild(cell);
  }
}

function renderAdminCalendar() {
  if (!adminCalendarGrid || !calLabel) return;
  const month = calendarMonth.getMonth();
  const year = calendarMonth.getFullYear();
  const label = calendarMonth.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  calLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  adminCalendarGrid.innerHTML = "";

  WEEKDAYS.forEach(day => {
    const head = document.createElement("div");
    head.className = "calendar-cell is-empty";
    head.style.cursor = "default";
    head.innerHTML = `<div class="calendar-day">${day}</div>`;
    adminCalendarGrid.appendChild(head);
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const offset = firstDay.getDay();

  for (let i = 0; i < offset; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-cell is-empty";
    adminCalendarGrid.appendChild(empty);
  }

  const todayKey = dateKeyFromDate(new Date());
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const dateKey = dateKeyFromDate(date);
    const count = bookings.items.filter(b => b.date === dateKey).length;
    const blocked = isDateBlocked(dateKey);

    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    if (dateKey === todayKey) cell.classList.add("is-today");
    if (blocked) cell.classList.add("is-blocked");
    if (count > 0) cell.classList.add("is-booked");

    const meta = [];
    if (blocked) meta.push("Bloqueado");
    if (count > 0) meta.push(`${count} agend.`);
    if (!blocked && count === 0) meta.push("Livre");

    cell.innerHTML = `
      <div class="calendar-day">${day}</div>
      <div class="calendar-meta">${meta.join(" • ")}</div>
    `;

    cell.addEventListener("click", () => {
      if (adminBookDate) {
        adminBookDate.value = dateKey;
        renderAdminBookings();
      }
    });

    adminCalendarGrid.appendChild(cell);
  }
}

function initAdminBookingUI() {
  if (adminBookDate) adminBookDate.valueAsDate = new Date();
  if (blockDate) blockDate.valueAsDate = new Date();
  if (blockSlotDate) blockSlotDate.valueAsDate = new Date();
  renderAdminBookings();
  renderBlockedDates();
  renderBlockedSlots();
  renderBlockSlotTimes();
  if (blockWeekdayInputs.length) {
    blockWeekdayInputs.forEach((input) => {
      const day = Number(input.dataset.day);
      input.checked = bookings.blockedWeekdays.includes(day);
    });
  }
  renderAdminCalendar();
  initScheduleUI();
  initBookingWindowUI();
  initBookingGraceUI();
  initCollapse(blockDatesToggle, blockDatesBody, blockDatesCard);
  initCollapse(blockSlotsToggle, blockSlotsBody, blockSlotsCard);
  initCollapse(blockWeekdaySlotsToggle, blockWeekdaySlotsBody, blockWeekdaySlotsCard);
  renderBlockedWeekdaySlots();
}

if (bookDate) {
  bookDate.addEventListener("change", () => {
    renderTimesSelect(bookDate.value);
    renderSlots();
    setBookMsg("");
    if (bookDate.value) {
      const [y, m] = bookDate.value.split("-").map(Number);
      if (y && m) {
        clientCalendarMonth = new Date(y, m - 1, 1);
      }
    }
    renderClientCalendar();
  });
}

if (bookTime) {
  bookTime.addEventListener("change", () => {
    $$(".slot").forEach(s => s.style.outline = "none");
  });
}

if (bookBtn) {
  bookBtn.addEventListener("click", async () => {
    const name = bookName ? bookName.value.trim() : "";
    const phone = bookPhone ? formatPhoneBR(bookPhone.value) : "";
    const date = bookDate ? bookDate.value : "";
    const time = bookTime ? bookTime.value : "";

    const selects = bookServicesList ? Array.from(bookServicesList.querySelectorAll('.bookServiceSelect')) : [];
    const chosenServices = selects.map(s => s.value).filter(Boolean);

    if (!name || !phone || chosenServices.length === 0 || !date || !time) {
      setBookMsg("Preencha todos os campos e selecione ao menos um serviço.");
      return;
    }
    const dateObj = new Date(date + "T00:00:00");
    if (!isDateWithinBookingWindow(dateObj)) {
      setBookMsg("Data fora do prazo de agendamento.");
      return;
    }
    if (isDateBlocked(date)) {
      setBookMsg("Essa data está bloqueada. Escolha outra.");
      return;
    }
    if (isSlotBlocked(date, time) || isSlotBooked(date, time)) {
      setBookMsg("Esse horário já está ocupado.");
      return;
    }

    let totalServicePrice = 0;
    chosenServices.forEach(sn => {
      const s = services.find(x => x.name === sn);
      if (s) totalServicePrice += (Number(s.price) || 0);
    });

    let fullServiceName = chosenServices.join(" + ");
    if (fullServiceName.length > 120) {
      fullServiceName = fullServiceName.substring(0, 117) + "...";
    }

    const booking = {
      id: uid(),
      name,
      phone,
      serviceName: fullServiceName,
      servicePrice: totalServicePrice,
      date,
      time,
      createdAt: new Date().toISOString()
    };

    setBookMsg("Confirmando...");
    const r = await apiFetchJson("/bookings.php?action=create", {
      method: "POST",
      body: JSON.stringify({
        id: booking.id,
        name: booking.name,
        phone: booking.phone,
        serviceName: booking.serviceName,
        servicePrice: booking.servicePrice,
        date: booking.date,
        time: booking.time,
        timezone_offset: new Date().getTimezoneOffset()
      })
    });

    if (!r || !r.ok) {
      if (r && r.error === "SLOT_TAKEN") setBookMsg("Esse horário já está ocupado.");
      else if (r && r.error === "BLOCKED") setBookMsg("Esse horário/data está bloqueado.");
      else setBookMsg("Não foi possível confirmar. Tente novamente.");
      const snap = await apiFetchJson("/bookings.php?action=snapshot").catch(() => null);
      if (snap && snap.ok && snap.bookings) bookings = snap.bookings;
      renderTimesSelect(date);
      renderSlots();
      renderAdminBookings();
      renderAdminCalendar();
      renderClientCalendar();
      return;
    }

    if (r.bookings) bookings = r.bookings;

    if (bookName) bookName.value = "";
    if (bookPhone) bookPhone.value = "";
    if (bookServicesList) {
      const rows = bookServicesList.querySelectorAll('.book-service-row');
      for (let i = 1; i < rows.length; i++) rows[i].remove();
      const firstSelect = bookServicesList.querySelector('.bookServiceSelect');
      if (firstSelect && firstSelect.options.length > 0) firstSelect.selectedIndex = 0;
    }
    setBookMsg("Agendamento confirmado! Você receberá confirmação no WhatsApp.");

    renderTimesSelect(date);
    renderSlots();
    renderAdminBookings();
    renderAdminCalendar();
    renderClientCalendar();
  });
}

if (adminBookDate) {
  adminBookDate.addEventListener("change", () => {
    renderAdminBookings();
    if (adminBookDate.value) {
      const [y, m] = adminBookDate.value.split("-").map(Number);
      if (y && m) {
        calendarMonth = new Date(y, m - 1, 1);
        renderAdminCalendar();
      }
    }
  });
}

if (adminTodayBtn) {
  adminTodayBtn.addEventListener("click", () => {
    if (adminBookDate) adminBookDate.valueAsDate = new Date();
    renderAdminBookings();
    calendarMonth = new Date();
    calendarMonth.setDate(1);
    renderAdminCalendar();
  });
}

if (blockWeekdayInputs.length) {
  blockWeekdayInputs.forEach((input) => {
    input.addEventListener("change", async () => {
      const selected = blockWeekdayInputs
        .filter(i => i.checked)
        .map(i => Number(i.dataset.day))
        .filter(n => !Number.isNaN(n));
      const r = await apiFetchJson("/bookings.php?action=set_weekdays", {
        method: "POST",
        body: JSON.stringify({ days: selected })
      });
      if (r && r.ok && r.bookings) bookings = r.bookings;
      renderAdminCalendar();
      renderSlots();
      renderTimesSelect(bookDate ? bookDate.value : "");
      renderClientCalendar();
    });
  });
}

if (calPrev) {
  calPrev.addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderAdminCalendar();
  });
}
if (calNext) {
  calNext.addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderAdminCalendar();
  });
}

if (blockDateBtn) {
  blockDateBtn.addEventListener("click", async () => {
    const dateStr = blockDate ? blockDate.value : "";
    if (!dateStr) return;
    const hasBookings = bookings.items.some(b => b.date === dateStr);
    if (hasBookings) {
      const ok = confirm("Existem agendamentos nessa data. Deseja bloquear mesmo assim?");
      if (!ok) return;
    }
    const r = await apiFetchJson("/bookings.php?action=block_date", {
      method: "POST",
      body: JSON.stringify({ date: dateStr })
    });
    if (r && r.ok && r.bookings) bookings = r.bookings;
    renderBlockedDates();
    renderAdminCalendar();
    renderSlots();
    renderTimesSelect(bookDate ? bookDate.value : "");
    renderClientCalendar();
  });
}

if (blockSlotBtn) {
  blockSlotBtn.addEventListener("click", async () => {
    const dateStr = blockSlotDate ? blockSlotDate.value : "";
    const timeStr = blockSlotTime ? blockSlotTime.value : "";
    if (!dateStr || !timeStr) return;
    const hasBooking = bookings.items.some(b => b.date === dateStr && b.time === timeStr);
    if (hasBooking) {
      const ok = confirm("Já existe agendamento nesse horário. Deseja bloquear mesmo assim?");
      if (!ok) return;
    }
    const r = await apiFetchJson("/bookings.php?action=block_slot", {
      method: "POST",
      body: JSON.stringify({ date: dateStr, time: timeStr })
    });
    if (r && r.ok && r.bookings) bookings = r.bookings;
    renderBlockedSlots();
    renderAdminCalendar();
    renderSlots();
    renderTimesSelect(bookDate ? bookDate.value : "");
    renderClientCalendar();
  });
}

/* Inicialização adiada (precisa do bootstrap do D1) */

if (clientCalPrev) {
  clientCalPrev.addEventListener("click", () => {
    const minMonth = new Date();
    minMonth.setDate(1);
    const monthKey = (d) => (d.getFullYear() * 12) + d.getMonth();
    const prevMonth = new Date(clientCalendarMonth.getFullYear(), clientCalendarMonth.getMonth() - 1, 1);
    if (monthKey(prevMonth) < monthKey(minMonth)) return;
    clientCalendarMonth = prevMonth;
    renderClientCalendar();
  });
}
if (clientCalNext) {
  clientCalNext.addEventListener("click", () => {
    const maxMonth = new Date(getBookingMaxDate().getFullYear(), getBookingMaxDate().getMonth(), 1);
    const monthKey = (d) => (d.getFullYear() * 12) + d.getMonth();
    const nextMonth = new Date(clientCalendarMonth.getFullYear(), clientCalendarMonth.getMonth() + 1, 1);
    if (monthKey(nextMonth) > monthKey(maxMonth)) return;
    clientCalendarMonth = nextMonth;
    renderClientCalendar();
  });
}


async function bootCloudflare() {
  // Carrega estado do D1 (sem localStorage) e snapshot dos agendamentos
  const b = await apiFetchJson("/bootstrap.php").catch(() => null);
  if (b && b.ok && b.state) {
    const st = b.state;

    // Estado KV (admin) — se não existir no banco, mantém defaults do código
    if (st.clients) clients = st.clients;
    if (st.stock) stock = st.stock;
    if (st.services) services = st.services;
    if (st.gallery) gallery = st.gallery;
    if (st.barbers) barbers = st.barbers;
    if (st.cuts) cuts = st.cuts;
    if (st.finances) finances = st.finances;
    if (st.subscribers) subscribers = st.subscribers;
    if (st.plans) plans = st.plans;

    if (st.schedule) schedule = normalizeSchedule(st.schedule);
    if (st.bookingWindowDays != null) bookingWindowDays = normalizeBookingWindowDays(st.bookingWindowDays);
    if (st.bookingGraceMinutes != null) bookingGraceMinutes = normalizeBookingGraceMinutes(st.bookingGraceMinutes);

    // sincroniza store em memória
    MEM_STORE[STORAGE_KEYS.clients] = clients;
    MEM_STORE[STORAGE_KEYS.stock] = stock;
    MEM_STORE[STORAGE_KEYS.services] = services;
    MEM_STORE[STORAGE_KEYS.gallery] = gallery;
    MEM_STORE[STORAGE_KEYS.barbers] = barbers;
    MEM_STORE[STORAGE_KEYS.cuts] = cuts;
    MEM_STORE[STORAGE_KEYS.finances] = finances;
    MEM_STORE[STORAGE_KEYS.subscribers] = subscribers;
    MEM_STORE[STORAGE_KEYS.plans] = plans;
    MEM_STORE[STORAGE_KEYS.schedule] = schedule;
    MEM_STORE[STORAGE_KEYS.bookingWindow] = bookingWindowDays;
    MEM_STORE[STORAGE_KEYS.bookingGrace] = bookingGraceMinutes;

    // logado?
    MEM_STORE[STORAGE_KEYS.admin] = !!b.logged;
  }

  const snap = await apiFetchJson("/bookings.php?action=snapshot").catch(() => null);
  if (snap && snap.ok && snap.bookings) {
    bookings = snap.bookings;
  }

  // garantias de formato
  if (!bookings.items) bookings.items = [];
  if (!bookings.blockedDates) bookings.blockedDates = [];
  if (!bookings.blockedSlots) bookings.blockedSlots = [];
  if (!Array.isArray(bookings.blockedWeekdays)) bookings.blockedWeekdays = [];

  BOOTSTRAPPED = true;

  // recalcula times a partir do schedule carregado
  TIMES = buildTimesFromSchedule(schedule);

  // === Re-render geral após bootstrap (admin + público) ===
  // Sem isso, as telas podem iniciar "vazias" e só aparecerem depois de alguma ação.
  try {
    renderPrices();
    renderPlans();
    renderGallery();

    // Admin renders (se os elementos existirem na página)
    if (typeof renderClients === "function") renderClients();
    if (typeof renderStock === "function") renderStock();
    if (typeof renderServicesAdmin === "function") renderServicesAdmin();
    if (typeof renderPlansAdmin === "function") renderPlansAdmin();
    if (typeof renderSubscribers === "function") renderSubscribers();

    if (typeof renderBarbers === "function") renderBarbers();
    if (typeof renderCutSelects === "function") renderCutSelects();
    if (typeof renderCuts === "function") renderCuts();
    if (typeof renderCommissionSummary === "function") renderCommissionSummary();
    if (typeof renderCommissionMonth === "function") renderCommissionMonth();

    if (typeof refreshFinanceUI === "function") refreshFinanceUI(activeFinanceMonth || undefined);

    // Booking/admin schedule helpers que dependem de TIMES
    if (typeof renderBlockSlotTimes === "function") renderBlockSlotTimes();
    if (typeof renderSlots === "function") renderSlots();
    if (typeof renderTimesSelect === "function") renderTimesSelect(bookDate ? bookDate.value : "");
    if (typeof renderAdminCalendar === "function") renderAdminCalendar();
  } catch (e) {
    console.warn("Re-render pós-bootstrap falhou:", e);
  }

  initBookingUI();
  initAdminBookingUI();
  renderClientCalendar();
}

// start
bootCloudflare();

/* Sessão do admin usa cookie assinado pela Pages Function. */
;
