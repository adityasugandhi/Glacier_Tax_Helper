import React from 'react';
import { Coffee } from 'lucide-react';

interface CoffeeButtonProps {
  kofiUsername: string;
}

const CoffeeButton: React.FC<CoffeeButtonProps> = ({ kofiUsername }) => {
  const handleClick = () => {
    window.open(`https://ko-fi.com/${kofiUsername}`, '_blank');
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center px-4 py-2 text-sm font-medium text-white bg-[#FF5E5B] hover:bg-[#FF5145] rounded-lg shadow-sm transition-colors"
    >
      <Coffee className="w-4 h-4 mr-2" />
      Buy me a coffee
    </button>
  );
};

export default CoffeeButton;