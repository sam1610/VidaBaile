import { useMemo } from 'react';
import './PackageCatalogTable.css';

interface CatalogTemplate {
  packageId: string;
  name: string;
  totalCredits: number;
  price: number;
  validFrom: string;
  validUntil: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  description?: string;
}

interface PackageCatalogTableProps {
  catalogs: CatalogTemplate[];
  onEdit: (catalog: CatalogTemplate) => void;
  onDelete?: (packageId: string) => void;
  filterTab: 'all' | 'active' | 'expired';
}

const getStatusColor = (status: string): { background: string; color: string } => {
  switch (status) {
    case 'ACTIVE':
      return { background: '#e8f5e9', color: '#2e7d32' };
    case 'INACTIVE':
      return { background: '#f5f5f5', color: '#616161' };
    case 'DEPRECATED':
      return { background: '#ffebee', color: '#c62828' };
    default:
      return { background: '#f5f5f5', color: '#666' };
  }
};

const isExpired = (validUntil: string): boolean => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  return validUntil < todayStr;
};

export function PackageCatalogTable({
  catalogs,
  onEdit,
  onDelete,
  filterTab,
}: PackageCatalogTableProps) {
  // Filter catalogs based on tab selection
  const filteredCatalogs = useMemo(() => {
    let filtered = catalogs;

    if (filterTab === 'active') {
      filtered = filtered.filter(
        (c) => c.status === 'ACTIVE' && !isExpired(c.validUntil)
      );
    } else if (filterTab === 'expired') {
      filtered = filtered.filter((c) => isExpired(c.validUntil) || c.status === 'DEPRECATED');
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogs, filterTab]);

  if (filteredCatalogs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
        <div style={{ fontSize: '14px', fontWeight: '500' }}>
          No packages in this category
        </div>
      </div>
    );
  }

  return (
    <div className="catalog-table-wrapper">
      <table className="catalog-table">
        <thead>
          <tr>
            <th>Package Name</th>
            <th>Price</th>
            <th>Credits</th>
            <th>Validity</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredCatalogs.map((catalog) => {
            const expired = isExpired(catalog.validUntil);
            const statusColor = getStatusColor(
              expired ? 'DEPRECATED' : catalog.status
            );

            return (
              <tr key={catalog.packageId} style={{ opacity: expired ? 0.6 : 1 }}>
                <td style={{ minWidth: '200px' }}>
                  <div style={{ fontWeight: '600', fontSize: '12px', color: '#2e3b50' }}>
                    {catalog.name}
                  </div>
                  {catalog.description && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#999',
                        marginTop: '2px',
                      }}
                    >
                      {catalog.description.substring(0, 50)}
                      {catalog.description.length > 50 ? '...' : ''}
                    </div>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontWeight: '600', color: '#27ae60' }}>
                  ${catalog.price.toFixed(2)}
                </td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: '600', color: '#2e3b50' }}>
                  {catalog.totalCredits}
                </td>
                <td style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>
                  <div>{catalog.validFrom}</div>
                  <div style={{ marginTop: '2px' }}>{catalog.validUntil}</div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      fontWeight: '600',
                      backgroundColor: statusColor.background,
                      color: statusColor.color,
                      textTransform: 'uppercase',
                    }}
                  >
                    {expired ? 'EXPIRED' : catalog.status}
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {/* Edit Button: Pencil Icon with Transparent Background */}
                    <button
                      onClick={() => onEdit(catalog)}
                      title="Edit package"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '18px',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.2s, opacity 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.1)';
                        e.currentTarget.style.opacity = '0.8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      ✏️
                    </button>

                    {/* Delete Button */}
                    {onDelete && (
                      <button
                        onClick={() =>
                          window.confirm('Delete this package template?') &&
                          onDelete(catalog.packageId)
                        }
                        title="Delete package"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '18px',
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'transform 0.2s, opacity 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.1)';
                          e.currentTarget.style.opacity = '0.8';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.opacity = '1';
                        }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
