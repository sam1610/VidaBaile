import { useEffect, useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import { KPIBox } from '../home/components/KPIBox';
import { useAdminSub } from '../../hooks';
import DatabaseService from '../../services/DatabaseService';
import { PackageCatalogTable } from './PackageCatalogTable';
import { PackageCatalogModal } from './PackageCatalogModal';
import './POSPackagesTab.css';

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

/**
 * POSPackagesTab: Package catalog management
 *
 * Features:
 * - Real-time catalog subscription via observeCatalogTemplates()
 * - Create/Edit/Delete package templates
 * - Revenue analytics
 * - Filter by status (Active, Expired, All)
 */
export const POSPackagesTab = () => {
  // Fetch admin's Cognito SUB (partition key)
  const { adminSub, loading: adminLoading } = useAdminSub();

  // Catalog subscription (CATALOG entities)
  const [catalogs, setCatalogs] = useState<CatalogTemplate[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<CatalogTemplate | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Catalog filter
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'active' | 'expired'>('all');

  // Subscribe to catalog updates
  useEffect(() => {
    if (!adminSub) return;

    setCatalogLoading(true);
    const unsubscribe = DatabaseService.observeCatalogTemplates(adminSub, (data: any[]) => {
      const templates = data
        .filter((item) => item.entityType === 'CATALOG')
        .map((item) => ({
          packageId: item.packageId,
          name: item.name,
          totalCredits: item.totalCredits,
          price: item.price,
          validFrom: item.validFrom,
          validUntil: item.validUntil,
          status: item.status,
          description: item.description,
        }));
      setCatalogs(templates);
      setCatalogLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [adminSub]);

  // Calculate KPIs
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const kpis = useMemo(() => {
    const totalRevenue = catalogs.reduce((sum, c) => sum + c.price, 0);
    const activeCount = catalogs.filter((c) => c.status === 'ACTIVE' && c.validUntil >= todayStr).length;

    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0];

    const expiringCount = catalogs.filter((c) => {
      return c.status === 'ACTIVE' && c.validUntil >= todayStr && c.validUntil <= sevenDaysStr;
    }).length;

    return {
      totalRevenue: totalRevenue.toFixed(2),
      activeCount,
      totalTemplates: catalogs.length,
      expiringCount,
    };
  }, [catalogs, todayStr, today]);

  // Handle create/update modal submission
  const handleModalSubmit = async (data: any, packageId?: string) => {
    setIsSubmitting(true);
    try {
      if (packageId) {
        // Update existing
        await DatabaseService.updateCatalogTemplate(adminSub!, packageId, data);
      } else {
        // Create new
        const newPackageId = nanoid();
        await DatabaseService.createCatalogTemplate(adminSub!, newPackageId, data);
      }
      setShowModal(false);
      setEditingCatalog(undefined);
    } catch (error) {
      console.error('Error saving package:', error);
      alert(`Error saving package: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditCatalog = (catalog: CatalogTemplate) => {
    setEditingCatalog(catalog);
    setShowModal(true);
  };

  const handleCreateNew = () => {
    setEditingCatalog(undefined);
    setShowModal(true);
  };

  // Loading state
  if (adminLoading || catalogLoading) {
    return (
      <div style={{ padding: '16px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>
          💰 POS & PACKAGES
        </h2>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
          Loading package data...
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* KPIs Section */}
      <div>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '700' }}>
          💰 PACKAGE ANALYTICS
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <KPIBox
            title="Total Revenue"
            value={`$${kpis.totalRevenue}`}
            unit="Template Value"
            trend="up"
            color="success"
          />
          <KPIBox
            title="Active Packages"
            value={kpis.activeCount.toString()}
            unit="Available"
            trend="neutral"
            color="primary"
          />
          <KPIBox
            title="Total Templates"
            value={kpis.totalTemplates.toString()}
            unit="Packages"
            trend="neutral"
            color="primary"
          />
          <KPIBox
            title="Expiring This Week"
            value={kpis.expiringCount.toString()}
            unit="Packages"
            trend={kpis.expiringCount > 0 ? 'down' : 'neutral'}
            color="danger"
          />
        </div>
      </div>

      {/* Catalog Management Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: '0', fontSize: '14px', fontWeight: '700', color: '#2e3b50' }}>
            📦 PACKAGE TEMPLATES
          </h3>
          <button
            onClick={handleCreateNew}
            style={{
              padding: '6px 12px',
              background: '#2e3b50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            + New Package
          </button>
        </div>

        {/* Catalog Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {(['all', 'active', 'expired'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setCatalogFilter(tab)}
              style={{
                padding: '6px 12px',
                background: catalogFilter === tab ? '#2e3b50' : '#f0f0f0',
                color: catalogFilter === tab ? 'white' : '#666',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)} ({
                tab === 'all'
                  ? catalogs.length
                  : tab === 'active'
                    ? catalogs.filter((c) => c.status === 'ACTIVE' && c.validUntil >= todayStr).length
                    : catalogs.filter((c) => c.validUntil < todayStr || c.status === 'DEPRECATED').length
              })
            </button>
          ))}
        </div>

        {/* Catalog Table */}
        {catalogs.length === 0 ? (
          <div
            style={{
              background: '#f9f9f9',
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              padding: '40px 20px',
              textAlign: 'center',
              color: '#999',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              No package templates yet
            </div>
            <button
              onClick={handleCreateNew}
              style={{
                padding: '6px 12px',
                background: '#2e3b50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Create Your First Package
            </button>
          </div>
        ) : (
          <PackageCatalogTable
            catalogs={catalogs}
            onEdit={handleEditCatalog}
            filterTab={catalogFilter}
          />
        )}
      </div>

      {/* Modal */}
      <PackageCatalogModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingCatalog(undefined);
        }}
        onSubmit={handleModalSubmit}
        initialData={editingCatalog}
        isLoading={isSubmitting}
      />
    </div>
  );
};
