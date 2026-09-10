import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useEntityByName } from '@/hooks/crm/useEntities';
import { useRecords, useDeleteRecord } from '@/hooks/crm/useRecords';
import { FieldRenderer } from '@/components/crm/data/FieldRenderer';
import { RecordForm } from '@/components/crm/data/RecordForm';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import type { CrmRecord } from '@/types/crm';
import { useEffect } from 'react';

/**
 * Data viewer for `/crm/:entityName` — column list derived from
 * the entity's `schemaJson.fields` (declared order).
 */
export default function CrmDataViewerPage() {
  const params = useParams<{ entityName: string }>();
  const entityName = params.entityName ?? '';
  const entityQ = useEntityByName(entityName);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sort, setSort] = useState('updatedAt:desc');
  const del = useDeleteRecord();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const entity = entityQ.data;
  const recordsQ = useRecords(entityName, { q: debounced, sort, limit: 25, offset: 0 });
  const records = recordsQ.data?.records ?? [];
  const total = recordsQ.data?.total ?? 0;

  if (entityQ.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!entity) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Entity tidak ditemukan.
      </div>
    );
  }

  const fields = entity.schemaJson.fields;

  const toggleSort = (fieldName: string) => {
    const current = sort.split(':');
    if (current[0] !== fieldName) {
      setSort(`${fieldName}:desc`);
    } else {
      setSort(`${fieldName}:${current[1] === 'desc' ? 'asc' : 'desc'}`);
    }
  };

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
        <div>
          <h1 className="text-lg font-semibold">{entity.label}</h1>
          <p className="font-mono text-xs text-muted-foreground">/{entity.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari record…"
              className="w-56 pl-9"
              aria-label="Cari record"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Record baru
          </Button>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {recordsQ.isLoading ? (
          <div className="space-y-1 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : recordsQ.isError ? (
          <Card className="m-4 border-destructive/40 bg-destructive/5">
            <CardContent className="space-y-2 p-4 text-sm text-destructive">
              <p>Gagal memuat data.</p>
              <Button variant="outline" size="sm" onClick={() => recordsQ.refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Coba lagi
              </Button>
            </CardContent>
          </Card>
        ) : records.length === 0 ? (
          <Card className="m-4 border-dashed">
            <CardContent className="space-y-2 p-10 text-center text-sm text-muted-foreground">
              <p>Belum ada record.</p>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Record baru
              </Button>
            </CardContent>
          </Card>
        ) : (
          <table className="w-full caption-bottom text-sm">
            <caption className="sr-only">{entity.label} records</caption>
            <thead className="bg-muted/40">
              <tr>
                <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                {fields.map((f) => (
                  <th key={f.name} className="px-3 py-2 text-left font-medium">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:underline"
                      onClick={() => toggleSort(f.name)}
                      aria-sort={
                        sort.split(':')[0] === f.name
                          ? sort.split(':')[1] === 'desc'
                            ? 'descending'
                            : 'ascending'
                          : 'none'
                      }
                    >
                      {f.label}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium">Updated</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  {fields.map((f) => (
                    <td key={f.name} className="px-3 py-2 align-top">
                      <FieldRenderer field={f} value={r.data?.[f.name]} />
                    </td>
                  ))}
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {dayjs.unix(r.updatedAt).format('YYYY-MM-DD HH:mm')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/crm/${entity.name}/${r.id}`}>Open</Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(r);
                          setFormOpen(true);
                        }}
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteId(r.id)}
                        aria-label="Hapus"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <footer className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground">
        {records.length} dari {total} record
        {debounced && (
          <Badge variant="outline" className="ml-2">
            q: {debounced}
          </Badge>
        )}
      </footer>
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Record' : 'Record Baru'}</DialogTitle>
          </DialogHeader>
          <RecordForm
            entity={entity}
            initial={editing}
            onDone={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus record?</AlertDialogTitle>
            <AlertDialogDescription>
              Record akan disembunyikan dari tampilan default. Tidak dapat dibatalkan dari UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try {
                  await del.mutateAsync({ id: deleteId });
                  toast.success('Record dihapus');
                  setDeleteId(null);
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
