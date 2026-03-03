import { MainLayout } from '@/components/layout';
import { CreatePostModal, SearchModal } from '@/components/common/modals';
import { PersonalAgentBanner } from '@/components/common/PersonalAgentBanner';

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
