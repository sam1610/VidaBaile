import React, { useState } from 'react';
import { generateClient } from 'aws-amplify/data';

/**
 * Generates predictable UUIDs for relational integrity.
 * Format: entity-type-N (e.g., member-1, coach-1, schedule-1)
 */
function generateId(entity: string, index: number): string {
  return `${entity}-${index}`;
}

/**
 * Formats a date as AWS AWSDate format (YYYY-MM-DD).
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Seeds the AppSync/DynamoDB backend with mock data.
 * Creates 3 Members, 3 Coaches, 3 Schedules, 3 MemberPackages, 3 Bookings, 1 Claim.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSeedData(client: any): Promise<void> {
  const clubId = 'club-001';
  const createdMembers: Array<{ memberId: string }> = [];
  const createdCoaches: Array<{ coachId: string }> = [];
  const createdSchedules: Array<{ scheduleId: string }> = [];
  const createdPackages: Array<{ packageId: string }> = [];
  const createdBookings: Array<{ bookingId: string }> = [];

  try {
    // ─── Create 3 Members ───────────────────────────────────────────────────
    console.log('🌱 Seeding Members...');
    const memberTiers = ['STANDARD', 'SILVER', 'GOLD'] as const;
    const memberStatuses = ['ACTIVE', 'ACTIVE', 'INACTIVE'] as const;

    for (let i = 1; i <= 3; i++) {
      const memberId = generateId('member', i);
      await client.models.Member.create({
        memberId,
        clubId,
        name: `Member ${i}`,
        phone: `+1-555-000${i}`,
        email: `member${i}@vidabaile.local`,
        tier: memberTiers[i - 1],
        status: memberStatuses[i - 1],
      });
      createdMembers.push({ memberId });
      console.log(`  ✓ Created Member: ${memberId} (${memberTiers[i - 1]})`);
    }

    // ─── Create 3 Coaches ───────────────────────────────────────────────────
    console.log('🌱 Seeding Coaches...');
    const specialties = ['Salsa', 'Bachata', 'Merengue'];

    for (let i = 1; i <= 3; i++) {
      const coachId = generateId('coach', i);
      await client.models.Coach.create({
        coachId,
        name: `Coach ${i}`,
        specialty: specialties[i - 1],
        bio: `Expert dance instructor specializing in ${specialties[i - 1]}.`,
        phone: `+1-555-100${i}`,
        email: `coach${i}@vidabaile.local`,
        status: 'ACTIVE',
      });
      createdCoaches.push({ coachId });
      console.log(`  ✓ Created Coach: ${coachId} (${specialties[i - 1]})`);
    }

    // ─── Create 3 Schedules ─────────────────────────────────────────────────
    console.log('🌱 Seeding Schedules...');
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    for (let i = 1; i <= 3; i++) {
      const scheduleId = generateId('schedule', i);
      const coachId = createdCoaches[i - 1].coachId;
      const classDate = new Date(tomorrow.getTime() + (i - 1) * 24 * 60 * 60 * 1000);

      await client.models.Schedule.create({
        scheduleId,
        date: formatDate(classDate),
        startTime: '18:00:00',
        endTime: '19:30:00',
        coachId,
        facilityId: `facility-studio-${i}`,
        activityType: `${specialties[i - 1]} Class`,
        capacity: 20,
        status: 'SCHEDULED',
      });
      createdSchedules.push({ scheduleId });
      console.log(`  ✓ Created Schedule: ${scheduleId} (Coach: ${coachId})`);
    }

    // ─── Create 3 MemberPackages ────────────────────────────────────────────
    console.log('🌱 Seeding MemberPackages...');
    const packages = [
      { type: '10 Sessions', credits: 10, price: 99.99 },
      { type: '20 Sessions', credits: 20, price: 179.99 },
      { type: '30 Sessions', credits: 30, price: 249.99 },
    ];

    for (let i = 1; i <= 3; i++) {
      const packageId = generateId('package', i);
      const memberId = createdMembers[i - 1].memberId;
      const validFrom = new Date();
      const validUntil = new Date(validFrom.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

      await client.models.MemberPackage.create({
        packageId,
        memberId,
        packageType: packages[i - 1].type,
        totalCredits: packages[i - 1].credits,
        remainingCredits: packages[i - 1].credits,
        price: packages[i - 1].price,
        currency: 'USD',
        validFrom: formatDate(validFrom),
        validUntil: formatDate(validUntil),
        status: 'ACTIVE',
      });
      createdPackages.push({ packageId });
      console.log(
        `  ✓ Created MemberPackage: ${packageId} (Member: ${memberId}, ${packages[i - 1].credits} credits)`
      );
    }

    // ─── Create 3 Bookings ──────────────────────────────────────────────────
    console.log('🌱 Seeding Bookings...');

    for (let i = 1; i <= 3; i++) {
      const bookingId = generateId('booking', i);
      const memberId = createdMembers[i - 1].memberId;
      const scheduleId = createdSchedules[i - 1].scheduleId;

      await client.models.Booking.create({
        bookingId,
        memberId,
        scheduleId,
        status: 'CONFIRMED',
        bookedAt: new Date().toISOString(),
        notes: `Booking for ${memberId} at ${scheduleId}`,
      });
      createdBookings.push({ bookingId });
      console.log(
        `  ✓ Created Booking: ${bookingId} (Member: ${memberId}, Schedule: ${scheduleId})`
      );
    }

    // ─── Create 1 Claim ─────────────────────────────────────────────────────
    console.log('🌱 Seeding Claim...');
    const claimId = generateId('claim', 1);
    const booking = createdBookings[0];
    const pkg = createdPackages[0];
    const member = createdMembers[0];

    await client.models.Claim.create({
      claimId,
      bookingId: booking.bookingId,
      packageId: pkg.packageId,
      memberId: member.memberId,
      creditsConsumed: 1,
      claimedAt: new Date().toISOString(),
    });
    console.log(
      `  ✓ Created Claim: ${claimId} (Booking: ${booking.bookingId}, Package: ${pkg.packageId})`
    );

    console.log('✅ Data seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  }
}

/**
 * React component for seeding mock data.
 * Mount in a developer tab or temporary location for admin use.
 */
export const DataSeeder: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setSuccess(false);
    setError(null);

    try {
      const client = generateClient();
      await handleSeedData(client);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000); // auto-hide after 5s
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      console.error('DataSeeder error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>🌱 Data Seeder (Dev Only)</h2>
      <p style={styles.description}>
        Click below to seed 3 Members, 3 Coaches, 3 Schedules, 3 MemberPackages, 3 Bookings, and 1 Claim.
      </p>

      <button onClick={handleClick} disabled={loading} style={styles.button(loading)}>
        {loading ? 'Seeding...' : 'Seed Mock Data'}
      </button>

      {success && <div style={styles.success}>✅ Data seeded successfully!</div>}
      {error && <div style={styles.errorMsg}>{error}</div>}
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9',
    maxWidth: '500px',
    margin: '20px 0',
  },
  title: {
    margin: '0 0 10px 0',
    fontSize: '18px',
    fontWeight: '600',
  },
  description: {
    margin: '0 0 15px 0',
    fontSize: '14px',
    color: '#666',
  },
  button: (disabled: boolean) => ({
    padding: '10px 16px',
    backgroundColor: disabled ? '#ccc' : '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'background-color 0.2s',
  }),
  success: {
    marginTop: '15px',
    padding: '12px',
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
    borderRadius: '4px',
    fontSize: '14px',
  },
  errorMsg: {
    marginTop: '15px',
    padding: '12px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    borderRadius: '4px',
    fontSize: '14px',
    wordBreak: 'break-word' as const,
  },
};
