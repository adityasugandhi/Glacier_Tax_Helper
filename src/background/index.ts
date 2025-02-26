import { CSVProcessor } from '../lib/csv-processor';
import { 
  TransactionStateManager, 
  ProcessingStatus, 
  EnhancedTransaction
} from '../utils/transaction-state-manager';

// Log utility
function log(message: string, data?: any) {
  console.log(`[Glacier Tax Helper Background] ${message}`, data || '');
}

// Error logging utility
function logError(message: string, error?: any) {
  console.error(`[Glacier Tax Helper Background] ERROR: ${message}`, error || '');
}

// Helper function to deduplicate transactions at the queue level
function deduplicateQueue(queue: EnhancedTransaction[]): EnhancedTransaction[] {
  log(`Deduplicating queue of ${queue.length} transactions`);
  
  // Use the CSVProcessor deduplication logic
  return CSVProcessor.deduplicateTransactions(queue);
}

// Initialize message listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Received message:', message);

  switch (message.type) {
    case 'PROCESS_CSV':
      handleCSVProcessing(message, sendResponse);
      return true;

    case 'START_IMPORT':
      handleImportStart(message, sendResponse);
      return true;

    case 'GET_PROCESSING_STATUS':
      handleGetProcessingStatus(sendResponse);
      return true;

    case 'CLEAR_TRANSACTIONS':
      handleClearTransactions(sendResponse);
      return true;
      
    case 'TRANSACTION_PROCESSED':
      handleTransactionProcessed(message, sendResponse);
      return true;
      
    case 'VERIFY_TRANSACTION':
      handleVerifyTransaction(message, sendResponse);
      return true;
      
    case 'PROCESS_NEXT_TRANSACTION':
      handleProcessNextTransaction(sendResponse);
      return true;
      
    case 'GET_TRANSACTION':
      handleGetTransaction(message, sendResponse);
      return true;
  }

  return false;
});

// Handle CSV Processing
function handleCSVProcessing(message: any, sendResponse: (response: any) => void) {
  try {
    // Process CSV content - CSVProcessor already has deduplication built in
    const result = CSVProcessor.processCSV(message.payload.content);
    
    if (result.transactions.length > 0) {
      // Add unique identifiers and timestamp to transactions
      const enhancedTransactions: EnhancedTransaction[] = result.transactions.map(t => ({
        ...t,
        timestamp: Date.now()
      }));
      
      log(`Successfully processed ${enhancedTransactions.length} transactions`);

      // Queue transactions with deduplication
      TransactionStateManager.getCurrentState().then(state => {
        // Combine existing queue with new transactions
        const combinedQueue = [...state.queue, ...enhancedTransactions];
        
        // Deduplicate the combined queue
        const dedupedQueue = deduplicateQueue(combinedQueue);
        
        log(`Queue after deduplication: ${state.queue.length} -> ${dedupedQueue.length}`);
        
        TransactionStateManager.updateState({
          queue: dedupedQueue,
          status: ProcessingStatus.PROCESSING
        }).then(() => {
          sendResponse({
            success: true,
            count: enhancedTransactions.length,
            transactions: enhancedTransactions,
            message: 'Transactions queued successfully'
          });
        }).catch(error => {
          logError('Error updating state with new transactions', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        });
      }).catch(error => {
        logError('Error getting current state', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    } else {
      logError('No transactions found in CSV');
      sendResponse({
        success: false,
        count: 0,
        error: 'No transactions found in CSV'
      });
    }
  } catch (error) {
    logError('CSV processing failed', error);
    sendResponse({
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  return true; // Keep message channel open
}

// Handle Import Start
function handleImportStart(message: any, sendResponse: (response: any) => void) {
  // If transactions are provided in the message, queue them
  if (message.transactions && Array.isArray(message.transactions) && message.transactions.length > 0) {
    TransactionStateManager.getCurrentState().then(state => {
      // Replace or append transactions based on message flag
      const combinedQueue = message.replaceQueue ? 
        message.transactions : 
        [...state.queue, ...message.transactions];
      
      // Deduplicate the queue
      const dedupedQueue = deduplicateQueue(combinedQueue);
      
      log(`Queue after deduplication: ${combinedQueue.length} -> ${dedupedQueue.length}`);
      
      TransactionStateManager.updateState({
        queue: dedupedQueue,
        status: ProcessingStatus.PROCESSING
      }).then(() => {
        log(`Import started with ${dedupedQueue.length} transactions in queue`);
        
        // Start processing the first transaction
        processNextTransaction().then(result => {
          log(`First transaction processing initiated: ${result}`);
          
          sendResponse({
            success: true,
            message: 'Transactions queued and processing started',
            queueSize: dedupedQueue.length
          });
        });
      }).catch(error => {
        logError('Error updating state for import', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }).catch(error => {
      logError('Error getting current state for import', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  } else {
    // No transactions provided - start processing existing queue if available
    TransactionStateManager.getCurrentState().then(state => {
      if (state.queue.length > 0) {
        TransactionStateManager.updateState({
          status: ProcessingStatus.PROCESSING
        }).then(() => {
          // Start processing the first transaction
          processNextTransaction().then(result => {
            log(`First transaction processing initiated: ${result}`);
            
            sendResponse({
              success: true,
              message: 'Processing started with existing queue',
              queueSize: state.queue.length
            });
          });
        });
      } else {
        sendResponse({
          success: false,
          error: 'No transactions in queue to process'
        });
      }
    });
  }
  
  return true; // Keep message channel open
}

// Handle Get Processing Status
function handleGetProcessingStatus(sendResponse: (response: any) => void) {
  TransactionStateManager.getCurrentState().then(state => {
    sendResponse({
      success: true,
      queueLength: state.queue.length,
      failedTransactions: state.failedTransactions,
      status: state.status
    });
  }).catch(error => {
    logError('Error getting processing status', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  });
  
  return true; // Keep message channel open
}

// Handle Get Transaction by ID
function handleGetTransaction(message: any, sendResponse: (response: any) => void) {
  const { transactionId } = message;
  
  if (!transactionId) {
    sendResponse({ success: false, error: 'No transaction ID provided' });
    return;
  }
  
  TransactionStateManager.getCurrentState().then(state => {
    const transaction = state.queue.find(t => t.id === transactionId);
    
    if (transaction) {
      log(`Found transaction ${transactionId}`);
      sendResponse({
        success: true,
        transaction
      });
    } else {
      log(`Transaction ${transactionId} not found`);
      sendResponse({
        success: false,
        error: 'Transaction not found'
      });
    }
  }).catch(error => {
    logError(`Error getting transaction ${transactionId}`, error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  });
}

// Handle Clear Transactions
function handleClearTransactions(sendResponse: (response: any) => void) {
  // Clear chrome.storage.local first
  chrome.storage.local.remove([
    'isProcessing',
    'currentTransactionId',
    'addTransactionClicked',
    'pendingCompletion',
    'pendingTransactionId'
  ], () => {
    // Then clear TransactionStateManager
    TransactionStateManager.clearState().then(() => {
      sendResponse({
        success: true,
        message: 'Transactions cleared successfully'
      });
    }).catch(error => {
      logError('Error clearing transactions', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });
  
  return true; // Keep message channel open
}

// Handle Transaction Processed Message
function handleTransactionProcessed(message: any, sendResponse: (response: any) => void) {
  const { transactionId, success } = message;
  log(`Transaction ${transactionId} processed with status: ${success ? 'success' : 'failed'}`);
  
  if (success) {
    // Get the transaction first to verify it exists
    TransactionStateManager.getCurrentState().then(state => {
      const transaction = state.queue.find(t => t.id === transactionId);
      
      if (transaction) {
        log(`Found transaction ${transactionId} in queue, removing it`);
        
        // Create updated queue by filtering out the processed transaction
        const updatedQueue = state.queue.filter(t => t.id !== transactionId);
        
        TransactionStateManager.updateState({
          queue: updatedQueue,
          status: updatedQueue.length > 0 ? ProcessingStatus.PROCESSING : ProcessingStatus.COMPLETED
        }).then(() => {
          log(`Transaction ${transactionId} removed, queue now has ${updatedQueue.length} items`);
          
          // Clear the current transaction ID from chrome.storage.local
          chrome.storage.local.remove(['currentTransactionId', 'pendingCompletion', 'pendingTransactionId'], () => {
            sendResponse({ success: true });
          });
        }).catch(error => {
          logError('Error updating queue after transaction processing', error);
          sendResponse({ success: false, error: 'Error updating queue' });
        });
      } else {
        log(`Transaction ${transactionId} not found in queue`);
        // Clear the current transaction ID from chrome.storage.local even if not found
        chrome.storage.local.remove(['currentTransactionId', 'pendingCompletion', 'pendingTransactionId'], () => {
          sendResponse({ success: false, error: 'Transaction not found' });
        });
      }
    }).catch(error => {
      logError('Error getting current state', error);
      sendResponse({ success: false, error: 'Error getting current state' });
    });
  } else {
    // If processing failed, keep the transaction in queue
    log(`Transaction ${transactionId} processing failed, keeping in queue`);
    // Just clear the pending state
    chrome.storage.local.remove(['pendingCompletion', 'pendingTransactionId'], () => {
      sendResponse({ success: false });
    });
  }
  
  return true; // Keep message channel open
}

// Process the next transaction in queue
async function processNextTransaction(): Promise<boolean> {
  try {
    const state = await TransactionStateManager.getCurrentState();
    
    if (state.queue.length === 0) {
      log('No transactions in queue to process');
      return false;
    }
    
    // Get the first transaction
    const transaction = state.queue[0];
    log(`Processing next transaction: ${transaction.id} - ${transaction.description}`);
    
    // Find a Glacier Tax tab to send the transaction to
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({ url: "*://*.glaciertax.com/*" }, resolve);
    });
    
    if (tabs.length === 0) {
      log('No Glacier Tax tabs found');
      return false;
    }
    
    // Send the transaction to the content script
    const response = await new Promise<any>((resolve) => {
      chrome.tabs.sendMessage(tabs[0].id!, {
        type: 'PROCESS_TRANSACTION',
        transaction
      }, resolve);
    });
    
    return response && response.success;
  } catch (error) {
    logError('Error processing next transaction', error);
    return false;
  }
}

// Handle next transaction processing request
function handleProcessNextTransaction(sendResponse: (response: any) => void) {
  processNextTransaction().then(success => {
    sendResponse({ success });
  }).catch(error => {
    logError('Error in handleProcessNextTransaction', error);
    sendResponse({ success: false, error: 'Error processing next transaction' });
  });
  
  return true; // Keep message channel open
}

// Verify if a transaction exists in the current queue
function handleVerifyTransaction(message: any, sendResponse: (response: any) => void) {
  const { transactionId } = message;
  log(`Verifying transaction ${transactionId} exists in queue`);
  
  TransactionStateManager.getCurrentState().then(state => {
    const exists = state.queue.some(t => t.id === transactionId);
    log(`Transaction ${transactionId} ${exists ? 'found' : 'not found'} in queue`);
    sendResponse({ exists });
  }).catch(error => {
    logError(`Error verifying transaction ${transactionId}`, error);
    sendResponse({ exists: false, error: error instanceof Error ? error.message : String(error) });
  });
  
  return true; // Keep message channel open
}

// Log when background script is loaded
log('Background script loaded successfully');

// Check for incomplete transactions on extension startup
chrome.runtime.onStartup.addListener(() => {
  log('Extension startup detected');
  
  // Check if we have any pending or in-progress transactions
  chrome.storage.local.get([
    'pendingCompletion', 
    'pendingTransactionId', 
    'isProcessing', 
    'currentTransactionId'
  ], (data) => {
    log('Retrieved state on startup:', data);
    
    // If we have a pending completion, it means a transaction was submitted but the response wasn't processed
    if (data.pendingCompletion && data.pendingTransactionId) {
      log(`Found pending transaction completion: ${data.pendingTransactionId}`);
      
      // Assume the transaction completed successfully
      TransactionStateManager.getCurrentState().then(state => {
        const updatedQueue = state.queue.filter(t => t.id !== data.pendingTransactionId);
        
        TransactionStateManager.updateState({
          queue: updatedQueue,
          status: updatedQueue.length > 0 ? ProcessingStatus.PROCESSING : ProcessingStatus.COMPLETED
        }).then(() => {
          log(`Removed pending transaction ${data.pendingTransactionId} on startup`);
          
          // Clear pending state
          chrome.storage.local.remove([
            'pendingCompletion', 
            'pendingTransactionId', 
            'isProcessing', 
            'currentTransactionId'
          ]);
        });
      });
    }
    
    // Otherwise just clear any leftover processing state
    else if (data.isProcessing || data.currentTransactionId) {
      log('Clearing stale processing state on startup');
      chrome.storage.local.remove([
        'isProcessing', 
        'currentTransactionId', 
        'addTransactionClicked'
      ]);
    }
  });
});

// Perform a queue deduplication check on extension startup
chrome.runtime.onInstalled.addListener(() => {
  log('Extension installed/updated, checking for duplicate transactions in queue');
  
  TransactionStateManager.getCurrentState().then(state => {
    if (state.queue.length > 0) {
      const originalLength = state.queue.length;
      const dedupedQueue = deduplicateQueue(state.queue);
      
      if (dedupedQueue.length < originalLength) {
        log(`Found and removed ${originalLength - dedupedQueue.length} duplicate transactions`);
        
        TransactionStateManager.updateState({
          queue: dedupedQueue
        }).then(() => {
          log('Queue deduplication complete');
        });
      } else {
        log('No duplicate transactions found in queue');
      }
    }
  }).catch(error => {
    logError('Error checking for duplicates on startup', error);
  });
});