export type TemplateKey = 'rent_payment' | 'water_bill' | 'maintenance_update' | 'lease_renewal'

export type TemplatePlaceholder = {
  token: string
  label: string
  description?: string
  sample?: string
}

export type TemplateMeta = {
  key: TemplateKey
  name: string
  description: string
  placeholders: TemplatePlaceholder[]
  defaultContent: string
}

export const TEMPLATE_METADATA: Record<TemplateKey, TemplateMeta> = {
  rent_payment: {
    key: 'rent_payment',
    name: 'Rent Payment Reminder',
    description: 'Reminder sent when rent invoices are due or overdue.',
    placeholders: [
      { token: '[TENANT_NAME]', label: 'Tenant name', sample: 'Jane' },
      { token: '[AMOUNT]', label: 'Rent amount', sample: 'KES 45,000' },
      { token: '[DUE_DATE]', label: 'Due date', sample: 'Mar 1, 2025' },
      { token: '[INVOICE_ID]', label: 'Invoice ID', sample: 'INV-1234' },
      { token: '[PROPERTY_NAME]', label: 'Property name', sample: 'Kilimani Heights' },
    ],
    defaultContent:
      'RES: Hello [TENANT_NAME], your rent of [AMOUNT] for [PROPERTY_NAME] is due on [DUE_DATE]. Invoice #[INVOICE_ID]. Please pay to avoid late fees.',
  },
  water_bill: {
    key: 'water_bill',
    name: 'Water Bill Reminder',
    description: 'Reminder sent with monthly water consumption totals.',
    placeholders: [
      { token: '[TENANT_NAME]', label: 'Tenant name', sample: 'Jane' },
      { token: '[UNIT_NUMBER]', label: 'Unit number', sample: '12B' },
      { token: '[PROPERTY_NAME]', label: 'Property name', sample: 'Kilimani Heights' },
      { token: '[BILL_MONTH]', label: 'Billing month', sample: 'March 2025' },
      { token: '[AMOUNT]', label: 'Bill amount', sample: 'KES 2,450' },
    ],
    defaultContent:
      'RES: Water bill for [PROPERTY_NAME] Unit [UNIT_NUMBER] - [BILL_MONTH] totals [AMOUNT]. Kindly settle via tenant portal.',
  },
  maintenance_update: {
    key: 'maintenance_update',
    name: 'Maintenance Update',
    description: 'Message notifying tenants about maintenance progress.',
    placeholders: [
      { token: '[TENANT_NAME]', label: 'Tenant name', sample: 'Jane' },
      { token: '[REQUEST_TITLE]', label: 'Request title', sample: 'Leaking tap' },
      { token: '[STATUS]', label: 'Status', sample: 'In progress' },
      { token: '[UNIT_NUMBER]', label: 'Unit number', sample: '12B' },
      { token: '[ASSIGNED_TO]', label: 'Technician/Caretaker', sample: 'David' },
    ],
    defaultContent:
      'RES: Update for maintenance request "[REQUEST_TITLE]" in Unit [UNIT_NUMBER]. Status: [STATUS]. [ASSIGNED_TO]',
  },
  lease_renewal: {
    key: 'lease_renewal',
    name: 'Lease Renewal Reminder',
    description: 'Warns tenants when their lease is approaching expiry.',
    placeholders: [
      { token: '[TENANT_NAME]', label: 'Tenant name', sample: 'Jane' },
      { token: '[UNIT_NUMBER]', label: 'Unit number', sample: '12B' },
      { token: '[PROPERTY_NAME]', label: 'Property name', sample: 'Kilimani Heights' },
      { token: '[CURRENT_END_DATE]', label: 'Current lease end date', sample: '30 Jun 2025' },
      { token: '[DAYS_REMAINING]', label: 'Days remaining', sample: '30' },
    ],
    defaultContent:
      'RES: Your lease for [PROPERTY_NAME] Unit [UNIT_NUMBER] expires on [CURRENT_END_DATE] ([DAYS_REMAINING] days left). Contact management to renew.',
  },
}

export const TEMPLATE_KEYS = Object.keys(TEMPLATE_METADATA) as TemplateKey[]
