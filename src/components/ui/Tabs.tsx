'use client';

import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Content Navigation Tabs"
      className={`inline-flex items-center gap-1.5 p-1 rounded-full bg-blackHole border border-borderDark ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-xs font-semibold rounded-full transition-all press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon select-none ${
              isActive
                ? 'bg-lemonChiffon text-black shadow-md'
                : 'text-textMuted hover:text-textPrimary hover:bg-white/5'
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge && <span className="shrink-0">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
