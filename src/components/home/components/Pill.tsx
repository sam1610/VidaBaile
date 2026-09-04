import React from 'react';

export interface PillProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'small' | 'medium';
}

export const Pill: React.FC<PillProps> = ({ label, value, icon, color = 'primary', size = 'small' }) => {
  const colorMap: Record<string, string> = {
    primary: '#2e3b50',
    success: '#27ae60',
    warning: '#f39c12',
    danger: '#e74c3c',
  };

  const sizeStyles = size === 'small' ? { padding: '4px 8px', fontSize: '11px' } : { padding: '6px 12px', fontSize: '12px' };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#f5f5f5',
        borderRadius: '16px',
        border: `2px solid ${colorMap[color]}`,
        ...sizeStyles,
        fontWeight: 500,
      }}
    >
      {icon && <span style={{ fontSize: '12px' }}>{icon}</span>}
      <span style={{ color: '#666' }}>{label}:</span>
      <span style={{ color: colorMap[color], fontWeight: 700 }}>{value}</span>
    </div>
  );
};
