import type { ComponentPropsWithRef, CSSProperties } from "react";

export type SpaceToken = "0" | "1" | "2" | "3" | "4" | "6" | "8";
export type LayoutSpace = SpaceToken | { custom: string };

type LayoutProps = ComponentPropsWithRef<"div"> & {
  /** Tokenized spacing by default; use `{ custom: value }` for exceptional layouts. */
  space?: LayoutSpace;
};

export type StackProps = LayoutProps;
export type InlineProps = LayoutProps;
export type InsetProps = LayoutProps;
export type BleedProps = LayoutProps;

function getLayoutProps(space: LayoutSpace, style: CSSProperties | undefined) {
  const token = typeof space === "string" ? space : "custom";
  const value = typeof space === "string" ? `var(--home-ui-space-${space})` : space.custom;

  return {
    "data-space": token,
    style: { ...style, "--home-ui-layout-space": value } as CSSProperties,
  };
}

function layoutClassName(base: string, className: string | undefined) {
  return [base, className].filter(Boolean).join(" ");
}

export function Stack({ space = "4", style, className, ...props }: StackProps) {
  return <div {...props} {...getLayoutProps(space, style)} className={layoutClassName("home-ui-stack", className)} />;
}

export function Inline({ space = "4", style, className, ...props }: InlineProps) {
  return <div {...props} {...getLayoutProps(space, style)} className={layoutClassName("home-ui-inline", className)} />;
}

export function Inset({ space = "4", style, className, ...props }: InsetProps) {
  return <div {...props} {...getLayoutProps(space, style)} className={layoutClassName("home-ui-inset", className)} />;
}

export function Bleed({ space = "4", style, className, ...props }: BleedProps) {
  return <div {...props} {...getLayoutProps(space, style)} className={layoutClassName("home-ui-bleed", className)} />;
}
