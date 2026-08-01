'use client';

import type { NotificationType } from '@/types/Notification';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications } from '@/hooks/UseNotifications';
import { cn } from '@/utils/Helpers';

const notificationIconMap: Record<NotificationType, React.ElementType> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

const notificationColorMap: Record<NotificationType, string> = {
  info: 'text-blue-500',
  success: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
};

const notificationBgMap: Record<NotificationType, string> = {
  info: 'bg-blue-50 dark:bg-blue-950',
  success: 'bg-green-50 dark:bg-green-950',
  warning: 'bg-yellow-50 dark:bg-yellow-950',
  error: 'bg-red-50 dark:bg-red-950',
};

function formatRelativeTime(date: Date, locale: string): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffInSeconds < 60) {
    return rtf.format(-diffInSeconds, 'second');
  }
  if (diffInSeconds < 3600) {
    return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
  }
  if (diffInSeconds < 86400) {
    return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
  }
  return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
}

export const NotificationButton = () => {
  const t = useTranslations('Notifications');
  const {
    notifications,
    unreadCount,
    hasUnread,
    markAsRead,
    markAllAsRead,
    removeNotification,
  } = useNotifications();

  // Static translation maps to satisfy i18n-check tool
  const titles = {
    new_member_joined: t('new_member_joined'),
    payment_received: t('payment_received'),
    membership_expiring: t('membership_expiring'),
    payment_failed: t('payment_failed'),
    class_reminder: t('class_reminder'),
    trial_ending: t('trial_ending'),
    profile_updated: t('profile_updated'),
  };

  const messages = {
    new_member_joined_message: t('new_member_joined_message'),
    payment_received_message: t('payment_received_message'),
    membership_expiring_message: t('membership_expiring_message'),
    payment_failed_message: t('payment_failed_message'),
    class_reminder_message: t('class_reminder_message'),
    trial_ending_message: t('trial_ending_message'),
    profile_updated_message: t('profile_updated_message'),
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t('view_notifications')}
        >
          <Bell className="size-5" />
          <span className="sr-only">{t('view_notifications')}</span>
          {hasUnread && (
            <span
              className="absolute -top-1 -right-1 size-3 rounded-full bg-red-500"
              aria-label={t('unread_indicator')}
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 sm:w-96 md:w-md"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <DropdownMenuLabel className="p-0">
              {t('title')}
            </DropdownMenuLabel>
            {hasUnread && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">
                {t('unread_count', { count: unreadCount })}
              </span>
            )}
          </div>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={markAllAsRead}
            >
              {t('mark_all_read')}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-100 overflow-y-auto">
          {notifications.length === 0
            ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t('no_notifications')}
                </div>
              )
            : (
                notifications.map((notification) => {
                  const Icon = notificationIconMap[notification.type];
                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        'relative flex cursor-pointer gap-3 p-3 transition-colors hover:bg-accent/50',
                        !notification.read && notificationBgMap[notification.type],
                      )}
                      onClick={() => markAsRead(notification.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          markAsRead(notification.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${titles[notification.title]}: ${messages[notification.message]}`}
                    >
                      <div
                        className={cn(
                          'mt-0.5 shrink-0',
                          notificationColorMap[notification.type],
                        )}
                      >
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm leading-tight font-medium',
                            !notification.read && 'font-semibold',
                          )}
                        >
                          {titles[notification.title]}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {messages[notification.message]}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatRelativeTime(notification.timestamp, 'en')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="absolute top-2 right-2 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:opacity-100 focus:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(notification.id);
                        }}
                        aria-label={t('dismiss_notification')}
                      >
                        <X className="size-3.5 text-muted-foreground" />
                      </button>
                      {!notification.read && (
                        <span
                          className="absolute top-1/2 left-1 size-2 -translate-y-1/2 rounded-full bg-blue-500"
                          aria-label={t('unread_indicator')}
                        />
                      )}
                    </div>
                  );
                })
              )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
