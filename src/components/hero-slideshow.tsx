"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { TouchEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getEnabledSlides, getNextSlideIndex, getPreviousSlideIndex, heroSlides } from "@/config/hero-slides";

const enabledSlides = getEnabledSlides(heroSlides);

export function HeroSlideshow() {
  const [active, setActive] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const slide = enabledSlides[active];

  const goNext = useCallback(() => {
    setActive((current) => getNextSlideIndex(current, enabledSlides.length));
  }, []);

  const goPrevious = useCallback(() => {
    setActive((current) => getPreviousSlideIndex(current, enabledSlides.length));
  }, []);

  useEffect(() => {
    if (reducedMotion || enabledSlides.length < 2) return;
    const timer = window.setTimeout(() => {
      setActive((current) => getNextSlideIndex(current, enabledSlides.length));
    }, slide?.duration ?? 6000);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion, slide?.duration]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(media.matches);
    updateMotionPreference();
    media.addEventListener("change", updateMotionPreference);
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.7);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.target instanceof HTMLElement && event.target.closest("a, button, input, textarea, select, summary")) return;
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrevious();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      media.removeEventListener("change", updateMotionPreference);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [goNext, goPrevious]);

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    const end = event.changedTouches[0];
    if (!start || !end) return;
    const horizontal = start.x - end.clientX;
    const vertical = start.y - end.clientY;
    if (Math.abs(horizontal) > 55 && Math.abs(horizontal) > Math.abs(vertical) * 1.25) {
      if (horizontal > 0) goNext();
      else goPrevious();
    }
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
      {enabledSlides.map((item, index) => (
        <div
          key={item.id}
          className={`campaign-slide ${index === active ? "is-active" : ""}`}
          aria-hidden={index !== active}
        >
          <img
            src={item.image.src}
            alt=""
            aria-hidden="true"
            className="campaign-backdrop-image"
            draggable={false}
          />
          <div className="campaign-poster-frame">
            <img
              src={item.image.src}
              alt={item.alt}
              className="campaign-image"
              draggable={false}
            />
          </div>
        </div>
      ))}
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
      {slide && <h1 className="visually-hidden" aria-live="polite">{slide.headline}</h1>}
    </section>
  );
}
