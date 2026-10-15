import { MAX_CLIENT_IMPORT_ROWS, normalizeClientEmail, normalizeClientPhone, parseClientCsv } from '@/lib/client-csv'

describe('parseClientCsv', () => {
  it('parses quoted commas, escaped quotes, and line breaks', () => {
    const rows = parseClientCsv(
      'full_name,phone,address,notes\n"Jordan, Lee",+15551234567,"125 Main St, Springfield","Gate says ""use side door""\ncall first"',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].client).toMatchObject({
      full_name: 'Jordan, Lee',
      address: '125 Main St, Springfield',
      notes: 'Gate says "use side door"\ncall first',
      preferred_contact: 'none',
      service_type: 'other',
    })
  })

  it('rejects missing required columns and unclosed quotes', () => {
    expect(() => parseClientCsv('full_name,phone\nJordan,+15551234567')).toThrow('Missing required column: address.')
    expect(() => parseClientCsv('full_name,phone,address\n"Jordan,+15551234567,Somewhere')).toThrow('unclosed quoted field')
  })

  it('marks invalid row values without discarding valid rows', () => {
    const rows = parseClientCsv(
      'full_name,phone,address,email,service_type,preferred_contact\nJordan,+15551234567,125 Main St,,pool_cleaning,none\nA,123,Nope,bad,invalid,call',
    )

    expect(rows[0].errors).toEqual([])
    expect(rows[0].client?.service_type).toBe('pool_cleaning')
    expect(rows[1].client).toBeNull()
    expect(rows[1].errors).toHaveLength(5)
  })

  it('caps batch size and rejects duplicate or unnamed columns', () => {
    const clients = Array.from({ length: MAX_CLIENT_IMPORT_ROWS + 1 }, () =>
      'Jordan,+15551234567,125 Main St',
    )
    expect(() => parseClientCsv(`full_name,phone,address\n${clients.join('\n')}`)).toThrow('Import up to 100 clients')
    expect(() => parseClientCsv('full_name,phone,phone,address')).toThrow('duplicate "phone" column')
    expect(() => parseClientCsv('full_name,,address')).toThrow('needs a header')
  })

  it('normalizes phone numbers and email case without merging distinct addresses', () => {
    expect(normalizeClientPhone(' +1 (555) 123-4567 ')).toBe('15551234567')
    expect(normalizeClientEmail(' Jordan.Lee+test@Example.com ')).toBe('jordan.lee+test@example.com')
  })
})
