"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, TouchEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { heroSlides } from "@/config/hero-slides";

const enabledSlides = heroSlides.filter((slide) => slide.enabled);

export function HeroSlideshow() {
  const [active, setActive] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(0);
  const transitionTimeout = useRef<number | null>(null);
  const slide = enabledSlides[active];

  const showSlide = useCallback((next: number) => {
    if (transitionTimeout.current !== null) window.clearTimeout(transitionTimeout.current);
    setPrevious(activeRef.current);
    activeRef.current = next;
    setActive(next);
    transitionTimeout.current = window.setTimeout(() => setPrevious(null), 1200);
  }, []);

  const move = useCallback((direction: number) => {
    showSlide((activeRef.current + direction + enabledSlides.length) % enabledSlides.length);
  }, [showSlide]);

  useEffect(() => {
    if (paused || reducedMotion || enabledSlides.length < 2) return;
    const timer = window.setTimeout(() => move(1), slide.duration);
    return () => window.clearTimeout(timer);
  }, [active, move, paused, reducedMotion, slide.duration]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(media.matches);
    updateMotionPreference();
    media.addEventListener("change", updateMotionPreference);
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.7);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.target instanceof HTMLElement && event.target.closest("a, button, input, textarea, select, summary")) return;
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      media.removeEventListener("change", updateMotionPreference);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      if (transitionTimeout.current !== null) window.clearTimeout(transitionTimeout.current);
    };
  }, [move]);

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    const end = event.changedTouches[0];
    if (!start || !end) return;
    const horizontal = start.x - end.clientX;
    const vertical = start.y - end.clientY;
    if (Math.abs(horizontal) > 55 && Math.abs(horizontal) > Math.abs(vertical) * 1.25) move(horizontal > 0 ? 1 : -1);
    touchStart.current = null;
  }

  return (
    <section
      className="campaign-hero"
      aria-label="ROVA Ghana campaign"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={onTouchEnd}
    >
      <div className="campaign-backdrop" />
      {enabledSlides.map((item, index) => {
        if (index !== active && index !== previous) return null;
        const imageStyle = { "--desktop-position": item.desktopPosition, "--mobile-position": item.mobilePosition } as CSSProperties;
        return (
          <div className={`campaign-slide ${index === active ? "is-active" : "is-leaving"}`} key={item.id} aria-hidden={index !== active} style={imageStyle}>
            <Image src={item.image} alt="" fill sizes="100vw" quality={42} className="campaign-backdrop-image" aria-hidden="true" />
            <Image src={item.image} alt={item.alt} fill sizes="100vw" quality={82} preload={index === 0} className="campaign-image" style={{ objectPosition: "var(--desktop-position)" }} />
          </div>
        );
      })}
      <div className="campaign-overlay" />
      <header className={`campaign-nav ${scrolled ? "nav-scrolled" : ""}`}>
        <Link className="campaign-logo" href="/" aria-label="ROVA Ghana home">ROVA<span>.</span></Link>
        <nav className={menuOpen ? "campaign-links menu-open" : "campaign-links"} aria-label="Main navigation">
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
          <a href="#opportunities" onClick={() => setMenuOpen(false)}>Opportunities</a>
          <a href="#partners" onClick={() => setMenuOpen(false)}>Partners</a>
          <a href="#safety" onClick={() => setMenuOpen(false)}>Safety</a>
          <Link className="nav-apply" href="/apply">Apply now <span>↗</span></Link>
        </nav>
        <button className="menu-toggle" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><span /><span /></button>
      </header>
      <h1 className="visually-hidden" aria-live="polite">{slide.headline}</h1>
      <div className="campaign-utility"><span><i /> ROVA GHANA · PRE-LAUNCH</span><Link href={slide.ctaHref}>{slide.ctaLabel} <b>↗</b></Link></div>
      <div className="slide-controls" aria-label="Campaign slideshow controls">
        <button className="slide-arrow" onClick={() => move(-1)} aria-label="Previous slide">←</button>
        <div className="slide-progress">
          {enabledSlides.map((item, index) => <button key={item.id} className={`progress-track ${index === active ? "current" : index < active ? "past" : ""}`} aria-label={`Show campaign slide ${index + 1}`} aria-current={index === active ? "true" : undefined} onClick={() => showSlide(index)}><span style={{ animationDuration: `${item.duration}ms`, animationPlayState: index === active && !paused && !reducedMotion ? "running" : "paused" }} /></button>)}
        </div>
        <button className="slide-arrow" onClick={() => move(1)} aria-label="Next slide">→</button>
        <button className="slide-pause" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Play slideshow" : "Pause slideshow"}>{paused ? "▶" : "Ⅱ"}</button>
      </div>
      <a className="hero-scroll" href="#about"><span /> SCROLL TO EXPLORE</a>
    </section>
  );
}
