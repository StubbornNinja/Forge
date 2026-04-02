import type { ConversationSummary } from './types';

export type TimeGroupLabel = 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Previous 30 Days' | 'Older';

export interface ConversationGroup {
  label: TimeGroupLabel;
  conversations: ConversationSummary[];
}

/**
 * Groups a sorted (by updated_at DESC) list of conversations into time buckets.
 * Returns only non-empty groups in chronological order.
 */
export function groupConversationsByTime(conversations: ConversationSummary[]): ConversationGroup[] {
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(startOfToday);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const groups: Record<TimeGroupLabel, ConversationSummary[]> = {
    'Today': [],
    'Yesterday': [],
    'Previous 7 Days': [],
    'Previous 30 Days': [],
    'Older': [],
  };

  for (const conv of conversations) {
    const date = new Date(conv.updated_at);

    if (date >= startOfToday) {
      groups['Today'].push(conv);
    } else if (date >= startOfYesterday) {
      groups['Yesterday'].push(conv);
    } else if (date >= sevenDaysAgo) {
      groups['Previous 7 Days'].push(conv);
    } else if (date >= thirtyDaysAgo) {
      groups['Previous 30 Days'].push(conv);
    } else {
      groups['Older'].push(conv);
    }
  }

  const order: TimeGroupLabel[] = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, conversations: groups[label] }));
}
