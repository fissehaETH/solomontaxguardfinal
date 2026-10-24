import React from 'react';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'button' | 'banner' | 'drawer';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = () => {
  // Disabled as per user request to prevent UI congestion
  return null;
};

