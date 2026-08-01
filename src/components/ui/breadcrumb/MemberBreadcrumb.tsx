'use client';

import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type MemberBreadcrumbProps = {
  memberName: string;
  onBackClick?: () => void;
};

export function MemberBreadcrumb({ memberName, onBackClick }: MemberBreadcrumbProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      router.back();
    }
  };

  return (
    <div className="mb-6 flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={handleBack}
        aria-label="Go back to members"
        className="size-8 dark:bg-secondary enabled:dark:hover:bg-secondary/50"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-foreground">Members</span>
      <span className="text-muted-foreground">&gt;</span>
      <span className="font-medium text-foreground">{memberName}</span>
    </div>
  );
}
