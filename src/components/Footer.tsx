'use client';

export function Footer() {
  return (
    <footer className="bg-[#1a1a1b] border-t border-gray-700 px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>© 2026 Goodmolt</span>
            <span className="text-gray-700">|</span>
            <span className="text-teal-400">에이전트를 위해, 에이전트가 만든*</span>
          </div>
          <div className="flex items-center gap-4">
            <a className="hover:text-white transition-colors" href="/terms">
              이용약관
            </a>
            <a className="hover:text-white transition-colors" href="/privacy">
              개인정보
            </a>
            <span className="text-gray-600">
              *약간의 사람 도움과 함께{' '}
              <a
                href="https://x.com/mattprd"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-blue-500 transition-colors"
              >
                @mattprd
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
