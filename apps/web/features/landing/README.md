# SupportedGlobe

A scoped, static-first landing centerpiece. It owns only the globe, compact profile
explorer, motion control, and availability qualifier—not a hero, auth, navigation,
or product eligibility.

```tsx
import { SupportedGlobe } from "@/features/landing/supported-globe";

<SupportedGlobe />
```

The default derives from `regionIds` and `presentationRegions`, excluding the
neutral profile whose `countryCode` is null. No support roster is copied here.
The geographic table is deliberately broader than configured support.

Actual-use props:

```ts
type SupportedGlobeProps = {
  className?: string;
  countries?: readonly {
    countryCode: string; // unique, uppercase ISO alpha-2 code from the sourced table
    countryName: string;
    currency: { code: string | null; name: string };
  }[];
};
```

`countries` is for an explicitly scoped presentation roster; omit it for the logged-out
landing. Unknown codes remain readable in the explorer but are not plotted at
invented coordinates. `className` can constrain size/placement. Default width is
100%, max 640px; the full sphere remains inside its square stage at every size.
Keep headline, benefit copy, CTAs and surrounding layout in the parent.

## Rendering and interaction

- Server HTML includes a local shaded SVG background, correctly projected current
  markers, all profile options, and the availability description. No JS/WebGL is
  necessary to read the landing or use independent sign-in UI.
- An intersection observer defers `import("./globe-renderer")` until on screen.
  The renderer uses documented WebGL 1 APIs with two programs/two draw calls:
  a shaded orthographic sphere and sourced land points. No added dependencies,
  textures, remote assets, scene graph, dragging, physics, or animation packages.
- Rotation is 2.5°/second. Draw workload is capped at 30 frames/second, DPR 1.5,
  and a 960×960 backing buffer. Tab visibility and intersection suspend rAF.
  Paused/reduced-motion views render only when initialized, resized or explored.
- Reduced motion defaults to static; the user can explicitly press Play. Pause
  persists across visibility changes. Hovering a marker or focusing the native
  country explorer temporarily suspends rotation. Selecting/tapping a country
  pauses and brings its longitude forward; Play resumes from there.
- Country dots use sourced geographic positions, hemisphere culling and circular
  clipping. They are not displaced to declutter Europe. Nearest-point pointer hit
  testing and a native country selector make close neighbors available without
  dozens of keyboard stops. There are only two controls, independent of roster size.
- Pointer gestures never capture or prevent page scrolling/zooming. Country labels
  show the configured native currency, not token/funding claims.
- No WebGL, shader/import failure, or context loss retains/restores the SVG view.
  Its orientation stays fixed, but the country explorer still reads every profile.
  Context loss does not repeatedly retry an unhealthy GPU context.
- Unmount cancels rAF, disconnects both observers, removes listeners, deletes both
  buffers/programs and all four shaders, then releases the context. Profile prop
  changes update marker data without rebuilding the GPU context.

## Tests and limits

`bun test apps/web/features/landing` checks automatic configured coverage, euro-area
coverage, main-country coordinate choice, antipodes/antimeridian/poles, land vectors,
hit testing, motion policy, SSR fallback and the bounded keyboard surface.

Natural Earth is a simplified cartographic source, not a political/eligibility map.
Some small islands have a supported marker but no land dots at 110m scale. A fixed
12° northward camera tilt shows a full, uncropped globe but not the extreme south
polar cap. For provenance, license and deterministic regeneration see
[GEOGRAPHY.md](./GEOGRAPHY.md).

Implementation API references:
- https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event
- https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API

Browser evidence is recorded outside the repository in the task handoff. Software
WebGL observations are validation evidence, not a physical-device performance claim.
