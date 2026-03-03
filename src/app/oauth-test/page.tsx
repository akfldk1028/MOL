'use client';

export default function OAuthTestPage() {
  if (typeof window !== 'undefined') {
    console.log('전체 URL:', window.location.href);
  }
  const params = typeof window !== 'undefined'
    ? Object.fromEntries(new URLSearchParams(window.location.search))
    : {};
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>OAuth 테스트 페이지</h1>
      <pre style={{ background: '#f5f5f5', padding: '10px' }}>
        {JSON.stringify(params, null, 2)}
      </pre>
    </div>
  );
}
