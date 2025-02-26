import { EnhancedTransaction } from '../types/transactions';

// IMMEDIATE LOAD CHECK - SHOULD APPEAR EVEN IF OTHER CODE FAILS
console.log('=============== CONTENT SCRIPT LOADED ===============');
console.log('Content script loaded at:', new Date().toISOString());
console.log('Page URL:', window.location.href);
console.log('=====================================================');

// Log when content script is first loaded
console.log('[Glacier Tax Helper] Content script loaded and running on:', window.location.href);

// Enhanced logging utility
function log(message: string, data?: any) {
  console.log(`[Glacier Tax Helper] Content - loaded: ${message}`, data || '');
}

// Error logging utility
function logError(message: string, error?: any) {
  console.error(`[Glacier Tax Helper] Content ERROR: ${message}`, error || '');
}

// Check if form elements exist
function checkFormElements(): boolean {
  const nameField = document.getElementById('Name') as HTMLInputElement;
  const soldDateField = document.getElementById('SoldDateString') as HTMLInputElement;
  const salesPriceField = document.getElementById('SalesPrice') as HTMLInputElement;
  const purchasePriceField = document.getElementById('PurchasePrice') as HTMLInputElement;
  const submitButton = document.querySelector('#submit') as HTMLAnchorElement;

  return !!(nameField && soldDateField && salesPriceField && purchasePriceField && submitButton);
}

// Handles button click
function handleAddTransactionClick(element: HTMLElement) {
  log("Triggering click on 'Add Transaction' button");
  
  try {
    // Mark that we're about to click Add Transaction in chrome.storage
    chrome.storage.local.set({ 'addTransactionClicked': true }, () => {
      // Click the button
      log("Attempting to click the button...");
      element.click();
      
      // Dispatch event for reliability
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
      );
      
      log("Click event dispatched, now waiting for form to appear...");
    });
  } catch (error) {
    logError("Error in handleAddTransactionClick:", error);
    chrome.storage.local.set({ 'addTransactionClicked': false });
  }
}

function clickAddTransaction(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    log("Attempting to click 'Add Transaction' button");

    // Check if already clicked (from chrome.storage, not localStorage)
    chrome.storage.local.get(['addTransactionClicked'], (result) => {
      if (result.addTransactionClicked) {
        log("'Add Transaction' already clicked according to storage, skipping...");
        return resolve();
      }

      // Function to find the button/link
      const findAddTransactionButton = (): HTMLElement | null => {
        return (
          (Array.from(document.querySelectorAll("a, button")).find(
            (el) => el.textContent?.trim().includes("Add Transaction")
          ) as HTMLElement | null) ||
          (document.querySelector('[data-testid="add-transaction"]') as HTMLElement | null) ||
          (document.querySelector('[id*="add-transaction"]') as HTMLElement | null)
        );
      };

      let addTransactionLink: HTMLElement | null = findAddTransactionButton();

      // If button isn't found, retry after a short delay
      if (!addTransactionLink) {
        log("'Add Transaction' button not found, retrying...");

        setTimeout(() => {
          addTransactionLink = findAddTransactionButton();
          if (addTransactionLink) {
            log("Button found after retry, proceeding with click...");
            handleAddTransactionClick(addTransactionLink);
            resolve();
          } else {
            logError("Failed to find 'Add Transaction' button after retry.");
            reject(new Error("'Add Transaction' button not found"));
          }
        }, 1000); // Retry after 1 second
        return;
      }

      // Click button
      handleAddTransactionClick(addTransactionLink);
      resolve();
    });
  });
}

// Date formatting function
function formatDateForForm(dateString: string): string {
  try {
    const [year, month, day] = dateString.split('-');
    return `${month}/${day}/${year}`;
  } catch {
    const today = new Date();
    return `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
  }
}

// Wait for form elements to be available
function waitForFormElements(): Promise<{
  nameField: HTMLInputElement;
  soldDateField: HTMLInputElement;
  salesPriceField: HTMLInputElement;
  purchasePriceField: HTMLInputElement;
  submitButton: HTMLAnchorElement;
}> {
  log('Starting to wait for form elements to appear');
  
  return new Promise((resolve, reject) => {
    let attempts = 0;
    let observer: MutationObserver | null = null;
    
    const getElements = () => {
      attempts++;
      if (attempts % 10 === 0) { // Log every 10 attempts to avoid too much logging
        log(`Still waiting for form elements (attempt ${attempts})`);
      }
      
      const nameField = document.getElementById('Name') as HTMLInputElement;
      const soldDateField = document.getElementById('SoldDateString') as HTMLInputElement;
      const salesPriceField = document.getElementById('SalesPrice') as HTMLInputElement;
      const purchasePriceField = document.getElementById('PurchasePrice') as HTMLInputElement;
      const submitButton = document.querySelector('#submit') as HTMLAnchorElement;

      if (nameField && soldDateField && salesPriceField && purchasePriceField && submitButton) {
        log('All form elements found!');
        observer?.disconnect();
        resolve({
          nameField,
          soldDateField,
          salesPriceField,
          purchasePriceField,
          submitButton
        });
      }
    };

    // Try immediately first
    getElements();

    // Set up observer for dynamic content
    observer = new MutationObserver(getElements);
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      observer?.disconnect();
      log('TIMEOUT: Form elements not found within 10 seconds');
      log('Current page content:', document.body.innerHTML.substring(0, 500) + '...');
      reject(new Error('Form elements not found within timeout'));
    }, 10000);
  });
}

// Check current form state and determine if we're in the process of filling a form
async function checkCurrentPageState(): Promise<void> {
  log('Checking current page state');
  
  // Check if we're in the Add Transaction form or on the main page
  const formExists = checkFormElements();

  // Get current processing state from chrome.storage
  chrome.storage.local.get(['currentTransactionId', 'isProcessing', 'addTransactionClicked'], async (data) => {
    log('Current state from storage:', data);
    
    if (data.isProcessing) {
      log('Processing is active');
      
      if (formExists) {
        log('Form exists and processing is active - likely a page that loaded with a form ready to fill');
        
        // If we have a current transaction ID, process it
        if (data.currentTransactionId) {
          log(`Will process transaction ID: ${data.currentTransactionId}`);
          
          // Get the transaction data from background
          chrome.runtime.sendMessage({
            type: 'GET_TRANSACTION',
            transactionId: data.currentTransactionId
          }, async (response) => {
            if (response && response.transaction) {
              log('Retrieved transaction data, filling form');
              await fillAndSubmitForm(response.transaction);
            } else {
              log('Transaction not found or error retrieving it');
              // Reset processing state
              chrome.storage.local.set({
                'isProcessing': false,
                'currentTransactionId': null,
                'addTransactionClicked': false
              });
            }
          });
        } else {
          log('No transaction ID found despite processing being active');
        }
      } else if (data.addTransactionClicked) {
        log('Add Transaction was clicked but form is not visible - might be loading');
        // Leave the state as is for now, as the form might still be loading
      } else {
        log('Processing active but not in a form state - will try to resume');
        // This could be the main page after a transaction was processed
        // Reset button clicked state since we're not on a form page
        chrome.storage.local.set({ 'addTransactionClicked': false });
        
        // Notify background that we need to move to the next transaction
        chrome.runtime.sendMessage({
          type: 'TRANSACTION_PROCESSED', 
          transactionId: data.currentTransactionId,
          success: true
        }, () => {
          setTimeout(() => {
            // Start next transaction processing after a short delay
            chrome.runtime.sendMessage({ type: 'PROCESS_NEXT_TRANSACTION' });
          }, 1000);
        });
      }
    } else {
      log('No active processing');
      
      // Check if we have queued transactions that we should be processing
      chrome.runtime.sendMessage({ type: 'GET_PROCESSING_STATUS' }, (response) => {
        if (response && response.queueLength > 0) {
          log(`Found ${response.queueLength} transactions in queue, will start processing`);
          chrome.storage.local.set({ 'isProcessing': true }, () => {
            chrome.runtime.sendMessage({ type: 'PROCESS_NEXT_TRANSACTION' });
          });
        }
      });
    }
  });
}

// Fill and submit form function
async function fillAndSubmitForm(transaction: EnhancedTransaction): Promise<boolean> {
  log('Starting form fill process for transaction:', transaction.description);

  try {
    // Check if form elements already exist, otherwise wait for them
    const formExists = checkFormElements();
    if (!formExists) {
      log('Form elements not immediately found, waiting...');
    }

    log('Waiting for form elements...');
    const formElements = await waitForFormElements();
    
    log('Form elements found, starting to fill form');
    
    // Fill form fields
    formElements.nameField.value = transaction.description || 'Various';
    formElements.soldDateField.value = formatDateForForm(transaction.saleDate);
    formElements.salesPriceField.value = transaction.salesPrice.toFixed(2);
    formElements.purchasePriceField.value = transaction.costBasis.toFixed(2);

    // Trigger input events for validation
    const inputEvents = ['input', 'change', 'blur'];
    Object.values(formElements).forEach(field => {
      if (field instanceof HTMLInputElement) {
        inputEvents.forEach(eventType => {
          field.dispatchEvent(new Event(eventType, { bubbles: true }));
        });
      }
    });

    log('Form fields filled, clicking submit');

    // IMPORTANT: Before submitting, mark the transaction as pending completion
    // This will be checked when the page reloads
    await new Promise<void>(resolve => {
      chrome.storage.local.set({ 
        'pendingCompletion': true,
        'pendingTransactionId': transaction.id
      }, resolve);
    });
    
    // Now it's safe to submit the form
    formElements.submitButton.click();
    
    log('Submit button clicked, page will refresh...');
    
    // No need to wait - page will refresh
    return true;
  } catch (error) {
    logError('Error in fillAndSubmitForm:', error);
    // Reset state on error
    chrome.storage.local.set({ 
      'addTransactionClicked': false,
      'pendingCompletion': false,
      'pendingTransactionId': null
    });
    return false;
  }
}

// Initialize function - called when page loads
async function initialize() {
  log('Initializing content script');
  
  // Check if we have a pending completion from before page refresh
  chrome.storage.local.get(['pendingCompletion', 'pendingTransactionId', 'isProcessing', 'currentTransactionId'], async (data) => {
    log('Retrieved state after page load:', data);
    
    if (data.pendingCompletion && data.pendingTransactionId) {
      log(`Found pending transaction completion: ${data.pendingTransactionId}`);
      
      // Transaction was being processed and page refreshed - mark it as complete
      chrome.runtime.sendMessage({
        type: 'TRANSACTION_PROCESSED',
        transactionId: data.pendingTransactionId,
        success: true
      }, response => {
        log(`Background acknowledged completed transaction: ${response?.success}`);
        
        // Clear pending state
        chrome.storage.local.set({
          'pendingCompletion': false,
          'pendingTransactionId': null,
          'addTransactionClicked': false
        }, () => {
          // Move to next transaction after a delay
          setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'PROCESS_NEXT_TRANSACTION' });
          }, 1500);
        });
      });
    } else {
      // No pending completion, check overall page state
      await checkCurrentPageState();
    }
  });
}

// Call initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    log('DOMContentLoaded event');
    initialize();
  });
} else {
  // DOMContentLoaded has already fired
  log('Document already loaded, initializing immediately');
  initialize();
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Received message:', message);

  if (message.type === 'TEST_CONNECTION') {
    sendResponse({ success: true, url: window.location.href });
    return true;
  }
  
  if (message.type === 'PROCESS_TRANSACTION') {
    log('Received transaction to process:', message.transaction);
    
    // Store the current transaction ID for processing
    chrome.storage.local.set({
      'currentTransactionId': message.transaction.id,
      'isProcessing': true
    }, async () => {
      // Check if we already have a form showing
      if (checkFormElements()) {
        log('Form already visible, filling directly');
        await fillAndSubmitForm(message.transaction);
      } else {
        // Need to click Add Transaction button
        try {
          await clickAddTransaction();
          log('Add Transaction clicked, form should appear soon');
        } catch (error) {
          logError('Error clicking Add Transaction:', error);
          sendResponse({ success: false, error: 'Failed to find Add Transaction button' });
        }
      }
    });
    
    sendResponse({ success: true, message: 'Transaction processing initiated' });
    return true;
  }

  if (message.type === 'CLEAR_STATE') {
    chrome.storage.local.remove([
      'isProcessing', 
      'currentTransactionId', 
      'addTransactionClicked',
      'pendingCompletion',
      'pendingTransactionId'
    ], () => {
      log('State cleared');
      sendResponse({ success: true });
    });
    return true;
  }

  return false;
});

log('Content script loaded successfully');