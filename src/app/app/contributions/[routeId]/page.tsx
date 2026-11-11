'use client';

import RouteDetailsView from '@/components/views/RouteDetailsView';

export default function AppRouteDetailsPage(props: { params: Promise<{ routeId: string }> }) {
  return <RouteDetailsView {...props} />;
}
