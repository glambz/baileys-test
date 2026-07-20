import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Route catch-all page.
 */
export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant="default">
            <a href="/chats">Kembali ke Chats</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}