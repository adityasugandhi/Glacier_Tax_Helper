import { CSVProcessor } from '../lib/csv-processor';
import { EnhancedTransaction } from '../types/transactions';

// This module provides a bridge between the inject.ts script and the background script
// to handle CSV processing using the existing code

// Listen for direct CSV processing requests from inject.ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROCESS_CSV') {
    console.log('[Glacier Tax Helper] Background received direct CSV processing request from inject script');
    
    try {
      // Use the existing CSVProcessor to handle the file
      const result = CSVProcessor.processCSV(message.payload.content);
      
      if (result.transactions.length > 0) {
        console.log(`[Glacier Tax Helper] Processed ${result.transactions.length} transactions from inject script`);
        
        // Return the processed transactions to the inject script
        sendResponse({
          success: true,
          transactions: result.transactions,
          count: result.transactions.length,
          error: null
        });
      } else {
        console.log('[Glacier Tax Helper] No transactions found in CSV from inject script');
        sendResponse({
          success: false,
          count: 0,
          error: 'No transactions found in CSV'
        });
      }
    } catch (error) {
      console.error('[Glacier Tax Helper] Error processing CSV from inject script', error);
      sendResponse({
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    return true; // Keep the message channel open
  }
});

console.log('[Glacier Tax Helper] Inject-Bridge loaded');
