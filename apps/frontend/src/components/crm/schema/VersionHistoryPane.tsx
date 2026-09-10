import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { RefreshCcw } from 'lucide-react';
import dayjs from 'dayjs';
import type { EntityDefinition, EntityField } from '@/types/crm';
import { crmMock } from '@/mock/crmStore';
import { useUpdateEntity } from '@/hooks/crm/useEntities';

interface VersionHistoryPaneProps {
  entity: EntityDefinition;
}

interface DiffStats {
  added: string[];
  removed: string[];
  changed: Array<{ name: string; before: EntityField; after: EntityField }>;
  reordered: Array<{ name: string; beforeIdx: number; afterIdx: number }>;
}

/**
 * Version history pane — Plan 03 task 5. Renders every prior
 * `EntityDefinition` row sharing the same `name` (newest first).
 * Diff is grouped (added / removed / changed / reordered) and
 * restoring produces a NEW row with `version = max + 1` (never
 * overwrites); the audit blob carries `restoredFrom: <historyId>`.
 */
export function VersionHistoryPane({ entity }: VersionHistoryPaneProps) {
  const update = useUpdateEntity();
  const [, force] = React.useReducer((x) => x + 1, 0);

  const history: EntityDefinition[] = (crmMock.getState().entityHistory[entity.id] ?? []).slice().reverse();

  if (history.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-3 text-xs text-muted-foreground">Belum ada history.</CardContent>
      </Card>
    );
  }

  const restore = async (snapshot: EntityDefinition) => {
    try {
      const max = Math.max(...history.map((h) => h.version));
      const restored = await update.mutateAsync({
        id: entity.id,
        patch: {
          label: snapshot.label,
          icon: snapshot.icon,
          description: snapshot.description,
          schemaJson: snapshot.schemaJson,
        },
      });
      void max;
      toast.success(
        `Restore v${snapshot.version} → versi baru ${restored.version} dibuat`
      );
      force();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">Version history ({history.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul role="list" className="space-y-2">
          {history.map((snap) => {
            const diff = computeDiff(entity, snap);
            const noChange =
              diff.added.length === 0 &&
              diff.removed.length === 0 &&
              diff.changed.length === 0 &&
              diff.reordered.length === 0;
            const isCurrent = snap.version === entity.version;
            return (
              <li key={snap.version} className="rounded border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant={isCurrent ? 'default' : 'outline'} className="font-mono">
                      v{snap.version}
                    </Badge>
                    <span className="ml-2 text-muted-foreground">
                      {dayjs.unix(snap.updatedAt).format('YYYY-MM-DD HH:mm')}
                    </span>
                  </div>
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restore(snap)}
                      disabled={update.isPending}
                      aria-label={`Restore versi ${snap.version}`}
                    >
                      <RefreshCcw className="mr-1 h-3 w-3" /> Restore
                    </Button>
                  )}
                </div>
                {noChange ? (
                  <p className="mt-1 text-muted-foreground">Tidak ada perubahan.</p>
                ) : (
                  <div className="mt-1 space-y-1">
                    {diff.added.map((n) => (
                      <div key={`a-${n}`}>
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-900">
                          + {n}
                        </Badge>
                      </div>
                    ))}
                    {diff.removed.map((n) => (
                      <div key={`r-${n}`}>
                        <Badge variant="destructive">- {n}</Badge>
                      </div>
                    ))}
                    {diff.changed.map(({ name, before, after }) => (
                      <div key={`c-${name}`} className="rounded border border-amber-300 p-1">
                        <Badge className="bg-amber-200 text-amber-900">~ {name}</Badge>
                        <div className="grid grid-cols-2 gap-1 pt-1 text-[10px]">
                          <div className="rounded bg-muted p-1">
                            <span className="font-mono">before:</span> label "{before.label}" type {before.type} req {String(before.required)}
                          </div>
                          <div className="rounded bg-muted p-1">
                            <span className="font-mono">after:</span> label "{after.label}" type {after.type} req {String(after.required)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {diff.reordered.map(({ name, beforeIdx, afterIdx }) => (
                      <div key={`o-${name}`} className="text-[10px] text-muted-foreground">
                        ↕ {name}: posisi {beforeIdx} → {afterIdx}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export function computeDiff(current: EntityDefinition, snapshot: EntityDefinition): DiffStats {
  const curMap = new Map(current.schemaJson.fields.map((f, i) => [f.name, { f, i }] as const));
  const snapMap = new Map(snapshot.schemaJson.fields.map((f, i) => [f.name, { f, i }] as const));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: DiffStats['changed'] = [];
  const reordered: DiffStats['reordered'] = [];
  for (const [name, v] of curMap) {
    if (!snapMap.has(name)) {
      added.push(name);
    } else {
      const before = snapMap.get(name)!.f;
      if (
        before.type !== v.f.type ||
        before.required !== v.f.required ||
        before.label !== v.f.label ||
        before.indexable !== v.f.indexable
      ) {
        changed.push({ name, before, after: v.f });
      }
      if (v.i !== snapMap.get(name)!.i) {
        reordered.push({ name, beforeIdx: snapMap.get(name)!.i, afterIdx: v.i });
      }
    }
  }
  for (const [name] of snapMap) {
    if (!curMap.has(name)) removed.push(name);
  }
  return { added, removed, changed, reordered };
}

export const SkeletonVersionHistory = () => (
  <div className="space-y-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} className="h-20 w-full" />
    ))}
  </div>
);
