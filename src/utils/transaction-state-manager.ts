import { TransactionTerm, TransactionType } from '../types/transactions';

// Enums for clear state management
export enum ProcessingStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  WAITING_CONFIRMATION = 'WAITING_CONFIRMATION',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export enum SubmissionResult {
  SUCCESS = 'SUCCESS',
  RETRY = 'RETRY',
  FAILED = 'FAILED'
}

// Enhanced Transaction Interface
export interface EnhancedTransaction {
  id: string;
  description: string;
  saleDate: string;
  dateAcquired?: string;
  salesPrice: number;
  costBasis: number;
  shares?: number;
  term?: TransactionTerm;
  transactionType?: TransactionType;
  processingAttempts?: number;
  lastAttemptTimestamp?: number;
  nonCovered?: boolean;
  ordinaryIncome?: boolean;
  accountNumber?: string;
  taxYear?: string;
  timestamp?: number; // Optional timestamp for tracking when transaction was added
}

// Helper function to deduplicate transactions
function deduplicateTransactions(transactions: EnhancedTransaction[]): EnhancedTransaction[] {
  console.log(`[TransactionStateManager] Deduplicating ${transactions.length} transactions`);
  
  // Create a map to track unique transactions by their key properties
  const uniqueMap = new Map<string, EnhancedTransaction>();
  
  // For each transaction, create a fingerprint and store only one instance
  transactions.forEach(transaction => {
    // Create a fingerprint combining key properties
    // Note: We round the numbers to avoid floating point comparison issues
    const salesPrice = Math.round(transaction.salesPrice * 100) / 100;
    const costBasis = Math.round(transaction.costBasis * 100) / 100;
    const fingerprint = `${transaction.description}|${transaction.saleDate}|${salesPrice}|${costBasis}`;
    
    // Only add if this fingerprint doesn't already exist
    if (!uniqueMap.has(fingerprint)) {
      uniqueMap.set(fingerprint, transaction);
    }
  });
  
  // Convert map back to array
  const deduplicated = Array.from(uniqueMap.values());
  console.log(`[TransactionStateManager] After deduplication: ${deduplicated.length} transactions`);
  
  return deduplicated;
}

// Comprehensive State Management
export class TransactionStateManager {
  private static STORAGE_KEY = 'glacierTaxHelper_transactionState';
  private static LOCK_KEY = 'glacierTaxHelper_processingLock';
  
  private static log(message: string, data?: any) {
    console.log(`[TransactionStateManager] ${message}`, data || '');
  }
  
  private static logError(message: string, error?: any) {
    console.error(`[TransactionStateManager] ERROR: ${message}`, error || '');
  }

  // Retrieve current processing state
  static async getCurrentState(): Promise<{
    status: ProcessingStatus;
    queue: EnhancedTransaction[];
    failedTransactions: EnhancedTransaction[];
  }> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.STORAGE_KEY, (result) => {
        const defaultState = {
          status: ProcessingStatus.IDLE,
          queue: [],
          failedTransactions: []
        };
        
        const state = result[this.STORAGE_KEY] || defaultState;
        this.log(`Retrieved state: status=${state.status}, queue size=${state.queue.length}, failed=${state.failedTransactions.length}`);
        
        resolve(state);
      });
    });
  }

  // Update processing state - with deduplication
  static async updateState(updates: Partial<{
    status: ProcessingStatus;
    queue: EnhancedTransaction[];
    failedTransactions: EnhancedTransaction[];
  }>): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.STORAGE_KEY, (result) => {
        const currentState = result[this.STORAGE_KEY] || {
          status: ProcessingStatus.IDLE,
          queue: [],
          failedTransactions: []
        };
        
        // If updating queue, deduplicate it first
        if (updates.queue !== undefined) {
          updates.queue = deduplicateTransactions(updates.queue);
        }
        
        const newState = { ...currentState, ...updates };
        
        // Debug logging
        if (updates.queue !== undefined) {
          this.log(`Updating queue: ${currentState.queue.length} -> ${updates.queue.length}`);
          
          if (updates.queue.length > 0) {
            this.log(`First transaction in new queue: ID=${updates.queue[0].id}, Description=${updates.queue[0].description}`);
          }
        }
        
        if (updates.status !== undefined) {
          this.log(`Updating status: ${currentState.status} -> ${updates.status}`);
        }
        
        chrome.storage.local.set({ 
          [this.STORAGE_KEY]: newState 
        }, () => {
          if (chrome.runtime.lastError) {
            this.logError('Error updating state:', chrome.runtime.lastError);
          }
          resolve();
        });
      });
    });
  }

  // Acquire processing lock
  static async acquireLock(timeout: number = 30000): Promise<boolean> {
    return new Promise((resolve) => {
      const lockTimestamp = Date.now();
      
      chrome.storage.local.get(this.LOCK_KEY, (result) => {
        const existingLock = result[this.LOCK_KEY];
        
        if (existingLock) {
          // Check if lock is stale
          if (lockTimestamp - existingLock > timeout) {
            // Release stale lock
            this.log('Found stale lock, releasing');
            this.releaseLock();
            resolve(true);
          } else {
            this.log('Could not acquire lock, already held');
            resolve(false);
          }
        } else {
          // Acquire new lock
          chrome.storage.local.set({ 
            [this.LOCK_KEY]: lockTimestamp 
          }, () => {
            this.log('Lock acquired');
            resolve(true);
          });
        }
      });
    });
  }

  // Release processing lock
  static async releaseLock(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(this.LOCK_KEY, () => {
        this.log('Lock released');
        resolve();
      });
    });
  }
  
  // Clear all state
  static async clearState(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(this.STORAGE_KEY, () => {
        this.log('State cleared');
        resolve();
      });
    });
  }
  
  // Get a transaction by ID
  static async getTransactionById(id: string): Promise<EnhancedTransaction | null> {
    const state = await this.getCurrentState();
    const transaction = state.queue.find(t => t.id === id);
    return transaction || null;
  }
  
  // Remove a transaction by ID
  static async removeTransactionById(id: string): Promise<boolean> {
    const state = await this.getCurrentState();
    const initialLength = state.queue.length;
    const updatedQueue = state.queue.filter(t => t.id !== id);
    
    if (initialLength === updatedQueue.length) {
      this.log(`Transaction ${id} not found in queue`);
      return false;
    }
    
    await this.updateState({
      queue: updatedQueue,
      status: updatedQueue.length > 0 ? state.status : ProcessingStatus.IDLE
    });
    
    this.log(`Removed transaction ${id}, new queue length: ${updatedQueue.length}`);
    return true;
  }
  
  // Add a transaction to the queue with deduplication
  static async addTransaction(transaction: EnhancedTransaction): Promise<void> {
    const state = await this.getCurrentState();
    
    // Check if this transaction already exists in the queue (by fingerprint)
    const salesPrice = Math.round(transaction.salesPrice * 100) / 100;
    const costBasis = Math.round(transaction.costBasis * 100) / 100;
    const fingerprint = `${transaction.description}|${transaction.saleDate}|${salesPrice}|${costBasis}`;
    
    const isDuplicate = state.queue.some(t => {
      const tSalesPrice = Math.round(t.salesPrice * 100) / 100;
      const tCostBasis = Math.round(t.costBasis * 100) / 100;
      const tFingerprint = `${t.description}|${t.saleDate}|${tSalesPrice}|${tCostBasis}`;
      return tFingerprint === fingerprint;
    });
    
    if (isDuplicate) {
      this.log(`Transaction ${transaction.id} appears to be a duplicate, not adding`);
      return;
    }
    
    // Add the transaction
    await this.updateState({
      queue: [...state.queue, transaction],
      status: ProcessingStatus.PROCESSING
    });
    
    this.log(`Added transaction ${transaction.id}, new queue length: ${state.queue.length + 1}`);
  }
  
  // Deduplicate the entire queue
  static async deduplicateQueue(): Promise<number> {
    const state = await this.getCurrentState();
    const originalLength = state.queue.length;
    
    if (originalLength === 0) {
      return 0;
    }
    
    const dedupedQueue = deduplicateTransactions(state.queue);
    const removedCount = originalLength - dedupedQueue.length;
    
    if (removedCount > 0) {
      await this.updateState({
        queue: dedupedQueue
      });
      this.log(`Deduplicated queue, removed ${removedCount} duplicates`);
    } else {
      this.log('No duplicates found in queue');
    }
    
    return removedCount;
  }
}