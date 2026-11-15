import React from 'react';

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="dashboard-skeleton-view" aria-hidden="true">
      {/* Skeleton Page Heading */}
      <div className="skeleton-line skeleton-eyebrow" />
      <div className="skeleton-line skeleton-headline" />
      <div className="skeleton-line skeleton-subhead" />

      {/* Primary Action Card Skeleton */}
      <div className="skeleton-block skeleton-checkin-banner" />

      {/* Grid: 4 Metric Cards */}
      <div className="skeleton-vitals-row">
        <div className="skeleton-metric-card" />
        <div className="skeleton-metric-card" />
        <div className="skeleton-metric-card" />
        <div className="skeleton-metric-card" />
      </div>

      {/* Two Column Layout: Main panel & Sidebar */}
      <div className="skeleton-layout-split">
        <div className="skeleton-block skeleton-large-panel" />
        <div className="skeleton-block skeleton-side-panel" />
      </div>
    </div>
  );
};
