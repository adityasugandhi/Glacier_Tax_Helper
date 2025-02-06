import { StockTransaction } from '../types';

const formFieldMapping = {
  date: 'input[name="saleDate"]',
  description: 'input[name="description"]',
  quantity: 'input[name="quantity"]',
  proceeds: 'input[name="proceeds"]',
  costBasis: 'input[name="costBasis"]',
  gain: 'input[name="gainLoss"]',
  shortTerm: 'select[name="term"]'
};

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSACTIONS_UPDATED') {
    loadAndFillTransactions();
  }
});

const loadAndFillTransactions = async () => {
  try {
    // Get transactions from storage
    const result = await chrome.storage.local.get('transactions');
    const transactions: StockTransaction[] = result.transactions || [];

    if (transactions.length === 0) {
      console.log('No transactions found in storage');
      return;
    }

    // Check if we're on the correct page
    if (!document.querySelector(formFieldMapping.date)) {
      console.log('Form fields not found on current page');
      return;
    }

    // Add transaction rows if needed
    await addTransactionRows(transactions.length);

    // Fill in the transactions
    fillTransactions(transactions);

  } catch (error) {
    console.error('Error loading transactions:', error);
  }
};

const addTransactionRows = async (count: number) => {
  const addButton = document.querySelector('button[data-action="add-transaction"]');
  if (!addButton) return;

  // Get current row count
  const currentRows = document.querySelectorAll('.transaction-row').length;
  const rowsNeeded = count - currentRows;

  // Add needed rows
  for (let i = 0; i < rowsNeeded; i++) {
    (addButton as HTMLButtonElement).click();
    // Wait for row to be added
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};

const fillTransactions = (transactions: StockTransaction[]) => {
  const rows = document.querySelectorAll('.transaction-row');
  
  transactions.forEach((transaction, index) => {
    const row = rows[index];
    if (!row) return;

    // Fill each field
    Object.entries(formFieldMapping).forEach(([key, selector]) => {
      const field = row.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
      if (!field) return;

      if (key === 'shortTerm') {
        (field as HTMLSelectElement).value = transaction[key] ? 'SHORT' : 'LONG';
      } else {
        (field as HTMLInputElement).value = transaction[key as keyof StockTransaction].toString();
      }

      // Trigger change event
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
};

// Check if we should start filling transactions when page loads
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.href.includes('glaciertax.com/IRSForm/StockTransaction')) {
    loadAndFillTransactions();
  }
});