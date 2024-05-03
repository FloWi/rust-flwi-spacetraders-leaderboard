import {Link, LinkProps, useMatchRoute} from "@tanstack/react-router";
import {
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "../@/components/ui/navigation-menu.tsx";

type MyLinkProps = LinkProps & { className?: string }

export function MyLink(
  props: MyLinkProps
) {
  const matchRoute = useMatchRoute();

  let isMatch = !!matchRoute({to: props.to, params: props.params});
  return (
    <NavigationMenuLink
      asChild
      active={isMatch}
      className={navigationMenuTriggerStyle()}
    >
      <Link {...props}>{props.children}</Link>
    </NavigationMenuLink>
  );
}
