'use client';

import { Bell, ChevronDown } from 'lucide-react';

export function UtilityBar() {
  return (
    <div className="flex items-center gap-4">
      {/* Notification Button */}
      <button
        type="button"
        className="relative cursor-pointer rounded-lg border border-border p-2 transition-colors hover:bg-muted"
        title="Notifications"
      >
        <Bell className="size-5 text-foreground" />
        <div className="absolute -top-1 -right-1 size-3 rounded-full bg-red-500" />
      </button>

      {/* Avatar Dropdown */}
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 transition-colors hover:bg-muted"
        title="Account menu"
      >
        <div className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-purple-600 text-xs font-semibold text-white">
          J
        </div>
        <ChevronDown className="size-4 text-foreground" />
      </button>
    </div>
  );
}
