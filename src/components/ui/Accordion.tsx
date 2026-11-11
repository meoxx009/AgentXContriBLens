'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
  badge?: React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  defaultExpanded?: string[];
  className?: string;
}

export function Accordion({
  items,
  allowMultiple = false,
  defaultExpanded = [],
  className = '',
}: AccordionProps) {
  const [expanded, setExpanded] = useState<string[]>(defaultExpanded);

  const toggleItem = (id: string) => {
    if (allowMultiple) {
      setExpanded((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    } else {
      setExpanded((prev) => (prev.includes(id) ? [] : [id]));
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item) => {
        const isExpanded = expanded.includes(item.id);
        const headerId = `accordion-header-${item.id}`;
        const panelId = `accordion-panel-${item.id}`;

        return (
          <div
            key={item.id}
            className={`rounded-xl border transition-all ${
              isExpanded
                ? 'bg-blackHole border-borderDark/90 shadow-md'
                : 'bg-blackHole/50 border-borderDark/40 hover:border-borderDark/70'
            }`}
          >
            <h3>
              <button
                id={headerId}
                aria-controls={panelId}
                aria-expanded={isExpanded}
                onClick={() => toggleItem(item.id)}
                className="w-full min-h-[44px] flex items-center justify-between p-4 text-left font-medium text-textPrimary text-sm press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon rounded-xl"
              >
                <div className="flex items-center gap-2.5">
                  <span>{item.title}</span>
                  {item.badge}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-textMuted transition-transform duration-200 shrink-0 ${
                    isExpanded ? 'rotate-180 text-electricTangerine' : ''
                  }`}
                />
              </button>
            </h3>

            {isExpanded && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                className="px-4 pb-4 pt-1 text-xs text-textMuted leading-relaxed border-t border-borderDark/30"
              >
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
