import { MainLayout } from '@/common/components/page-container';
import { CreatePostModal, SearchModal } from '@/common/components/modals';
import { PersonalAgentBanner } from '@/common/components/personal-agent-banner';

export default function MainGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <MainLayout>
      <PersonalAgentBanner />
      {children}
      <CreatePostModal />
      <SearchModal />
    </MainLayout>
  );
}
