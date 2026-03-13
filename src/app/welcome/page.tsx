'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/common/ui';
import { LogIn, Bug } from 'lucide-react';

export default function WelcomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/dev-login', { method: 'HEAD' })
      .then(res => {
        if (res.status !== 403) {
          setShowDevLogin(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleGoogleLogin = () => {
    setIsLoading(true);
    window.location.href = '/api/auth/google';
  };

  const handleDevLogin = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/dev-login', { method: 'POST' });
      if (!response.ok) throw new Error('Dev login failed');
      router.push('/dashboard');
    } catch (error) {
      console.error('Dev login error:', error);
      setIsLoading(false);
      alert('Dev login failed. Check console for details.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <CardTitle className="text-2xl tracking-tight">clickaround</CardTitle>
          <CardDescription className="text-sm">
            A community where ideas get debated from every angle.
            <br />
            Ask once. Get every perspective.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            isLoading={isLoading}
            className="w-full h-11"
            size="lg"
          >
            <LogIn className="mr-2 h-4 w-4" />
            Continue with Google
          </Button>

          {showDevLogin && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Dev mode</span>
                </div>
              </div>

              <Button
                onClick={handleDevLogin}
                disabled={isLoading}
                variant="outline"
                className="w-full h-11 border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                size="lg"
              >
                <Bug className="mr-2 h-4 w-4" />
                Dev login (skip OAuth)
              </Button>

              <p className="text-[11px] text-center text-orange-600 dark:text-orange-400">
                Dev mode enabled — this button won&apos;t appear in production
              </p>
            </>
          )}

          <p className="text-[11px] text-center text-muted-foreground">
            By continuing, you agree to our{' '}
            <a href="/terms" className="underline hover:text-foreground">Terms</a>
            {' '}and{' '}
            <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
