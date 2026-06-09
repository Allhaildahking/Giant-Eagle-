/* ================================================================
   GIANT EAGLE REAL ESTATE — Invoice Builder  |  script.js
   ================================================================ */

/* ── FIREBASE INIT ── */
const firebaseConfig = {
  apiKey:            "AIzaSyD7Ftc3jzC_C-5fRNYJiSwlpEhHAEdKZqw",
  authDomain:        "giant-eagle-42ca5.firebaseapp.com",
  projectId:         "giant-eagle-42ca5",
  storageBucket:     "giant-eagle-42ca5.firebasestorage.app",
  messagingSenderId: "485969008857",
  appId:             "1:485969008857:web:7429a154e8439a4e9b06c8"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ── STATE ── */
let units        = [];
let unitCounter  = 0;
let editingDocId = null;
let allInvoices  = [];

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  setTodayDate();
  loadNextInvoiceNumber();
  addUnit();
  updatePreview();
  loadHistory();
});

/* ── DATE ── */
function setTodayDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('invoiceDate').value = today;
}

function formatDate(str) {
  if (!str) return '—';
  const d   = new Date(str + 'T00:00:00');
  const day = d.getDate();
  const sfx = (d => {
    if (d >= 11 && d <= 13) return 'th';
    return ['th','st','nd','rd'][Math.min(d % 10, 3)] || 'th';
  })(day);
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${day}${sfx} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

/* ── INVOICE NUMBER ── */
async function loadNextInvoiceNumber() {
  try {
    const doc = await db.collection('meta').doc('counter').get();
    const last = doc.exists ? (doc.data().lastNumber || 0) : 0;
    document.getElementById('invoiceNo').value = 'INVOICE ' + String(last + 1).padStart(3, '0');
  } catch(e) {
    document.getElementById('invoiceNo').value = 'INVOICE 001';
  }
}

function getInvoiceNo() {
  return document.getElementById('invoiceNo').value || 'INVOICE 001';
}

/* ── CURRENCY ── */
function fmt(n) {
  return '₦' + Math.round(n || 0).toLocaleString('en-NG');
}

/* ── UNITS ── */
function addUnit() {
  const id = ++unitCounter;
  units.push({ id, name: '', size: 0 });

  const div = document.createElement('div');
  div.className = 'unit-row';
  div.id = `urow-${id}`;
  div.innerHTML = `
    <button class="btn-rm" onclick="removeUnit(${id})" title="Remove">✕</button>
    <div class="unit-label">Unit ${id}</div>
    <div class="field-row two-col">
      <div class="field">
        <label>Description</label>
        <input type="text" id="uname-${id}" placeholder="e.g. Unit 1 & Unit 3" oninput="syncUnit(${id})" />
      </div>
      <div class="field">
        <label>Size (SQM)</label>
        <input type="number" id="usize-${id}" placeholder="e.g. 192" oninput="syncUnit(${id})" />
      </div>
    </div>
    <div class="unit-amt" id="uamt-${id}">Amount: ₦0</div>
  `;
  document.getElementById('unitsContainer').appendChild(div);
}

function removeUnit(id) {
  units = units.filter(u => u.id !== id);
  const row = document.getElementById(`urow-${id}`);
  if (row) row.remove();
  updatePreview();
}

function syncUnit(id) {
  const u = units.find(u => u.id === id);
  if (!u) return;
  u.name = document.getElementById(`uname-${id}`).value;
  u.size = parseFloat(document.getElementById(`usize-${id}`).value) || 0;
  const rate = parseFloat(document.getElementById('ratePerSqm').value) || 0;
  const el = document.getElementById(`uamt-${id}`);
  if (el) el.textContent = `Amount: ${fmt(u.size * rate)}`;
  updatePreview();
}

/* ── CALCULATIONS ── */
function calculate() {
  const rate      = parseFloat(v('ratePerSqm')) || 0;
  const discount  = parseFloat(v('discount'))   || 0;
  const legalPct  = parseFloat(v('legalFee'))   || 0;
  const agencyPct = parseFloat(v('agencyFee'))  || 0;

  const unitAmounts = units.map(u => ({ ...u, amount: u.size * rate }));
  const subTotal    = unitAmounts.reduce((s, u) => s + u.amount, 0);
  const agreedAmt   = subTotal - discount;
  const legalAmt    = (legalPct  / 100) * agreedAmt;
  const agencyAmt   = (agencyPct / 100) * agreedAmt;
  const grandTotal  = agreedAmt + legalAmt + agencyAmt;

  return { unitAmounts, subTotal, discount, agreedAmt, legalAmt, agencyAmt, grandTotal, legalPct, agencyPct, rate };
}

/* ── LIVE PREVIEW ── */
function updatePreview() {
  set('prev-invoiceNo',   getInvoiceNo());
  set('prev-invoiceDate', 'Date: ' + formatDate(v('invoiceDate')));
  set('prev-customerName',        v('customerName')        || '');
  set('prev-propertyDescription', v('propertyDescription') || '');

  const c = calculate();

  // Units table
  const tbody = document.getElementById('prev-unitsBody');
  tbody.innerHTML = '';
  const filled = c.unitAmounts.filter(u => u.name || u.size);
  if (filled.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-placeholder">Add units in the form</td></tr>';
  } else {
    filled.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.name || '—'}</td>
        <td>${u.size ? u.size + ' SQM' : '—'}</td>
        <td>${c.rate ? '₦' + c.rate.toLocaleString('en-NG') + ' Per SQM' : '—'}</td>
        <td style="text-align:right">${fmt(u.amount)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  set('prev-subTotal',  fmt(c.subTotal));
  set('prev-agreedAmt', fmt(c.agreedAmt));
  set('prev-grandTotal',fmt(c.grandTotal));
  set('prev-legalRate', c.legalPct  + '%');
  set('prev-agencyRate',c.agencyPct + '%');
  set('prev-legalAmt',  fmt(c.legalAmt));
  set('prev-agencyAmt', fmt(c.agencyAmt));

  const discRow = document.getElementById('prev-discountRow');
  if (c.discount > 0) {
    discRow.style.display = 'block';
    set('prev-discountAmt', fmt(c.discount));
  } else {
    discRow.style.display = 'none';
  }

  set('prev-bankName',      v('bankName')      || 'FCMB');
  set('prev-accountName',   v('accountName')   || 'HATFIELD GUEST');
  set('prev-accountNumber', v('accountNumber') || '2007052014');
  set('prev-paymentPhone',  v('paymentPhone')  || '08032961727');

  const notes = v('additionalNotes');
  const nb = document.getElementById('prev-notesBlock');
  if (notes && notes.trim()) { nb.style.display = 'block'; set('prev-notes', notes); }
  else nb.style.display = 'none';
}

/* ── HELPERS ── */
function v(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function set(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

/* ── COLLECT FORM DATA ── */
function collectData() {
  const c = calculate();
  return {
    invoiceNo:           getInvoiceNo(),
    date:                v('invoiceDate'),
    customerName:        v('customerName'),
    propertyDescription: v('propertyDescription'),
    ratePerSqm:          parseFloat(v('ratePerSqm')) || 0,
    discount:            parseFloat(v('discount'))   || 0,
    legalFee:            parseFloat(v('legalFee'))   || 0,
    agencyFee:           parseFloat(v('agencyFee'))  || 0,
    bankName:            v('bankName'),
    accountName:         v('accountName'),
    accountNumber:       v('accountNumber'),
    paymentPhone:        v('paymentPhone'),
    additionalNotes:     v('additionalNotes'),
    units:               units.map(u => ({ name: u.name, size: u.size })),
    subTotal:   c.subTotal,
    agreedAmt:  c.agreedAmt,
    grandTotal: c.grandTotal,
    savedAt:    firebase.firestore.FieldValue.serverTimestamp()
  };
}

/* ── SAVE ── */
async function saveInvoice(silent = false) {
  const data = collectData();
  try {
    if (editingDocId) {
      await db.collection('invoices').doc(editingDocId).set(data, { merge: true });
      if (!silent) showToast('✅ Invoice updated!');
    } else {
      await db.collection('invoices').add(data);
      const num = parseInt(data.invoiceNo.replace(/\D/g,'')) || 0;
      await db.collection('meta').doc('counter').set({ lastNumber: num }, { merge: true });
      if (!silent) showToast('✅ Invoice saved!');
    }
    loadHistory();
  } catch(e) {
    console.error(e);
    showToast('❌ Save failed. Check console.');
  }
}

/* ── PRINT ── */
async function generateAndPrint() {
  await saveInvoice(true);
  updatePreview();
  // Small delay so preview renders, then print
  setTimeout(() => { window.print(); }, 400);
}

/* ── HISTORY ── */
async function loadHistory() {
  const el = document.getElementById('invoiceList');
  try {
    const snap = await db.collection('invoices').orderBy('savedAt','desc').get();
    allInvoices = [];
    snap.forEach(doc => allInvoices.push({ id: doc.id, ...doc.data() }));
    renderHistory(allInvoices);
  } catch(e) {
    el.innerHTML = '<p class="empty-msg">Could not load invoices.</p>';
  }
}

function renderHistory(list) {
  const el = document.getElementById('invoiceList');
  if (!list || list.length === 0) { el.innerHTML = '<p class="empty-msg">No invoices yet.</p>'; return; }
  el.innerHTML = list.map(inv => `
    <div class="hcard">
      <div class="hc-top">
        <span class="hc-num">${inv.invoiceNo || '—'}</span>
        <span class="hc-date">${formatDate(inv.date)}</span>
      </div>
      <div class="hc-client">${inv.customerName || '—'}</div>
      <div class="hc-amt">Grand Total: ${fmt(inv.grandTotal)}</div>
      <div class="hc-btns">
        <button class="hbtn open"  onclick="openInvoice('${inv.id}')">📂 Open</button>
        <button class="hbtn prnt"  onclick="printInvoice('${inv.id}')">🖨 Print</button>
        <button class="hbtn del"   onclick="confirmDelete('${inv.id}','${inv.invoiceNo}')">🗑 Delete</button>
      </div>
    </div>
  `).join('');
}

function searchInvoices() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) { renderHistory(allInvoices); return; }
  renderHistory(allInvoices.filter(inv =>
    (inv.invoiceNo||'').toLowerCase().includes(q) ||
    (inv.customerName||'').toLowerCase().includes(q) ||
    (inv.propertyDescription||'').toLowerCase().includes(q) ||
    (inv.date||'').toLowerCase().includes(q)
  ));
}

/* ── OPEN / EDIT ── */
async function openInvoice(docId) {
  const doc = await db.collection('invoices').doc(docId).get();
  if (!doc.exists) { showToast('❌ Not found.'); return; }
  const d = doc.data();
  editingDocId = docId;
  switchTab('create');

  document.getElementById('invoiceNo').value           = d.invoiceNo           || '';
  document.getElementById('invoiceDate').value          = d.date                || '';
  document.getElementById('customerName').value         = d.customerName        || '';
  document.getElementById('propertyDescription').value  = d.propertyDescription || '';
  document.getElementById('ratePerSqm').value           = d.ratePerSqm          || '';
  document.getElementById('discount').value             = d.discount            || '';
  document.getElementById('legalFee').value             = d.legalFee            || '';
  document.getElementById('agencyFee').value            = d.agencyFee           || '';
  document.getElementById('bankName').value             = d.bankName            || 'FCMB';
  document.getElementById('accountName').value          = d.accountName         || 'HATFIELD GUEST';
  document.getElementById('accountNumber').value        = d.accountNumber       || '2007052014';
  document.getElementById('paymentPhone').value         = d.paymentPhone        || '08032961727';
  document.getElementById('additionalNotes').value      = d.additionalNotes     || '';

  units = []; unitCounter = 0;
  document.getElementById('unitsContainer').innerHTML = '';
  (d.units || []).forEach(u => {
    addUnit();
    const id = unitCounter;
    const ne = document.getElementById(`uname-${id}`);
    const se = document.getElementById(`usize-${id}`);
    if (ne) ne.value = u.name || '';
    if (se) se.value = u.size || '';
    const us = units.find(x => x.id === id);
    if (us) { us.name = u.name || ''; us.size = parseFloat(u.size) || 0; }
  });

  updatePreview();
  showToast('📂 Invoice loaded.');
}

async function printInvoice(docId) {
  await openInvoice(docId);
  setTimeout(() => window.print(), 500);
}

/* ── DELETE ── */
let pendingDeleteId = null;
function confirmDelete(docId, num) {
  pendingDeleteId = docId;
  document.getElementById('confirmMsg').textContent = `Delete ${num}? This cannot be undone.`;
  document.getElementById('confirmModal').style.display = 'flex';
  document.getElementById('confirmYes').onclick = doDelete;
}
async function doDelete() {
  closeModal();
  if (!pendingDeleteId) return;
  try {
    await db.collection('invoices').doc(pendingDeleteId).delete();
    pendingDeleteId = null;
    showToast('🗑 Deleted.');
    loadHistory();
  } catch(e) { showToast('❌ Delete failed.'); }
}
function closeModal() { document.getElementById('confirmModal').style.display = 'none'; }

/* ── RESET ── */
function resetForm() {
  editingDocId = null;
  ['customerName','propertyDescription','ratePerSqm','discount',
   'legalFee','agencyFee','additionalNotes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('bankName').value     = 'FCMB';
  document.getElementById('accountName').value  = 'HATFIELD GUEST';
  document.getElementById('accountNumber').value= '2007052014';
  document.getElementById('paymentPhone').value = '08032961727';
  units = []; unitCounter = 0;
  document.getElementById('unitsContainer').innerHTML = '';
  addUnit();
  loadNextInvoiceNumber();
  setTodayDate();
  updatePreview();
  showToast('✦ Ready for new invoice.');
}

/* ── TABS ── */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  document.getElementById(`tab-${name}`).classList.add('active');
  if (name === 'history') loadHistory();
}

/* ── TOAST ── */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
