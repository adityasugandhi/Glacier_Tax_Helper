import Papa from 'papaparse';
import { StockTransaction } from '../types';

// Configuration for expected CSV columns
const defaultColumnMapping = {
  date: 'Date',
  description: 'Description',
  quantity: 'Quantity',
  proceeds: 'Proceeds',
  costBasis: 'Cost Basis',
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROCESS_CSV') {
    processCSV(message.payload.content);
  }
});

const processCSV = (csvContent: string) => {
  try {
    Papa.parse(csvContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const transactions: StockTransaction[] = results.data.map((row: any) => {
          const transaction: StockTransaction = {
            date: row[defaultColumnMapping.date],
            description: row[defaultColumnMapping.description],
            quantity: parseFloat(row[defaultColumnMapping.quantity]),
            proceeds: parseFloat(row[defaultColumnMapping.proceeds]),
            costBasis: parseFloat(row[defaultColumnMapping.costBasis]),
            gain: parseFloat(row[defaultColumnMapping.proceeds]) - parseFloat(row[defaultColumnMapping.costBasis]),
            shortTerm: isShortTerm(row[defaultColumnMapping.date])
          };
          return transaction;
        });

        // Store processed transactions
        await chrome.storage.local.set({ transactions });
        
        // Notify any open tabs
        const tabs = await chrome.tabs.query({ url: 'https://www.glaciertax.com/IRSForm/StockTransaction*' });
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'TRANSACTIONS_UPDATED' });
          }
        });
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
      }
    });
  } catch (error) {
    console.error('Error processing CSV:', error);
  }
};

const isShortTerm = (dateStr: string): boolean => {
  const saleDate = new Date(dateStr);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return saleDate > oneYearAgo;
};