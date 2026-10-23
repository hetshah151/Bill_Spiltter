/**
 * SplitKarle — Smart & Exact Bill Splitter
 * ZeroCode Competition at Techfest
 * Built exclusively with vanilla HTML, CSS, and JavaScript.
 */

(function () {
  'use strict';

  // --- Constants & Storage Key ---
  const STORAGE_KEY = 'splitkarle_data';

  // --- DOM Element References ---
  const splitForm = document.getElementById('splitForm');
  const occasionInput = document.getElementById('occasionInput');
  const billAmountInput = document.getElementById('billAmountInput');
  const numPeopleInput = document.getElementById('numPeopleInput');
  const currencySelect = document.getElementById('currencySelect');
  const currencySymbol = document.getElementById('currencySymbol');

  const errorAlert = document.getElementById('errorAlert');
  const errorMessage = document.getElementById('errorMessage');
  const dismissErrorBtn = document.getElementById('dismissErrorBtn');

  const emptyState = document.getElementById('emptyState');
  const resultView = document.getElementById('resultView');

  const displayOccasion = document.getElementById('displayOccasion');
  const displayTimestamp = document.getElementById('displayTimestamp');
  const metricTotalBill = document.getElementById('metricTotalBill');
  const metricPeopleCount = document.getElementById('metricPeopleCount');
  const metricBaseShare = document.getElementById('metricBaseShare');

  const reconciledSum = document.getElementById('reconciledSum');
  const reconciledOriginal = document.getElementById('reconciledOriginal');
  const remainderNotice = document.getElementById('remainderNotice');
  const sharesTableBody = document.getElementById('sharesTableBody');
  const tableTotalSum = document.getElementById('tableTotalSum');

  const stepDownBtn = document.getElementById('stepDownBtn');
  const stepUpBtn = document.getElementById('stepUpBtn');
  const clearFormBtn = document.getElementById('clearFormBtn');
  const headerResetBtn = document.getElementById('headerResetBtn');

  const toggleNamesBtn = document.getElementById('toggleNamesBtn');
  const namesContainer = document.getElementById('namesContainer');

  const copyBreakdownBtn = document.getElementById('copyBreakdownBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  const printReceiptBtn = document.getElementById('printReceiptBtn');
  const toast = document.getElementById('toast');

  // --- State ---
  let customNames = [];
  let currentResultData = null;

  // --- Helpers ---

  /**
   * Format numbers into standardized 2-decimal currency strings.
   * e.g., formatCurrency(1250.5, '₹') => '₹1,250.50'
   */
  function formatCurrency(amount, symbol) {
    const sym = symbol || '₹';
    const num = Number(amount) || 0;
    // Format with commas and 2 fixed decimal places
    const parts = num.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sym}${parts.join('.')}`;
  }

  /**
   * Display accessible toast notification.
   */
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  /**
   * Hide any active validation error message.
   */
  function clearError() {
    if (errorAlert) {
      errorAlert.classList.add('hidden');
    }
    billAmountInput.classList.remove('has-error');
    numPeopleInput.classList.remove('has-error');
  }

  /**
   * Show validation error and strictly hide the result view (Requirement 4).
   */
  function showError(msg, targetInput) {
    if (errorMessage) {
      errorMessage.textContent = msg;
    }
    if (errorAlert) {
      errorAlert.classList.remove('hidden');
    }

    // Hide the result view and show empty state
    if (resultView) {
      resultView.classList.add('hidden');
    }
    if (emptyState) {
      emptyState.classList.remove('hidden');
    }

    if (targetInput) {
      targetInput.classList.add('has-error');
      targetInput.focus();
    }
  }

  /**
   * Generate custom name inputs when the user changes the number of people.
   */
  function syncCustomNameInputs() {
    if (!namesContainer) return;
    const count = parseInt(numPeopleInput.value, 10);
    if (!count || count <= 0 || count > 50) {
      namesContainer.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Enter a valid number of people to customize names.</span>';
      return;
    }

    namesContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'name-item-input';
      input.placeholder = `Person ${i + 1} Name`;
      input.maxLength = 30;
      input.value = customNames[i] || '';
      input.dataset.index = i;

      input.addEventListener('input', function (e) {
        customNames[i] = e.target.value.trim();
        // If calculation is already active, refresh table names dynamically
        if (currentResultData) {
          calculateAndRender(false);
        }
      });

      namesContainer.appendChild(input);
    }
  }

  // --- Core Calculation Logic ---

  /**
   * Mathematically exact share calculation (Requirement 3).
   *
   * Splits total amount without any floating-point or rounding losses.
   * Converts total amount into smallest currency units (cents/paisa).
   * Distributes remainder cent-by-cent across members so that:
   * SUM(shares) === totalAmount down to 0.00 error.
   */
  function computeExactShares(totalAmount, count, currency, names) {
    const totalCents = Math.round(Number(totalAmount) * 100);
    const baseShareCents = Math.floor(totalCents / count);
    const remainderCents = totalCents % count;

    const shares = [];
    let runningCentsSum = 0;

    for (let i = 0; i < count; i++) {
      // First `remainderCents` people absorb 1 additional cent each
      const extraCent = i < remainderCents ? 1 : 0;
      const personCents = baseShareCents + extraCent;
      runningCentsSum += personCents;

      const defaultName = `Person ${i + 1}`;
      const name = (names && names[i] && names[i].length > 0) ? names[i] : defaultName;

      shares.push({
        index: i + 1,
        name: name,
        amount: personCents / 100,
        hasRemainderCent: extraCent > 0,
        cents: personCents
      });
    }

    const calculatedSum = runningCentsSum / 100;
    const baseShareAmount = baseShareCents / 100;

    return {
      totalAmount: totalCents / 100,
      count,
      currency,
      baseShareAmount,
      remainderCents,
      shares,
      reconciledSum: calculatedSum,
      isExact: runningCentsSum === totalCents
    };
  }

  /**
   * Validate inputs and execute split calculation.
   * Satisfies Requirement 1, 2, 3, 4, 5.
   */
  function calculateAndRender(shouldSave = true) {
    clearError();

    const occasionVal = occasionInput.value.trim();
    const occasion = occasionVal || 'Group Outing';

    const billRaw = billAmountInput.value.trim();
    const peopleRaw = numPeopleInput.value.trim();
    const currency = currencySelect.value || '₹';

    // --- REQUIREMENT 4: Validation checks ---
    // 1. Check if bill amount is empty, zero or negative
    if (billRaw === '') {
      showError('Please enter the total bill amount.', billAmountInput);
      return false;
    }

    const billAmount = parseFloat(billRaw);
    if (isNaN(billAmount) || billAmount <= 0) {
      showError('The bill amount must be greater than zero.', billAmountInput);
      return false;
    }

    // 2. Check if number of people is empty, zero or negative
    if (peopleRaw === '') {
      showError('Please enter the number of people.', numPeopleInput);
      return false;
    }

    const numPeople = Number(peopleRaw);
    if (isNaN(numPeople) || numPeople <= 0) {
      showError('The number of people must be at least 1.', numPeopleInput);
      return false;
    }

    if (!Number.isInteger(numPeople)) {
      showError('The number of people must be a whole number.', numPeopleInput);
      return false;
    }

    if (numPeople > 500) {
      showError('Number of people cannot exceed 500.', numPeopleInput);
      return false;
    }

    // --- REQUIREMENT 3: Exact Split Computation ---
    const result = computeExactShares(billAmount, numPeople, currency, customNames);
    currentResultData = {
      occasion,
      billAmount: result.totalAmount,
      numPeople: result.count,
      currency: result.currency,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      customNames: [...customNames]
    };

    // Render Metrics
    if (displayOccasion) displayOccasion.textContent = occasion;
    if (displayTimestamp) displayTimestamp.textContent = currentResultData.timestamp;
    if (metricTotalBill) metricTotalBill.textContent = formatCurrency(result.totalAmount, currency);
    if (metricPeopleCount) metricPeopleCount.textContent = result.count.toString();
    if (metricBaseShare) metricBaseShare.textContent = formatCurrency(result.baseShareAmount, currency);

    // Render Exact Precision Proof
    if (reconciledSum) reconciledSum.textContent = formatCurrency(result.reconciledSum, currency);
    if (reconciledOriginal) reconciledOriginal.textContent = formatCurrency(result.totalAmount, currency);

    if (remainderNotice) {
      if (result.remainderCents > 0) {
        const paisaOrCent = currency === '₹' ? 'paisa' : 'cent';
        const plural = result.remainderCents > 1 ? 's' : '';
        remainderNotice.textContent = `${result.remainderCents} ${paisaOrCent}${plural} distributed to match the bill exactly.`;
      } else {
        remainderNotice.textContent = 'Evenly divisible · Zero remainder.';
      }
    }

    // Render Shares Table
    if (sharesTableBody) {
      sharesTableBody.innerHTML = '';
      result.shares.forEach(person => {
        const tr = document.createElement('tr');

        // Member Column (with avatar badge)
        const tdMember = document.createElement('td');
        const memberCell = document.createElement('div');
        memberCell.className = 'member-cell';

        const avatar = document.createElement('span');
        avatar.className = 'member-avatar';
        // Extract initials or index
        const initial = person.name.charAt(0).toUpperCase() || person.index.toString();
        avatar.textContent = initial;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'member-name';
        nameSpan.textContent = person.name;

        memberCell.appendChild(avatar);
        memberCell.appendChild(nameSpan);
        tdMember.appendChild(memberCell);

        // Note Column
        const tdNote = document.createElement('td');
        const noteTag = document.createElement('span');
        noteTag.className = 'note-tag';
        if (person.hasRemainderCent) {
          noteTag.classList.add('adjusted');
          const unit = currency === '₹' ? 'paisa' : 'c';
          noteTag.textContent = `+1${unit} balance`;
        } else {
          noteTag.textContent = 'Base share';
        }
        tdNote.appendChild(noteTag);

        // Amount Column
        const tdAmount = document.createElement('td');
        tdAmount.className = 'amount-cell font-tabular';
        tdAmount.textContent = formatCurrency(person.amount, currency);

        tr.appendChild(tdMember);
        tr.appendChild(tdNote);
        tr.appendChild(tdAmount);
        sharesTableBody.appendChild(tr);
      });
    }

    // Reconciled Sum in Table Footer (Sum of all individual shares)
    if (tableTotalSum) {
      tableTotalSum.textContent = formatCurrency(result.reconciledSum, currency);
    }

    // Switch Views (Show Result, Hide Empty State)
    if (emptyState) emptyState.classList.add('hidden');
    if (resultView) resultView.classList.remove('hidden');

    // --- REQUIREMENT 5: Persistence across page reload ---
    if (shouldSave) {
      saveToStorage(currentResultData);
    }

    return true;
  }

  // --- LocalStorage Persistence (Requirement 5) ---

  function saveToStorage(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('SplitKarle: Unable to save to localStorage', e);
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;

      if (data.occasion) occasionInput.value = data.occasion;
      if (data.billAmount) billAmountInput.value = data.billAmount;
      if (data.numPeople) numPeopleInput.value = data.numPeople;
      if (data.currency) {
        currencySelect.value = data.currency;
        if (currencySymbol) currencySymbol.textContent = data.currency;
      }
      if (Array.isArray(data.customNames)) {
        customNames = data.customNames;
        syncCustomNameInputs();
      }

      // Automatically recalculate and render the restored split result
      if (data.billAmount && data.numPeople) {
        calculateAndRender(false);
      }
    } catch (e) {
      console.warn('SplitKarle: Error loading from localStorage', e);
    }
  }

  function resetAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('SplitKarle: Error clearing localStorage', e);
    }

    occasionInput.value = '';
    billAmountInput.value = '';
    numPeopleInput.value = '';
    customNames = [];
    currentResultData = null;

    if (namesContainer) namesContainer.innerHTML = '';
    if (toggleNamesBtn) {
      toggleNamesBtn.classList.remove('active');
      toggleNamesBtn.setAttribute('aria-expanded', 'false');
    }
    if (namesContainer) namesContainer.classList.add('hidden');

    clearError();

    // Show empty state and hide result view
    if (resultView) resultView.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');

    showToast('SplitKarle reset. Ready for a new bill!');
  }

  // --- Clipboard Export for WhatsApp / Chat ---

  function copySummaryToClipboard() {
    if (!currentResultData) return;

    const { occasion, billAmount, numPeople, currency } = currentResultData;
    const result = computeExactShares(billAmount, numPeople, currency, customNames);

    let text = `🧾 SplitKarle — ${occasion}\n`;
    text += `💰 Total Bill: ${formatCurrency(result.totalAmount, currency)}\n`;
    text += `👥 Split Between: ${numPeople} people\n`;
    text += `----------------------------------------\n`;

    result.shares.forEach(person => {
      text += `• ${person.name}: ${formatCurrency(person.amount, currency)}\n`;
    });

    text += `----------------------------------------\n`;
    text += `✓ Total Shares: ${formatCurrency(result.reconciledSum, currency)} (100% exact match)\n`;
    text += `Calculated with SplitKarle`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Breakdown copied! Ready to paste into group chat.');
        if (copyBtnText) copyBtnText.textContent = 'Copied to Clipboard!';
        setTimeout(() => {
          if (copyBtnText) copyBtnText.textContent = 'Copy Share Breakdown';
        }, 2200);
      }).catch(() => {
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }
  }

  function fallbackCopyText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('Breakdown copied to clipboard!');
    } catch (err) {
      showToast('Could not copy automatically. Please copy manually.');
    }
    document.body.removeChild(textArea);
  }

  // --- Event Listeners Setup ---

  function setupEventListeners() {
    // 1. Form submission: Calculate split without reloading the page (Requirement 2)
    splitForm.addEventListener('submit', function (e) {
      e.preventDefault();
      calculateAndRender(true);
    });

    // 2. Clear / Reset buttons
    if (clearFormBtn) {
      clearFormBtn.addEventListener('click', resetAll);
    }
    if (headerResetBtn) {
      headerResetBtn.addEventListener('click', resetAll);
    }

    // 3. Currency selection change
    currencySelect.addEventListener('change', function () {
      const sym = currencySelect.value;
      if (currencySymbol) currencySymbol.textContent = sym;
      // If result is already displayed, live-update it
      if (currentResultData) {
        currentResultData.currency = sym;
        calculateAndRender(true);
      }
    });

    // 4. Stepper buttons for number of people
    if (stepDownBtn) {
      stepDownBtn.addEventListener('click', function () {
        const current = parseInt(numPeopleInput.value, 10) || 1;
        if (current > 1) {
          numPeopleInput.value = current - 1;
          syncCustomNameInputs();
          if (currentResultData) calculateAndRender(true);
        }
      });
    }

    if (stepUpBtn) {
      stepUpBtn.addEventListener('click', function () {
        const current = parseInt(numPeopleInput.value, 10) || 0;
        numPeopleInput.value = current + 1;
        syncCustomNameInputs();
        if (currentResultData) calculateAndRender(true);
      });
    }

    // 5. Input change on number of people syncs custom name slots
    numPeopleInput.addEventListener('input', function () {
      syncCustomNameInputs();
    });

    // 6. Quick add chips for bill amount
    document.querySelectorAll('[data-add-amount]').forEach(btn => {
      btn.addEventListener('click', function () {
        const add = parseFloat(this.getAttribute('data-add-amount')) || 0;
        const current = parseFloat(billAmountInput.value) || 0;
        const updated = (current + add).toFixed(2);
        billAmountInput.value = updated;
        billAmountInput.classList.remove('has-error');
        if (currentResultData) calculateAndRender(true);
      });
    });

    // 7. Toggle custom names section
    if (toggleNamesBtn) {
      toggleNamesBtn.addEventListener('click', function () {
        const isHidden = namesContainer.classList.contains('hidden');
        if (isHidden) {
          namesContainer.classList.remove('hidden');
          toggleNamesBtn.classList.add('active');
          toggleNamesBtn.setAttribute('aria-expanded', 'true');
          syncCustomNameInputs();
        } else {
          namesContainer.classList.add('hidden');
          toggleNamesBtn.classList.remove('active');
          toggleNamesBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // 8. Dismiss error button
    if (dismissErrorBtn) {
      dismissErrorBtn.addEventListener('click', clearError);
    }

    // 9. Real-time clearing of error states as user types
    billAmountInput.addEventListener('input', function () {
      if (billAmountInput.classList.contains('has-error')) {
        billAmountInput.classList.remove('has-error');
        if (errorAlert) errorAlert.classList.add('hidden');
      }
    });

    numPeopleInput.addEventListener('input', function () {
      if (numPeopleInput.classList.contains('has-error')) {
        numPeopleInput.classList.remove('has-error');
        if (errorAlert) errorAlert.classList.add('hidden');
      }
    });

    // 10. Copy and Print actions
    if (copyBreakdownBtn) {
      copyBreakdownBtn.addEventListener('click', copySummaryToClipboard);
    }

    if (printReceiptBtn) {
      printReceiptBtn.addEventListener('click', function () {
        window.print();
      });
    }
  }

  // --- App Initialization ---
  function init() {
    setupEventListeners();
    // Load persisted state if user previously calculated a split (Requirement 5)
    loadFromStorage();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();