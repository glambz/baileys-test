import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface DropzoneAreaProps {
  entityId: string | null;
  onUpload: (file: File) => Promise<void> | void;
}

const ACCEPTED = ['text/plain', 'text/markdown', 'application/pdf', 'text/csv'];
const MAX_FILES = 20;
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Drag-and-drop / click-to-pick upload zone per
 * `docs/crm/features/knowledge-rag/spec.md` section 3.
 */
export function DropzoneArea({ onUpload }: DropzoneAreaProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const validate = (files: FileList | File[]): File[] => {
    const list = Array.from(files);
    if (list.length > MAX_FILES) {
      setError(`Maks ${MAX_FILES} file per upload`);
      return [];
    }
    const bad: string[] = [];
    const oversize: string[] = [];
    for (const f of list) {
      if (!(ACCEPTED.includes(f.type) || /\.(md|csv|pdf|txt)$/i.test(f.name))) bad.push(f.name);
      if (f.size > MAX_BYTES) oversize.push(`${f.name} (>25MB)`);
    }
    if (bad.length || oversize.length) {
      const parts: string[] = [];
      if (bad.length) parts.push(`Format salah: ${bad.join(', ')}`);
      if (oversize.length) parts.push(`Terlalu besar: ${oversize.join(', ')}`);
      setError(parts.join(' · '));
      return [];
    }
    return list;
  };

  const handle = async (files: File[]) => {
    setError(null);
    if (files.length === 0) return;
    setBusy(true);
    try {
      for (const f of files) await onUpload(f);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = validate(e.dataTransfer.files);
        void handle(files);
      }}
      className={`border-dashed ${dragOver ? 'bg-accent/50' : ''}`}
    >
      <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="text-sm">Tarik file ke sini untuk upload</p>
        <p className="text-xs text-muted-foreground">PDF / Markdown / Text / CSV, maks 25MB per file, 20 file per upload.</p>
        <Button asChild size="sm" variant="outline" disabled={busy}>
          <label className="cursor-pointer">
            Pilih file…
            <input
              type="file"
              multiple
              accept=".md,.csv,.pdf,.txt,application/pdf,text/markdown,text/plain,text/csv"
              className="sr-only"
              onChange={(e) => {
                const files = validate(e.target.files ?? []);
                void handle(files);
                e.target.value = '';
              }}
            />
          </label>
        </Button>
        {busy && <p className="text-xs text-muted-foreground">Mengupload…</p>}
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
