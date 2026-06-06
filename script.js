/* ================================================================
   GIANT EAGLE REAL ESTATE — INVOICE BUILDER
   script.js  |  Clean, modular, well-commented
   ================================================================ */

/* ──────────────────────────────────────────────
   SECTION 1: FIREBASE CONFIGURATION & INIT
   ────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyD7Ftc3jzC_C-5fRNYJiSwlpEhHAEdKZqw",
  authDomain:        "giant-eagle-42ca5.firebaseapp.com",
  databaseURL:       "https://giant-eagle-42ca5-default-rtdb.firebaseio.com",
  projectId:         "giant-eagle-42ca5",
  storageBucket:     "giant-eagle-42ca5.firebasestorage.app",
  messagingSenderId: "485969008857",
  appId:             "1:485969008857:web:7429a154e8439a4e9b06c8",
  measurementId:     "G-2Q6847T2DP"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ──────────────────────────────────────────────
   SECTION 2: APP STATE
   ────────────────────────────────────────────── */
let units        = [];          // Array of { id, name, size } objects
let unitCounter  = 0;           // Used to generate unique unit IDs
let editingDocId = null;        // Firestore doc ID if editing an existing invoice
let allInvoices  = [];          // Local cache of history invoices for search

/* ──────────────────────────────────────────────
   SECTION 3: INITIALISATION
   Called once when the page loads.
   ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setTodayDate();          // Pre-fill date field with today
  loadNextInvoiceNumber(); // Auto-generate next invoice number from Firestore
  addUnit();               // Start with one blank unit row
  updatePreview();         // Render the initial empty preview
  loadHistory();           // Fetch and display invoice history
});

/* ──────────────────────────────────────────────
   SECTION 4: DATE UTILITIES
   ────────────────────────────────────────────── */

/** Set the date input to today's date in YYYY-MM-DD format */
function setTodayDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('invoiceDate').value = today;
  document.getElementById('invoiceDate').addEventListener('change', updatePreview);
}

/** Format a date string (YYYY-MM-DD) to "25th May, 2026" style */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d   = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const suffix = ['th','st','nd','rd'][((day % 100 - 11) > 0 && (day % 100 - 13) < 0) ? 0 : [0,1,2,3,4][Math.min(day % 10, 4)]] || 'th';
  const months  = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
  return `${day}${suffix} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

/* ──────────────────────────────────────────────
   SECTION 5: INVOICE NUMBER
   Auto-generates sequential numbers from Firestore.
   ────────────────────────────────────────────── */

/** 
 * Load the last invoice number from the 'meta/counter' Firestore doc
 * and set the next one in the input field.
 */
async function loadNextInvoiceNumber() {
  try {
    const metaDoc = await db.collection('meta').doc('counter').get();
    let last = 0;
    if (metaDoc.exists) {
      last = metaDoc.data().lastNumber || 0;
    }
    const next = last + 1;
    document.getElementById('invoiceNo').value = 'INVOICE ' + String(next).padStart(3, '0');
  } catch (e) {
    console.error('Could not load invoice counter:', e);
    document.getElementById('invoiceNo').value = 'INVOICE 001';
  }
}

/** Returns the current invoice number shown in the field */
function getInvoiceNo() {
  return document.getElementById('invoiceNo').value || 'INVOICE 001';
}

/* ──────────────────────────────────────────────
   SECTION 6: CURRENCY FORMATTING
   ────────────────────────────────────────────── */

/** Format a number as ₦1,234,567 */
function fmt(n) {
  if (isNaN(n) || n === null || n === undefined) return '₦0';
  return '₦' + Math.round(n).toLocaleString('en-NG');
}

/* ──────────────────────────────────────────────
   SECTION 7: DYNAMIC UNIT MANAGEMENT
   ────────────────────────────────────────────── */

/** Add a new unit row to the form and state */
function addUnit() {
  const id = ++unitCounter;
  units.push({ id, name: '', size: '' });

  const container = document.getElementById('unitsContainer');
  const div = document.createElement('div');
  div.className = 'unit-row';
  div.id = `unit-row-${id}`;
  div.innerHTML = `
    <button class="btn-remove-unit" onclick="removeUnit(${id})" title="Remove unit">✕</button>
    <div class="unit-row-title">Unit ${id}</div>
    <div class="field-row two-col">
      <div class="field">
        <label>Unit Name / Description</label>
        <input type="text" id="unit-name-${id}" placeholder="e.g. Unit 1 & Unit 3"
               oninput="updateUnitData(${id})" />
      </div>
      <div class="field">
        <label>Size (SQM)</label>
        <input type="number" id="unit-size-${id}" placeholder="e.g. 192"
               oninput="updateUnitData(${id})" />
      </div>
    </div>
    <div class="unit-amount-preview" id="unit-amt-${id}">Amount: ₦0</div>
  `;
  container.appendChild(div);
}

/** Remove a unit row by ID */
function removeUnit(id) {
  units = units.filter(u => u.id !== id);
  const row = document.getElementById(`unit-row-${id}`);
  if (row) row.remove();
  updatePreview();
}

/** Called whenever a unit's name or size changes */
function updateUnitData(id) {
  const unit = units.find(u => u.id === id);
  if (!unit) return;
  unit.name = document.getElementById(`unit-name-${id}`).value;
  unit.size = parseFloat(document.getElementById(`unit-size-${id}`).value) || 0;

  // Show per-unit amount live
  const rate   = parseFloat(document.getElementById('ratePerSqm').value) || 0;
  const amount = unit.size * rate;
  const amtEl  = document.getElementById(`unit-amt-${id}`);
  if (amtEl) amtEl.textContent = `Amount: ${fmt(amount)}`;

  updatePreview();
}

/* ──────────────────────────────────────────────
   SECTION 8: CALCULATIONS
   ────────────────────────────────────────────── */

/** 
 * Calculate all invoice totals.
 * Returns { unitAmounts[], subTotal, discountAmt, agreedAmt, legalAmt, agencyAmt, grandTotal }
 */
function calculate() {
  const rate      = parseFloat(document.getElementById('ratePerSqm').value) || 0;
  const discount  = parseFloat(document.getElementById('discount').value)   || 0;
  const legalPct  = parseFloat(document.getElementById('legalFee').value)   || 0;
  const agencyPct = parseFloat(document.getElementById('agencyFee').value)  || 0;

  // Per-unit amounts
  const unitAmounts = units.map(u => ({
    ...u,
    amount: u.size * rate
  }));

  const subTotal   = unitAmounts.reduce((sum, u) => sum + u.amount, 0);
  const agreedAmt  = subTotal - discount;
  const legalAmt   = (legalPct  / 100) * agreedAmt;
  const agencyAmt  = (agencyPct / 100) * agreedAmt;
  const grandTotal = agreedAmt + legalAmt + agencyAmt;

  return { unitAmounts, subTotal, discount, agreedAmt, legalAmt, agencyAmt, grandTotal, legalPct, agencyPct };
}

/* ──────────────────────────────────────────────
   SECTION 9: LIVE PREVIEW UPDATE
   Called every time any input changes.
   ────────────────────────────────────────────── */
function updatePreview() {
  // ── Meta
  const invoiceNo = getInvoiceNo();
  const dateStr   = document.getElementById('invoiceDate').value;
  set('prev-invoiceNo',   invoiceNo);
  set('prev-invoiceDate', 'Date: ' + formatDate(dateStr));

  // ── Client
  set('prev-customerName',        val('customerName')        || '—');
  set('prev-propertyDescription', val('propertyDescription') || '—');

  // ── Units table
  const { unitAmounts, subTotal, discount, agreedAmt, legalAmt, agencyAmt, grandTotal, legalPct, agencyPct } = calculate();
  const tbody = document.getElementById('prev-unitsBody');
  tbody.innerHTML = '';

  if (unitAmounts.length === 0 || unitAmounts.every(u => !u.name && !u.size)) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;font-style:italic;">Add units in the form</td></tr>';
  } else {
    const rate = parseFloat(document.getElementById('ratePerSqm').value) || 0;
    unitAmounts.forEach(u => {
      if (!u.name && !u.size) return;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.name || '—'}</td>
        <td>${u.size ? u.size + ' SQM' : '—'}</td>
        <td>₦${(rate).toLocaleString('en-NG')} Per SQM</td>
        <td style="text-align:right">${fmt(u.amount)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Totals
  set('prev-subTotal',   fmt(subTotal));
  set('prev-agreedAmt',  fmt(agreedAmt));
  set('prev-grandTotal', fmt(grandTotal));

  // Show/hide discount row
  const discRow = document.getElementById('prev-discountRow');
  if (discount > 0) {
    discRow.style.display = 'block';
    set('prev-discountAmt', fmt(discount));
  } else {
    discRow.style.display = 'none';
  }

  // ── Additional charges
  set('prev-legalRate',  legalPct  + '%');
  set('prev-agencyRate', agencyPct + '%');
  set('prev-legalAmt',   fmt(legalAmt));
  set('prev-agencyAmt',  fmt(agencyAmt));

  // ── Bank details
  set('prev-bankName',      val('bankName')      || '—');
  set('prev-accountName',   val('accountName')   || '—');
  set('prev-accountNumber', val('accountNumber') || '—');
  set('prev-paymentPhone',  val('paymentPhone')  || '08032961727');

  // ── Notes
  const notes     = val('additionalNotes');
  const notesBlock = document.getElementById('prev-notesBlock');
  if (notes && notes.trim()) {
    notesBlock.style.display = 'block';
    set('prev-notes', notes);
  } else {
    notesBlock.style.display = 'none';
  }
}

/** Helper: get value of an element by ID */
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

/** Helper: set text content of an element by ID */
function set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ──────────────────────────────────────────────
   SECTION 10: SAVE TO FIRESTORE
   ────────────────────────────────────────────── */

/** Collect all form data into a plain object */
function collectFormData() {
  const calc = calculate();
  return {
    invoiceNo:           getInvoiceNo(),
    date:                val('invoiceDate'),
    customerName:        val('customerName'),
    propertyDescription: val('propertyDescription'),
    ratePerSqm:          parseFloat(val('ratePerSqm')) || 0,
    discount:            parseFloat(val('discount'))   || 0,
    legalFee:            parseFloat(val('legalFee'))   || 0,
    agencyFee:           parseFloat(val('agencyFee'))  || 0,
    bankName:            val('bankName'),
    accountName:         val('accountName'),
    accountNumber:       val('accountNumber'),
    paymentPhone:        val('paymentPhone'),
    additionalNotes:     val('additionalNotes'),
    units:               units.map(u => ({ name: u.name, size: u.size })),
    // Calculated totals (stored for display in history)
    subTotal:   calc.subTotal,
    agreedAmt:  calc.agreedAmt,
    grandTotal: calc.grandTotal,
    savedAt:    firebase.firestore.FieldValue.serverTimestamp()
  };
}

/** Save (or update) the invoice to Firestore */
async function saveInvoice(silent = false) {
  const data = collectFormData();

  try {
    if (editingDocId) {
      // ── UPDATE existing invoice
      await db.collection('invoices').doc(editingDocId).set(data, { merge: true });
      if (!silent) showToast('✅ Invoice updated successfully!');
    } else {
      // ── CREATE new invoice
      await db.collection('invoices').add(data);

      // Increment the counter in Firestore
      const numberPart = parseInt(data.invoiceNo.replace(/\D/g, '')) || 0;
      await db.collection('meta').doc('counter').set({ lastNumber: numberPart }, { merge: true });

      if (!silent) showToast('✅ Invoice saved successfully!');
    }

    loadHistory(); // Refresh history list
  } catch (e) {
    console.error('Save error:', e);
    showToast('❌ Error saving invoice. Check console.');
  }
}

/* ──────────────────────────────────────────────
   SECTION 11: GENERATE & PRINT
   ────────────────────────────────────────────── */

/** Save the invoice then trigger the browser print dialog */
async function generateAndPrint() {
  await saveInvoice(true); // Save silently
  updatePreview();
  setTimeout(() => {
    window.print();
  }, 300);
}

/* ──────────────────────────────────────────────
   SECTION 12: HISTORY — LOAD & DISPLAY
   ────────────────────────────────────────────── */

/** Load all invoices from Firestore and render history list */
async function loadHistory() {
  const listEl = document.getElementById('invoiceList');
  try {
    const snapshot = await db.collection('invoices').orderBy('savedAt', 'desc').get();
    allInvoices = [];
    snapshot.forEach(doc => {
      allInvoices.push({ id: doc.id, ...doc.data() });
    });
    renderHistory(allInvoices);
  } catch (e) {
    console.error('Load history error:', e);
    listEl.innerHTML = '<p class="empty-msg">Could not load invoices.</p>';
  }
}

/** Render a list of invoice objects as history cards */
function renderHistory(list) {
  const listEl = document.getElementById('invoiceList');
  if (!list || list.length === 0) {
    listEl.innerHTML = '<p class="empty-msg">No invoices saved yet.</p>';
    return;
  }
  listEl.innerHTML = list.map(inv => `
    <div class="history-card">
      <div class="hc-top">
        <span class="hc-number">${inv.invoiceNo || '—'}</span>
        <span class="hc-date">${formatDate(inv.date)}</span>
      </div>
      <div class="hc-client">${inv.customerName || '—'}</div>
      <div class="hc-amount">Grand Total: ${fmt(inv.grandTotal)}</div>
      <div class="hc-actions">
        <button class="btn-hc open"  onclick="openInvoice('${inv.id}')">📂 Open</button>
        <button class="btn-hc print" onclick="printInvoice('${inv.id}')">🖨 Print</button>
        <button class="btn-hc del"   onclick="confirmDelete('${inv.id}', '${inv.invoiceNo}')">🗑 Delete</button>
      </div>
    </div>
  `).join('');
}

/* ──────────────────────────────────────────────
   SECTION 13: HISTORY — SEARCH
   ────────────────────────────────────────────── */

/** Filter history list by search term (invoice no, name, description, date) */
function searchInvoices() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  if (!q) {
    renderHistory(allInvoices);
    return;
  }
  const filtered = allInvoices.filter(inv => {
    return (
      (inv.invoiceNo           || '').toLowerCase().includes(q) ||
      (inv.customerName        || '').toLowerCase().includes(q) ||
      (inv.propertyDescription || '').toLowerCase().includes(q) ||
      (inv.date                || '').toLowerCase().includes(q)
    );
  });
  renderHistory(filtered);
}

/* ──────────────────────────────────────────────
   SECTION 14: HISTORY — OPEN / LOAD
   ────────────────────────────────────────────── */

/** Load an existing invoice into the form for viewing/editing */
async function openInvoice(docId) {
  const doc = await db.collection('invoices').doc(docId).get();
  if (!doc.exists) { showToast('❌ Invoice not found.'); return; }

  const d = doc.data();
  editingDocId = docId;

  // Switch to create tab
  switchTab('create');

  // Fill form fields
  document.getElementById('invoiceNo').value           = d.invoiceNo           || '';
  document.getElementById('invoiceDate').value          = d.date                || '';
  document.getElementById('customerName').value         = d.customerName        || '';
  document.getElementById('propertyDescription').value  = d.propertyDescription || '';
  document.getElementById('ratePerSqm').value           = d.ratePerSqm          || '';
  document.getElementById('discount').value             = d.discount            || '';
  document.getElementById('legalFee').value             = d.legalFee            || '';
  document.getElementById('agencyFee').value            = d.agencyFee           || '';
  document.getElementById('bankName').value             = d.bankName            || '';
  document.getElementById('accountName').value          = d.accountName         || '';
  document.getElementById('accountNumber').value        = d.accountNumber       || '';
  document.getElementById('paymentPhone').value         = d.paymentPhone        || '';
  document.getElementById('additionalNotes').value      = d.additionalNotes     || '';

  // Rebuild units
  units = [];
  unitCounter = 0;
  document.getElementById('unitsContainer').innerHTML = '';
  (d.units || []).forEach(u => {
    addUnit();
    const id = unitCounter;
    const nameEl = document.getElementById(`unit-name-${id}`);
    const sizeEl = document.getElementById(`unit-size-${id}`);
    if (nameEl) nameEl.value = u.name || '';
    if (sizeEl) sizeEl.value = u.size || '';
    // Sync state
    const unitInState = units.find(x => x.id === id);
    if (unitInState) {
      unitInState.name = u.name || '';
      unitInState.size = parseFloat(u.size) || 0;
    }
  });

  updatePreview();
  showToast('📂 Invoice loaded. Edit and save.');
}

/** Load an invoice and immediately print it */
async function printInvoice(docId) {
  await openInvoice(docId);
  setTimeout(() => window.print(), 400);
}

/* ──────────────────────────────────────────────
   SECTION 15: HISTORY — DELETE
   ────────────────────────────────────────────── */
let pendingDeleteId = null;

/** Show confirmation modal before deleting */
function confirmDelete(docId, invoiceNo) {
  pendingDeleteId = docId;
  document.getElementById('confirmMsg').textContent =
    `Delete ${invoiceNo}? This cannot be undone.`;
  document.getElementById('confirmModal').style.display = 'flex';
  document.getElementById('confirmYes').onclick = doDelete;
}

/** Execute the delete */
async function doDelete() {
  closeModal();
  if (!pendingDeleteId) return;
  try {
    await db.collection('invoices').doc(pendingDeleteId).delete();
    pendingDeleteId = null;
    showToast('🗑 Invoice deleted.');
    loadHistory();
  } catch (e) {
    showToast('❌ Delete failed.');
    console.error(e);
  }
}

function closeModal() {
  document.getElementById('confirmModal').style.display = 'none';
}

/* ──────────────────────────────────────────────
   SECTION 16: RESET FORM
   ────────────────────────────────────────────── */

/** Clear all form fields and start a fresh invoice */
function resetForm() {
  editingDocId = null;

  document.getElementById('customerName').value        = '';
  document.getElementById('propertyDescription').value = '';
  document.getElementById('ratePerSqm').value          = '';
  document.getElementById('discount').value            = '';
  document.getElementById('legalFee').value            = '';
  document.getElementById('agencyFee').value           = '';
  document.getElementById('bankName').value            = '';
  document.getElementById('accountName').value         = '';
  document.getElementById('accountNumber').value       = '';
  document.getElementById('paymentPhone').value        = '08032961727';
  document.getElementById('additionalNotes').value     = '';

  // Clear units
  units = [];
  unitCounter = 0;
  document.getElementById('unitsContainer').innerHTML = '';
  addUnit();

  // Reload next invoice number
  loadNextInvoiceNumber();
  setTodayDate();
  updatePreview();
  showToast('✦ Ready for new invoice.');
}

/* ──────────────────────────────────────────────
   SECTION 17: TAB SWITCHING
   ────────────────────────────────────────────── */

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');

  if (tabName === 'history') loadHistory();
}

/* ──────────────────────────────────────────────
   SECTION 18: TOAST NOTIFICATION
   ────────────────────────────────────────────── */
let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
