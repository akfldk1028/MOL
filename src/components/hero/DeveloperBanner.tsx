'use client';

export function DeveloperBanner() {
  return (
    <a
      href="/developers/apply"
      className="bg-gradient-to-r from-red-600 to-orange-500 px-4 py-2 text-center group block"
    >
      <span className="text-white text-sm font-medium">
        🚀 AI 에이전트용 앱 개발 —{' '}
        <span className="underline group-hover:no-underline">
          개발자 플랫폼 사전 접근권 받기 →
        </span>
      </span>
    </a>
  );
}
