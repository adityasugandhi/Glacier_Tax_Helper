import { 
  TransactionStateManager, 
  ProcessingStatus, 
  SubmissionResult, 
  EnhancedTransaction 
} from './transaction-state-manager';

export class TransactionProcessor {
  private static MAX_RETRY_ATTEMPTS = 3;
  
  private static log(message: string, data?: any) {
    console.log(`[TransactionProcessor] ${message}`, data || '');
  }
  
  private static logError(message: string, error?: any) {
    console.error(`[TransactionProcessor] ERROR: ${message}`, error || '');
  }

  // Process next transaction in the queue
  static async processNextTransaction(): Promise<SubmissionResult> {
    // Attempt to acquire processing lock
    const lockAcquired = await TransactionStateManager.acquireLock();
    if (!lockAcquired) {
      this.log('Unable to acquire processing lock');
      return SubmissionResult.RETRY;
    }

    try {
      // Retrieve current state
      const currentState = await TransactionStateManager.getCurrentState();
      
      // Check if queue is empty
      if (currentState.queue.length === 0) {
        this.log('No transactions in queue');
        return SubmissionResult.SUCCESS;
      }

      // Get the first transaction
      const transaction = currentState.queue[0];

      // Check retry attempts
      if ((transaction.processingAttempts || 0) >= this.MAX_RETRY_ATTEMPTS) {
        this.logError('Max retry attempts reached for transaction', transaction);
        
        // Move to failed transactions
        await TransactionStateManager.updateState({
          queue: currentState.queue.slice(1),
          failedTransactions: [...currentState.failedTransactions, transaction]
        });

        return SubmissionResult.FAILED;
      }

      // Attempt to submit transaction
      const submissionResult = await this.submitTransaction(transaction);

      switch (submissionResult) {
        case SubmissionResult.SUCCESS:
          // Remove processed transaction
          this.log(`SUCCESS: Removing transaction ${transaction.id} from queue`);
          this.log(`Queue before removal: ${currentState.queue.length} items`);
          const updatedQueue = currentState.queue.slice(1);
          this.log(`Queue after removal: ${updatedQueue.length} items`);
          
          await TransactionStateManager.updateState({
            queue: updatedQueue,
            status: updatedQueue.length > 0 ? ProcessingStatus.PROCESSING : ProcessingStatus.COMPLETED
          });
          return SubmissionResult.SUCCESS;

        case SubmissionResult.RETRY:
          // Update transaction with retry information
          const updatedTransaction: EnhancedTransaction = {
            ...transaction,
            processingAttempts: (transaction.processingAttempts || 0) + 1,
            lastAttemptTimestamp: Date.now()
          };

          // Requeue transaction (move to end of queue)
          await TransactionStateManager.updateState({
            queue: [
              ...currentState.queue.slice(1), 
              updatedTransaction
            ],
            status: ProcessingStatus.WAITING_CONFIRMATION
          });

          return SubmissionResult.RETRY;

        case SubmissionResult.FAILED:
          // Move to failed transactions
          await TransactionStateManager.updateState({
            queue: currentState.queue.slice(1),
            failedTransactions: [...currentState.failedTransactions, transaction],
            status: currentState.queue.length > 1 ? ProcessingStatus.PROCESSING : ProcessingStatus.ERROR
          });

          return SubmissionResult.FAILED;
      }
    } catch (error) {
      this.logError('Transaction processing error', error);
      
      // Handle unexpected errors
      await TransactionStateManager.updateState({
        status: ProcessingStatus.ERROR
      });

      return SubmissionResult.FAILED;
    } finally {
      // Always release the lock
      await TransactionStateManager.releaseLock();
    }
  }

  // Actual transaction submission logic
  private static async submitTransaction(transaction: EnhancedTransaction): Promise<SubmissionResult> {
    return new Promise((resolve) => {
      // Send message to content script to submit transaction
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'SUBMIT_TRANSACTION',
            transaction: transaction
          }, (response) => {
            if (chrome.runtime.lastError) {
              this.logError('Submission error', chrome.runtime.lastError);
              resolve(SubmissionResult.FAILED);
              return;
            }

            // Handle response from content script
            if (response && response.success) {
              resolve(SubmissionResult.SUCCESS);
            } else if (response && response.retry) {
              resolve(SubmissionResult.RETRY);
            } else {
              resolve(SubmissionResult.FAILED);
            }
          });
        } else {
          this.logError('No active tab found');
          resolve(SubmissionResult.FAILED);
        }
      });
    });
  }

  // Method to add transactions to the queue
  static async queueTransactions(transactions: EnhancedTransaction[]): Promise<void> {
    const currentState = await TransactionStateManager.getCurrentState();
    
    // Add unique identifiers to transactions if not present
    const processedTransactions = transactions.map(transaction => ({
      ...transaction,
      id: transaction.id || `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      processingAttempts: 0,
      lastAttemptTimestamp: null
    }));

    // Update state with new transactions
    await TransactionStateManager.updateState({
      queue: [
        ...currentState.queue, 
        ...processedTransactions
      ],
      status: ProcessingStatus.PROCESSING
    });

    // Trigger processing
    this.startProcessing();
  }

  // Start continuous processing
  static async startProcessing(): Promise<void> {
    const currentState = await TransactionStateManager.getCurrentState();
    
    // Prevent multiple processing instances
    if (currentState.status === ProcessingStatus.PROCESSING) {
      this.log('Processing already in progress');
      return;
    }

    // Continuous processing loop
    const processNext = async () => {
      const state = await TransactionStateManager.getCurrentState();
      
      // Stop if no more transactions
      if (state.queue.length === 0) {
        await TransactionStateManager.updateState({
          status: ProcessingStatus.IDLE
        });
        return;
      }

      // Process next transaction
      const result = await this.processNextTransaction();

      // Short delay between processing attempts
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Continue processing
      if (result !== SubmissionResult.FAILED) {
        await processNext();
      }
    };

    // Start processing
    await processNext();
  }

  // Utility method to check processing status
  static async getProcessingStatus(): Promise<{
    queueLength: number;
    failedTransactions: EnhancedTransaction[];
    status: ProcessingStatus;
  }> {
    const currentState = await TransactionStateManager.getCurrentState();
    
    return {
      queueLength: currentState.queue.length,
      failedTransactions: currentState.failedTransactions,
      status: currentState.status
    };
  }

  // Clear all transactions and reset state
  static async clearTransactions(): Promise<void> {
    await TransactionStateManager.clearState();
  }
  
  // Get a specific transaction from the queue
  static async getTransaction(id: string): Promise<EnhancedTransaction | null> {
    return TransactionStateManager.getTransactionById(id);
  }
  
  // Remove a specific transaction from the queue
  static async removeTransaction(id: string): Promise<boolean> {
    return TransactionStateManager.removeTransactionById(id);
  }
}