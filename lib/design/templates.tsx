import 'server-only';

import type { ReactElement } from 'react';

import { canvas, palette, reviewState, scale, space, type, type ReviewStateKey } from './tokens';

/**
 * Asset templates.
 *
 * Rendered by satori, which supports a deliberately small subset of CSS: flex
 * only (no grid, no float), explicit `display` on every element with more than
 * one child, and no shorthand that it cannot resolve. The layouts below are
 * written to that subset rather than to what a browser would accept.
 *
 * Every template takes data and returns markup — no randomness, no clock, no
 * network. Same input, same bytes.
 */

export type AssetInput = {
  title: string;
  /** Series or category line above the title. */
  eyebrow?: string;
  /** Supporting line beneath it. */
  subtitle?: string;
  /** Drives the state band. Anything not approved is marked as such. */
  state: ReviewStateKey;
  /** Worksheet only: the recall questions. */
  questions?: string[];
  /** Worksheet only: shown in the footer so a printed page cites its own basis. */
  sourceNote?: string;
};

/**
 * The state band.
 *
 * Present on every asset, and only quiet when the content has actually been
 * approved. An unreviewed worksheet that looks finished is how unverified
 * aviation material ends up in front of a student, so the artwork refuses to
 * look finished until a reviewer has signed it off.
 */
function StateBand({ state, width }: { state: ReviewStateKey; width: number }): ReactElement {
  const { color, label } = reviewState[state];
  const approved = state === 'approved';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width,
        padding: `${space.xs}px ${space.lg}px`,
        backgroundColor: approved ? 'transparent' : color,
        borderTop: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          fontFamily: type.display,
          fontWeight: 700,
          fontSize: scale.xs,
          letterSpacing: 2,
          color: approved ? color : palette.ground,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** The mark: a stylised aircraft silhouette, matching app/icon.svg. */
function Mark({ size, color }: { size: number; color: string }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path
        d="M16 5.5c.9 0 1.6.9 1.6 2v4.9l8.4 4.9v2.2l-8.4-2.6v5l2.9 2.1v1.9L16 24.6l-4.5 1.3v-1.9l2.9-2.1v-5L6 19.5v-2.2l8.4-4.9V7.5c0-1.1.7-2 1.6-2z"
        fill={color}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------

export function CoverTemplate(input: AssetInput): ReactElement {
  const { width, height } = canvas.cover;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width,
        height,
        backgroundColor: palette.ground,
      }}
    >
      {/* Three children under space-between: mark at the top, title block
          centred, footer at the base. Pinning the title to the top left the
          lower two-thirds empty, which reads as an unfinished cover. */}
      <div style={{ display: 'flex', alignItems: 'center', padding: space.xxl }}>
        <Mark size={56} color={palette.accent} />
        <div
          style={{
            fontFamily: type.display,
            fontWeight: 600,
            fontSize: scale.sm,
            letterSpacing: 4,
            color: palette.accent,
            marginLeft: space.sm,
          }}
        >
          AVIATION CLARITY
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: `0 ${space.xxl}px` }}>
        {input.eyebrow ? (
          <div
            style={{
              fontFamily: type.display,
              fontWeight: 600,
              fontSize: scale.base,
              letterSpacing: 3,
              color: palette.inkMuted,
            }}
          >
            {input.eyebrow.toUpperCase()}
          </div>
        ) : null}

        <div
          style={{
            fontFamily: type.display,
            fontWeight: 700,
            fontSize: scale.hero,
            lineHeight: 1.02,
            color: palette.ink,
            marginTop: space.md,
          }}
        >
          {input.title}
        </div>

        {/* A rule the width of the accent, not the page: the title owns the space. */}
        <div
          style={{
            display: 'flex',
            width: 160,
            height: 5,
            backgroundColor: palette.accent,
            marginTop: space.lg,
          }}
        />

        {input.subtitle ? (
          <div
            style={{
              fontFamily: type.body,
              fontWeight: 400,
              fontSize: scale.md,
              lineHeight: 1.4,
              color: palette.inkMuted,
              marginTop: space.lg,
              maxWidth: 820,
            }}
          >
            {input.subtitle}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontFamily: type.body,
            fontSize: scale.sm,
            color: palette.inkMuted,
            padding: `0 ${space.xxl}px ${space.lg}px`,
          }}
        >
          Instructional aid. Verify against authoritative sources before operational use.
        </div>
        <StateBand state={input.state} width={width} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Social card
// ---------------------------------------------------------------------------

export function SocialTemplate(input: AssetInput): ReactElement {
  const { width, height } = canvas.social;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width,
        height,
        backgroundColor: palette.ground,
      }}
    >
      {/* flex:1 + centred, so the card fills its 1200x630 rather than
          stranding the text at the top edge. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          padding: space.lg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Mark size={34} color={palette.accent} />
          <div
            style={{
              fontFamily: type.display,
              fontWeight: 600,
              fontSize: scale.xs,
              letterSpacing: 3,
              color: palette.accent,
              marginLeft: space.xs,
            }}
          >
            AVIATION CLARITY
          </div>
        </div>

        <div
          style={{
            fontFamily: type.display,
            fontWeight: 700,
            fontSize: scale.xxl,
            lineHeight: 1.05,
            color: palette.ink,
            marginTop: space.md,
            maxWidth: 1040,
          }}
        >
          {input.title}
        </div>

        {input.subtitle ? (
          <div
            style={{
              fontFamily: type.body,
              fontSize: scale.base,
              lineHeight: 1.4,
              color: palette.inkMuted,
              marginTop: space.md,
              maxWidth: 980,
            }}
          >
            {input.subtitle}
          </div>
        ) : null}
      </div>

      <StateBand state={input.state} width={width} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worksheet
// ---------------------------------------------------------------------------

/**
 * Light ground, unlike the other two: worksheets get photocopied and written
 * on. A navy worksheet is a worksheet nobody prints.
 */
/**
 * Ruled lines per question, sized to fill the page.
 *
 * A worksheet is written on, so unused paper is wasted answer space. Three
 * questions get generous room; six get less. Fixed line counts left two-thirds
 * of a Letter page blank at low question counts.
 */
function linesPerQuestion(count: number): number {
  if (count <= 0) return 0;
  const available = canvas.worksheet.height - 430; // header, title, footer
  const perQuestion = available / count;
  const forLines = perQuestion - 58; // question text plus its gap
  return Math.max(2, Math.min(8, Math.floor(forLines / LINE_HEIGHT)));
}

const LINE_HEIGHT = 34;

export function WorksheetTemplate(input: AssetInput): ReactElement {
  const { width, height } = canvas.worksheet;
  const questions = (input.questions ?? []).slice(0, 6);
  const lines = linesPerQuestion(questions.length);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width,
        height,
        backgroundColor: palette.paper,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', padding: space.lg }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `2px solid ${palette.paperInk}`,
            paddingBottom: space.sm,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Mark size={28} color={palette.accentDeep} />
            <div
              style={{
                fontFamily: type.display,
                fontWeight: 600,
                fontSize: scale.xs,
                letterSpacing: 3,
                color: palette.accentDeep,
                marginLeft: space.xs,
              }}
            >
              AVIATION CLARITY
            </div>
          </div>
          <div
            style={{
              fontFamily: type.display,
              fontWeight: 600,
              fontSize: scale.xs,
              letterSpacing: 2,
              color: palette.paperMuted,
            }}
          >
            RETRIEVAL PRACTICE
          </div>
        </div>

        <div
          style={{
            fontFamily: type.display,
            fontWeight: 700,
            fontSize: scale.xl,
            lineHeight: 1.08,
            color: palette.paperInk,
            marginTop: space.md,
          }}
        >
          {input.title}
        </div>

        <div
          style={{
            fontFamily: type.body,
            fontSize: scale.xs,
            color: palette.paperMuted,
            marginTop: space.xs,
          }}
        >
          Answer from memory before checking anything. Recall is what builds retention.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: space.md }}>
          {questions.map((question, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', marginBottom: space.md }}>
              <div style={{ display: 'flex' }}>
                <div
                  style={{
                    fontFamily: type.display,
                    fontWeight: 700,
                    fontSize: scale.sm,
                    color: palette.accentDeep,
                    width: 34,
                  }}
                >
                  {/* One string, not `{i + 1}.` — that is two child nodes, and
                      satori requires explicit display on any div with more
                      than one child. */}
                  {`${i + 1}.`}
                </div>
                <div
                  style={{
                    fontFamily: type.body,
                    fontWeight: 600,
                    fontSize: scale.sm,
                    lineHeight: 1.35,
                    color: palette.paperInk,
                    maxWidth: 1080,
                  }}
                >
                  {question}
                </div>
              </div>
              {/* Ruled space to write in — the reason this is a sheet, not a screen. */}
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: space.xs }}>
                {Array.from({ length: lines }, (_, line) => (
                  <div
                    key={line}
                    style={{
                      display: 'flex',
                      height: LINE_HEIGHT,
                      borderBottom: `1px solid ${palette.paperRule}`,
                      marginLeft: 34,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontFamily: type.body,
            fontSize: 13,
            color: palette.paperMuted,
            padding: `0 ${space.lg}px ${space.sm}px`,
          }}
        >
          {input.sourceNote ??
            'Instructional aid. Verify against authoritative sources before operational use.'}
        </div>
        <StateBand state={input.state} width={width} />
      </div>
    </div>
  );
}

export const TEMPLATES = {
  cover: CoverTemplate,
  social: SocialTemplate,
  worksheet: WorksheetTemplate,
} as const;

export type TemplateKind = keyof typeof TEMPLATES;
