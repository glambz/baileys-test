import { z } from 'zod';
import type { EntityDefinition, EntityField } from '@/types/crm';
import { CRM_AI_CONFIDENCE_THRESHOLD } from '@/lib/config-crm';

/**
 * CRM/RAG confidence threshold. Sourced from `@/lib/config-crm`; the
 * single declaration lives there (`docs/tech/crm-data-model.md` §3).
 * This re-export keeps the legacy alias working for downstream
 * consumers that already import `CRM_CONFIDENCE_THRESHOLD`.
 */
export const CRM_CONFIDENCE_THRESHOLD = CRM_AI_CONFIDENCE_THRESHOLD;

const PHONE_E164 = /^\+?[0-9]{6,15}$/;
const EMAIL_RFC5321ISH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Build a per-entity zod schema from the EntityDefinition's schemaJson.
 * Honors: required, default, validation.min/max, validation.pattern,
 * validation.enumValues, phone E.164, email RFC-5321-ish.
 */
export function buildZodSchema(entity: EntityDefinition): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const field of entity.schemaJson.fields) {
    shape[field.name] = zodForField(field);
  }
  return z.object(shape).strict();
}

function zodForField(field: EntityField): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (field.type) {
    case 'text': {
      base = z.string().max(255);
      const validation = field.validation;
      if (validation?.pattern) {
        base = (base as z.ZodString).regex(new RegExp(validation.pattern));
      }
      break;
    }
    case 'longtext': {
      base = z.string().max(8192);
      break;
    }
    case 'number': {
      let n: z.ZodNumber = z.number();
      const min = field.validation?.min;
      const max = field.validation?.max;
      if (typeof min === 'number') n = n.min(min);
      if (typeof max === 'number') n = n.max(max);
      base = n;
      break;
    }
    case 'boolean': {
      base = z.boolean();
      break;
    }
    case 'date': {
      base = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
      break;
    }
    case 'enum': {
      const values = field.validation?.enumValues ?? [];
      base = values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string();
      break;
    }
    case 'relation': {
      base = z.string();
      break;
    }
    case 'file': {
      base = z.string();
      break;
    }
    case 'phone': {
      base = z.string().regex(PHONE_E164, 'Nomor telepon tidak valid (E.164)');
      break;
    }
    case 'email': {
      base = z.string().regex(EMAIL_RFC5321ISH, 'Email tidak valid');
      break;
    }
    default: {
      base = z.unknown();
    }
  }

  if (!field.required) {
    base = base.optional();
  } else if (field.default !== undefined && field.default !== null) {
    base = base.default(field.default);
  }

  return base;
}

interface CacheEntry {
  version: number;
  schema: z.ZodObject<z.ZodRawShape>;
}

const cache = new Map<string, CacheEntry>();

/**
 * Memoized per-entityId validator. Returns the same compiled schema
 * instance until the entity's `version` changes.
 */
export function getCachedValidator(entity: EntityDefinition): z.ZodObject<z.ZodRawShape> {
  const hit = cache.get(entity.id);
  if (hit && hit.version === entity.version) return hit.schema;
  const schema = buildZodSchema(entity);
  cache.set(entity.id, { version: entity.version, schema });
  return schema;
}

export function invalidateValidator(entityId: string): void {
  cache.delete(entityId);
}
