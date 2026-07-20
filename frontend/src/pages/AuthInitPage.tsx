import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthInit } from '@/hooks/useAuthInit';
import { useAuthStatus } from '@/hooks/useAuthStatus';

/**
 * /auth-init — single Init button shown when WhatsApp is not authenticated.
 *
 * Behaviour:
 *   - Reads the current auth state via useAuthStatus() (polls every 30s).
 *   - If already `open`, redirects to /chats.
 *   - Otherwise shows one big "Init" button that POSTs /api/auth/init.
 *   - On success, navigates to /qr.
 */
export function AuthInitPage() {
  const navigate = useNavigate();
  const { data: status } = useAuthStatus();
  const init = useAuthInit();
  const [error, setError] = useState<string | null>(null);

  // If we're already open, the user is logged in — send them to the app.
  if (status?.state === 'open') {
    // Navigate immediately on the next tick.
    setTimeout(() => navigate('/chats', { replace: true }), 0);
  }

  const handleInit = async () => {
    setError(null);
    try {
      await init.mutateAsync();
      navigate('/qr', { replace: true });
    } catch (err) {
      setError((err as Error).message || 'Gagal memulai autentikasi');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Hubungkan WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Klik tombol di bawah untuk memulai autentikasi WhatsApp. Setelah siap,
            halaman QR akan muncul untuk Anda pindai dengan HP.
          </p>
          <Button
            className="w-full"
            size="lg"
            disabled={init.isPending}
            onClick={handleInit}
          >
            {init.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Memulai…
              </>
            ) : (
              <>Init</>
            )}
          </Button>
          {error && (
            <p className="text-xs text-destructive" role="alert">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AuthInitPage;