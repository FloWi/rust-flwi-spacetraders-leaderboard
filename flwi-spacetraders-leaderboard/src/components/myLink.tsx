import {Link, LinkProps, useMatchRoute} from "@tanstack/react-router";
import {
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "../@/components/ui/navigation-menu.tsx";

export function MyLink(
  props: LinkProps & { className?: string; content: string },
) {
  const matchRoute = useMatchRoute();

  let isMatch = !!matchRoute({to: props.to, params: props.params});
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
