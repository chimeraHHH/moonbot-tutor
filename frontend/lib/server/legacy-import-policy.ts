/** Server-only gate for recovery of pre-account browser data. */
export function canOfferUnownedLegacyImport(input: {
  featureFlag: string | undefined;
  userRole: string | undefined;
}): boolean {
  return input.featureFlag === 'true' && input.userRole === 'admin';
}
