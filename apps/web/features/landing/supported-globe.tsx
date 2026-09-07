"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  configuredGlobeCountries,
  countryLabel,
  INITIAL_LONGITUDE,
  locateCountries,
  nearestCountry,
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
  const selectId = useId();
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
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [controlsFocused, setControlsFocused] = useState(false);
  const playing = shouldAnimateGlobe(reducedMotion, userPlaying);
  const activeCountry = countries.find((country) => country.countryCode === (hovered ?? selected));

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

    // The static, server-rendered globe is already useful. Load GPU code only
    // when it is actually on screen, not as a prerequisite to reading/sign-in.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      import("./globe-renderer").then(({ createGlobeRenderer }) => {
        if (cancelled) return;
        renderer = createGlobeRenderer(canvas!, project, unavailable);
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
    motionRef.current = playing && !hovered && !controlsFocused;
    rendererRef.current?.setMotion(status === "ready" && motionRef.current);
  }, [status, playing, hovered, controlsFocused]);

  function chooseCountry(code: string) {
    setSelected(code);
    setHovered(null);
    setUserPlaying(false);
    const point = points.find((country) => country.countryCode === code);
    if (point) rendererRef.current?.setLongitude(point.longitude);
  }

  function hitCountry(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return nearestCountry(points,
      (event.clientX - bounds.left) / bounds.width * 100,
      (event.clientY - bounds.top) / bounds.height * 100,
      longitudeRef.current,
      18 / bounds.width * 100,
    );
  }

  return (
    <figure className={[styles.globe, className].filter(Boolean).join(" ")}
      aria-label="A world of country profiles" aria-describedby={descriptionId} data-renderer={status}>
      <div ref={stageRef} className={styles.stage} aria-hidden="true"
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") setHovered(hitCountry(event)?.countryCode ?? null);
        }}
        onPointerLeave={() => setHovered(null)}
        onPointerUp={(event) => {
          const point = hitCountry(event);
          if (point) chooseCountry(point.countryCode);
        }}>
        <div className={styles.staticGlobe} hidden={status === "ready"} />
        <canvas ref={canvasRef} className={styles.canvas} style={{ visibility: status === "ready" ? "visible" : "hidden" }} />
        <svg className={styles.markers} viewBox="0 0 100 100">
          {points.map((point) => {
            const position = projectCountry(point.longitude, point.latitude);
            return <circle key={point.countryCode} data-country={point.countryCode}
              ref={(node) => {
                if (node) markerRefs.current.set(point.countryCode, node);
                else markerRefs.current.delete(point.countryCode);
              }}
              cx={position.x} cy={position.y} r={point.countryCode === (hovered ?? selected) ? .7 : .48}
              visibility={position.visible ? "visible" : "hidden"}
              fill="#0000FF" stroke="white" strokeWidth=".22" />;
          })}
        </svg>
        {activeCountry && <div className={styles.readout}>
          <span className={styles.readoutDot} />
          <span>{activeCountry.countryName}<small>{activeCountry.currency.name} · {activeCountry.currency.code}</small></span>
        </div>}
      </div>
      <figcaption className={styles.caption}>
        <div className={styles.controls}>
          <div className={styles.countryPicker}>
            <span className={styles.legendDot} aria-hidden="true" />
            <label htmlFor={selectId} className={styles.srOnly}>Explore country and currency profiles</label>
            <select id={selectId} value={selected} onChange={(event) => chooseCountry(event.target.value)}
              onFocus={() => setControlsFocused(true)} onBlur={() => setControlsFocused(false)}>
              <option value="">{countries.length} country profiles</option>
              {countries.map((country) => <option key={country.countryCode} value={country.countryCode}>
                {countryLabel(country)}
              </option>)}
            </select>
          </div>
          <button type="button" className={styles.motion}
            disabled={status !== "ready"}
            aria-label={status === "unavailable" ? "Static globe view" : playing && status === "ready" ? "Pause globe rotation" : "Play globe rotation"}
            onClick={() => setUserPlaying(!playing)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              {playing && status === "ready" ? <path d="M2.5 1.5h2v9h-2zm5 0h2v9h-2z" /> : <path d="M3 1.2v9.6L10 6z" />}
            </svg>
            {status === "unavailable" ? "Static view" : playing && status === "ready" ? "Pause" : "Play"}
          </button>
        </div>
        <p id={descriptionId} className={styles.note}>
          Country &amp; currency profiles. Product availability varies.
          <span className={styles.srOnly}> Points do not guarantee banking, funding, or product eligibility. Explore the country list to read every profile, including those on the far side of the globe.</span>
        </p>
      </figcaption>
    </figure>
  );
}
