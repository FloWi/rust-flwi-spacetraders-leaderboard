import { Link } from "@tanstack/react-router";
import { Separator } from "../@/components/ui/separator.tsx";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "../@/components/ui/navigation-menu.tsx";

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
        <div className="space-y-1 text-left">
          <h4 className="text-sm font-medium leading-none">Reset</h4>
          <p className="text-sm text-muted-foreground">{resetDate}</p>
        </div>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Page</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="flex flex-col w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px] ">
                  <li>
                    <NavigationMenuLink asChild>
                      <Link
                        to="/resets/$resetDate/leaderboard"
                        params={{ resetDate }}
                        search={{ agents: selectedAgents }}
                        className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
                      >
                        Leaderboard
                      </Link>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <Link
                        to="/resets/$resetDate/history"
                        params={{ resetDate }}
                        search={{ selectedAgents: selectedAgents }}
                        className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
                      >
                        History
                      </Link>
                    </NavigationMenuLink>
                  </li>
                  <li>
                    <NavigationMenuLink asChild>
                      <Link
                        to="/resets/$resetDate/jump-gate"
                        params={{ resetDate }}
                        className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground
              [&.active]:bg-muted
              [&.active]:font-medium
              [&.active]:text-primary
"
                      >
                        Jump-Gate Overview
                      </Link>
                    </NavigationMenuLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
      <Separator />
    </div>
  );
};
