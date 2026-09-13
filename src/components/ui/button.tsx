import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const cn = (...v: Parameters<typeof clsx>) => twMerge(clsx(v));
const styles = cva("button", {
  variants: {
    variant: {
      default: "primary",
      outline: "outline",
      ghost: "ghost",
      destructive: "destructive",
    },
    size: { default: "", sm: "small", icon: "icon" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof styles> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(styles({ variant, size }), className)} {...props} />
  );
}
