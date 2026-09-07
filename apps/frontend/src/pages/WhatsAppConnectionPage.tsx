import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plug,
  QrCode,
  LogOut,
  RefreshCw,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAuthInit } from '@/hooks/useAuthInit';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { useAuthQr, type AuthQrResult } from '@/hooks/useAuthQr';
import { useAuthLogout, type AuthLogoutResult } from '@/hooks/useAuthLogout';
import type { AuthStatus } from '@/types';
import { cn } from '@/lib/utils';

/**
 * /whatsapp-connection — manual control panel for the WhatsApp socket.
 *
 * Deliberately manual, and deliberately separate from /qr. That page is a
 * guided onboarding flow: it polls the QR every 5s and redirects to /chats
 * the moment the socket opens. Useful the first time, wrong for an operator
 * diagnosing a dropped session, who wants to press one thing at a time and
 * read what came back.
 *
 * Each action shows its own outcome, including the raw message from the
 * backend, so a failure is legible instead of just "it didn't work".
 */

type ConnState = AuthStatus['state'];

const STATE_META: Record<
  ConnState,
  { label: string; icon: typeof Plug; className: string; hint: string }
> = {
  open: {
    label: 'Tersambung',
    icon: CheckCircle2,
    className: 'border-success/30 bg-success/10 text-success',
    hint: 'Socket aktif. Pesan masuk dan keluar berjalan normal.',
  },
  qr: {
    label: 'Menunggu QR dipindai',
    icon: QrCode,
    className: 'border-info/30 bg-info/10 text-info',
    hint: 'QR sudah dibuat. Pindai dengan WhatsApp di HP untuk menyelesaikan pairing.',
  },
  connecting: {
    label: 'Menyambung',
    icon: Loader2,
    className: 'border-warning/30 bg-warning/10 text-warning',
    hint: 'Socket sedang menyambung. Tunggu beberapa detik lalu cek status lagi.',
  },
  close: {
    label: 'Terputus',
    icon: XCircle,
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
    hint: 'Tidak ada socket aktif. Klik "Inisialisasi koneksi" untuk memulai.',
  },
};

function StatePill({ state }: { state: ConnState }) {
  const meta = STATE_META[state] ?? STATE_META.close;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        meta.className
      )}
    >
      <Icon
        aria-hidden
        className={cn('h-3.5 w-3.5', state === 'connecting' && 'animate-spin')}
      />
      {meta.label}
    </span>
  );
}

/**
 * Outcome panel shared by all three actions. Renders nothing until an action
 * has run, so the page does not open with three empty boxes.
 */
function Outcome({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'error';
  children: ReactNode;
}) {
  const toneClass = {
    ok: 'border-success/30 bg-success/[0.07] text-foreground',
    warn: 'border-warning/30 bg-warning/[0.07] text-foreground',
    error: 'border-destructive/30 bg-destructive/[0.07] text-foreground',
  }[tone];
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : XCircle;
  const iconClass =
    tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-destructive';
  return (
    <div
      role="status"
      className={cn('flex gap-2 rounded-md border p-3 text-xs leading-relaxed', toneClass)}
    >
      <Icon aria-hidden className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', iconClass)} />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

/** A labelled row in the status detail list. */
function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-xs font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

export default function WhatsAppConnectionPage() {
  const qc = useQueryClient();
  const statusQuery = useAuthStatus();
  const init = useAuthInit();
  const qr = useAuthQr();
  const logout = useAuthLogout();

  const [initMessage, setInitMessage] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [qrResult, setQrResult] = useState<AuthQrResult | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [statusCheckedAt, setStatusCheckedAt] = useState<string | null>(null);
  const [logoutResult, setLogoutResult] = useState<AuthLogoutResult | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const status = statusQuery.data;
  const state: ConnState = (status?.state as ConnState) ?? 'close';
  const meta = STATE_META[state] ?? STATE_META.close;

  const handleInit = async () => {
    setInitError(null);
    setInitMessage(null);
    try {
      const res = (await init.mutateAsync()) as { message?: string } | undefined;
      setInitMessage(res?.message ?? 'Permintaan inisialisasi terkirim.');
      // The socket state changes as a result, so the cached status is stale.
      await qc.invalidateQueries({ queryKey: ['auth', 'status'] });
    } catch (err) {
      setInitError((err as Error).message);
    }
  };

  const handleShowQr = async () => {
    setQrError(null);
    try {
      const res = await qr.mutateAsync();
      setQrResult(res);
      // A QR being issued means the state moved to `qr`; refresh the pill.
      await qc.invalidateQueries({ queryKey: ['auth', 'status'] });
    } catch (err) {
      setQrResult(null);
      setQrError((err as Error).message);
    }
  };

  const handleCheckStatus = async () => {
    await statusQuery.refetch();
    setStatusCheckedAt(new Date().toLocaleTimeString());
  };

  const handleLogout = async () => {
    setConfirmLogout(false);
    setLogoutError(null);
    setLogoutResult(null);
    try {
      const res = await logout.mutateAsync();
      setLogoutResult(res);
      // Clear the stale QR panel: any QR shown belonged to the session that
      // just ended, and the chat caches now belong to no account.
      setQrResult(null);
      await qc.invalidateQueries({ queryKey: ['auth', 'status'] });
      await qc.invalidateQueries({ queryKey: ['chats'] });
      await qc.invalidateQueries({ queryKey: ['crm', 'chats', 'modes'] });
    } catch (err) {
      setLogoutError((err as Error).message);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[12rem] flex-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Smartphone aria-hidden className="h-5 w-5 text-primary" />
              WhatsApp Connection
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Inisialisasi socket, ambil QR, dan periksa status — masing-masing satu klik.
            </p>
          </div>
          {statusQuery.isLoading ? (
            <span className="text-xs text-muted-foreground">Memuat status…</span>
          ) : (
            <StatePill state={state} />
          )}
        </header>

        <p className="rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
          {meta.hint}
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {/* 1 — Initialise */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Plug aria-hidden className="h-4 w-4 text-muted-foreground" />
                Inisialisasi
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Membuka socket ke WhatsApp. Aman dipanggil ulang — kalau sudah tersambung,
                backend hanya melaporkan statusnya.
              </p>
              <Button
                className="w-full"
                onClick={handleInit}
                disabled={init.isPending}
                aria-busy={init.isPending}
              >
                {init.isPending ? (
                  <>
                    <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
                    Menginisialisasi…
                  </>
                ) : (
                  <>
                    <Plug aria-hidden className="mr-1.5 h-4 w-4" />
                    Inisialisasi koneksi
                  </>
                )}
              </Button>
              {initMessage && <Outcome tone="ok">{initMessage}</Outcome>}
              {initError && (
                <Outcome tone="error">
                  <p className="font-medium">Gagal inisialisasi</p>
                  <p>{initError}</p>
                </Outcome>
              )}
            </CardContent>
          </Card>

          {/* 2 — Show QR */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <QrCode aria-hidden className="h-4 w-4 text-muted-foreground" />
                QR Code
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                WhatsApp di HP → <strong>Perangkat Tertaut</strong> →{' '}
                <strong>Tautkan Perangkat</strong>, lalu pindai.
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={handleShowQr}
                disabled={qr.isPending}
                aria-busy={qr.isPending}
              >
                {qr.isPending ? (
                  <>
                    <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
                    Mengambil QR…
                  </>
                ) : (
                  <>
                    <QrCode aria-hidden className="mr-1.5 h-4 w-4" />
                    Tampilkan QR
                  </>
                )}
              </Button>

              {qrResult?.kind === 'ready' && (
                <div className="space-y-2">
                  <img
                    src={qrResult.dataUrl}
                    alt="Kode QR untuk menautkan perangkat WhatsApp"
                    className="mx-auto h-44 w-44 rounded border bg-white p-1.5"
                  />
                  <p className="text-center text-[11px] text-muted-foreground">
                    QR berganti berkala. Klik tombol di atas untuk mengambil yang terbaru.
                  </p>
                </div>
              )}
              {qrResult?.kind === 'not-ready' && (
                <Outcome tone="warn">{qrResult.message}</Outcome>
              )}
              {qrResult?.kind === 'already-connected' && (
                <Outcome tone="ok">{qrResult.message}</Outcome>
              )}
              {qrError && (
                <Outcome tone="error">
                  <p className="font-medium">Gagal mengambil QR</p>
                  <p>{qrError}</p>
                </Outcome>
              )}
            </CardContent>
          </Card>

          {/* 3 — Check status */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <RefreshCw aria-hidden className="h-4 w-4 text-muted-foreground" />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Membaca status socket terkini dari backend.
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={handleCheckStatus}
                disabled={statusQuery.isFetching}
                aria-busy={statusQuery.isFetching}
              >
                {statusQuery.isFetching ? (
                  <>
                    <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
                    Memeriksa…
                  </>
                ) : (
                  <>
                    <RefreshCw aria-hidden className="mr-1.5 h-4 w-4" />
                    Cek status
                  </>
                )}
              </Button>

              {statusQuery.isError && (
                <Outcome tone="error">
                  <p className="font-medium">Gagal membaca status</p>
                  <p>{(statusQuery.error as Error)?.message}</p>
                </Outcome>
              )}

              {status && (
                <dl className="divide-y divide-border rounded-md border border-border px-3 py-1">
                  <Detail label="State" value={status.state} />
                  <Detail label="Tersambung" value={status.connected ? 'ya' : 'tidak'} />
                  {status.userName && <Detail label="Akun" value={status.userName} />}
                  {status.userJid && (
                    <Detail
                      label="JID"
                      value={<code className="text-[11px]">{status.userJid}</code>}
                    />
                  )}
                  {typeof status.reconnectAttempts === 'number' &&
                    status.reconnectAttempts > 0 && (
                      <Detail label="Percobaan ulang" value={status.reconnectAttempts} />
                    )}
                  {status.lastError && (
                    <Detail
                      label="Error terakhir"
                      value={<span className="text-destructive">{status.lastError}</span>}
                    />
                  )}
                  {statusCheckedAt && (
                    <Detail label="Diperiksa" value={statusCheckedAt} />
                  )}
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 4 — Logout. Separated from the grid above because it is the only
            destructive action here: it unlinks the device, so getting back in
            needs physical access to the phone. */}
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <LogOut aria-hidden className="h-4 w-4 text-destructive" />
              Logout
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Memutus tautan perangkat ini dari WhatsApp dan menghapus kredensial lokal.
              Entri di <strong>Perangkat Tertaut</strong> akan hilang, jadi untuk menyambung
              lagi Anda perlu memindai QR baru dari HP.
            </p>
            <p className="text-xs text-muted-foreground">
              Riwayat chat di database <strong>tidak dihapus</strong>. Setiap baris terikat ke
              akun yang menulisnya, jadi memasang akun lain akan menampilkan chat akun itu
              saja — bukan gabungan keduanya.
            </p>
            <Button
              variant="destructive"
              onClick={() => setConfirmLogout(true)}
              disabled={logout.isPending}
              aria-busy={logout.isPending}
            >
              {logout.isPending ? (
                <>
                  <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
                  Memutus tautan…
                </>
              ) : (
                <>
                  <LogOut aria-hidden className="mr-1.5 h-4 w-4" />
                  Logout &amp; putuskan tautan
                </>
              )}
            </Button>

            {logoutResult && (
              <Outcome tone={logoutResult.sessionCleared === false ? 'warn' : 'ok'}>
                <p className="font-medium">{logoutResult.message}</p>
                <ul className="list-inside list-disc">
                  <li>
                    Perangkat ter-unlink:{' '}
                    {logoutResult.deviceUnlinked ? 'ya' : 'tidak'}
                  </li>
                  <li>
                    Sesi lokal terhapus:{' '}
                    {logoutResult.sessionCleared ? 'ya' : 'tidak'}
                    {typeof logoutResult.filesRemoved === 'number' &&
                      ` (${logoutResult.filesRemoved} file)`}
                  </li>
                </ul>
                {logoutResult.unlinkError && (
                  <p className="text-muted-foreground">
                    Catatan unlink: {logoutResult.unlinkError}
                  </p>
                )}
              </Outcome>
            )}
            {logoutError && (
              <Outcome tone="error">
                <p className="font-medium">Gagal logout</p>
                <p>{logoutError}</p>
              </Outcome>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Putuskan tautan perangkat ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Perangkat ini akan dihapus dari daftar Perangkat Tertaut di WhatsApp dan
                kredensial lokal dihapus. Untuk menyambung lagi Anda perlu memindai QR
                baru — jadi pastikan HP-nya ada di dekat Anda. Riwayat chat di database
                tetap tersimpan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleLogout()}>
                Ya, logout
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <p className="text-[11px] text-muted-foreground">
          Endpoint:{' '}
          <code className="rounded bg-secondary px-1 py-0.5">POST /api/auth/init</code>,{' '}
          <code className="rounded bg-secondary px-1 py-0.5">GET /api/auth/qr.json</code>,{' '}
          <code className="rounded bg-secondary px-1 py-0.5">GET /api/auth/status</code>,{' '}
          <code className="rounded bg-secondary px-1 py-0.5">POST /api/auth/logout</code>.
          Status juga ikut ter-refresh otomatis tiap 30 detik.
        </p>
      </div>
    </div>
  );
}
