import type { BuilderOptions, DataModel, Field, FieldDefinition, SchemaDefinition } from './types'
import { fieldTypeMap } from './constants'
import { getNamingFn } from './naming'

const defaultOptions: BuilderOptions = {
  nameTransform: 'database',
}

export function buildSchema(data: DataModel, options = defaultOptions) {
  const nameFn = getNamingFn(options.nameTransform)
  const result: SchemaDefinition = new Map()

  // setup the collections
  for (const collection of Object.values(data.collections)) {
    if (result.has(collection.collection))
      continue

    const systemCollection = collection.collection.startsWith('directus_')

    const collectionName = systemCollection
      ? collection.collection
      : nameFn(collection.collection)

    const fields = data.fields.filter(predicate => predicate.collection === collection.collection)

    result.set(collection.collection, {
      name: collectionName,
      system: systemCollection,
      singleton: Boolean(collection.meta?.singleton),
      fields: fields.map((field) => {
        let mappedType: string[] | string | undefined = fieldTypeMap[field.type]
        let fieldRelation: FieldDefinition['relation'] = null
        const isPrimaryKey = field.schema?.is_primary_key

        if (systemCollection && field.schema?.is_generated)
          return null

        // check many to any relations
        if (isRelationAlias(field)) {
          const relation = data.relations.find(
            ({ meta }) => meta?.one_collection === collection.collection && meta?.one_field === field.field,
          )

          if (relation && isPrimaryKey) {
            fieldRelation = { collection: relation.collection, multiple: true }
            mappedType = `${fieldTypeMap[field.type]}[]`
          }
        }

        if (mappedType === undefined)
          return null

        // check one to any relations
        if (fieldRelation == null) {
          const relation = data.relations.find(rel => rel.field === field.field && rel.collection === collection.collection)

          if (relation) {
            // m2o relations
            if (relation.related_collection)
              fieldRelation = { collection: relation.related_collection, multiple: false }

            // m2a relations
            if (relation.meta?.one_allowed_collections) {
              fieldRelation = relation.meta.one_allowed_collections.map(collectionName => ({
                collection: collectionName,
                multiple: false,
              }))
            }
          }
        }

        // check for m2a collection fields
        if (field.field === 'collection') {
          const rel = data.relations.find(r => r.collection === collection.collection && r.field === 'item')

          if (rel && rel.meta?.one_allowed_collections)
            mappedType = rel.meta.one_allowed_collections.map(c => `'${c}'`)
        }

        return {
          name: field.field,
          type: mappedType!,
          nullable: Boolean(field.schema?.is_nullable),
          primary_key: isPrimaryKey,
          relation: fieldRelation,
        }
      }).filter(x => Boolean(x)) as FieldDefinition[],
    })
  }

  // clean up untouched system collections or those without fields
  for (const [name, collection] of result) {
    if (collection.fields.length === 0)
      result.delete(name)
  }

  return result
}

function isRelationAlias(field: Field): boolean {
  const special = field.meta?.special

  if (field.type !== 'alias' || !special)
    return false

  const isRelationField = ['o2m', 'm2m', 'm2a'].some(type => special.includes(type))

  return isRelationField
}
