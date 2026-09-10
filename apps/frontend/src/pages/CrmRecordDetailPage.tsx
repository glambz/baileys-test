import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { useEntityByName } from '@/hooks/crm/useEntities';
import { useRecords } from '@/hooks/crm/useRecords';
import { FieldRenderer } from '@/components/crm/data/FieldRenderer';
import dayjs from 'dayjs';
import type { CrmRecord } from '@/types/crm';

/**
 * Record detail page at `/crm/:entityName/:recordId`.
 */
export default function CrmRecordDetailPage() {
  const { entityName, recordId } = useParams<{ entityName: string; recordId: string }>();
  const entityQ = useEntityByName(entityName ?? '');
  const recordsQ = useRecords(entityName, { limit: 100, offset: 0 });
  const record: CrmRecord | undefined = recordsQ.data?.records.find((r) => r.id === recordId);

  if (entityQ.isLoading || recordsQ.isLoading) {
    return <Skeleton className="m-4 h-64 w-full" />;
  }
  if (!entityQ.data || !record) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Record tidak ditemukan.
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col overflow-auto p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-3 self-start">
        <Link to={`/crm/${entityName}`}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Kembali ke {entityQ.data.label}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Record
            <Badge variant="secondary" className="font-mono text-[10px]">
              {record.id.slice(-8)}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Diperbarui {dayjs.unix(record.updatedAt).format('YYYY-MM-DD HH:mm')}
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {entityQ.data.schemaJson.fields.map((f) => (
            <div
              key={f.name}
              className="grid grid-cols-[160px_1fr] items-start gap-3 border-b pb-2 last:border-0"
            >
              <div className="text-xs text-muted-foreground">{f.label}</div>
              <div>
                <FieldRenderer field={f} value={record.data?.[f.name]} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
