// Import the EnhancedTransaction interface from the shared file
import { EnhancedTransaction } from '../utils/transaction-state-manager';

// Enhanced StateManager with advanced error handling and optimization
export class StateManager {
  // Storage keys with improved namespacing
  private static STORAGE_NAMESPACE = 'glacierTaxHelper_';
  private static STORAGE_KEYS = {
    TRANSACTION_QUEUE: `${this.STORAGE_NAMESPACE}transactionQueue`,
    IS_PROCESSING: `${this.STORAGE_NAMESPACE}isProcessing`,
    BUTTON_CLICKED: `${this.STORAGE_NAMESPACE}buttonClicked`
  };

  // Configuration constants
  private static MAX_QUEUE_SIZE = 500; // Prevent excessive memory usage
  private static CACHE_DURATION = 1000 * 60 * 60 * 24; // 24-hour cache

  // Cached transaction data
  private static transactionCache: {
    data: EnhancedTransaction[];
    timestamp: number;
  } | null = null;

  // Get transaction queue with advanced error handling
  static getTransactionQueue(): EnhancedTransaction[] {
    // Check in-memory cache first
    if (this.transactionCache && 
        (Date.now() - this.transactionCache.timestamp) < this.CACHE_DURATION) {
      return this.transactionCache.data;
    }

    try {
      // Check localStorage availability
      if (!this.isLocalStorageAvailable()) {
        console.warn('localStorage not available');
        return [];
      }

      const rawQueue = localStorage.getItem(this.STORAGE_KEYS.TRANSACTION_QUEUE);
      if (!rawQueue) return [];

      // Parse and validate queue
      const parsedQueue = this.parseAndValidateQueue(rawQueue);
      
      // Update in-memory cache
      this.transactionCache = {
        data: parsedQueue,
        timestamp: Date.now()
      };

      return parsedQueue;
    } catch (error) {
      console.error('Error retrieving transaction queue:', error);
      return [];
    }
  }

  // Set transaction queue with robust validation
  static setTransactionQueue(queue: EnhancedTransaction[]): void {
    try {
      // Validate input
      if (!Array.isArray(queue)) {
        throw new Error('Invalid input: Expected array');
      }

      // Sanitize and validate each transaction
      const sanitizedQueue = queue
        .filter(this.isValidTransaction)
        .slice(0, this.MAX_QUEUE_SIZE);

      // Check localStorage availability
      if (!this.isLocalStorageAvailable()) {
        console.warn('localStorage not available');
        return;
      }

      // Store sanitized queue
      localStorage.setItem(
        this.STORAGE_KEYS.TRANSACTION_QUEUE, 
        JSON.stringify(sanitizedQueue)
      );

      // Update cache
      this.transactionCache = {
        data: sanitizedQueue,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error setting transaction queue:', error);
    }
  }

  // Processing state management
  static getIsProcessing(): boolean {
    return this.safeGetBooleanItem(this.STORAGE_KEYS.IS_PROCESSING);
  }

  static setIsProcessing(isProcessing: boolean): void {
    this.safeSaveBooleanItem(this.STORAGE_KEYS.IS_PROCESSING, isProcessing);
  }

  // Button clicked state management
  static getButtonClicked(): boolean {
    return this.safeGetBooleanItem(this.STORAGE_KEYS.BUTTON_CLICKED);
  }

  static setButtonClicked(clicked: boolean): void {
    this.safeSaveBooleanItem(this.STORAGE_KEYS.BUTTON_CLICKED, clicked);
  }

  // Automatic cleanup of stale transactions
  static cleanupStaleTransactions(): void {
    const queue = this.getTransactionQueue();
    const currentTime = Date.now();

    // Remove transactions older than 30 days
    const freshQueue = queue.filter(transaction => {
      const saleDate = new Date(transaction.saleDate).getTime();
      return (currentTime - saleDate) < (1000 * 60 * 60 * 24 * 30);
    });

    this.setTransactionQueue(freshQueue);
  }

  // Clear all extension-related states
  static clearState(): void {
    try {
      Object.values(this.STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Reset cache
      this.transactionCache = null;
    } catch (error) {
      console.error('Error clearing state:', error);
    }
  }

  // Private utility methods
  private static isLocalStorageAvailable(): boolean {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return true;
    } catch(e) {
      return false;
    }
  }

  private static isValidTransaction(transaction: any): boolean {
    return (
      transaction && 
      typeof transaction.description === 'string' &&
      typeof transaction.saleDate === 'string' &&
      typeof transaction.salesPrice === 'number' &&
      typeof transaction.costBasis === 'number'
    );
  }

  private static parseAndValidateQueue(rawQueue: string): EnhancedTransaction[] {
    try {
      const parsed = JSON.parse(rawQueue);
      
      // Ensure parsed data is an array and validate each transaction
      return Array.isArray(parsed) 
        ? parsed.filter(this.isValidTransaction)
        : [];
    } catch (error) {
      console.error('Error parsing queue:', error);
      return [];
    }
  }

  // Safe boolean storage methods
  private static safeGetBooleanItem(key: string): boolean {
    try {
      return localStorage.getItem(key) === 'true';
    } catch (error) {
      console.error(`Error getting boolean item ${key}:`, error);
      return false;
    }
  }

  private static safeSaveBooleanItem(key: string, value: boolean): void {
    try {
      localStorage.setItem(key, value.toString());
    } catch (error) {
      console.error(`Error saving boolean item ${key}:`, error);
    }
  }
}
