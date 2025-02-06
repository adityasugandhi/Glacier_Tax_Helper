import React, { useState, useRef } from 'react';
import { Upload, Settings, FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const Popup: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;
    
    if (!uploadedFile.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setFile(uploadedFile);
    setError(null);
    
    try {
      setIsProcessing(true);
      const fileContent = await uploadedFile.text();
      // Send message to background script
      chrome.runtime.sendMessage({
        type: 'PROCESS_CSV',
        payload: { content: fileContent }
      });
    } catch (err) {
      setError('Error processing file');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-96 p-4 bg-white">
      <h1 className="text-2xl font-bold mb-4">Glacier Tax Helper</h1>
      
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          
          <div className="mt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-blue-600 hover:text-blue-800"
              disabled={isProcessing}
            >
              {file ? 'Change CSV file' : 'Upload CSV file'}
            </button>
          </div>
          
          {file && (
            <div className="mt-2 text-sm text-gray-500">
              <FileText className="inline-block mr-1 h-4 w-4" />
              {file.name}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </button>

          <button
            onClick={() => {
              if (file) {
                chrome.tabs.create({
                  url: 'https://www.glaciertax.com/IRSForm/StockTransaction'
                });
              }
            }}
            disabled={!file}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Start Import
          </button>
        </div>
      </div>
    </div>
  );
};

export default Popup;