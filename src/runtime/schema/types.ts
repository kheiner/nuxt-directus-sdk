import type { Collection, Field as DirectusField, Relation } from '@directus/types'

export interface CliOptions {
  host: string
  accessToken: string
  file: string
  naming: 'database' | 'camelcase' | 'pascalcase'
  rootName: string
}

export interface BuilderOptions {
  nameTransform: string
}

export interface RenderOptions {
  indent: {
    amount: number
    char: string
  }
}

export interface DataModel {
  collections: Collection[]
  fields: DirectusField[]
  relations: Relation[]
}

export type SchemaDefinition = Map<string, CollectionDefinition>

export interface CollectionDefinition {
  name: string
  system: boolean
  singleton: boolean
  fields: FieldDefinition[]
}

export interface FieldDefinition {
  name: string
  type: MaybeArray<string>
  nullable: boolean
  primary_key: boolean
  relation: MaybeArray<RelationDefinition> | null
}

export interface RelationDefinition {
  collection: string
  multiple: boolean
}

export type Field = DirectusField & {
  relation?: {
    type: 'many' | 'one'
    collection: string
  }
}

export type StringTransformer = (str: string) => string

export type MaybeArray<T> = T | T[]

export type Nullable<T> = T | null | undefined
