import { useState, useEffect } from 'react';
import { useAdminSub } from '../../hooks';
import { queryBookingsByMember } from '../../services/DatabaseService';
import type { Member } from '../../lib/models';


interface Coach {
  phone: string;
  name: string;
}

interface Booking {
  bookingId: string;
  scheduleId: string;
  coachPhone: string;
  memberPhone: string;
  phone?: string;
  packageId?: string;  // present on Campaign/WhatsApp bookings
  bookedAt: string;
  // Denormalized schedule data (matches schema field names)
  activityType?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
}

interface MemberEnrollmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  
  coaches: Coach[];
}

/**
 * Helper function to determine activity temporal status
 */
/**
 * Format date string to DD-MM-YYYY
 */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    // Handle YYYY-MM-DD format directly (booking.date format)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-');
      return `${day}-${month}-${year}`;
    }
    
    // Handle ISO datetime format
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr;
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).split('/').reverse().join('-'); // Convert MM/DD/YYYY to DD-MM-YYYY
  } catch {
    return dateStr;
  }
}

function getActivityStatus(scheduleDate: string | undefined, endTime: string | undefined): 'PAST' | 'CURRENT' | 'FUTURE' {
  if (!scheduleDate) return 'FUTURE';

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const scheduleDateTime = new Date(`${scheduleDate}T${endTime || '23:59:00'}`);
  const now = new Date();

  if (scheduleDateTime < now) {
    return 'PAST';
  } else if (scheduleDate === todayStr) {
    return 'CURRENT';
  } else {
    return 'FUTURE';
  }
}

/**
 * Get Tailwind CSS classes for row coloring based on temporal status
 */
function getRowColorClass(status: 'PAST' | 'CURRENT' | 'FUTURE'): string {
  switch (status) {
    case 'PAST':
      return 'bg-gray-100 text-gray-500';
    case 'CURRENT':
      return 'bg-emerald-50 text-emerald-900 border-l-4 border-emerald-500 font-medium';
    case 'FUTURE':
      return 'bg-blue-50 text-blue-900';
  }
}


export function MemberEnrollmentsModal({
  isOpen,
  onClose,
  member,
  
  coaches,
}: MemberEnrollmentsModalProps) {
  const { adminSub } = useAdminSub();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Date range filter — default: first→last day of current month
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  });

  /**
   * Query bookings when member changes or modal opens
   */
  useEffect(() => {
    if (!isOpen || !member || !adminSub) {
      setBookings([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    queryBookingsByMember(adminSub, member.phone || '')
      .then((data) => {
        setBookings(data);
        setIsLoading(false);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load bookings';
        console.error('Error loading bookings:', err);
        setError(message);
        setIsLoading(false);
      });
  }, [isOpen, member, adminSub]);

  if (!isOpen || !member) {
    return null;
  }

  // In-memory date range filter — only show rows where booking.date is within range
  const filteredBookings = bookings.filter((b) => {
    if (!b.date) return true; // no date = include (don't hide it)
    return b.date >= startDate && b.date <= endDate;
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          maxWidth: '800px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            textAlign: 'center',
            color: '#2e3b50',
            margin: '0 0 8px 0',
          }}>
            {member.name}
          </h2>
          <p style={{
            textAlign: 'center',
            color: '#999',
            fontSize: '12px',
            margin: '0',
          }}>
            Activity Enrollment History
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#999',
          }}
        >
          ✕
        </button>

        {/* Loading State */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
            Loading activity history...
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={{
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '16px',
            color: '#c33',
            fontSize: '12px',
          }}>
            {error}
          </div>
        )}

        {/* Date Range Picker */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
          />
          <label style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>To:</label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
          />
          <span style={{ fontSize: '11px', color: '#999' }}>
            {filteredBookings.length} session{filteredBookings.length !== 1 ? 's' : ''} in range
          </span>
        </div>

        {/* Empty State */}
        {!isLoading && filteredBookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
            <div style={{ fontSize: '14px', fontWeight: '500' }}>
              No activity enrollments found
            </div>
          </div>
        )}

        {/* Table */}
        {!isLoading && filteredBookings.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12px',
            }}>
              <thead>
                <tr style={{
                  backgroundColor: '#f5f5f5',
                  borderBottom: '2px solid #e0e0e0',
                }}>
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#2e3b50',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                  }}>
                    Activity
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#2e3b50',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                  }}>
                    Activity / Enrollment
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#2e3b50',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                  }}>
                    Coach
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#2e3b50',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                  }}>
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((booking) => {
                  const coach = coaches.find(c => c.phone === booking.coachPhone);
                  
                  // Get activity info from booking (denormalized data)
                  const activityType = booking.activityType || 'Pending Assignment';
                  const bookedDate = booking.bookedAt ? formatDate(booking.bookedAt) : '—';
                  
                  // Build timing string
                  // Note: automated bookings may have date/time but no bookedAt, so
                  // we only require date + startTime to show a useful time string.
                  let timingStr = '—';
                  if (booking.date && booking.startTime) {
                    const sDate = formatDate(booking.date);
                    const endPart = booking.endTime ? ` - ${booking.endTime}` : '';
                    const bookedPart = booking.bookedAt ? ` / ${bookedDate}` : '';
                    timingStr = `${sDate}: ${booking.startTime}${endPart}${bookedPart}`;
                  }
                  
                  // Determine status and color for temporal indication
                  const status = getActivityStatus(booking.date, booking.endTime);
                  const rowColorClass = getRowColorClass(status);

                  return (
                    <tr
                      key={booking.bookingId}
                      style={{
                        borderBottom: '1px solid #f0f0f0',
                        transition: 'background 0.2s',
                      }}
                      className={rowColorClass}
                    >
                      <td style={{ padding: '12px', verticalAlign: 'middle', whiteSpace: 'nowrap', minWidth: '120px' }}>
                        {activityType}
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'middle', whiteSpace: 'nowrap', minWidth: '220px' }}>
                        {timingStr}
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'middle', whiteSpace: 'nowrap', minWidth: '100px' }}>
                        {coach?.name || '—'}
                      </td>
                      <td style={{ padding: '12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {booking.packageId ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 7px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: '700',
                            letterSpacing: '0.03em',
                            background: '#e3f2fd',
                            border: '1px solid #90caf9',
                            color: '#1565c0',
                            whiteSpace: 'nowrap',
                          }}>
                            Campaign Package
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 7px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: '700',
                            letterSpacing: '0.03em',
                            background: '#f5f5f5',
                            border: '1px solid #ddd',
                            color: '#777',
                            whiteSpace: 'nowrap',
                          }}>
                            Standard Booking
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
