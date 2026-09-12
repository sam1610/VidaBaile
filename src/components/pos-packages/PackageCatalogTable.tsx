import './PackageCatalogTable.css';

// Matches the simplified CatalogTemplate in POSPackagesTab (no dates/status)
interface CatalogTemplate {
  packageId: string;
  name: string;
  price: number;
  totalCredits: number;
  packageKnowledgeBase?: string;
}

interface PackageCatalogTableProps {
  catalogs: CatalogTemplate[];
  onEdit: (catalog: CatalogTemplate) => void;
  onDelete?: (packageId: string) => void;
}

export function PackageCatalogTable({
  catalogs,
  onEdit,
  onDelete,
}: PackageCatalogTableProps) {
  const sorted = [...catalogs].sort((a, b) => a.name.localeCompare(b.name));

  if (sorted.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
        <div style={{ fontSize: '14px', fontWeight: '500' }}>No packages yet</div>
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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(catalog => (
            <tr key={catalog.packageId}>
              <td style={{ minWidth: '200px' }}>
                <div style={{ fontWeight: '600', fontSize: '12px', color: '#2e3b50' }}>
                  {catalog.name}
                </div>
                {catalog.packageKnowledgeBase && (
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                    {catalog.packageKnowledgeBase.substring(0, 60)}
                    {catalog.packageKnowledgeBase.length > 60 ? '…' : ''}
                  </div>
                )}
              </td>
              <td style={{ whiteSpace: 'nowrap', fontWeight: '600', color: '#27ae60' }}>
                ${catalog.price.toFixed(2)}
              </td>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: '600', color: '#2e3b50' }}>
                {catalog.totalCredits}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button onClick={() => onEdit(catalog)} title="Edit package"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                             fontSize: '18px', padding: '4px 8px' }}>✏️</button>
                  {onDelete && (
                    <button
                      onClick={() => window.confirm('Delete this package?') && onDelete(catalog.packageId)}
                      title="Delete package"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                               fontSize: '18px', padding: '4px 8px' }}>🗑️</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
