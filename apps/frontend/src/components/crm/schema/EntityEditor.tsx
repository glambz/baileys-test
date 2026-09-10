import * as React from 'react';
import * as lucide from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import type {
  EntityDefinition,
  EntityField,
  EntityFieldType,
  EntityRelationship,
} from '@/types/crm';
import {
  useCreateEntity,
  useEntities,
  useUpdateEntity,
} from '@/hooks/crm/useEntities';
import { VersionHistoryPane } from './VersionHistoryPane';

const FIELD_TYPES: EntityFieldType[] = [
  'text',
  'longtext',
  'number',
  'boolean',
  'date',
  'enum',
  'relation',
  'file',
  'phone',
  'email',
];

const RELATION_CARDINALITIES: Array<EntityRelationship['cardinality']> = [
  'one-to-one',
  'one-to-many',
  'many-to-many',
];

const FIELD_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const ENTITY_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

interface EntityEditorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entity: EntityDefinition | null;
}

interface DraftEntity {
  name: string;
  label: string;
  icon: string;
  description: string;
  fields: EntityField[];
  relations: EntityRelationship[];
}

/**
 * Modal editor for an entity — name/label/icon/description + the
 * inline fields and relations lists + the version history pane on the
 * right (Plan 03 task 2 + tasks 3,4,5). Saves via `useCreateEntity` or
 * `useUpdateEntity`, versioning the schema (never overwriting).
 *
 * Source-of-truth: `docs/crm/features/schema-designer/spec.md` §1–§5.
 */
export function EntityEditor({ open, onOpenChange, entity }: EntityEditorProps) {
  const isEdit = Boolean(entity);
  const entitiesQuery = useEntities();
  const create = useCreateEntity();
  const update = useUpdateEntity();

  const [draft, setDraft] = React.useState<DraftEntity>(() => toDraft(entity));
  const [errors, setErrors] = React.useState<{ name?: string; label?: string; fields?: string }>({});

  React.useEffect(() => {
    setDraft(toDraft(entity));
    setErrors({});
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [entity?.id, open]);

  const close = () => onOpenChange(false);

  const setField = (idx: number, patch: Partial<EntityField>) => {
    setDraft((d) => {
      const fields = [...d.fields];
      fields[idx] = { ...fields[idx], ...patch };
      return { ...d, fields };
    });
  };

  const addField = () => {
    setDraft((d) => ({
      ...d,
      fields: [
        ...d.fields,
        {
          name: '',
          label: '',
          type: 'text',
          required: false,
        } as EntityField,
      ],
    }));
  };

  const removeField = (idx: number) => {
    setDraft((d) => ({ ...d, fields: d.fields.filter((_, i) => i !== idx) }));
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    setDraft((d) => {
      const j = idx + dir;
      if (j < 0 || j >= d.fields.length) return d;
      const fields = [...d.fields];
      [fields[idx], fields[j]] = [fields[j], fields[idx]];
      return { ...d, fields };
    });
  };

  const addRelation = () => {
    setDraft((d) => ({
      ...d,
      relations: [
        ...d.relations,
        {
          id: `rel-${Math.random().toString(36).slice(2, 8)}`,
          fromEntity: entity?.name ?? d.name,
          fromField: '',
          toEntity: '',
          toField: 'id',
          cardinality: 'one-to-one',
        },
      ],
    }));
  };

  const setRelation = (idx: number, patch: Partial<EntityRelationship>) => {
    setDraft((d) => {
      const relations = [...d.relations];
      relations[idx] = { ...relations[idx], ...patch };
      return { ...d, relations };
    });
  };

  const removeRelation = (idx: number) => {
    setDraft((d) => ({ ...d, relations: d.relations.filter((_, i) => i !== idx) }));
  };

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!isEdit && !ENTITY_NAME_RE.test(draft.name)) e.name = 'Nama harus ^[a-z][a-z0-9_]{0,63}$';
    if (!draft.label || draft.label.length > 64) e.label = 'Label 1–64 karakter';
    const fieldErr = draft.fields.find((f) => !FIELD_NAME_RE.test(f.name ?? ''));
    if (fieldErr) e.fields = `Field "${fieldErr.name || '(kosong)'}" invalid`;
    setErrors(e);
    return !e.name && !e.label && !e.fields;
  };

  const submit = async () => {
    if (!validate()) return;
    const cleanedFields: EntityField[] = draft.fields.map((f) => ({
      ...f,
      validation:
        f.type === 'enum' && (!f.validation || !f.validation.enumValues)
          ? { ...(f.validation ?? {}), enumValues: [] }
          : f.validation,
    }));
    try {
      if (isEdit && entity) {
        const updated = await update.mutateAsync({
          id: entity.id,
          patch: {
            label: draft.label,
            icon: draft.icon || null,
            description: draft.description || null,
            schemaJson: { fields: cleanedFields, relations: draft.relations },
          },
        });
        toast.success(`Tersimpan (version ${updated.version})`);
      } else {
        const created = await create.mutateAsync({
          name: draft.name,
          label: draft.label,
          description: draft.description || null,
          icon: draft.icon || 'Database',
          schemaJson: { fields: cleanedFields, relations: draft.relations },
        });
        toast.success(`${created.label} dibuat`);
      }
      close();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${entity?.label}` : 'Entity Baru'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Mengedit entity ini akan membuat versi baru (tidak menimpa).'
              : 'Buat entity baru untuk schema CRM.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Identitas</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="entity-name">Nama (machine)</Label>
                  <Input
                    id="entity-name"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    disabled={isEdit}
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
                </div>
                <div>
                  <Label htmlFor="entity-label">Label</Label>
                  <Input
                    id="entity-label"
                    value={draft.label}
                    onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                    aria-invalid={Boolean(errors.label)}
                  />
                  {errors.label && <p className="mt-1 text-xs text-destructive">{errors.label}</p>}
                </div>
                <div>
                  <Label htmlFor="entity-icon">Icon</Label>
                  <IconPicker
                    value={draft.icon}
                    onChange={(v) => setDraft((d) => ({ ...d, icon: v }))}
                  />
                </div>
                <div>
                  <Label htmlFor="entity-desc">Deskripsi</Label>
                  <Textarea
                    id="entity-desc"
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    rows={2}
                    maxLength={280}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Fields ({draft.fields.length})</h3>
                <Button size="sm" variant="outline" onClick={addField}>
                  <Plus className="mr-1 h-4 w-4" /> Field
                </Button>
              </div>
              {errors.fields && <p className="text-xs text-destructive">{errors.fields}</p>}
              {draft.fields.length === 0 ? (
                <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                  Belum ada field.
                </p>
              ) : (
                <ul className="space-y-2">
                  {draft.fields.map((f, idx) => (
                    <FieldRow
                      key={`${f.name}-${idx}`}
                      field={f}
                      onChange={(patch) => setField(idx, patch)}
                      onRemove={() => removeField(idx)}
                      onMoveUp={() => moveField(idx, -1)}
                      onMoveDown={() => moveField(idx, 1)}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Relasi ({draft.relations.length})</h3>
                <Button size="sm" variant="outline" onClick={addRelation}>
                  <Plus className="mr-1 h-4 w-4" /> Relasi
                </Button>
              </div>
              {draft.relations.length === 0 ? (
                <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                  Belum ada relasi.
                </p>
              ) : (
                <ul className="space-y-2">
                  {draft.relations.map((r, idx) => (
                    <RelationEditor
                      key={r.id}
                      relation={r}
                      otherEntities={(entitiesQuery.data ?? [])
                        .filter((e) => e.name !== (entity?.name ?? draft.name))
                        .map((e) => ({ name: e.name, label: e.label }))}
                      onChange={(patch) => setRelation(idx, patch)}
                      onRemove={() => removeRelation(idx)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div>
            {isEdit && entity ? (
              <VersionHistoryPane entity={entity} />
            ) : (
              <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                Version history tersedia setelah entity dibuat.
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={close} disabled={create.isPending || update.isPending}>
            Batal
          </Button>
          <Button
            onClick={submit}
            disabled={create.isPending || update.isPending}
          >
            {create.isPending || update.isPending
              ? 'Menyimpan…'
              : isEdit
                ? `Simpan (versi ${(entity?.version ?? 0) + 1})`
                : 'Buat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toDraft(entity: EntityDefinition | null): DraftEntity {
  if (!entity) {
    return {
      name: '',
      label: '',
      icon: 'Database',
      description: '',
      fields: [],
      relations: [],
    };
  }
  return {
    name: entity.name,
    label: entity.label,
    icon: entity.icon ?? 'Database',
    description: entity.description ?? '',
    fields: entity.schemaJson.fields.map((f) => ({ ...f })),
    relations: entity.schemaJson.relations.map((r) => ({ ...r })),
  };
}

interface FieldRowProps {
  field: EntityField;
  onChange: (patch: Partial<EntityField>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/**
 * Single field row inside the entity editor's Fields list
 * (Plan 03 task 3). Drag-to-reorder is implemented via simple
 * up/down buttons to avoid pulling in `dnd-kit`.
 */
function FieldRow({ field, onChange, onRemove, onMoveUp, onMoveDown }: FieldRowProps) {
  return (
    <li className="space-y-2 rounded border p-3">
      <div className="flex items-center gap-2">
        <span
          className="cursor-grab text-muted-foreground"
          aria-hidden
          title="Urutan disimpan sesuai array (gunakan tombol atas/bawah)"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <Input
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="field_name"
          className="font-mono text-xs"
          aria-label="Field name"
        />
        <Input
          value={field.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Label"
          className="text-xs"
          aria-label="Field label"
        />
        <Select value={field.type} onValueChange={(v) => onChange({ type: v as EntityFieldType })}>
          <SelectTrigger className="w-32 text-xs" aria-label="Field type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={Boolean(field.required)}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          required
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={Boolean(field.indexable)}
            onChange={(e) => onChange({ indexable: e.target.checked })}
          />
          indexable
        </label>
        <Button type="button" variant="ghost" size="icon" onClick={onMoveUp} aria-label="Naik">
          ↑
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onMoveDown} aria-label="Turun">
          ↓
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="Hapus field"
          className="text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <FieldEditor field={field} onChange={onChange} />
    </li>
  );
}

interface FieldEditorProps {
  field: EntityField;
  onChange: (patch: Partial<EntityField>) => void;
}

/**
 * Expanded field options — the second row of the field editor
 * (Plan 03 task 3). Per-type extra controls live here.
 */
function FieldEditor({ field, onChange }: FieldEditorProps) {
  const validation = field.validation ?? {};
  const updateValidation = (patch: Partial<typeof validation>) =>
    onChange({ validation: { ...validation, ...patch } });

  return (
    <div className="grid grid-cols-1 gap-2 pl-6 text-xs md:grid-cols-4">
      {(field.type === 'text' || field.type === 'longtext') && (
        <>
          <Input
            value={(validation.pattern as string | undefined) ?? ''}
            onChange={(e) => updateValidation({ pattern: e.target.value })}
            placeholder="regex (optional)"
            className="font-mono"
          />
          <Input
            type="number"
            value={typeof validation.min === 'number' ? validation.min : ''}
            onChange={(e) =>
              updateValidation({ min: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="min length"
          />
          <Input
            type="number"
            value={typeof validation.max === 'number' ? validation.max : ''}
            onChange={(e) =>
              updateValidation({ max: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="max length"
          />
        </>
      )}
      {field.type === 'number' && (
        <>
          <Input
            type="number"
            value={typeof validation.min === 'number' ? validation.min : ''}
            onChange={(e) =>
              updateValidation({ min: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="min value"
          />
          <Input
            type="number"
            value={typeof validation.max === 'number' ? validation.max : ''}
            onChange={(e) =>
              updateValidation({ max: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="max value"
          />
        </>
      )}
      {field.type === 'enum' && (
        <EnumEditor
          values={(validation.enumValues as string[] | undefined) ?? []}
          onChange={(vals) => updateValidation({ enumValues: vals })}
        />
      )}
      {field.type === 'relation' && (
        <>
          <Input
            value={field.targetEntity ?? ''}
            onChange={(e) => onChange({ targetEntity: e.target.value })}
            placeholder="target entity (machine name)"
            className="font-mono"
          />
          <Select
            value={field.cardinality ?? 'one-to-one'}
            onValueChange={(v) => onChange({ cardinality: v as EntityRelationship['cardinality'] })}
          >
            <SelectTrigger className="text-xs" aria-label="Cardinality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELATION_CARDINALITIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={field.targetField ?? 'id'}
            onChange={(e) => onChange({ targetField: e.target.value })}
            placeholder="target field"
            className="font-mono"
          />
        </>
      )}
    </div>
  );
}

function EnumEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [pending, setPending] = React.useState('');
  return (
    <div className="col-span-4 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {values.map((v) => (
          <Badge
            key={v}
            variant="secondary"
            className="cursor-pointer"
            onClick={() => onChange(values.filter((x) => x !== v))}
            title="Klik untuk hapus"
          >
            {v} ×
          </Badge>
        ))}
        <div className="flex items-center gap-1">
          <Input
            value={pending}
            onChange={(e) => setPending(e.target.value)}
            placeholder="enum value"
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const v = pending.trim();
              if (!v || values.includes(v)) return;
              onChange([...values, v]);
              setPending('');
            }}
          >
            Tambah
          </Button>
        </div>
      </div>
    </div>
  );
}

interface RelationEditorProps {
  relation: EntityRelationship;
  otherEntities: Array<{ name: string; label: string }>;
  onChange: (patch: Partial<EntityRelationship>) => void;
  onRemove: () => void;
}

/**
 * One relation row inside the entity editor's Relations list.
 */
function RelationEditor({ relation, otherEntities, onChange, onRemove }: RelationEditorProps) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded border p-2 text-xs">
      <span className="text-muted-foreground">{relation.fromEntity}.</span>
      <Input
        value={relation.fromField}
        onChange={(e) => onChange({ fromField: e.target.value })}
        placeholder="fromField"
        className="h-7 w-32 font-mono"
      />
      <span aria-hidden>→</span>
      <Select
        value={relation.toEntity}
        onValueChange={(v) => onChange({ toEntity: v })}
      >
        <SelectTrigger className="h-7 w-40 text-xs" aria-label="Target entity">
          <SelectValue placeholder="Pilih entity" />
        </SelectTrigger>
        <SelectContent>
          {otherEntities.map((e) => (
            <SelectItem key={e.name} value={e.name}>
              {e.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={relation.toField}
        onChange={(e) => onChange({ toField: e.target.value })}
        placeholder="toField"
        className="h-7 w-28 font-mono"
      />
      <Select
        value={relation.cardinality}
        onValueChange={(v) => onChange({ cardinality: v as EntityRelationship['cardinality'] })}
      >
        <SelectTrigger className="h-7 w-32 text-xs" aria-label="Cardinality">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RELATION_CARDINALITIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label="Hapus relasi"
        className="ml-auto text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

interface IconPickerProps {
  value: string;
  onChange: (v: string) => void;
}

/**
 * Compact icon picker — searchable list of every `lucide-react` icon.
 */
function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const all = React.useMemo(() => {
    return Object.keys(lucide)
      .filter((k) => /^[A-Z]/.test(k) && /[a-z]/.test(k))
      .filter((k) => !/(Provider|Icon|Context|Props)$/.test(k))
      .sort();
  }, []);
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all.slice(0, 40);
    return all.filter((n) => n.toLowerCase().includes(needle)).slice(0, 40);
  }, [all, q]);

  const Current = (lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    value || 'Database'
  ] ?? lucide.Database;

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Current className="h-4 w-4" /> {value || 'Database'}
        </span>
        <span className="text-xs text-muted-foreground">Pilih</span>
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded border bg-background p-2 shadow-lg">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari icon…"
            className="mb-2 h-8 text-xs"
          />
          <ul role="listbox" className="grid grid-cols-4 gap-1">
            {filtered.map((name) => {
              const I = (lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
              if (!I) return null;
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                    className="flex w-full flex-col items-center gap-1 rounded p-1 text-[10px] hover:bg-secondary"
                    aria-label={name}
                  >
                    <I className="h-4 w-4" />
                    <span className="truncate">{name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// Re-export for callers that still reference the inline version.
export { dayjs };
