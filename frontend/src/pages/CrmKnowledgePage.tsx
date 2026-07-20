import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useKnowledgeFiles, useDeleteKnowledgeFile, useReEmbedKnowledgeFile, useUploadKnowledgeFile } from '@/hooks/crm/useKnowledge';
import { useEntities } from '@/hooks/crm/useEntities';
import { StatusChip } from '@/components/crm/knowledge/StatusChip';
import { DropzoneArea } from '@/components/crm/knowledge/DropzoneArea';
import { Trash2, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';
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
import dayjs from 'dayjs';

/**
 * Knowledge upload page (`/crm/_knowledge`). Includes drag/drop,
 * pipeline status, retry, and delete confirm.
 */
export default function CrmKnowledgePage() {
  const [entityId, setEntityId] = useState<string>('none');
  const filesQ = useKnowledgeFiles(entityId === 'none' ? undefined : entityId);
  const entitiesQ = useEntities();
  const upload = useUploadKnowledgeFile();
  const remove = useDeleteKnowledgeFile();
  const reembed = useReEmbedKnowledgeFile();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Knowledge</h1>
          <p className="text-sm text-muted-foreground">
            Upload dokumen untuk knowledge base AI. Maks 25MB per file.
          </p>
        </div>
        <Select value={entityId} onValueChange={setEntityId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Pilih entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Tanpa entity</SelectItem>
            {(entitiesQ.data ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <DropzoneArea
        entityId={entityId === 'none' ? null : entityId}
        onUpload={async (file) => {
          try {
            await upload.mutateAsync({
              filename: file.name,
              size: file.size,
              mimeType: file.type || 'application/octet-stream',
              entityId: entityId === 'none' ? null : entityId,
            });
            toast.success(`${file.name} mulai diproses`);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Files</CardTitle>
        </CardHeader>
        <CardContent>
          {filesQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filesQ.isError ? (
            <p className="text-sm text-destructive">Gagal memuat.</p>
          ) : (filesQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada file. Tarik file ke drop zone untuk mulai.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left">Filename</th>
                  <th className="px-2 py-2 text-left">Mime</th>
                  <th className="px-2 py-2 text-right">Size</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-right">Chunks</th>
                  <th className="px-2 py-2 text-left">Uploaded</th>
                  <th className="px-2 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(filesQ.data ?? []).map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-2 py-2 font-mono text-xs">{f.filename}</td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {f.mimeType}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums">
                      {new Intl.NumberFormat('id-ID', { notation: 'compact' }).format(f.size)}B
                    </td>
                    <td className="px-2 py-2">
                      <StatusChip status={f.status} errorMessage={f.errorMessage ?? null} />
                    </td>
                    <td className="px-2 py-2 text-right text-xs">{f.chunksCount}</td>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                      {dayjs.unix(f.uploadedAt).format('YYYY-MM-DD HH:mm')}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await reembed.mutateAsync({ id: f.id });
                              toast.success('Re-embed dimulai');
                            } catch (err) {
                              toast.error((err as Error).message);
                            }
                          }}
                          disabled={f.status !== 'failed'}
                          aria-label="Re-embed"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDeleteId(f.id)}
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
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus file dan semua chunk-nya?</AlertDialogTitle>
            <AlertDialogDescription>
              <FileText className="mr-1 inline h-4 w-4" /> Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try {
                  await remove.mutateAsync({ id: deleteId });
                  toast.success('File dihapus');
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
      <p className="mt-4 text-xs text-muted-foreground">
        <Link to="/crm" className="hover:underline">
          Kembali ke CRM workspace
        </Link>
      </p>
    </div>
  );
}
