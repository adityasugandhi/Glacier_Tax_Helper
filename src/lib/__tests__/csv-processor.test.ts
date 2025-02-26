import { CSVProcessor } from '../csv-processor';
import * as fs from 'fs';
import * as path from 'path';

describe('CSVProcessor', () => {
  const testCSVPath = path.resolve(__dirname, '../../../../5ba2e932-5b2e-4cca-b248-1a117dd2aaaf.csv');

  it('should process Robinhood 1099-B CSV correctly', () => {
    const csvContent = fs.readFileSync(testCSVPath, 'utf8');
    const result = CSVProcessor.processRobinhoodCSV(csvContent);

    // Basic checks
    expect(result.totalTransactionsProcessed).toBeGreaterThan(0);
    expect(result.processingErrors.length).toBe(0);

    // Verify first transaction details
    const firstTransaction = result.transactions[0];
    expect(firstTransaction).toBeDefined();
    expect(firstTransaction.description).toBe('CHARGEPOINT HOLDINGS  INC.');
    expect(firstTransaction.transactionType).toBe('STOCK');
    expect(firstTransaction.shares).toBe(10.82653);
    expect(firstTransaction.term).toBe('SHORT');
  });

  it('should handle different transaction types', () => {
    const csvContent = fs.readFileSync(testCSVPath, 'utf8');
    const result = CSVProcessor.processRobinhoodCSV(csvContent);

    // Check for various transaction types
    const transactionTypes = result.transactions.map(t => t.transactionType);
    expect(transactionTypes).toContain('STOCK');
    expect(transactionTypes).toContain('OPTION');
    expect(transactionTypes).toContain('CRYPTO');
  });

  it('should correctly parse date formats', () => {
    const csvContent = fs.readFileSync(testCSVPath, 'utf8');
    const result = CSVProcessor.processRobinhoodCSV(csvContent);

    const transaction = result.transactions.find(t => t.description === 'ENPHASE ENERGY  INC. COMMON STOCK');
    expect(transaction).toBeDefined();
    expect(transaction?.dateAcquired).toBe('2024-03-28');
    expect(transaction?.saleDate).toBe('2024-03-28');
  });
});