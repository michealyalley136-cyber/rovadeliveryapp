/* eslint-disable @next/next/no-img-element */
import { heroSlides } from "@/config/hero-slides";

export default function SlideshowTestPage() {
  const slides = heroSlides.filter((slide) => slide.enabled);

  return (
    <main
      style={{
        background: "#071d39",
        height: "100vh",
        overflowY: "auto",
        padding: "40px",
      }}
    >
      <h1 style={{ color: "white", marginBottom: "24px" }}>
        ROVA Slideshow Asset Test ({slides.length} enabled)
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "30px",
        }}
      >
        {slides.map((slide, index) => (
          <article
            key={slide.id}
            style={{
              background: "#0b3158",
              padding: "16px",
              borderRadius: "6px",
            }}
          >
            <div
              style={{
                aspectRatio: "941 / 1672",
                position: "relative",
                background: "#071d39",
              }}
            >
              <img
                src={slide.image.src}
                alt={slide.alt}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>

            <p style={{ color: "white", margin: "12px 0 4px", fontWeight: 700 }}>
              {String(index + 1).padStart(2, "0")}. {slide.id}
            </p>

            <small
              style={{
                color: "#efb93f",
                wordBreak: "break-all",
                display: "block",
              }}
            >
              {slide.image.src}
            </small>
          </article>
        ))}
      </div>
    </main>
  );
}
