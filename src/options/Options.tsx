import React, { useState, useEffect } from 'react';
import { Save, Upload, HelpCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ColumnMapping {
  date: string;
  description: string;
  quantity: string;
  proceeds: string;
  costBasis: string;
}

const Options: React.FC = () => {
  const [mapping, setMapping] = useState<ColumnMapping>({
    date: 'Date',
    description: 'Description',
    quantity: 'Quantity',
    proceeds: 'Proceeds',
    costBasis: 'Cost Basis',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load saved mappings
    chrome.storage.local.get('columnMapping', (result) => {
      if (result.columnMapping) {
        setMapping(result.columnMapping);
      }
    });
  }, []);

  const handleSave = async () => {
    try {
      await chrome.storage.local.set({ columnMapping: mapping });
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('Failed to save settings');
    }
  };

  const handleChange = (field: keyof ColumnMapping, value: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleImportTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const template = JSON.parse(content);
      if (validateTemplate(template)) {
        setMapping(template);
        setError(null);
      } else {
        setError('Invalid template format');
      }
    } catch (err) {
      setError('Failed to import template');
    }
  };

  const validateTemplate = (template: any): template is ColumnMapping => {
    const requiredFields = ['date', 'description', 'quantity', 'proceeds', 'costBasis'];
    return requiredFields.every(field => typeof template[field] === 'string');
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {saved && (
        <Alert className="mb-4 bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">Settings saved successfully!</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="mb-4 bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">CSV Column Mappings</h2>
            <div className="flex items-center space-x-2">
              <label className="cursor-pointer px-3 py-1 text-sm text-gray-600 hover:text-gray-800 flex items-center">
                <Upload className="w-4 h-4 mr-1" />
                Import Template
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportTemplate}
                  className="hidden"
                />
              </label>
              <button
                onClick={handleSave}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </button>
            </div>
          </div>
          
          <div className="space-y-4">
            {Object.entries(mapping).map(([key, value]) => (
              <div key={key} className="flex items-center space-x-4">
                <div className="w-1/3">
                  <label className="flex items-center text-sm font-medium text-gray-700">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                    <HelpCircle className="w-4 h-4 ml-1 text-gray-400" />
                  </label>
                </div>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleChange(key as keyof ColumnMapping, e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder={`Enter ${key} column name`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Advanced Settings</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700">
                Auto-detect columns
                <HelpCircle className="w-4 h-4 ml-1 text-gray-400" />
              </label>
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700">
                Skip header row
                <HelpCircle className="w-4 h-4 ml-1 text-gray-400" />
              </label>
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Need Help?</h3>
          <p className="text-sm text-gray-600">
            Make sure the column names match exactly with your CSV headers. For example, if your CSV has a column named "Transaction Date", enter "Transaction Date" in the Date field above.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Options;