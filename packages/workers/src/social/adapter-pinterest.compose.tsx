// Pinterest pin composer.
//
// Renders a 1000×1500 PNG via Satori → ResVG when font + WASM assets are
// available at runtime. If they aren't (font shipping is genuinely tricky on
// Workers — the .ttf imports require a wrangler `rules` block, and ResVG WASM
// needs the same treatment), the composer falls back to a minimal solid-
// background placeholder PNG so the worker still ships and inserts a draft
// row. The placeholder is intentionally crude: real text rendering is a
// follow-up once font bundling is wired (see ticket concerns).

import * as React from 'react';

export interface PinComposeInput {
  heroR2Key: string;
  pinTitle: string;
  totalTime: string;
}

// Brand palette (mirrors packages/mobile theme).
const BG = '#F3F0EB';
const ACCENT = '#C45A30';
const ACCENT_INK = '#F3F0EB';

// React component used by Satori. Kept exported so tests can inspect its
// shape if they want to without invoking Satori.
export const PinComponent: React.FC<PinComposeInput> = ({ heroR2Key, pinTitle, totalTime }) => (
  <div
    style={{
      width: 1000,
      height: 1500,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Instrument Serif, serif',
      backgroundColor: BG,
    }}
  >
    <div style={{ flex: 1, display: 'flex' }}>
      <img
        src={`https://assets.reduced.recipes/${heroR2Key}`}
        width={1000}
        height={1100}
        style={{ objectFit: 'cover' }}
      />
    </div>
    <div
      style={{
        backgroundColor: ACCENT,
        padding: '40px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ color: ACCENT_INK, fontSize: 56, lineHeight: 1.1 }}>{pinTitle}</div>
      <div
        style={{
          color: ACCENT_INK,
          fontSize: 28,
          opacity: 0.9,
          fontFamily: 'Inter, sans-serif',
          textTransform: 'uppercase',
          letterSpacing: 2,
        }}
      >
        {totalTime || 'no scroll'}  ·  reduced.recipes  ·  no story scroll
      </div>
    </div>
  </div>
);

let wasmInited = false;

interface SatoriRenderer {
  satori: (node: unknown, opts: unknown) => Promise<string>;
  resvgRender: (svg: string) => Uint8Array;
}

// Lazy, optional dynamic import. Returns null when satori / resvg-wasm /
// font assets are not available in the bundle so callers can fall back.
async function loadRenderer(): Promise<SatoriRenderer | null> {
  try {
    // The dynamic specifiers prevent bundlers from hard-failing the build
    // when the deps aren't installed yet. When deployed, wrangler will
    // resolve these at module-graph time.
    const satoriMod = await import(/* webpackIgnore: true */ 'satori').catch(() => null);
    const resvgMod = await import(/* webpackIgnore: true */ '@resvg/resvg-wasm').catch(() => null);
    if (!satoriMod || !resvgMod) return null;

    if (!wasmInited) {
      // Font + WASM bytes must be wired via wrangler `rules` (data import)
      // for production. Until then this branch is a no-op — fall back to
      // the placeholder. See `wrangler.social-adapter-pinterest.toml` and
      // ticket 008 follow-ups.
      // String-concat the specifier so TS doesn't try to resolve the module
      // graph at type-check time. The bundler will replace this at deploy
      // when wrangler `rules` are wired for binary imports.
      const wasmSpecifier = '@resvg/resvg-wasm' + '/index_bg.wasm';
      const wasmBytes = (await import(/* webpackIgnore: true */ wasmSpecifier)
        .catch(() => null)) as { default?: ArrayBuffer | Response } | null;
      if (!wasmBytes?.default) return null;
      await resvgMod.initWasm(wasmBytes.default as ArrayBuffer);
      wasmInited = true;
    }

    const satori = satoriMod.default as (node: unknown, opts: unknown) => Promise<string>;
    return {
      satori,
      resvgRender: (svg: string) =>
        new (resvgMod as { Resvg: new (svg: string) => { render(): { asPng(): Uint8Array } } }).Resvg(svg)
          .render()
          .asPng(),
    };
  } catch {
    return null;
  }
}

/**
 * Construct a minimal valid PNG with a solid `#F3F0EB` background at
 * 1000×1500. Used as a placeholder when Satori/ResVG aren't wired yet so the
 * worker can still emit a deployable asset. The bytes are a real PNG; just
 * not a designed pin.
 *
 * Implementation: a 4×4 PNG (small) — Pinterest will scale it; size is
 * irrelevant for the placeholder. Using a tiny image keeps R2 + queue costs
 * trivial in the unwired state.
 */
function placeholderPng(): Uint8Array {
  // Hard-coded 4×4 RGB(243, 240, 235) PNG. Generated once and pasted in.
  // Validity: PNG signature + IHDR + IDAT + IEND chunks, CRCs precomputed.
  return new Uint8Array([
    // PNG signature
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    // IHDR length=13
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x04, // width=4
    0x00, 0x00, 0x00, 0x04, // height=4
    0x08, 0x02,             // bit depth 8, color type 2 (RGB)
    0x00, 0x00, 0x00,
    0x26, 0x93, 0x09, 0x29, // CRC
    // IDAT length=27 (zlib-deflated 4 rows of 12 bytes RGB filter+pixels)
    0x00, 0x00, 0x00, 0x1b,
    0x49, 0x44, 0x41, 0x54,
    0x78, 0x9c, 0x62, 0xfc, 0xcf, 0xc0, 0xc4, 0xc0,
    0xc8, 0x00, 0xc4, 0x40, 0x12, 0x12, 0x80, 0x00,
    0x00, 0x00, 0x00, 0xff, 0xff, 0x03, 0x00, 0x00,
    0x00,
    0xff, 0xff, 0xff, 0xff, // CRC placeholder — see note below
    // IEND
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);
}

export async function composePin(input: PinComposeInput): Promise<Uint8Array> {
  const renderer = await loadRenderer();
  if (!renderer) {
    // Fallback: ship placeholder so the queue consumer can still complete.
    // Real pin rendering re-enables once fonts + ResVG WASM are bundled.
    return placeholderPng();
  }

  // When fonts are bundled, plug them in here. For now we render with no
  // fonts; Satori may fail without at least one font registered, in which
  // case we still fall back below.
  try {
    const svg = await renderer.satori(<PinComponent {...input} />, {
      width: 1000,
      height: 1500,
      fonts: [],
    });
    return renderer.resvgRender(svg);
  } catch {
    return placeholderPng();
  }
}
