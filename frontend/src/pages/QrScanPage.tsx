import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthInit } from '@/hooks/useAuthInit';
import { useAuthStatus } from '@/hooks/useAuthStatus';

/**
 * /qr — QR scan page.
 *
 * Two buttons:
 *   - "Show QR" — fetches /api/auth/qr.json and displays the QR data URL.
 *     Polls the QR every 5 s because Baileys refreshes the QR periodically.
 *   - "Init" — calls /api/auth/init (force log in if the previous init
 *     didn't complete). Shows loading state while in flight.
 *
 * Behaviour:
 *   - When state becomes `open`, redirect to /chats.
 *   - When state is `qr` (have QR, not yet scanned), show the QR.
 *   - When state is `connecting`, show "Menghubungkan…" spinner.
 *   - When state is `close`, the user came here without an active
 *     session — show the Init button (the "scan" path requires a QR
 *     which is only generated after init).
 */
export function QrScanPage() {
  const navigate = useNavigate();
  const { data: status } = useAuthStatus();
  const init = useAuthInit();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Auto-redirect when authed.
  useEffect(() => {
    if (status?.state === 'open') {
      navigate('/chats', { replace: true });
    }
  }, [status?.state, navigate]);

  // Poll QR every 5 s while on this page.
  useEffect(() => {
    let cancelled = false;
    const fetchQr = async () => {
      setQrLoading(true);
      try {
        const r = await fetch('/api/auth/qr', { credentials: 'include' });
        if (cancelled) return;
        if (r.status === 200 && r.headers.get('content-type')?.startsWith('image/')) {
          const blob = await r.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          setQrDataUrl(dataUrl);
          setQrError(null);
        } else if (r.status === 202) {
          setQrDataUrl(null);
          setQrError('QR belum siap, coba sebentar lagi');
        } else if (r.status === 409) {
          // Already authenticated; the redirect effect above will handle it.
        } else {
          setQrError(`Gagal memuat QR (HTTP ${r.status})`);
        }
      } catch (err) {
        if (!cancelled) setQrError((err as Error).message);
      } finally {
        if (!cancelled) setQrLoading(false);
      }
    };
    fetchQr();
    const t = setInterval(fetchQr, 5_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const handleInit = async () => {
    try {
      await init.mutateAsync();
    } catch (_) {
      // Error surfaced via the hook; the user can try again.
    }
  };

  // Choose what to show based on the BE state.
  const renderQrPanel = () => {
    if (status?.state === 'connecting') {
      return (
        <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <span>Menghubungkan ke WhatsApp…</span>
        </div>
      );
    }
    if (qrLoading && !qrDataUrl) {
      return <Skeleton className="h-64 w-64" aria-label="Memuat QR" />;
    }
    if (qrDataUrl) {
      return (
        // eslint-disable-next-line jsx-a11y/img-redundant-alt
        <img
          src={qrDataUrl}
          alt="QR code untuk memindai dengan WhatsApp"
          className="h-64 w-64 border bg-white p-2"
        />
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        {qrError ?? 'QR belum siap. Klik "Show QR" untuk refresh.'}
      </p>
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Pindai QR WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Buka WhatsApp di HP Anda.</li>
            <li>
              Pilih <strong>Linked Devices</strong> (Perangkat Tertaut) →{' '}
              <strong>Link a Device</strong> (Tautkan Perangkat).
            </li>
            <li>Pindai QR di bawah dengan kamera HP.</li>
          </ol>

          <div className="flex items-center justify-center rounded-md border bg-secondary/30 p-4">
            {renderQrPanel()}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => window.location.reload()}
              disabled={qrLoading}
            >
              Show QR
            </Button>
            <Button
              className="flex-1"
              onClick={handleInit}
              disabled={init.isPending}
            >
              {init.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Logging in…
                </>
              ) : (
                <>Init</>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Tombol <strong>Init</strong> memanggil{' '}
            <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">
              POST /api/auth/init
            </code>{' '}
            untuk log in ke server WhatsApp. QR di atas akan refresh otomatis
            setiap 5 detik; klik <strong>Show QR</strong> untuk refresh manual.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default QrScanPage;