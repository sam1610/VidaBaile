import { getCurrentUser, fetchUserAttributes } from 'aws-amplify/auth';

/**
 * Retrieves the current admin user's Cognito SUB
 * Used as the pk field for all DynamoDB operations
 *
 * @returns The admin's Cognito SUB or null if not authenticated
 */
export async function getAdminSub(): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    if (!user || !user.userId) {
      console.error('No authenticated user found');
      return null;
    }
    return user.userId;
  } catch (err) {
    console.error('Failed to get current user:', err);
    return null;
  }
}

/**
 * Retrieves the current admin user's email
 * @returns The admin's email or null if not available
 */
export async function getAdminEmail(): Promise<string | null> {
  try {
    const attributes = await fetchUserAttributes();
    return attributes.email || null;
  } catch (err) {
    console.error('Failed to fetch user attributes:', err);
    return null;
  }
}

/**
 * Formats a phone number into the sk field format
 * @param phone The phone number
 * @returns Formatted sk: "PHONE#<phone>"
 */
export function formatPhoneSk(phone: string): string {
  return `PHONE#${phone}`;
}

/**
 * Extracts phone from sk field
 * @param sk The sort key in format "PHONE#<phone>"
 * @returns The phone number
 */
export function extractPhoneFromSk(sk: string): string {
  return sk.replace(/^PHONE#/, '');
}
