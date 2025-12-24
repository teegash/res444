export function unsignedRenewalPath(orgId: string, leaseId: string, renewalId: string) {
  return `org/${orgId}/lease/${leaseId}/renewal/${renewalId}/unsigned.pdf`
}

export function tenantSignedPathFromUnsigned(unsignedPath: string) {
  return unsignedPath.replace('/unsigned.pdf', '/tenant_signed.pdf')
}

export function fullySignedPathFromTenant(tenantSignedPath: string) {
  return tenantSignedPath.replace('/tenant_signed.pdf', '/fully_signed.pdf')
}

