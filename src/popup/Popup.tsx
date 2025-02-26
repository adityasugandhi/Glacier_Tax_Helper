import React, { useState, useRef, useEffect } from 'react';
import { Upload } from 'lucide-react';

const Popup: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log('Popup initialized');
    
    const messageListener = (message: any) => {
      console.log('Popup received message:', message);
      
      if (message.type === 'CSV_PROCESSED') {
        setIsProcessing(false);
        if (!message.success) {
          setError(message.error || 'Error processing file');
        } else {
          setError(null);
          setProcessingStatus(`Successfully processed ${message.count} transactions`);
        }
      }
    };

    // Add listener for messages from background script
    chrome.runtime.onMessage.addListener(messageListener);

    // Cleanup listener on component unmount
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;
    
    console.log('File selected:', uploadedFile.name);
    
    if (!uploadedFile.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setFile(uploadedFile);
    setError(null);
    setProcessingStatus(null);
    setIsProcessing(true);
    
    try {
      // Read file content
      console.log('Reading file content');
      const fileContent = await uploadedFile.text();
      
      // Send to background script
      console.log('Sending PROCESS_CSV message to background script');
      chrome.runtime.sendMessage(
        {
          type: 'PROCESS_CSV',
          payload: { content: fileContent }
        },
        (response) => {
          console.log('Got response from background:', response);
          
          // Check for runtime errors
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            setError(`Failed to process file: ${chrome.runtime.lastError.message}`);
            setIsProcessing(false);
            return;
          }

          // Handle response
          if (response) {
            if (response.success) {
              setProcessingStatus(`Processed ${response.count} transactions`);
              setIsProcessing(false);
            } else {
              if (response.count === 0) {
                setError('No transactions found in the uploaded CSV file');
              } else {
                setError(response.error || 'Unknown error occurred');
              }
              setIsProcessing(false);
            }
          } else {
            setError('No response received from background script');
            setIsProcessing(false);
          }
        }
      );
    } catch (err) {
      console.error('Error reading file:', err);
      setError(`Error reading file: ${err instanceof Error ? err.message : String(err)}`);
      setIsProcessing(false);
    }
  };

  const handleStartImport = () => {
    if (!file) return;

    console.log('Start Import button clicked');
    setIsProcessing(true);
    setError(null);

    try {
      console.log('Sending START_IMPORT message to background script');
      chrome.runtime.sendMessage({ type: 'START_IMPORT' }, (response) => {
        console.log('Received response from START_IMPORT:', response);
        if (chrome.runtime.lastError) {
          console.error('Start import error:', chrome.runtime.lastError);
          setError(`Failed to start import: ${chrome.runtime.lastError.message}`);
          setIsProcessing(false);
        } else {
          setProcessingStatus('Import started. Check Glacier Tax page.');
          // Remove automatic window closing
          // window.close();
        }
      });
    } catch (err) {
      console.error('Error starting import:', err);
      setError(`Error starting import: ${err instanceof Error ? err.message : String(err)}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-96 p-4 bg-white">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Glacier Tax Helper</h1>
      </div>
      
      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded text-sm">
          <p className="font-semibold">{error}</p>
          {error.includes('No transactions found') && (
            <ul className="mt-2 text-xs list-disc list-inside">
              <li>Make sure your CSV contains 1099-B transactions</li>
              <li>The file should have sections starting with "1099-B" as the first column</li>
              <li>Check that your CSV has columns for DESCRIPTION, SALE DATE, SALES PRICE and COST BASIS</li>
              <li>Try opening the CSV in a text editor to verify its format</li>
            </ul>
          )}
        </div>
      )}

      {processingStatus && (
        <div className="mb-4 p-2 bg-green-100 text-green-700 rounded text-sm">
          {processingStatus}
        </div>
      )}

      <div className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded p-4 text-center">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 text-blue-600 hover:text-blue-800"
            disabled={isProcessing}
          >
            {file ? 'Change CSV file' : 'Upload 1099-B CSV'}
          </button>
          
          {file && (
            <div className="mt-2 text-sm text-gray-600">
              Selected: {file.name}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleStartImport}
            disabled={!file || isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? 'Processing...' : 'Start Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Popup;