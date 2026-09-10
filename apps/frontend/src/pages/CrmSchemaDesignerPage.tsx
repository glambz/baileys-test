import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Edit, History as HistoryIcon, Trash2 } from 'lucide-react';
import {
  useEntities,
  useArchiveEntity,
  useEntityByName,
} from '@/hooks/crm/useEntities';
import { useRecords } from '@/hooks/crm/useRecords';
import { EntityEditor as SchemaEntityEditor } from '@/components/crm/schema/EntityEditor';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import type { EntityDefinition } from '@/types/crm';

/**
 * Schema designer - entity list + entity editor (modal) per
 * `docs/crm/features/schema-designer/spec.md` sections 1-3.
 */
export default function CrmSchemaDesignerPage() {
  const query = useEntities();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntityDefinition | null>(null);

  const open = (entity?: EntityDefinition) => {
    setEditingEntity(entity ?? null);
    setEditorOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b p-4">
        <div>
          <h1 className="text-lg font-semibold">Schema Designer</h1>
          <p className="text-sm text-muted-foreground">Desain entity, field, dan relasi.</p>
        </div>
        <Button onClick={() => open()} size="sm">
          <Plus className="mr-2 h-4 w-4" /> Entitas baru
        </Button>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:grid-cols-[300px_1fr]">
        <EntityList
          query={query}
          selectedName={selectedName}
          onSelect={(name) => {
            setSelectedName(name);
            setEditingEntity(null);
          }}
          onEdit={(e) => open(e)}
        />
        <div className="overflow-y-auto">
          {selectedName ? (
            <EntityDetail
              entityName={selectedName}
              onEdit={() => open(query.data?.find((x) => x.name === selectedName))}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
                Pilih entity di daftar, atau buat entity baru.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <SchemaEntityEditor open={editorOpen} onOpenChange={setEditorOpen} entity={editingEntity} />
    </div>
  );
}

function EntityList({
  query,
  selectedName,
  onSelect,
  onEdit,
}: {
  query: ReturnType<typeof useEntities>;
  selectedName: string | null;
  onSelect: (name: string) => void;
  onEdit: (entity: EntityDefinition) => void;
}) {
  const archive = useArchiveEntity();

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="space-y-2 p-4 text-sm text-destructive">
          <p>Gagal memuat schema.</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  const entities = query.data ?? [];
  if (entities.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="space-y-2 p-6 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Belum ada entity</p>
          <p>Klik + Entitas baru untuk mulai.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul role="list" className="space-y-2 overflow-y-auto">
      {entities.map((e) => (
        <li key={e.id}>
          <EntityRow
            entity={e}
            selected={e.name === selectedName}
            onClick={() => onSelect(e.name)}
            onEdit={() => onEdit(e)}
            onArchive={async () => {
              try {
                await archive.mutateAsync({ id: e.id });
                toast.success(`${e.label} diarsipkan`);
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function EntityRow({
  entity,
  selected,
  onClick,
  onEdit,
  onArchive,
}: {
  entity: EntityDefinition;
  selected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const records = useRecords(entity.name, { limit: 1, offset: 0 });
  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer transition-colors hover:bg-secondary/40 ${selected ? 'ring-2 ring-primary' : ''}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardHeader className="flex-row items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="truncate">{entity.label}</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              v{entity.version}
            </Badge>
          </CardTitle>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{entity.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label={`Edit ${entity.label}`}
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            aria-label={`Arsipkan ${entity.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2 px-3 pb-3 text-[11px] text-muted-foreground">
        <span>
          {entity.schemaJson.fields.length} field · {records.data?.total ?? 0} record
        </span>
        <span>{dayjs.unix(entity.updatedAt).format('YYYY-MM-DD HH:mm')}</span>
      </CardContent>
    </Card>
  );
}

function EntityDetail({
  entityName,
  onEdit,
}: {
  entityName: string;
  onEdit: () => void;
}) {
  const query = useEntityByName(entityName);
  const recordsQuery = useRecords(entityName, { limit: 1 });

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (!query.data) return <p className="text-sm text-muted-foreground">Memuat…</p>;
  const e = query.data;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {e.label}
            <Badge variant="secondary" className="font-mono text-[10px]">
              v{e.version}
            </Badge>
          </CardTitle>
          <p className="font-mono text-xs text-muted-foreground">{e.name}</p>
          <p className="text-sm text-muted-foreground">{e.description ?? 'Tidak ada deskripsi.'}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Edit className="mr-2 h-4 w-4" /> Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <h3 className="mb-2 font-medium">Fields ({e.schemaJson.fields.length})</h3>
          {e.schemaJson.fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">Belum ada field.</p>
          ) : (
            <ul className="space-y-1">
              {e.schemaJson.fields.map((f) => (
                <li key={f.name} className="rounded border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono">{f.name}</span>
                    <Badge variant="outline">{f.type}</Badge>
                  </div>
                  <div className="text-muted-foreground">{f.label}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 font-medium">
            <HistoryIcon className="mr-1 inline h-4 w-4" /> Records
          </h3>
          <p className="text-xs text-muted-foreground">
            {recordsQuery.data?.total ?? 0} record tersimpan.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}

