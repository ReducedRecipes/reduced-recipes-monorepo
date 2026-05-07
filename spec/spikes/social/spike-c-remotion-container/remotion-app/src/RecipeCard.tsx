import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';

export const recipeCardSchema = z.object({
  hookText: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  statsText: z.string(),
  ctaText: z.string(),
});

type Props = z.infer<typeof recipeCardSchema>;

const PALETTE = {
  bg: '#F3F0EB',
  ink: '#2D2923',
  accent: '#C45A30',
  accentLight: '#F5E6DD',
};

const fontStack = '"Instrument Serif", "Georgia", serif';
const sansStack = '"Inter", -apple-system, sans-serif';

export const RecipeCard: React.FC<Props> = ({ hookText, ingredients, steps, statsText, ctaText }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.bg }}>
      <Sequence from={0} durationInFrames={fps * 2}>
        <Hook text={hookText} />
      </Sequence>

      <Sequence from={fps * 2} durationInFrames={fps * 4}>
        <IngredientsList ingredients={ingredients} />
      </Sequence>

      <Sequence from={fps * 6} durationInFrames={fps * 12}>
        <Steps steps={steps} />
      </Sequence>

      <Sequence from={fps * 18} durationInFrames={fps * 4}>
        <Stats text={statsText} />
      </Sequence>

      <Sequence from={fps * 22} durationInFrames={fps * 3}>
        <CTA text={ctaText} />
      </Sequence>

      <ProgressBar t={t} totalSeconds={25} />
    </AbsoluteFill>
  );
};

const Hook: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const scale = interpolate(frame, [0, 60], [1.0, 1.08], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 80, opacity }}>
      <div
        style={{
          backgroundColor: PALETTE.accent,
          width: 1080 * 0.7,
          height: 1080 * 0.7,
          borderRadius: '50%',
          transform: `scale(${scale})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          color: PALETTE.bg,
          fontFamily: fontStack,
          fontSize: 96,
          lineHeight: 1.05,
          textAlign: 'center',
          padding: 100,
          fontWeight: 400,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const IngredientsList: React.FC<{ ingredients: string[] }> = ({ ingredients }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: 80, justifyContent: 'flex-start', paddingTop: 240 }}>
      <div style={{ fontFamily: sansStack, fontSize: 36, color: PALETTE.ink, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 60, fontWeight: 600 }}>
        What you need
      </div>
      {ingredients.map((ing, i) => {
        const start = i * 12;
        const opacity = interpolate(frame, [start, start + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const x = interpolate(frame, [start, start + 12], [-40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div
            key={i}
            style={{
              fontFamily: fontStack,
              fontSize: 84,
              color: PALETTE.ink,
              opacity,
              transform: `translateX(${x}px)`,
              marginBottom: 16,
              fontWeight: 400,
            }}
          >
            {ing}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Steps: React.FC<{ steps: string[] }> = ({ steps }) => {
  const frame = useCurrentFrame();
  const stepDurationFrames = (12 * 30) / steps.length;
  const activeIdx = Math.min(steps.length - 1, Math.floor(frame / stepDurationFrames));
  return (
    <AbsoluteFill style={{ padding: 80, justifyContent: 'center' }}>
      <div style={{ fontFamily: sansStack, fontSize: 36, color: PALETTE.accent, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 40, fontWeight: 600 }}>
        Step {activeIdx + 1} of {steps.length}
      </div>
      <div
        style={{
          fontFamily: fontStack,
          fontSize: 110,
          lineHeight: 1.1,
          color: PALETTE.ink,
          fontWeight: 400,
        }}
      >
        {steps[activeIdx]}
      </div>
    </AbsoluteFill>
  );
};

const Stats: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity }}>
      <div style={{ fontFamily: fontStack, fontSize: 120, color: PALETTE.ink, fontWeight: 400 }}>{text}</div>
    </AbsoluteFill>
  );
};

const CTA: React.FC<{ text: string }> = ({ text }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.accent, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: fontStack, fontSize: 96, color: PALETTE.bg, textAlign: 'center', padding: 80, fontWeight: 400 }}>
        {text}
      </div>
      <div style={{ fontFamily: sansStack, fontSize: 48, color: PALETTE.bg, marginTop: 40, opacity: 0.85 }}>
        reduced.recipes
      </div>
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC<{ t: number; totalSeconds: number }> = ({ t, totalSeconds }) => {
  const pct = Math.min(1, t / totalSeconds);
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, height: 8, width: `${pct * 100}%`, backgroundColor: PALETTE.accent }} />
  );
};
