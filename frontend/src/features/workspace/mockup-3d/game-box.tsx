'use client';

import { useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { LayoutPage } from '@px/contracts';
import { anchor, clamp, Cuboid, easeInOut, L, PageImage, preserve, sheen, StageFrame, ToolButton, useStage, ViewTools } from './stage';

/**
 * MyGame: the box with the customer's lid. Opening lifts the lid and lays it next to the box; inside are the board,
 * a deck of cards with one card face up, and the rules — cut from the same page previews that go to print.
 */

/** Cards are 63×88 mm, imposed 3×3 and centred on the sheet (services/layout/src/templates/boardgame.ts). */
const CARD = { w: 63, h: 88, cols: 3, rows: 3 } as const;
const DEPTH = 48;
const LID = 22;
const GAP = 24;
const YELLOW = '#ffd12e';
const CARDBOARD = '#efe9dc';

const boxSide: CSSProperties = { background: `linear-gradient(180deg, rgb(0 0 0 / 0.06), transparent 30%), ${YELLOW}` };
const inner: CSSProperties = { background: CARDBOARD };
const white: CSSProperties = { background: '#ffffff' };
const deckEdge: CSSProperties = {
  background: 'repeating-linear-gradient(0deg, #ffffff 0 1px, #e4e0d8 1px 2px)',
};

/** One card cut out of an imposed sheet; index counts left to right, top to bottom. */
function CardCrop({ sheet, index }: { sheet: LayoutPage; index: number }) {
  const col = index % CARD.cols;
  const row = Math.floor(index / CARD.cols) % CARD.rows;
  const x = (sheet.widthMm - CARD.w * CARD.cols) / 2 + col * CARD.w;
  const y = (sheet.heightMm - CARD.h * CARD.rows) / 2 + row * CARD.h;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated SVG preview
    <img
      src={sheet.previewUrl}
      alt=""
      draggable={false}
      decoding="async"
      className="absolute block select-none"
      style={{ left: L(-x), top: L(-y), width: L(sheet.widthMm), height: L(sheet.heightMm), maxWidth: 'none' }}
    />
  );
}

export function GameBoxMockup({ pages }: { pages: LayoutPage[] }) {
  const lidPage = pages.find((p) => p.kind === 'box') ?? pages[0]!;
  const board = pages.find((p) => p.kind === 'board');
  const cards = pages.find((p) => p.kind === 'cards');
  const backs = pages.find((p) => p.kind === 'card-backs');
  const rules = pages.find((p) => p.kind === 'rules');
  const W = lidPage.widthMm;
  const H = lidPage.heightMm;
  const wb = W - 2;
  const hb = H - 2;
  const floor = -DEPTH / 2 + 1;
  const extent = Math.hypot(W, H, DEPTH);
  const k = extent / Math.hypot(2 * W + GAP, H, DEPTH);

  // Contents: the board at the top, below it the deck, a face-up card and the rules.
  const boardSide = Math.max(0, Math.min(wb - 8, hb - CARD.h - 16));
  const lowY = hb / 2 - 4 - CARD.h / 2;
  const deckX = -wb / 2 + 6 + CARD.w / 2;
  const rulesW = Math.max(0, wb / 2 - 6 - (deckX + CARD.w * 1.6));
  const rulesH = rules ? Math.min(CARD.h, (rulesW * rules.heightMm) / rules.widthMm) : 0;

  const shift = useRef<HTMLDivElement>(null);
  const lid = useRef<HTMLDivElement>(null);
  const layout = useCallback(
    (p: number) => {
      const lift = easeInOut(clamp(p / 0.35, 0, 1));
      const away = easeInOut(clamp((p - 0.35) / 0.65, 0, 1));
      const closedZ = DEPTH / 2 - LID / 2 + 0.6;
      const up = closedZ + 34 * lift;
      const z = up + (-DEPTH / 2 + LID / 2 - up) * away;
      const turn = 12 * Math.sin(Math.PI * away);
      if (lid.current) lid.current.style.transform = `translate3d(${L(-(W + GAP) * away)}, 0, ${L(z)}) rotateY(${-turn}deg)`;
      if (shift.current) shift.current.style.transform = `translateX(${L(((W + GAP) / 2) * clamp(p, 0, 1))})`;
      return (group: string) => (group === 'lid' ? turn : 0);
    },
    [W],
  );

  const stage = useStage({
    maxPos: 1,
    initial: { rx: -14, ry: 28 },
    openView: { rx: 30, ry: 0, zoom: 1.15 },
    fit: (p) => 1 + (k - 1) * clamp(p, 0, 1),
    layout,
    onTap: () => stage.goTo(stage.target.current ? 0 : 1),
    duration: () => 1100,
  });
  const { rescan, dest } = stage;
  useLayoutEffect(() => rescan(), [rescan, pages]);

  const open = dest === 1;
  return (
    <div className="flex flex-col items-center gap-4">
      <StageFrame stage={stage.stage} orbit={stage.orbit} handlers={stage.handlers} extent={extent} label={open ? '3D-модель: коробка открыта' : '3D-модель: коробка'} ground={{ top: H * 0.56, w: W * 1.2, h: DEPTH * 1.2 }}>
        <div ref={shift} className={anchor} style={preserve}>
          {/* Box: outer walls and bottom, then the inside (walls facing in, floor) */}
          <Cuboid w={wb} h={hb} d={DEPTH} faces={{ back: { style: boxSide }, left: { style: boxSide }, right: { style: boxSide }, top: { style: boxSide }, bottom: { style: boxSide } }} />
          <Cuboid w={wb - 2} h={hb - 2} d={DEPTH - 0.5} at={[0, 0, 0.25]} inward faces={{ back: { style: inner }, left: { style: inner }, right: { style: inner }, top: { style: inner }, bottom: { style: inner } }} />

          {board && boardSide > 0 && (
            <Cuboid
              w={boardSide}
              h={boardSide}
              d={2}
              at={[0, -hb / 2 + 4 + boardSide / 2, floor + 1]}
              faces={{ front: { style: white, node: <PageImage src={board.previewUrl} /> }, right: { style: white }, left: { style: white }, top: { style: white }, bottom: { style: white } }}
            />
          )}
          {cards && (
            <>
              <Cuboid
                w={CARD.w}
                h={CARD.h}
                d={12}
                at={[deckX, lowY, floor + 6]}
                faces={{
                  front: { style: white, node: <CardCrop sheet={backs ?? cards} index={backs ? CARD.cols - 1 : 0} /> },
                  right: { style: deckEdge },
                  left: { style: deckEdge },
                  top: { style: deckEdge },
                  bottom: { style: deckEdge },
                }}
              />
              <div className={anchor} style={{ ...preserve, transform: `translate3d(${L(deckX + CARD.w * 1.1)}, ${L(lowY)}, ${L(floor + 0.6)}) rotateZ(-5deg)` }}>
                <Cuboid w={CARD.w} h={CARD.h} d={0.4} faces={{ front: { style: white, node: <><CardCrop sheet={cards} index={0} />{sheen}</> } }} />
              </div>
            </>
          )}
          {rules && rulesW > 20 && (
            <div className={anchor} style={{ ...preserve, transform: `translate3d(${L(wb / 2 - 4 - rulesW / 2)}, ${L(lowY)}, ${L(floor + 0.4)}) rotateZ(3deg)` }}>
              <Cuboid w={rulesW} h={rulesH} d={0.3} faces={{ front: { style: white, node: <PageImage src={rules.previewUrl} /> } }} />
            </div>
          )}

          {/* Lid: the customer's cover on top */}
          <div ref={lid} className={anchor} style={preserve}>
            <Cuboid
              w={W}
              h={H}
              d={LID}
              group="lid"
              faces={{
                front: { tap: 'toggle', style: { background: YELLOW }, node: <><PageImage src={lidPage.previewUrl} />{sheen}</> },
                back: { tap: 'toggle', style: inner },
                left: { style: boxSide },
                right: { style: boxSide },
                top: { style: boxSide },
                bottom: { style: boxSide },
              }}
            />
          </div>
        </div>
      </StageFrame>

      <div role="toolbar" aria-label="Вид модели" className="flex flex-wrap items-center justify-center gap-2">
        <ToolButton pressed={open} onClick={() => stage.goTo(open ? 0 : 1)}>
          {open ? 'Закрыть коробку' : 'Открыть коробку'}
        </ToolButton>
        <ToolButton onClick={() => stage.view({ rx: 0, ry: 0 })}>Крышка</ToolButton>
        <ToolButton onClick={() => stage.view({ rx: 0, ry: 90 })}>Сбоку</ToolButton>
        <ViewTools zoomBy={stage.zoomBy} auto={stage.auto} toggleAuto={stage.toggleAuto} reset={stage.reset} />
      </div>
      <p className="max-w-xl text-center text-[13px] leading-relaxed text-muted">
        Коробка {Math.round(W)} × {Math.round(H)} мм. Поворачивайте мышью или пальцем, нажмите на крышку — коробка откроется: внутри
        поле, карточки и правила. Цвета на экране и на бумаге немного различаются.
      </p>
    </div>
  );
}
