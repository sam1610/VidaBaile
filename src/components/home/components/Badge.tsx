import React from 'react';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
  text: string;
  size?: 'small' | 'medium';
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', text, size = 'small' }) => {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    default: { bg: '#f0f0f0', fg: '#1a1a1a' },
    success: { bg: '#d4edda', fg: '#155724' },
    warning: { bg: '#fff3cd', fg: '#856404' },
    danger: { bg: '#f8d7da', fg: '#721c24' },
    info: { bg: '#d1ecf1', fg: '#0c5460' },
    primary: { bg: '#cfe2ff', fg: '#084298' },
  };

  const colors = colorMap[variant] || colorMap.default;
  const padding = size === 'small' ? '2px 6px' : '4px 8px';
  const fontSize = size === 'small' ? '11px' : '12px';

  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.fg,
        padding,
        fontSize,
        borderRadius: '3px',
        fontWeight: 600,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
};
