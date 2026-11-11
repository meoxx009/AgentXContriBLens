'use client';

import FindingDetailsView from '@/components/views/FindingDetailsView';

export default function AppFindingDetailsPage(props: { params: Promise<{ findingId: string }> }) {
  return <FindingDetailsView {...props} />;
}
