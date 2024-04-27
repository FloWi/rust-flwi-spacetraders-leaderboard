import { Link } from "@tanstack/react-router";
import { Separator } from "../@/components/ui/separator.tsx";

interface ResetHeaderBarProps {
  resetDate: string;
  selectedAgents?: string[];
}

export const ResetHeaderBar = ({
  resetDate,
  selectedAgents,
}: ResetHeaderBarProps) => {
  return (
    <div className="min-w-full flex flex-col gap-4">
      <div className="flex flex-row items-center h-5 space-x-2">
        <div className="space-y-1">
          <h4 className="text-sm font-medium leading-none">Reset</h4>
          <p className="text-sm text-muted-foreground">{resetDate}</p>
        </div>
        <Link
          to="/resets/$resetDate/leaderboard"
          params={{ resetDate }}
          search={{ agents: selectedAgents }}
          className="flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
        >
          Leaderboard
        </Link>
        <Link
          to="/resets/$resetDate/history"
          params={{ resetDate }}
          search={{ selectedAgents: selectedAgents }}
          className="flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
        >
          History
        </Link>
        <Link
          to="/resets/$resetDate/jump-gate"
          params={{ resetDate }}
          className="flex h-7 items-center justify-center rounded-full px-4 text-center text-sm transition-colors hover:text-primary text-muted-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
        >
          Jump-Gate Overview
        </Link>
      </div>
      <Separator />
    </div>
  );
};
