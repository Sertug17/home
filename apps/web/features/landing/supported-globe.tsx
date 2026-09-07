"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  configuredGlobeCountries,
  INITIAL_LONGITUDE,
  locateCountries,
  projectCountry,
  shouldAnimateGlobe,
  type GlobeCountry,
} from "./globe-geometry";
import type { GlobeRenderer } from "./globe-renderer";
import styles from "./supported-globe.module.css";

export type { GlobeCountry } from "./globe-geometry";

export type SupportedGlobeProps = {
  className?: string;
  /** Defaults to every configured non-neutral presentation profile. ISO alpha-2 codes. */
  countries?: readonly GlobeCountry[];
};

const defaultCountries = configuredGlobeCountries();
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function motionSnapshot() { return window.matchMedia(motionQuery).matches; }
function serverMotionSnapshot() { return true; }

/** A centerpiece only: composition, headline and sign-in remain with the landing. */
export function SupportedGlobe({ className, countries = defaultCountries }: SupportedGlobeProps) {
  const descriptionId = useId();
  const motionId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef(new Map<string, SVGCircleElement>());
  const rendererRef = useRef<GlobeRenderer | null>(null);
  const motionRef = useRef(false);
  const longitudeRef = useRef(INITIAL_LONGITUDE);
  const points = useMemo(() => locateCountries(countries), [countries]);
  const pointsRef = useRef(points);
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotionSnapshot);
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"static" | "ready" | "unavailable">("static");
  const playing = shouldAnimateGlobe(reducedMotion, userPlaying);

  useEffect(() => {
    pointsRef.current = points;
    for (const point of points) {
      const marker = markerRefs.current.get(point.countryCode);
      const position = projectCountry(point.longitude, point.latitude, longitudeRef.current);
      marker?.setAttribute("cx", position.x.toFixed(3));
      marker?.setAttribute("cy", position.y.toFixed(3));
      marker?.setAttribute("visibility", position.visible ? "visible" : "hidden");
    }
  }, [points]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    let cancelled = false;
    let renderer: GlobeRenderer | undefined;

    function project(longitude: number) {
      longitudeRef.current = longitude;
      for (const point of pointsRef.current) {
        const marker = markerRefs.current.get(point.countryCode);
        if (!marker) continue;
        const position = projectCountry(point.longitude, point.latitude, longitude);
        marker.setAttribute("cx", position.x.toFixed(3));
        marker.setAttribute("cy", position.y.toFixed(3));
        marker.setAttribute("visibility", position.visible ? "visible" : "hidden");
      }
    }

    function unavailable() {
      if (cancelled) return;
      rendererRef.current = null;
      project(INITIAL_LONGITUDE);
      setStatus("unavailable");
    }

    // Static server HTML stays useful; GPU code isn't a prerequisite to sign-in.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      import("./globe-renderer").then(({ createGlobeRenderer }) => {
        if (cancelled) return;
        renderer = createGlobeRenderer(canvas!, stage!, project, unavailable);
        rendererRef.current = renderer;
        renderer.setMotion(motionRef.current);
        setStatus("ready");
      }).catch(unavailable);
    });
    observer.observe(stage);
    return () => {
      cancelled = true;
      observer.disconnect();
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    motionRef.current = playing;
    rendererRef.current?.setMotion(status === "ready" && playing);
  }, [status, playing]);

  return (
    <figure className={[styles.globe, className].filter(Boolean).join(" ")} data-renderer={status}>
      <div ref={stageRef} className={styles.stage}
        role={status === "ready" ? "group" : "img"}
        aria-label="A world of country profiles"
        aria-describedby={`${descriptionId} ${motionId}`}
        tabIndex={status === "ready" ? 0 : undefined}
        aria-keyshortcuts={status === "ready" ? "Space ArrowLeft ArrowRight" : undefined}
        onKeyDown={(event) => {
          if (status !== "ready" || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === " ") {
            event.preventDefault();
            if (!event.repeat) setUserPlaying(!playing);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            rendererRef.current?.rotate(event.key === "ArrowLeft" ? 12 : -12);
          }
        }}>
        <div className={styles.staticGlobe} hidden={status === "ready"} aria-hidden="true" />
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true"
          style={{ visibility: status === "ready" ? "visible" : "hidden" }} />
        <svg className={styles.markers} viewBox="0 0 100 100" aria-hidden="true">
          {points.map((point) => {
            const position = projectCountry(point.longitude, point.latitude);
            return <circle key={point.countryCode} data-country={point.countryCode}
              ref={(node) => {
                if (node) markerRefs.current.set(point.countryCode, node);
                else markerRefs.current.delete(point.countryCode);
              }}
              cx={position.x.toFixed(3)} cy={position.y.toFixed(3)} r=".48"
              visibility={position.visible ? "visible" : "hidden"}
              fill="#0000FF" stroke="white" strokeWidth=".22" />;
          })}
        </svg>
      </div>
      <figcaption className={styles.srOnly}>
        <p id={descriptionId}>
          {countries.length} country &amp; currency profiles. Product availability varies.
          {" "}Points do not guarantee banking, funding, or product eligibility.
          {status === "ready" && " Drag horizontally to spin. Space pauses or resumes rotation; Left and Right arrows rotate the globe."}
        </p>
        <p id={motionId} role="status">
          {status === "ready" ? playing ? "Globe rotation on." : "Globe rotation paused." : "Static globe view."}
        </p>
      </figcaption>
    </figure>
  );
}
