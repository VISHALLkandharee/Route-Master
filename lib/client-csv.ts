export const MAX_CLIENT_IMPORT_ROWS = 100
export const MAX_CLIENT_IMPORT_BYTES = 1024 * 1024

export type ImportedClient = {
  full_name: string
  phone: string
  address: string
  email: string | null
  service_type: 'pet_grooming' | 'pool_cleaning' | 'auto_detailing' | 'other'
  preferred_contact: 'sms' | 'call' | 'none'
  notes: string | null
}

export type ClientCsvRow = {
  rowNumber: number
  client: ImportedClient | null
  errors: string[]
}

const SERVICE_TYPES = new Set(['pet_grooming', 'pool_cleaning', 'auto_detailing', 'other'])
const CONTACT_PREFERENCES = new Set(['sms', 'call', 'none'])

function parseCsvRecords(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field.length === 0) {
      quoted = true
    } else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      record.push(field)
      if (record.some((value) => value.trim() !== '')) records.push(record)
      record = []
      field = ''
    } else {
      field += char
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.')
  record.push(field)
  if (record.some((value) => value.trim() !== '')) records.push(record)
  return records
}

export function parseClientCsv(input: string): ClientCsvRow[] {
  const records = parseCsvRecords(input)
  if (records.length === 0) throw new Error('The CSV file is empty.')

  const headers = records[0].map((header) => header.trim().toLowerCase())
  if (headers.some((header) => !header)) throw new Error('Every CSV column needs a header.')
  const duplicateHeader = headers.find((header, index) => headers.indexOf(header) !== index)
  if (duplicateHeader) throw new Error(`The CSV has a duplicate "${duplicateHeader}" column.`)

  const required = ['full_name', 'phone', 'address']
  const missing = required.filter((header) => !headers.includes(header))
  if (missing.length) {
    throw new Error(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`)
  }

  if (records.length - 1 > MAX_CLIENT_IMPORT_ROWS) {
    throw new Error(`Import up to ${MAX_CLIENT_IMPORT_ROWS} clients at a time.`)
  }

  return records.slice(1).map((values, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, (values[column] ?? '').trim()]))
    const fullName = row.full_name ?? ''
    const phone = row.phone ?? ''
    const address = row.address ?? ''
    const email = row.email ?? ''
    const serviceType = (row.service_type || 'other').toLowerCase()
    const preferredContact = (row.preferred_contact || 'none').toLowerCase()
    const errors: string[] = values.length > headers.length
      ? [`Expected ${headers.length} columns but found ${values.length}`]
      : []

    if (fullName.length < 2) errors.push('Name must be at least 2 characters')
    if (phone.replace(/\D/g, '').length < 7) errors.push('Phone number must contain at least 7 digits')
    if (address.length < 5) errors.push('Address must be at least 5 characters')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email is invalid')
    if (!SERVICE_TYPES.has(serviceType)) errors.push('Service type is invalid')
    if (!CONTACT_PREFERENCES.has(preferredContact)) errors.push('Contact preference must be sms, call, or none')

    return {
      rowNumber: index + 2,
      errors,
      client: errors.length
        ? null
        : {
            full_name: fullName,
            phone,
            address,
            email: email || null,
            service_type: serviceType as ImportedClient['service_type'],
            preferred_contact: preferredContact as ImportedClient['preferred_contact'],
            notes: row.notes || null,
          },
    }
  })
}

export function normalizeClientEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function normalizeClientPhone(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}
