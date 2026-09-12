import { useEffect, useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import { KPIBox } from '../home/components/KPIBox';
import { useAdminSub } from '../../hooks';
import DatabaseService from '../../services/DatabaseService';
import { PackageCatalogTable } from './PackageCatalogTable';
import { PackageCatalogModal, type CatalogSubmitData } from './PackageCatalogModal';
import './POSPackagesTab.css';

interface CatalogTemplate {
  packageId: string;
  name: string;
  price: number;
  totalCredits: number;
  packageKnowledgeBase?: string;
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

  // Subscribe to catalog updates
  useEffect(() => {
    if (!adminSub) return;

    setCatalogLoading(true);
    const unsubscribe = DatabaseService.observeCatalogTemplates(adminSub, (data: any[]) => {
      const templates = data
        .filter((item) => item.entityType === 'CATALOG')
        .map((item) => ({
          packageId:            item.packageId,
          name:                 item.name,
          price:                item.price,
          totalCredits:         item.totalCredits,
          packageKnowledgeBase: item.packageKnowledgeBase,
        }));
      setCatalogs(templates);
      setCatalogLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [adminSub]);

  // KPIs
  const kpis = useMemo(() => {
    const totalRevenue = catalogs.reduce((sum, c) => sum + c.price, 0);
    return {
      totalRevenue:   totalRevenue.toFixed(2),
      totalTemplates: catalogs.length,
    };
  }, [catalogs]);

  // Handle create/update modal submission
  const handleModalSubmit = async (data: CatalogSubmitData, packageId?: string) => {
    setIsSubmitting(true);
    try {
      if (packageId) {
        await DatabaseService.updateCatalogTemplate(adminSub!, packageId, data);
      } else {
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
            title="Total Templates"
            value={kpis.totalTemplates.toString()}
            unit="Packages"
            trend="neutral"
            color="primary"
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
