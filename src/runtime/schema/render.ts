import { pascalcase } from './naming'
import type { Nullable, RenderOptions, SchemaDefinition } from './types'

const defaultOptions: RenderOptions = {
  indent: {
    amount: 4,
    char: ' ',
  },
}

export function renderSchema(schema: SchemaDefinition, options = defaultOptions) {
  const sortedNames = [...schema.keys()].sort()
  const sortedUserCollections = sortedNames.filter(name => !name.startsWith('directus_'))

  let rootType = 'export interface DirectusSchema {\n'
  const indentation = options.indent.char.repeat(options.indent.amount)

  for (const name of sortedUserCollections) {
    const collection = schema.get(name)
    if (!collection)
      continue

    rootType += `${indentation}${name}: ${collection.name}${fmtArray(!collection.singleton)};\n`
  }

  rootType += '}\n\n'

  rootType += 'export interface AllDirectusCollections {\n'

  for (const name of sortedNames) {
    const collection = schema.get(name)
    if (!collection)
      continue

    rootType += `${indentation}${name}: ${collection.name}${fmtArray(!collection.singleton)};\n`
  }

  rootType += '}\n\n'

  const collectionSchema: string[] = []
  const systemImports = new Set<string>()

  for (const name of sortedNames) {
    const collection = schema.get(name)
    if (!collection)
      continue

    let collectionType = `interface ${collection.name} {\n`

    const pk = collection.fields.find(({ primary_key }) => primary_key)
    const sortedFields = collection.fields.sort((a, b) => (a.name > b.name ? 1 : -1))

    if (pk) {
      // pull the primary key to the top
      collectionType += `${indentation}${pk.name}: ${makeArray(pk.type).join(' | ')};\n`
    }

    for (const field of sortedFields) {
      if (field.primary_key)
        continue

      const fieldTypes = makeArray(field.type)

      for (const relation of makeArray(field.relation)) {
        let relationName = ''

        if (relation?.collection.startsWith('directus_')) {
          const SystemName = pascalcase(relation.collection)
          relationName = `${SystemName}<AllDirectusCollections>`
          systemImports.add(SystemName)
        }
        else if (schema.has(relation?.collection)) {
          relationName = schema.get(relation.collection)!.name
        }

        fieldTypes.unshift(`${relationName}${fmtArray(relation.multiple)}`)
      }

      if (field.nullable)
        fieldTypes.push('null')

      collectionType += `${indentation}${field.name}: ${fieldTypes.join(' | ')};\n`
    }

    collectionType += '}'
    collectionSchema.push(collectionType)
  }

  const importStr = systemImports.size > 0 ? `import { ${[...systemImports].join(', ')} } from '@directus/sdk';\n\n` : ''

  return `
  ${importStr}

  declare module '#app' {
    ${collectionSchema.join('\n\n')}
    ${rootType}
  }
  
  declare global {
    ${collectionSchema.join('\n\n')}
    ${rootType}
  }

  export {};
`
}

function fmtArray(isArray: boolean) {
  return isArray ? '[]' : ''
}

function makeArray<T>(item: Nullable<T | T[]>): T[] {
  if (!item)
    return []
  return Array.isArray(item) ? item : [item]
}
