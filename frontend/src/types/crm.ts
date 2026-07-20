/**
 * Shared CRM TypeScript types (mirrors docs/tech/crm-data-model.md and
 * the docs/crm/features tree). Single file so the AIReplyMode literal
 * union appears in exactly one place across the whole frontend.
 */

export type AIReplyMode = 'ai' | 'human' | 'human_pending_flag';

/**
 * The 10 field kinds the schema designer supports. Order mirrors
 * `docs/tech/crm-data-model.md` §4.1.
 */
export type EntityFieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'relation'
  | 'file'
  | 'phone'
  | 'email';

export type EntityRelationshipCardinality =
  | 'one-to-one'
  | 'one-to-many'
  | 'many-to-many';

export type KnowledgeFileStatus = 'pending' | 'chunked' | 'embedded' | 'failed';

export interface EntityFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enumValues?: string[];
}

export interface EntityField {
  name: string;
  label: string;
  type: EntityFieldType;
  required?: boolean;
  default?: unknown;
  validation?: EntityFieldValidation;
  indexable?: boolean;
  /** For `relation` fields: the target entity's machine `name`. */
  targetEntity?: string;
  /** For `relation` fields: the target field (defaults to `id`). */
  targetField?: string;
  /** For `relation` fields. */
  cardinality?: EntityRelationshipCardinality;
}

export interface EntityRelationship {
  id: string;
  fromEntity: string;
  fromField: string;
  toEntity: string;
  toField: string;
  cardinality: EntityRelationshipCardinality;
}

export interface EntitySchemaJson {
  fields: EntityField[];
  relations: EntityRelationship[];
}

export interface EntityDefinition {
  id: string;
  name: string;
  label: string;
  icon?: string | null;
  description?: string | null;
  schemaJson: EntitySchemaJson;
  version: number;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
}

export interface CrmRecord {
  id: string;
  entityId: string;
  entityName: string;
  contactId?: string | null;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
}

export interface KnowledgeFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  status: KnowledgeFileStatus;
  chunksCount: number;
  ingestedAt?: number | null;
  errorMessage?: string | null;
  entityId?: string | null;
  uploadedAt: number;
  progress?: number;
}

export interface KnowledgeChunk {
  id: string;
  fileId: string;
  index: number;
  text: string;
  /** Opaque reference to a deterministic vector in the mock. */
  embeddingRef: string;
  metadata?: Record<string, unknown>;
}

export interface CrmAiEvidence {
  kind: 'kb' | 'record';
  entryId?: string;
  recordId?: string;
  excerpt: string;
  source: string;
  contactId?: string | null;
  confidence: number;
}

export interface CrmAiAnswer {
  kind: 'answered';
  answer: string;
  confidence: number;
  evidence: CrmAiEvidence[];
  generatedAt: number;
  question: string;
}

export interface CrmAiFallback {
  kind: 'fallback';
  message: string;
}

export type CrmAskAiResponse = CrmAiAnswer | CrmAiFallback;

export interface CrmReplyPreview {
  answer: string;
  confidence: number;
  evidence: CrmAiEvidence[];
  would_send: boolean;
  reason?: string | null;
}
