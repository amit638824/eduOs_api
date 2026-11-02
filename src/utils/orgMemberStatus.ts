/** Status change applied to every member when an organization is suspended or reactivated. */
export function orgMemberStatusSync(isActive: boolean): { from: string[]; to: string } {
  if (isActive) return { from: ['pending', 'suspended'], to: 'active' };
  return { from: ['active', 'pending'], to: 'suspended' };
}
