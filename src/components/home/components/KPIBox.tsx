import React from 'react';

export interface KPIBoxProps {
  title: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendPercent?: number;
  icon?: React.ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'small' | 'medium';
}

export const KPIBox: React.FC<KPIBoxProps> = ({
  title,
  value,
  unit,
  trend,
  trendPercent,
  icon,
  color = 'primary',
  size = 'medium',
}) => {
  const colorMap: Record<string, string> = {
    primary: '#2e3b50',
    success: '#27ae60',
    warning: '#f39c12',
    danger: '#e74c3c',
  };

  const sizeStyles = size === 'small' ? { padding: '12px', minHeight: '80px' } : { padding: '16px', minHeight: '100px' };

  const trendColor = trend === 'up' ? '#27ae60' : trend === 'down' ? '#e74c3c' : '#95a5a6';
  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        ...sizeStyles,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <div style={{ fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon && <span style={{ fontSize: '20px' }}>{icon}</span>}
          <div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: colorMap[color], lineHeight: 1 }}>
              {value}
            </div>
            {unit && (
              <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                {unit}
              </div>
            )}
          </div>
        </div>
        {trend && (
          <div style={{ fontSize: '12px', color: trendColor, fontWeight: 600, textAlign: 'right' }}>
            {trendArrow}
            {trendPercent && ` ${trendPercent}%`}
          </div>
        )}
      </div>
    </div>
  );
};
