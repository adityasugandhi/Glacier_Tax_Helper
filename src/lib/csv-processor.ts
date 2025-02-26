import Papa from 'papaparse';
import { EnhancedTransaction } from '../utils/transaction-state-manager';
import { TransactionTerm, TransactionType, CSVProcessingResult } from '../types/transactions';

export class CSVProcessor {
  // Helper function to deduplicate transactions
  static deduplicateTransactions(transactions: EnhancedTransaction[]): EnhancedTransaction[] {
    console.log(`Deduplicating ${transactions.length} transactions`);
    
    // Create a map to track unique transactions by their key properties
    const uniqueMap = new Map<string, EnhancedTransaction>();
    
    // For each transaction, create a fingerprint and store only one instance
    transactions.forEach(transaction => {
      // Create a fingerprint combining key properties
      // Note: We round the numbers to avoid floating point comparison issues
      const salesPrice = Math.round(transaction.salesPrice * 100) / 100;
      const costBasis = Math.round(transaction.costBasis * 100) / 100;
      const fingerprint = `${transaction.description}|${transaction.saleDate}|${salesPrice}|${costBasis}`;
      
      console.log(`Transaction fingerprint: ${fingerprint}`);
      
      // Only add if this fingerprint doesn't already exist
      if (!uniqueMap.has(fingerprint)) {
        uniqueMap.set(fingerprint, transaction);
      } else {
        console.log(`Duplicate found: ${fingerprint}`);
      }
    });
    
    // Convert map back to array
    const deduplicated = Array.from(uniqueMap.values());
    console.log(`After deduplication: ${deduplicated.length} transactions`);
    
    return deduplicated;
  }

  // Process CSV and convert to Enhanced Transactions (main method used by background script)
  static processCSV(content: string): { 
    transactions: EnhancedTransaction[] 
  } {
    try {
      // First try to process it as a Robinhood CSV
      const robinhoodResult = this.processRobinhoodCSV(content);
      if (robinhoodResult.transactions.length > 0) {
        // Deduplicate before returning
        return { transactions: this.deduplicateTransactions(robinhoodResult.transactions) };
      }
      
      // If Robinhood parsing didn't find any transactions, try the generic method
      const genericResult = this.processGenericCSV(content);
      return { transactions: this.deduplicateTransactions(genericResult.transactions) };
    } catch (error) {
      console.error('CSV Processing Error:', error);
      console.error('Error details:', {
        errorName: error?.name || 'Unknown error',
        errorMessage: error?.message || 'No error message available',
        errorStack: error?.stack || 'No stack trace available'
      });
      throw new Error(`Failed to process CSV: ${error?.message || 'Unknown error'}`);
    }
  }
  
  // Process Robinhood 1099-B CSV format
  static processRobinhoodCSV(content: string): CSVProcessingResult {
    try {
      // First, parse the CSV without headers to find the 1099-B header row
      const initialParse = Papa.parse(content, {
        header: false,
        dynamicTyping: true,
        skipEmptyLines: true
      });
      
      console.log('Initial Parse:', {
        rowCount: initialParse.data.length,
        firstFewRows: initialParse.data.slice(0, 5)
      });
      
      // Find the 1099-B header row index
      let b1099HeaderIndex = -1;
      for (let i = 0; i < initialParse.data.length; i++) {
        const row = initialParse.data[i];
        if (Array.isArray(row) && 
            row.length > 1 && 
            row[0] === '1099-B' && 
            row[1] === 'ACCOUNT NUMBER') {
          b1099HeaderIndex = i;
          console.log('Found 1099-B header at row', i);
          break;
        }
      }
      
      if (b1099HeaderIndex === -1) {
        console.error('No 1099-B header row found in CSV');
        return { transactions: [], processingErrors: ['No 1099-B header found'], totalTransactionsProcessed: 0 };
      }
      
      // Get the headers from the 1099-B header row
      const headers = initialParse.data[b1099HeaderIndex].map(String);
      
      // Find all 1099-B transaction rows (rows after the header that start with 1099-B)
      const transactionRows = [];
      for (let i = b1099HeaderIndex + 1; i < initialParse.data.length; i++) {
        const row = initialParse.data[i];
        if (Array.isArray(row) && row.length > 0) {
          // Check for 1099-B transactions with any variant
          const firstCol = String(row[0] || '').trim();
          if (firstCol === '1099-B' || firstCol === '1099-BC' || firstCol.startsWith('1099-B')) {
            // Map the row values to column headers
            const transaction: any = {};
            for (let j = 0; j < headers.length; j++) {
              if (headers[j] && row[j] !== undefined) {
                transaction[headers[j]] = row[j];
              }
            }
            
            // Special handling for crypto - detect by account number suffix 'C'
            const accountNum = String(transaction['ACCOUNT NUMBER'] || '');
            if (accountNum.endsWith('C')) {
              console.log(`Detected crypto transaction with account ${accountNum}:`, transaction['DESCRIPTION']);
            }
            
            transactionRows.push(transaction);
          } else if (row?.[0] && String(row[0]) !== '1099-B' && row?.[1] === 'ACCOUNT NUMBER') {
            // We've reached a new document type header, stop processing
            break;
          }
        }
      }
      
      console.log('Found 1099-B transactions:', transactionRows.length);
      if (transactionRows.length > 0) {
        console.log('Sample transaction:', transactionRows[0]);
      }
      
      // Filter transactions that have all required fields
      const b1099Transactions = transactionRows.filter((row: any) => {
        const hasDescription = !!row['DESCRIPTION'];
        const hasSaleDate = !!row['SALE DATE'];
        
        // More permissive price check - even zero or negative values are allowed
        // This is important because some options can have zero cost basis
        const salesPrice = parseFloat(String(row['SALES PRICE'] || '0'));
        const costBasis = parseFloat(String(row['COST BASIS'] || '0'));
        const hasPrice = !isNaN(salesPrice) || !isNaN(costBasis);
        
        // Log detailed filtering info
        console.log('Transaction filter check:', {
          description: row['DESCRIPTION'],
          hasDescription,
          hasSaleDate,
          hasPrice,
          salesPrice,
          costBasis,
          isIncluded: hasDescription && hasSaleDate && hasPrice
        });
        
        // Include transaction if it has description, sale date, and any price values (even zero)
        return hasDescription && hasSaleDate && hasPrice;
      });
      
      console.log('Filtered 1099-B Transactions:', b1099Transactions.length);

      // Transform rows into EnhancedTransaction
      const transactions: EnhancedTransaction[] = [];
      const processingErrors: string[] = [];
      
      for (const row of b1099Transactions) {
        try {
          const transaction: EnhancedTransaction = {
            id: `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            description: String(row['DESCRIPTION'] || ''),
            saleDate: this.formatSaleDate(row['SALE DATE']),
            salesPrice: parseFloat(String(row['SALES PRICE'] || '0')),
            costBasis: parseFloat(String(row['COST BASIS'] || '0')),
            shares: parseFloat(String(row['SHARES'] || '0')),
            term: String(row['TERM'] || 'SHORT') as TransactionTerm,
            dateAcquired: row['DATE ACQUIRED'] ? this.formatSaleDate(row['DATE ACQUIRED']) : undefined,
            transactionType: this.determineTransactionType(String(row['DESCRIPTION'] || '')),
            processingAttempts: 0,
            nonCovered: row['NON COVERED'] === '1' || row['NON COVERED'] === true,
            ordinaryIncome: row['ORDINARY'] === 'Y' || row['ORDINARY'] === true,
            accountNumber: row['ACCOUNT NUMBER'] ? String(row['ACCOUNT NUMBER']) : undefined
          };
          
          transactions.push(transaction);
        } catch (err) {
          const errorMsg = `Error processing row: ${JSON.stringify(row)}: ${err}`;
          console.error(errorMsg);
          processingErrors.push(errorMsg);
          // Continue processing other rows
        }
      }

      console.log('Processed Transactions (before deduplication):', {
        count: transactions.length,
        firstTransaction: transactions.length > 0 ? transactions[0] : 'No transactions found'
      });

      // If no transactions found, provide helpful error message
      if (transactions.length === 0) {
        console.warn('No valid 1099-B transactions found in the CSV file');
        console.log('CSV Structure:', {
          rowCount: initialParse.data.length,
          headerRowFound: b1099HeaderIndex !== -1,
          possibleHeaderRow: b1099HeaderIndex !== -1 ? initialParse.data[b1099HeaderIndex] : 'None found',
          transactionRowsFound: transactionRows.length
        });
        processingErrors.push('No valid transactions found in the CSV');
      }

      return { 
        transactions, 
        processingErrors, 
        totalTransactionsProcessed: transactions.length 
      };
    } catch (error) {
      console.error('Error processing Robinhood CSV:', error);
      return { 
        transactions: [], 
        processingErrors: [`Failed to process Robinhood CSV: ${error?.message || 'Unknown error'}`], 
        totalTransactionsProcessed: 0 
      };
    }
  }
  
  // Process generic CSV format
  static processGenericCSV(content: string): { transactions: EnhancedTransaction[] } {
    try {
      const parseResult = Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toUpperCase()
      });
      
      console.log('Generic CSV Parse Results:', {
        fields: parseResult.meta.fields,
        rowCount: parseResult.data.length
      });
      
      if (!parseResult.meta.fields || parseResult.meta.fields.length === 0) {
        console.error('No headers found in generic CSV');
        return { transactions: [] };
      }
      
      // Map expected field names from various formats
      const fieldMappings: Record<string, string[]> = {
        'description': ['DESCRIPTION', 'NAME', 'SECURITY', 'STOCK', 'SYMBOL', 'SECURITY NAME'],
        'saleDate': ['SALE DATE', 'SOLD', 'DATE SOLD', 'SOLD DATE', 'SETTLEMENT DATE'],
        'dateAcquired': ['DATE ACQUIRED', 'ACQUIRED', 'PURCHASE DATE', 'DATE PURCHASED', 'ACQUIRED DATE'],
        'salesPrice': ['SALES PRICE', 'PROCEEDS', 'GROSS PROCEEDS', 'AMOUNT', 'SALE AMOUNT', 'SOLD AMOUNT'],
        'costBasis': ['COST BASIS', 'COST', 'BASIS', 'PURCHASE PRICE', 'AMOUNT PAID'],
        'shares': ['SHARES', 'QUANTITY', 'QTY', 'NUMBER OF SHARES']
      };
      
      // Find the actual field names in the CSV
      const fieldMap: Record<string, string> = {};
      for (const [targetField, possibleNames] of Object.entries(fieldMappings)) {
        for (const name of possibleNames) {
          if (parseResult.meta.fields?.includes(name)) {
            fieldMap[targetField] = name;
            break;
          }
        }
      }
      
      console.log('Field mapping:', fieldMap);
      
      // Check if we have the minimum required fields
      if (!fieldMap.description || !fieldMap.saleDate || 
          (!fieldMap.salesPrice && !fieldMap.costBasis)) {
        console.error('Missing required fields in generic CSV');
        return { transactions: [] };
      }
      
      // Convert rows to transactions
      const transactions: EnhancedTransaction[] = [];
      
      for (const row of parseResult.data) {
        try {
          // Skip empty rows
          if (Object.keys(row).length === 0) continue;
          
          const description = String(row[fieldMap.description] || '');
          if (!description) continue; // Skip rows without descriptions
          
          const salesPrice = fieldMap.salesPrice ? 
            parseFloat(String(row[fieldMap.salesPrice] || '0')) : 0;
          const costBasis = fieldMap.costBasis ? 
            parseFloat(String(row[fieldMap.costBasis] || '0')) : 0;
          
          // Skip if both sales price and cost basis are zero/invalid
          if (salesPrice === 0 && costBasis === 0) continue;
          
          const shares = fieldMap.shares ? 
            parseFloat(String(row[fieldMap.shares] || '0')) : 0;
          
          // Create transaction
          const transaction: EnhancedTransaction = {
            id: `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            description,
            saleDate: this.formatSaleDate(row[fieldMap.saleDate]),
            salesPrice,
            costBasis,
            shares,
            transactionType: this.determineTransactionType(description),
            term: 'SHORT' as TransactionTerm,  // Default to SHORT term
            dateAcquired: fieldMap.dateAcquired ? 
              this.formatSaleDate(row[fieldMap.dateAcquired]) : undefined,
            processingAttempts: 0
          };
          
          transactions.push(transaction);
        } catch (err) {
          console.error('Error processing generic CSV row:', err, row);
          // Continue with next row
        }
      }
      
      console.log(`Processed ${transactions.length} transactions from generic CSV (before deduplication)`);
      return { transactions };
    } catch (error) {
      console.error('Error processing generic CSV:', error);
      return { transactions: [] };
    }
  }

  // Helper to format sale date
  private static formatSaleDate(dateString: string | number | null | undefined): string {
    // Handle null, undefined, or non-string/number values
    if (dateString === null || dateString === undefined) {
      return new Date().toISOString().split('T')[0];
    }
    
    // Convert to string if it's a number or other type
    const dateStr = String(dateString).trim();
    
    if (!dateStr) {
      return new Date().toISOString().split('T')[0];
    }
    
    try {
      // Handle YYYYMMDD format
      if (/^\d{8}$/.test(dateStr)) {
        return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
      
      // Handle MM/DD/YYYY format
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const parts = dateStr.split('/');
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }

      // Try parsing with Date object
      const parsedDate = new Date(dateStr);
      
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().split('T')[0];
      }
      
      console.warn(`Could not parse date: ${dateStr}, using current date instead`);
      return new Date().toISOString().split('T')[0];
    } catch (err) {
      console.error('Error formatting date:', err);
      return new Date().toISOString().split('T')[0];
    }
  }
  
  // Helper to determine transaction type
  private static determineTransactionType(description: string | null | undefined): TransactionType {
    // Handle null, undefined, or empty strings
    if (!description) return 'OTHER';
    
    try {
      const descriptionUpper = String(description).toUpperCase();
      console.log(`Determining type for: ${description}`);
      
      // Check for options
      if (descriptionUpper.includes(' CALL ') || descriptionUpper.includes(' PUT ')) {
        console.log(`Classified as OPTION: ${description}`);
        return 'OPTION';
      }
      
      // Check for common crypto currencies - expanded list
      const cryptoKeywords = [
        'BITCOIN', 'BTC', 'ETHEREUM', 'ETH', 'LITECOIN', 'LTC', 
        'DOGECOIN', 'DOGE', 'COMPOUND', 'CHAINLINK', 'CRYPTO', 
        'COIN', 'USDC', 'USDT', 'XRP', 'SOL', 'SOLANA',
        'BINANCE', 'BNB', 'RIPPLE', 'STELLAR', 'XLM', 'ADA',
        'CARDANO', 'DOT', 'POLKADOT', 'SHIB', 'MATIC', 'POLYGON'
      ];
      
      for (const keyword of cryptoKeywords) {
        if (descriptionUpper.includes(keyword)) {
          console.log(`Classified as CRYPTO: ${description}`);
          return 'CRYPTO';
        }
      }
      
      // Check for account identifiers that might indicate crypto
      if (description.endsWith('C') || /\d+C$/.test(description)) {
        console.log(`Classified as CRYPTO due to account suffix C: ${description}`);
        return 'CRYPTO';
      }
      
      // Default to stock
      console.log(`Classified as STOCK: ${description}`);
      return 'STOCK';
    } catch (err) {
      console.error('Error determining transaction type:', err);
      return 'OTHER';
    }
  }
}