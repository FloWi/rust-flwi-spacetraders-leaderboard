import {Link, LinkProps, useMatchRoute} from "@tanstack/react-router";
import {Separator} from "../@/components/ui/separator.tsx";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "../@/components/ui/navigation-menu.tsx";

interface ResetHeaderBarProps {
  resetDate: string;
  selectedAgents?: string[];
}

function MyLink(props: LinkProps & { className?: string; content: string }) {
  const matchRoute = useMatchRoute();

  let isMatch = !!matchRoute({to: props.to});
  return (
    <NavigationMenuLink
      asChild
      active={isMatch}
      className={navigationMenuTriggerStyle()}
    >
      <Link {...props}>{props.content}</Link>
    </NavigationMenuLink>
  );
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
                    <MyLink
                      to="/resets/$resetDate/leaderboard"
                      params={{resetDate}}
                      search={{agents: selectedAgents}}
                      content="Leaderboard"
                    ></MyLink>
                  </li>
                  <li>
                    <MyLink
                      to="/resets/$resetDate/history"
                      params={{resetDate: resetDate}}
                      search={{selectedAgents: selectedAgents}}
                      className={navigationMenuTriggerStyle()}
                      content="History"
                    />
                  </li>
                  <li>
                    <MyLink
                      to="/resets/$resetDate/jump-gate"
                      params={{resetDate}}
                      className={navigationMenuTriggerStyle()}
                      content="Jump-Gate Overview"
                    ></MyLink>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
      <Separator/>
    </div>
  );
};
