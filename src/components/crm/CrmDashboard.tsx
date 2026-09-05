import { useState, useEffect } from 'react';
import { Badge } from '../home/components/Badge';
import { useAdminSub } from '../../hooks';
import { isMember, type Member } from '../../lib/models';
import { observeMembers } from '../../services/DatabaseService';
import './CrmDashboard.css';

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

interface CrmDashboardProps {
  onEditMember?: (member: Member) => void;
  onViewEnrollments?: (member: Member) => void;
}

/**
 * CrmDashboard: Real-time CRM table with STD backend
 *
 * Architecture:
 * - useAdminSub() gets tenant partition key (adminSub)
 * - Auth lifecycle guard: Don't subscribe until adminSub exists
 * - DatabaseService.observeMembers() provides real-time updates
 * - Automatic cleanup on unmount
 *
 * Features:
 * - Real-time sync via AppSync subscriptions
 * - Multi-tenant isolation via pk=adminSub
 * - Sortable columns with visual indicators
 * - Icon-based actions with tooltips
 */
export const CrmDashboard = ({ onEditMember, onViewEnrollments }: CrmDashboardProps) => {
  // Fetch admin's Cognito SUB (partition key) with auth guard
  const { adminSub, loading: adminLoading, error: adminError } = useAdminSub();

  // State for members data
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // UI state
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'name',
    direction: 'asc',
  });

  /**
   * AUTH LIFECYCLE GUARD: Only subscribe when adminSub is available
   * This prevents queries like "undefined#MEMBERS"
   */
  useEffect(() => {
    // Guard: Wait for adminSub to be resolved
    if (!adminSub) {
      console.log('[CrmDashboard] Waiting for adminSub...');
      setLoading(true);
      setMembers([]);
      return;
    }

    console.log('[CrmDashboard] adminSub resolved:', adminSub);
    setLoading(true);
    setError(null);

    // Subscribe to real-time member updates
    const unsubscribe = observeMembers(adminSub, (data: Member[]) => {
      console.log('[CrmDashboard] Received member data:', data.length, 'items');
      
      // Filter by entityType and sort by name
      const filtered = data.filter(isMember).sort((a, b) => 
        (a.name || '').localeCompare(b.name || '')
      );
      
      setMembers(filtered);
      setLoading(false);
    });

    // Cleanup on unmount
    return () => {
      console.log('[CrmDashboard] Cleaning up member subscription');
      unsubscribe();
    };
  }, [adminSub]);

  // If auth is still loading, show skeleton
  if (adminLoading || !adminSub) {
    return (
      <div className="crm-dashboard-container">
        <div className="loading-skeleton">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </div>
    );
  }

  // If auth failed, show error
  if (adminError) {
    return (
      <div className="crm-dashboard-container">
        <div className="error-banner">
          Authentication error: {adminError.message}
        </div>
      </div>
    );
  }

  // If subscription failed, show error
  if (error) {
    return (
      <div className="crm-dashboard-container">
        <div className="error-banner">
          Failed to load members: {error.message}
        </div>
      </div>
    );
  }

  /**
   * Sort members by selected key
   */
  const sortedMembers = [...members].sort((a: Member, b: Member) => {
    const aVal = a[sortConfig.key as keyof Member];
    const bVal = b[sortConfig.key as keyof Member];

    if (sortConfig.key === 'createdAt') {
      try {
        const aTime = new Date(aVal as unknown as string).getTime();
        const bTime = new Date(bVal as unknown as string).getTime();
        return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime;
      } catch {
        return 0;
      }
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortConfig.direction === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });

  /**
   * Handle header click to sort
   */
  const handleHeaderClick = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  /**
   * Get badge variant for tier
   */
  const getTierBadgeVariant = (
    tier: string | null | undefined
  ): 'primary' | 'success' | 'warning' | 'danger' | 'info' => {
    const tierMap: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
      PLATINUM: 'danger',
      GOLD: 'warning',
      SILVER: 'info',
      STANDARD: 'primary',
    };
    return tierMap[tier || 'STANDARD'] || 'primary';
  };

  /**
   * Get status display
   */
  const getStatusDisplay = (
    status: string | null | undefined
  ): { icon: string; color: string } => {
    switch (status) {
      case 'ACTIVE':
        return { icon: '✓', color: '#27ae60' };
      case 'SUSPENDED':
        return { icon: '⚠', color: '#e67e22' };
      case 'INACTIVE':
      default:
        return { icon: '✕', color: '#999' };
    }
  };

  return (
    <div className="crm-dashboard-container">
      {loading && (
        <div className="loading-overlay">
          <div className="spinner">Loading members...</div>
        </div>
      )}

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th 
                className="sortable" 
                onClick={() => handleHeaderClick('name')}
                title="Click to sort"
              >
                <span className="th-content">
                  <span>Name</span>
                  {sortConfig.key === 'name' && (
                    <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </span>
              </th>
              <th 
                className="sortable" 
                onClick={() => handleHeaderClick('phone')}
                title="Click to sort"
              >
                <span className="th-content">
                  <span>Phone</span>
                  {sortConfig.key === 'phone' && (
                    <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </span>
              </th>
              <th 
                className="sortable" 
                onClick={() => handleHeaderClick('tier')}
                title="Click to sort"
              >
                <span className="th-content">
                  <span>Tier</span>
                  {sortConfig.key === 'tier' && (
                    <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </span>
              </th>
              <th 
                className="sortable" 
                onClick={() => handleHeaderClick('status')}
                title="Click to sort"
              >
                <span className="th-content">
                  <span>Status</span>
                  {sortConfig.key === 'status' && (
                    <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </span>
              </th>
              <th 
                className="sortable" 
                onClick={() => handleHeaderClick('createdAt')}
                title="Click to sort"
              >
                <span className="th-content">
                  <span>Joined</span>
                  {sortConfig.key === 'createdAt' && (
                    <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </span>
              </th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedMembers.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={6} className="empty-state">
                  No members found. Add your first member to get started.
                </td>
              </tr>
            ) : (
              sortedMembers.map((member) => {
                const statusDisplay = getStatusDisplay(member.status);
                return (
                  <tr 
                    key={member.phone} 
                    className="data-row cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => onViewEnrollments?.(member)}
                  >
                    <td className="cell-name">{member.name || '—'}</td>
                    <td className="cell-phone">{member.phone || '—'}</td>
                    <td className="cell-tier">
                      <Badge 
                        variant={getTierBadgeVariant(member.tier)}
                        text={member.tier || 'STANDARD'}
                      />
                    </td>
                    <td className="cell-status">
                      <span className="status-badge" style={{ color: statusDisplay.color }}>
                        <span className="status-icon">{statusDisplay.icon}</span>
                        {member.status || 'INACTIVE'}
                      </span>
                    </td>
                    <td className="cell-date">{formatDate(member.createdAt)}</td>
                    <td className="cell-actions">
                      <button
                        className="icon-button edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditMember?.(member);
                        }}
                        title="Edit member"
                        aria-label={`Edit ${member.name}`}
                        style={{ display: 'inline-flex' }}
                      >
                        ✏️
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
