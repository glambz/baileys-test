import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Plus, Database } from 'lucide-react';
import { useEntities } from '@/hooks/crm/useEntities';
import { useRecords } from '@/hooks/crm/useRecords';
import { useKnowledgeFiles } from '@/hooks/crm/useKnowledge';

/**
 * CRM workspace home page. Three tabs (Schema / Data / Knowledge);
 * the Schema and Knowledge tabs deep-link to dedicated pages via
 * React Router (`/crm/_schema`, `/crm/_knowledge`) and the Data tab
 * lists entities with click-to-data-viewer.
 *
 * See `docs/crm/features/navigation/spec.md` §1.3 and
 * `docs/crm/features/schema-designer/spec.md` §2.
 */
export default function CrmWorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const query = useEntities();
  const filesQuery = useKnowledgeFiles();

  const initialTab: 'data' | 'schema' | 'knowledge' =
    location.pathname === '/crm/_schema'
      ? 'schema'
      : location.pathname === '/crm/_knowledge'
        ? 'knowledge'
        : 'data';

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4 md:p-6">
      <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">CRM Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Kelola schema, data, dan knowledge base AI Anda.
          </p>
        </div>
        <Button asChild>
          <Link to="/crm/_schema">
            <Plus className="mr-2 h-4 w-4" /> Entitas baru
          </Link>
        </Button>
      </header>
      <Tabs defaultValue={initialTab} className="flex flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="schema" onClick={() => navigate('/crm/_schema')}>
            Schema
          </TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="knowledge" onClick={() => navigate('/crm/_knowledge')}>
            Knowledge
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="flex-1" forceMount>
          <DataTab query={query} />
        </TabsContent>

        <TabsContent value="schema" className="flex-1" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Schema designer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Kelola entity, field, dan relasi di schema designer.
              </p>
              <Button asChild className="mt-4" variant="outline">
                <Link to="/crm/_schema">Buka schema designer</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="flex-1" forceMount>
          <Card>
            <CardHeader>
              <CardTitle>Knowledge</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Upload dokumen untuk knowledge base AI. {filesQuery.data?.length ?? 0} file terindeks.
              </p>
              <Button asChild className="mt-4" variant="outline">
                <Link to="/crm/_knowledge">Buka knowledge</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DataTab({ query }: { query: ReturnType<typeof useEntities> }) {
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
          <p>Gagal memuat entitas.</p>
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
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Database className="h-10 w-10 opacity-40" aria-hidden />
          <p className="font-medium text-foreground">Belum ada entity</p>
          <p>Klik + Entitas baru untuk mulai.</p>
          <Button asChild className="mt-2">
            <Link to="/crm/_schema">Buat entity</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {entities.map((e) => (
        <EntityCard key={e.id} entity={e} />
      ))}
    </div>
  );
}

function EntityCard({ entity }: { entity: import('@/types/crm').EntityDefinition }) {
  const records = useRecords(entity.name, { limit: 1, offset: 0 });
  const fieldCount = entity.schemaJson.fields.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{entity.label}</span>
          <Badge variant="secondary" className="font-mono text-[10px]">
            v{entity.version}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="line-clamp-2 text-muted-foreground">
          {entity.description ?? 'Tidak ada deskripsi.'}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{fieldCount} field</span>
          <span aria-hidden>·</span>
          <span>{records.data?.total ?? 0} record</span>
        </div>
        <Button asChild variant="outline" size="sm" className="mt-2">
          <Link to={`/crm/${entity.name}`}>Buka data</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
