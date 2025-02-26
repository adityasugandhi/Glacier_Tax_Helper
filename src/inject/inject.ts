import { EnhancedTransaction } from '../utils/transaction-state-manager';
import { StateManager } from './state-manager';

// Load jQuery type definitions for TypeScript
declare const $: JQueryStatic;

// Function to check if we're on a stock transaction form
function isOnTransactionForm(): boolean {
  // Check for various possible form layouts
  
  // Check for detailed form with Name, SoldDateString fields
  const detailedForm = document.getElementById('Name') && document.getElementById('SoldDateString');
  if (detailedForm) return true;
  
  // Check for summary form with "Name of Stock" field
  const stockNameField = Array.from(document.querySelectorAll('label')).find(el => 
    el.textContent?.includes('Name of Stock')
  );
  
  const dateFields = document.querySelectorAll('input[type="text"]');
  const submitButton = document.querySelector('input[value="Save"]') || 
                       document.querySelector('button[type="submit"]') ||
                       document.querySelector('a.saveButton');
                       
  if (stockNameField && dateFields.length >= 2 && submitButton) {
    console.log('[Glacier Tax Helper] Detected summary transaction form');
    return true;
  }
  
  return false;
}

// Define interfaces for type safety
interface PayorData {
  id: string;
  name?: string;
}

interface ImportState {
  transactions: EnhancedTransaction[];
  status: 'not ready' | 'ready' | 'working' | 'done';
  payorId: string;
  index: number;
  file: string;
}

// Main extension initialization
// Use a unique tag to track if the inject script has already run
const INJECTED_TAG_ID = 'glacier-tax-helper-injected';

// Helper function declarations - moved outside the block to comply with strict mode
// Helper to find elements more robustly across different page structures
function findElement(selectors: string[]): Element | null {
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) return element;
    } catch (e) {
      console.error(`[Glacier Tax Helper] Error finding element with selector ${selector}:`, e);
    }
  }
  console.warn('[Glacier Tax Helper] Could not find element with selectors:', selectors);
  return null;
}

// Helper to find elements by multiple possible IDs
function findElementByPossibleIds(ids: string[]): Element | null {
  for (const id of ids) {
    try {
      const element = document.getElementById(id);
      if (element) return element;
    } catch (e) {
      console.error(`[Glacier Tax Helper] Error finding element with ID ${id}:`, e);
    }
  }
  console.warn('[Glacier Tax Helper] Could not find element with IDs:', ids);
  return null;
}

function initializeImporter(): void {
  console.log('[Glacier Tax Helper] Inject script initialized');
  
  // Log diagnostic information about the page
  console.log('[Glacier Tax Helper] Current URL:', window.location.href);
  console.log('[Glacier Tax Helper] Page title:', document.title);
  
  try {
    // Check if we're already on a transaction form page
    if (isOnTransactionForm()) {
      console.log('[Glacier Tax Helper] Already on a transaction form, skipping UI initialization');
      // Don't add the UI again, just check existing state
      checkExistingState();
      return;
    }
    
    // Check if UI is already added
    if (document.getElementById('gtx-helper')) {
      console.log('[Glacier Tax Helper] UI already present, just checking state');
      checkExistingState();
      return;
    }
  const css = document.createElement('style');
  css.type = "text/css";
  css.innerHTML = `
    .myInput { margin-left: 20px; }
    .gtx-helper-container { 
      margin: 15px 0;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .gtx-helper-heading {
      margin-top: 0;
      color: #333;
    }
    .gtx-helper-fieldset {
      margin-bottom: 15px;
      border: 1px solid #ccc;
      padding: 10px;
    }
    .gtx-helper-button {
      background-color: #4CAF50;
      color: white;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .gtx-helper-button:disabled {
      background-color: #cccccc;
    }
    .gtx-helper-error {
      background-color: #f44336;
      color: white;
      padding: 5px 10px;
      margin: 10px 0;
      border-radius: 4px;
    }
    .gtx-helper-success {
      background-color: #4CAF50;
      color: white;
      padding: 5px 10px;
      margin: 10px 0;
      border-radius: 4px;
    }
    .gtx-helper-warning {
      background-color: #ff9800;
      color: white;
      padding: 5px 10px;
      margin: 10px 0;
      border-radius: 4px;
    }
  `;
  document.body.appendChild(css);

  // Get Payor IDs
  const payorIds = getPayorIds();
  
  // Build dropdown options
  let options = `<option value='' selected>Select Payor ID (EIN)</option>\n`;
  for (let payorData of payorIds) {
    options += `<option value='${payorData.id}'>${payorData.id}${payorData.name ? ' - ' + payorData.name : ''}</option>\n`;
  }

  // Create importer HTML
  const importerHTML = `
    <div id='gtx-helper' class='gtx-helper-container'>
      <h2 class='gtx-helper-heading'>Glacier Tax Prep Form 1099-B Stock Transactions Importer</h2>
      <fieldset class='gtx-helper-fieldset'>
        <legend>Instructions</legend>
        <ol>
          <li>
            Add 1099-B forms in the previous page.
          </li>
          <li>Select a desired Payor ID (EIN) in the dropdown list.</li>
          <li>
            Choose the corresponding local CSV file.
          </li>
          <li>If both "Payor ID (EIN)" and the selected CSV file are valid, then the "Import" button will appear. Click "Import" to start importing transactions.</li>
        </ol>
        <ul>
          <li>
            Disclaimer: This Chrome extension is NOT an official tool from Glacier Tax Prep.
          </li>
        </ul>
      </fieldset>
      <fieldset class='gtx-helper-fieldset'>
        <legend>Select Payor ID (EIN) and Choose CSV File</legend>
        <span class='myInput'>
          <label for="payorId">Payor ID (EIN): </label>
          <select name="payorId" id="payorId">
            ${options}
          </select>
        </span>
        <span class='myInput'><input id='fileInput' type='file' accept='text/*,.csv'></span>
        <span class='myInput'><button style='display:none;' id='process' class='gtx-helper-button'>Start</button></span>
        <span class='myInput' style='display:none;' id='errorMessage' class='gtx-helper-error'></span>
      </fieldset>
    </div>
  `;
  
  // Insert the importer UI
  const mainElement = document.getElementById("main");
  if (mainElement) {
    mainElement.insertAdjacentHTML('afterbegin', importerHTML);
  } else {
    // Fallback if #main doesn't exist
    const targetElement = document.querySelector('.container') || document.body;
    targetElement.insertAdjacentHTML('afterbegin', importerHTML);
  }

  // Set up event listeners
  setupEventListeners();
  
  // Check if we're on the transaction entry form
  setTimeout(() => {
    if (document.getElementById('Name') && document.getElementById('SoldDateString')) {
      // We're on the form page, check for transactions to process
      const queue = StateManager.getTransactionQueue();
      if (queue.length > 0) {
        // Process the first transaction in the queue
        const currentTransaction = queue[0];
        fillAndSubmitCurrentTransaction(currentTransaction);
      }
    } else {
      // We're on the main page, check if we need to start processing
      checkExistingState();
    }
  }, 500);
  } catch (error) {
    console.error('[Glacier Tax Helper] Error initializing importer:', error);
  }
}

function setupEventListeners(): void {
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  const payorIdSelect = document.getElementById('payorId') as HTMLSelectElement;
  const processButton = document.getElementById('process') as HTMLButtonElement;
  
  if (payorIdSelect) {
    payorIdSelect.addEventListener('change', function(e) {
      hideErrorMessage();
      if (!validatePayorId()) {
        resetStatus();
        hideProcessButton();
        showErrorMessage("WARNING: Invalid Payor ID.", "warning");
        return;
      }
      
      hideErrorMessage();
      if (fileInput && fileInput.value == "") {
        resetStatus();
        return;
      }
      
      if (fileInput && fileInput.files && fileInput.files.length > 0) {
        importFile(fileInput.files[0]);
      }
    });
  }
  
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      hideErrorMessage();
      if (fileInput.value == "") {
        resetStatus();
        hideProcessButton();
        showErrorMessage("WARNING: Invalid Input File.", "warning");
        return;
      }
      
      hideErrorMessage();
      if (!validatePayorId()) {
        resetStatus();
        hideProcessButton();
        showErrorMessage("WARNING: Invalid Payor ID.", "warning");
        return;
      }
      
      if (fileInput.files && fileInput.files.length > 0) {
        importFile(fileInput.files[0]);
      }
    });
  }
  
  if (processButton) {
    processButton.addEventListener('click', function() {
      // First, get ALL relevant data including transactions
      chrome.storage.local.get(['status', 'transactions'], function(items) {
        if (items.status == 'ready') {
          // Make sure we have transactions
          if (!items.transactions || !Array.isArray(items.transactions) || items.transactions.length === 0) {
            console.error('[Glacier Tax Helper] No transactions to process!');
            showErrorMessage("ERROR: No transactions found to process. Please try re-importing the CSV file.", "error");
            return;
          }
          
          console.log(`[Glacier Tax Helper] Starting import of ${items.transactions.length} transactions`);
          
          // Get current state before setting status to 'working'
          chrome.storage.local.get(['payorId', 'index', 'file'], function(currentState) {
            // Set status to 'working' and preserve the state
            chrome.storage.local.set({
              'status': 'working',
              'transactions': items.transactions, // Explicitly include transactions
              'payorId': currentState.payorId || '',
              'index': 0,
              'file': currentState.file || ''
            }, function() {
              console.log(`[Glacier Tax Helper] Setting status to working with ${items.transactions.length} transactions`);
              console.log('[Glacier Tax Helper] First transaction:', items.transactions[0]);
              
              // Add a short delay before navigating to ensure storage is updated
              setTimeout(() => {
                try {
                  // Try to navigate without a full page reload if possible
                  navigateToTransactionForm();
                } catch (e) {
                  console.error('[Glacier Tax Helper] Navigation failed, falling back to reload', e);
                  location.reload();
                }
              }, 500);
            });
          });
        }
      });
    });
  }
}

function checkExistingState(): void {
  chrome.storage.local.get(['transactions', 'status', 'payorId', 'index', 'file', 'currentlyProcessing', 'currentTransaction'], function(items: Partial<ImportState & {currentlyProcessing?: boolean, currentTransaction?: string}>) {
    const transactions = items.transactions || [];
    const payorId = items.payorId || '';
    const index = items.index || 0;
    const file = items.file || '';
    const currentlyProcessing = items.currentlyProcessing || false;
    const currentTransaction = items.currentTransaction || '';
    
    console.log('[Glacier Tax Helper] Checking existing state:', {
      status: items.status,
      transactionsCount: transactions.length,
      payorId,
      index,
      currentlyProcessing,
      currentTransaction
    });
    
    // If we were in the middle of processing a transaction when the page reloaded,
    // we need to make sure that transaction is properly marked as processed
    if (currentlyProcessing && items.status === 'working') {
      console.log('[Glacier Tax Helper] Detected interrupted transaction processing!');
      
      // Since we know the page reloaded after form submission, we can assume the transaction was processed
      // Move to the next transaction by incrementing the index
      chrome.storage.local.set({
        'currentlyProcessing': false,
        'index': index + 1 // Move to next transaction
      }, function() {
        console.log('[Glacier Tax Helper] Recovered from interrupted processing, moving to next transaction');
        
        // Check if we've processed all transactions
        if (index + 1 >= transactions.length) {
          chrome.storage.local.set({'status': 'done'}, function() {
            showErrorMessage(`SUCCESS: Imported CSV file for Payor ID ${payorId}.`, "success");
          });
          return;
        }
        
        // Small delay to ensure state updates before continuing
        setTimeout(() => {
          checkExistingState(); // Re-check state to process next transaction
        }, 500);
      });
      return; // Exit early as we're handling recovery
    }
    
    if (items.status == 'working') {
      showProcessButtonAs("Importing...", true);
      
      // Check if we're on the transaction entry form page
      if (isOnTransactionForm() && transactions.length > 0 && index < transactions.length) {
        // We're on the form page, fill and submit
        const transaction = transactions[index];
        
        // First ensure we won't lose state by saving it again
        chrome.storage.local.set({
          'status': 'working', 
          'payorId': payorId, 
          'index': index, 
          'file': file,
          'transactions': transactions
        }, function() {
          console.log("[Glacier Tax Helper] State preserved before processing transaction");
          
          // Fill form fields with transaction data
          fillAndSubmitCurrentTransaction(transaction);
        });
      } else if (transactions.length > 0 && index < transactions.length) {
        // Not on form page, try to navigate there
        console.log("[Glacier Tax Helper] Not on form page, navigating...");
        // Save state again to ensure it's not lost during navigation
        chrome.storage.local.set({
          'status': 'working',
          'transactions': transactions,
          'payorId': payorId,
          'index': index,
          'file': file
        }, function() {
          navigateToTransactionForm();
        });
      } else if (index >= transactions.length) {
        // We've processed all transactions
        chrome.storage.local.set({'status': 'done'}, function() {
          showErrorMessage(`SUCCESS: Imported CSV file for Payor ID ${payorId}.`, "success");
        });
      } else {
        console.error('[Glacier Tax Helper] No transactions to process!');
        chrome.storage.local.set({'status': 'done'}, function() {
          showErrorMessage(`No transactions to process!`, "error");
        });
      }
    } else if (items.status == 'done') {
      showErrorMessage(`SUCCESS: Imported CSV file for Payor ID ${payorId}.`, "success");
    }
  });
}

// Function to handle the complete process of filling and submitting a transaction
function fillAndSubmitCurrentTransaction(transaction: EnhancedTransaction): void {
  console.log('[Glacier Tax Helper] Filling and submitting transaction:', transaction);
  
  // Before filling the form, ensure our state is saved with a marker that we're
  // in the middle of processing this transaction
  chrome.storage.local.set({
    'currentlyProcessing': true,
    'currentTransaction': transaction.id
  }, function() {
    // Fill the form fields with transaction data
    fillFormFields(transaction);
    
    // Add a small delay before submission to ensure all fields are properly filled
    setTimeout(() => {
      // Submit the form
      submitForm();
      
      // Update processing state and queue after submission
      // Note: This may not execute if the page reloads immediately after form submission
      setTimeout(() => {
        // Set a flag that we're done with this transaction
        chrome.storage.local.set({ 'currentlyProcessing': false }, function() {
          console.log('[Glacier Tax Helper] Transaction processing completed');
        });
      }, 500);
    }, 500);
  });
}

// Function to navigate to the transaction form by finding and clicking the "Add Transaction" link
function navigateToTransactionForm(): void {
  console.log('[Glacier Tax Helper] Looking for Add Transaction link');
  
  try {
    // Look for "Add Transaction" link with the pattern found in the HTML
    const addTransactionLinks = document.querySelectorAll('a[href*="/IRSForm/StockTransaction"]');
    
    if (addTransactionLinks.length === 0) {
      console.log('[Glacier Tax Helper] No Add Transaction links found by CSS selector, looking by text content');
      // Try finding by text content
      const allLinks = document.querySelectorAll('a');
      for (let i = 0; i < allLinks.length; i++) {
        const link = allLinks[i] as HTMLAnchorElement;
        const linkText = link.textContent?.trim();
        
        if (linkText === 'Add Transaction') {
          console.log('[Glacier Tax Helper] Found Add Transaction link by text content');
          
          // Instead of directly clicking which can cause a full page reload
          // Let's try to navigate more gently
          const href = link.getAttribute('href');
          if (href) {
            console.log(`[Glacier Tax Helper] Navigating to ${href}`);
            // Use history.pushState to avoid a full page reload if possible
            try {
              history.pushState({}, '', href);
              // After pushState, we need to manually load the content
              // This part is tricky and might not work in all cases
              // If it doesn't work, we'll fall back to traditional navigation
              setTimeout(() => {
                if (document.getElementById('Name') === null) {
                  console.log('[Glacier Tax Helper] pushState didn\'t load page content, falling back to window.location');
                  window.location.href = href;
                }
              }, 500);
              return;
            } catch (e) {
              console.error('[Glacier Tax Helper] pushState failed, falling back to traditional navigation');
              window.location.href = href;
              return;
            }
          } else {
            console.log('[Glacier Tax Helper] No href attribute found, clicking directly');
            // Click as a last resort
            link.click();
            return;
          }
        }
      }
    }
    
    // If we get here, we need to check the original selector results
    for (let i = 0; i < addTransactionLinks.length; i++) {
      const link = addTransactionLinks[i] as HTMLAnchorElement;
      const linkText = link.textContent?.trim();
      
      if (linkText === 'Add Transaction') {
        console.log('[Glacier Tax Helper] Found Add Transaction link, navigating');
        const href = link.getAttribute('href');
        if (href) {
          console.log(`[Glacier Tax Helper] Navigating to ${href}`);
          window.location.href = href;
        } else {
          link.click();
        }
        return;
      }
    }
    
    // Look for the stock transaction form - we might already be on it
    if (document.getElementById('Name') && document.getElementById('SoldDateString')) {
      console.log('[Glacier Tax Helper] Already on transaction form');
      return;
    }
    
    // Special handling for Payor ID specific link
    navigateToPayorTransactionPage();
  } catch (error) {
    console.error('[Glacier Tax Helper] Error navigating to transaction form:', error);
  }
}

// Fill the form based on its detected type
function fillFormFields(transaction: EnhancedTransaction): void {
  console.log('[Glacier Tax Helper] Filling form fields for transaction:', transaction);
  
  // First check if we're on the detailed form
  const nameField = document.getElementById('Name') as HTMLInputElement;
  const soldDateField = document.getElementById('SoldDateString') as HTMLInputElement;
  
  if (nameField && soldDateField) {
    console.log('[Glacier Tax Helper] Filling detailed transaction form');
    fillDetailedFormFields(transaction);
    return;
  }
  
  // If not, we must be on the summary form
  console.log('[Glacier Tax Helper] Filling summary transaction form');
  fillSummaryFormFields(transaction);
}

// Fill the detailed transaction form
function fillDetailedFormFields(transaction: EnhancedTransaction): void {
  // Use the exact field IDs from the actual HTML
  const nameField = document.getElementById('Name') as HTMLInputElement;
  const soldDateField = document.getElementById('SoldDateString') as HTMLInputElement;
  const salesPriceField = document.getElementById('SalesPrice') as HTMLInputElement;
  const purchasePriceField = document.getElementById('PurchasePrice') as HTMLInputElement;
  
  // Log which fields were found for debugging
  console.log('[Glacier Tax Helper] Detailed form fields found:', { 
    nameField: !!nameField,
    soldDateField: !!soldDateField,
    salesPriceField: !!salesPriceField,
    purchasePriceField: !!purchasePriceField
  });
  
  // Fill in the fields that were found
  if (nameField) nameField.value = transaction.description;
  // Note: If purchase date (date acquired) is needed but not visible as a field,
  // we may need to investigate further
  if (soldDateField) soldDateField.value = formatDateForForm(transaction.saleDate);
  if (salesPriceField) salesPriceField.value = transaction.salesPrice.toString();
  if (purchasePriceField) purchasePriceField.value = transaction.costBasis.toString();
  
  // Trigger events on the fields to activate any validation
  [nameField, soldDateField, salesPriceField, purchasePriceField].forEach(field => {
    if (field) {
      ['input', 'change', 'blur'].forEach(eventType => {
        field.dispatchEvent(new Event(eventType, { bubbles: true }));
      });
    }
  });
}

// Fill the summary transaction form
function fillSummaryFormFields(transaction: EnhancedTransaction): void {
  // The summary form has different field identifiers
  // We need to find them by labels or relative positions
  
  // Get all text input fields
  const textInputs = Array.from(document.querySelectorAll('input[type="text"]'));
  
  // Find stock name field - usually the first text input
  const stockNameField = textInputs[0] as HTMLInputElement;
  
  // Find date fields - typically the next two text inputs
  const purchaseDateField = textInputs[1] as HTMLInputElement;
  const saleDateField = textInputs[2] as HTMLInputElement;
  
  // Find amount fields - often have specific patterns or nearby labels
  const salesPriceField = document.querySelector('input[name*="price"], input[name*="sales"]') as HTMLInputElement ||
                         document.querySelector('input[id*="price"], input[id*="sales"]') as HTMLInputElement;
  
  const costField = document.querySelector('input[name*="cost"], input[name*="basis"]') as HTMLInputElement ||
                   document.querySelector('input[id*="cost"], input[id*="basis"]') as HTMLInputElement;
  
  // If we couldn't find fields by name/id, try by index
  const allInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'));
  if (!salesPriceField && allInputs.length >= 4) {
    const salesInput = allInputs[3] as HTMLInputElement;
    if (salesInput) salesInput.value = transaction.salesPrice.toString();
  }
  
  if (!costField && allInputs.length >= 5) {
    const costInput = allInputs[4] as HTMLInputElement;
    if (costInput) costInput.value = transaction.costBasis.toString();
  }
  
  // Log which fields were found
  console.log('[Glacier Tax Helper] Summary form fields found:', {
    stockNameField: !!stockNameField,
    purchaseDateField: !!purchaseDateField,
    saleDateField: !!saleDateField,
    salesPriceField: !!salesPriceField,
    costField: !!costField
  });
  
  // Fill in the fields that were found
  if (stockNameField) stockNameField.value = transaction.description;
  if (purchaseDateField && transaction.dateAcquired) purchaseDateField.value = formatDateForForm(transaction.dateAcquired);
  if (saleDateField) saleDateField.value = formatDateForForm(transaction.saleDate);
  if (salesPriceField) salesPriceField.value = transaction.salesPrice.toString();
  if (costField) costField.value = transaction.costBasis.toString();
  
  // Trigger events on the fields
  [stockNameField, purchaseDateField, saleDateField, salesPriceField, costField].forEach(field => {
    if (field) {
      ['input', 'change', 'blur'].forEach(eventType => {
        field.dispatchEvent(new Event(eventType, { bubbles: true }));
      });
    }
  });
}

function formatDateForForm(dateString: string): string {
  try {
    if (!dateString) {
      return formatCurrentDate();
    }
    
    // Handle YYYY-MM-DD format (ISO format)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-');
      return `${month}/${day}/${year}`;
    }
    
    // Handle YYYYMMDD format
    if (/^\d{8}$/.test(dateString)) {
      const year = dateString.substring(0, 4);
      const month = dateString.substring(4, 6);
      const day = dateString.substring(6, 8);
      return `${month}/${day}/${year}`;
    }
    
    // Handle MM/DD/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
      return dateString; // Already in the correct format
    }
    
    // Try to parse as a standard Date object
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    }
    
    console.warn(`[Glacier Tax Helper] Could not parse date: ${dateString}`);
    return formatCurrentDate();
  } catch (e) {
    console.error('[Glacier Tax Helper] Error formatting date:', e);
    return formatCurrentDate();
  }
}

// Helper to format current date in MM/DD/YYYY format
function formatCurrentDate(): string {
  const today = new Date();
  return `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
}

function submitForm(): void {
  try {
    // First, ensure the index is incremented BEFORE form submission
    // This ensures that even if the page reloads immediately, we won't process the same transaction again
    chrome.storage.local.get(['index', 'transactions'], function(data) {
      const currentIndex = data.index || 0;
      const transactions = data.transactions || [];
      
      // Increment the index to point to the next transaction
      chrome.storage.local.set({'index': currentIndex + 1}, function() {
        console.log(`[Glacier Tax Helper] Index incremented to ${currentIndex + 1} before form submission`);
        
        // Check if this was the last transaction
        if (currentIndex + 1 >= transactions.length) {
          chrome.storage.local.set({'status': 'done'}, function() {
            console.log("[Glacier Tax Helper] All transactions will be processed after this submission");
          });
        }
        
        // Now actually submit the form
        const submitBtn = document.getElementById('submit') as HTMLAnchorElement;
        const saveBtn = document.querySelector('input[value="Save"]') as HTMLInputElement;
        const saveLink = document.querySelector('a.saveButton, a[id*="save"]') as HTMLAnchorElement;
        
        // Try the submit button first
        if (submitBtn) {
          console.log('[Glacier Tax Helper] Submitting form by clicking the submit button');
          submitBtn.click();
        }
        // Then try the Save button
        else if (saveBtn) {
          console.log('[Glacier Tax Helper] Submitting form by clicking the Save button');
          saveBtn.click();
        }
        // Then try save link
        else if (saveLink) {
          console.log('[Glacier Tax Helper] Submitting form by clicking the Save link');
          saveLink.click();
        }
        // Fallback to form submit
        else {
          // Try to find and submit the form directly
          const forms = document.forms;
          if (forms.length > 0) {
            console.log('[Glacier Tax Helper] Submitting form directly');
            forms[0].submit();
          } else {
            console.error('[Glacier Tax Helper] Could not find any submit method');
          }
          return;
        }
      });
    });
  } catch (error) {
    console.error('[Glacier Tax Helper] Error submitting form:', error);
  }
}

function navigateToPayorTransactionPage(): void {
  // Get the current state to find Payor ID
  chrome.storage.local.get(['transactions', 'payorId', 'index', 'file'], function(items: Partial<ImportState>) {
    const transactions = items.transactions || [];
    const payorId = items.payorId || '';
    const index = items.index || 0;
  
    console.log(`[Glacier Tax Helper] Navigating to transaction page for Payor ID: ${payorId}`);
    
    if (!payorId) {
      console.error('[Glacier Tax Helper] No Payor ID found in state');
      return;
    }
    
    // Try finding by text content
    const allLinks = document.querySelectorAll('a');
    for (let i = 0; i < allLinks.length; i++) {
      const link = allLinks[i] as HTMLAnchorElement;
      const linkText = link.textContent?.trim();
      
      if (linkText === 'Add Transaction') {
        console.log('[Glacier Tax Helper] Found Add Transaction link, clicking it');
        link.click();
        return;
      }
    }
    
    // Fallback: look specifically in the row with the matching Payor ID
    const tableRows = document.querySelectorAll('tbody tr');
    
    for (let i = 0; i < tableRows.length; i++) {
      try {
        const row = tableRows[i] as HTMLTableRowElement;
        const firstCell = row.cells?.[0];
        
        if (firstCell && firstCell.innerText.trim() === payorId && index < transactions.length) {
          // Find and click the edit/add transaction link
          const actionLinks = row.querySelectorAll('a');
          
          for (let j = 0; j < actionLinks.length; j++) {
            const link = actionLinks[j] as HTMLAnchorElement;
            if (link.textContent?.trim() === 'Add Transaction') {
              console.log('[Glacier Tax Helper] Found Add Transaction in Payor row, clicking it');
              link.click();
              return;
            }
          }
        }
      } catch (error) {
        console.error('[Glacier Tax Helper] Error processing row:', error);
      }
    }
    
    console.error('[Glacier Tax Helper] Could not find Add Transaction link');
  });
}

function resetStatus(): void {
  chrome.storage.local.get(['transactions', 'status', 'payorId', 'index', 'file'], function(items: Partial<ImportState>) {
    const transactions = items.transactions || [];
    const status = items.status || 'not ready';
    const payorId = items.payorId || '';
    const index = items.index || 0;
    const file = items.file || '';

    if (status == 'done' && index > 0) {
      chrome.storage.local.set({ 
        'transactions': transactions, 
        'status': 'not ready', 
        'payorId': payorId, 
        'index': 0, 
        'file': file
      }, function() {
        console.log('[Glacier Tax Helper] Reset status to "not ready".');
      });
    }
  });
}

function importFile(file: File): void {
  const textType = /.*\.csv/;
  
  if (file.name.match(textType)) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      if (!reader.result) {
        showErrorMessage("ERROR: Failed to read file", "error");
        return;
      }
      
      try {
        const content = reader.result as string;
        
          // Process the CSV using the content script's processing capabilities
          chrome.runtime.sendMessage({
            type: 'PROCESS_CSV',
            payload: {
              content: content
            }
          }, function(response) {
            if (response && response.success) {
              const payorIdSelect = document.getElementById('payorId') as HTMLSelectElement;
              const payorIdValue = payorIdSelect ? payorIdSelect.value : '';
              
              // Verify we have actual transactions
              if (!response.transactions || !Array.isArray(response.transactions) || response.transactions.length === 0) {
                showErrorMessage(`ERROR: No valid transactions found in CSV. Please check your file.`, "error");
                return;
              }
              
              console.log(`[Glacier Tax Helper] Processed ${response.transactions.length} transactions, saving to storage`);
              
              // Store the transactions explicitly
              chrome.storage.local.set({ 
                'transactions': response.transactions, 
                'status': 'ready', 
                'payorId': payorIdValue, 
                'index': 0, 
                'file': file.name
              }, function() {
                // Verify they were saved
                chrome.storage.local.get(['transactions'], function(data) {
                  const savedCount = data.transactions ? data.transactions.length : 0;
                  console.log(`[Glacier Tax Helper] Verified ${savedCount} transactions saved to storage`);
                  
                  if (savedCount > 0) {
                    console.log('[Glacier Tax Helper] Ready for import!');
                    hideErrorMessage();
                    showProcessButton();
                  } else {
                    showErrorMessage(`ERROR: Failed to save transactions. Please try again.`, "error");
                  }
                });
              });
            } else {
              const error = response && response.error 
                ? response.error 
                : "Unknown error processing CSV";
              showErrorMessage(`ERROR: ${error}`, "error");
            }
          });
      } catch (error) {
        console.error('[Glacier Tax Helper] Error processing file:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showErrorMessage(`ERROR: Failed to process file: ${errorMessage}`, "error");
      }
    };
    
    reader.readAsText(file);
  } else {
    hideProcessButton();
    showErrorMessage("ERROR: Only CSV files are supported!", "error");
  }
}

function getPayorIds(): PayorData[] {
  const payorIds: PayorData[] = [];
  
  // Try multiple selectors to find the table rows
  const tableRows = document.querySelectorAll('tbody tr, .payor-row, tr[data-payor]');
  console.log(`[Glacier Tax Helper] Found ${tableRows.length} potential payor rows`);
  
  // If we didn't find any rows, try a more generic approach
  if (tableRows.length === 0) {
    // Look for any EIN-like patterns in the page
    const pageText = document.body.innerText;
    const einRegex = /\b(\d{2}-\d{7})\b/g;
    let match;
    
    while ((match = einRegex.exec(pageText)) !== null) {
      const ein = match[1];
      if (!payorIds.some(p => p.id === ein)) {
        payorIds.push({ id: ein });
      }
    }
    
    console.log(`[Glacier Tax Helper] Found ${payorIds.length} EINs using text search`);
    return payorIds;
  }
  
  // Process the found table rows
  for (let i = 0; i < tableRows.length; i++) {
    const row = tableRows[i] as HTMLTableRowElement;
    
    try {
      // Different ways to find the Payor ID cell
      let payorCell = null;
      let descriptionCell = null;
      
      // Method 1: By cell index
      if (row.cells && row.cells.length >= 2) {
        payorCell = row.cells[0];
        descriptionCell = row.cells[1];
      }
      
      // Method 2: By data attributes
      if (!payorCell && row.getAttribute('data-payor')) {
        payorCell = { innerText: row.getAttribute('data-payor') || '' };
      }
      
      // Method 3: By class or id
      if (!payorCell) {
        const idCell = row.querySelector('.payor-id, .ein, [id*="ein"], [id*="payor"]');
        if (idCell) payorCell = idCell;
      }
      
      // If we found a payorCell, extract the ID
      if (payorCell) {
        const payorId = payorCell.innerText.trim();
        
        if (payorId && payorId.length > 0) {
          // Try to extract description
          let description = '';
          if (descriptionCell) {
            description = descriptionCell.innerText.trim();
          }
          
          payorIds.push({ 
            id: payorId,
            name: description
          });
        }
      }
    } catch (error) {
      console.error('[Glacier Tax Helper] Error processing row:', error);
    }
  }
  
  console.log(`[Glacier Tax Helper] Found ${payorIds.length} Payor IDs`);
  return payorIds;
}

function validatePayorId(): boolean {
  const payorIdSelect = document.getElementById('payorId') as HTMLSelectElement;
  if (!payorIdSelect) return false;
  
  const payorValue = payorIdSelect.value;
  if (!payorValue) return false;
  
  const payorIds = getPayorIds().map(p => p.id);
  return payorIds.includes(payorValue);
}

function hideErrorMessage(): void {
  const errorMessage = document.getElementById('errorMessage');
  if (errorMessage) {
    errorMessage.style.display = 'none';
  }
}

function showErrorMessage(message: string, type: 'error' | 'warning' | 'success' = 'error'): void {
  const errorMessage = document.getElementById('errorMessage');
  if (errorMessage) {
    // Set color based on type
    if (type === 'error') {
      errorMessage.className = 'gtx-helper-error';
    } else if (type === 'warning') {
      errorMessage.className = 'gtx-helper-warning';
    } else if (type === 'success') {
      errorMessage.className = 'gtx-helper-success';
    }
    
    errorMessage.innerHTML = message;
    errorMessage.style.display = 'inline-block';
  }
}

function hideProcessButton(): void {
  const processButton = document.getElementById('process');
  if (processButton) {
    processButton.style.display = 'none';
  }
}

function showProcessButton(): void {
  const processButton = document.getElementById('process');
  if (processButton) {
    processButton.style.display = 'inline-block';
    processButton.innerHTML = 'Import';
    processButton.disabled = false;
  }
}

function showProcessButtonAs(text: string, disabled: boolean = true): void {
  const processButton = document.getElementById('process');
  if (processButton) {
    processButton.style.display = 'inline-block';
    processButton.innerHTML = text;
    processButton.disabled = disabled;
  }
}

// Main execution code
if (!document.getElementById(INJECTED_TAG_ID)) {
  // Add a marker to the DOM to prevent multiple injections
  const injectedTag = document.createElement('div');
  injectedTag.id = INJECTED_TAG_ID;
  injectedTag.style.display = 'none';
  document.body.appendChild(injectedTag);

  // Initialize the injector - this runs every time the page loads
  chrome.runtime.sendMessage({type: 'EXTENSION_LOADED'}, function() {
    let readyStateCheckInterval = setInterval(function() {
      if (document.readyState === "complete") {
        clearInterval(readyStateCheckInterval);
        // Always run initialization on page load - this is key for resuming after reload
        console.log('[Glacier Tax Helper] Page loaded - initializing...');
        initializeImporter();
        
        // Check existing state immediately - this ensures processing continues after reloads
        console.log('[Glacier Tax Helper] Checking for in-progress transactions');
        checkExistingState();
      }
    }, 100);
  });
} // End of INJECTED_TAG_ID condition
