// Composição de verificação do ambiente (NÃO é o vídeo): confere fontes, cores,
// curvas, assets do site, máscara de texto, número animado e transição — usando
// só CSS que o "Render in browser" suporta (sem backdrop-filter, blend mode,
// z-index ou perspective).
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { color, dur, ease, sec } from "../brand/tokens";
import { font } from "../brand/fonts";

const Card: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = (start: number, len: number = dur.reveal) =>
    interpolate(frame, [sec(fps, start), sec(fps, start + len)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease.out,
    });
  const count = Math.round(95 * p(0.8, 1.4));

  return (
    <AbsoluteFill style={{ background: color.bg, alignItems: "center", justifyContent: "center", gap: 28 }}>
      <Img src={staticFile("site/img/mark.svg")} style={{ width: 120, opacity: p(0), scale: String(0.9 + 0.1 * p(0)) }} />
      {/* máscara: o contêiner corta, a linha sobe por dentro dele */}
      <div style={{ overflow: "hidden", paddingBottom: 10 }}>
        <div style={{ fontFamily: font.display, fontWeight: 600, fontSize: 88, color: color.ink, translate: `0 ${(1 - p(0.25)) * 110}%` }}>
          Dois lados, <em style={{ color: color.terracotta }}>um match</em>
        </div>
      </div>
      <div style={{ fontFamily: font.body, fontSize: 30, color: color.inkSoft, opacity: p(0.6), fontVariantNumeric: "tabular-nums" }}>
        <b style={{ color: color.sageDark, fontWeight: 700 }}>{count}%</b> compatível
      </div>
      <div style={{ width: 520, height: 10, borderRadius: 99, background: color.bgAlt, overflow: "hidden" }}>
        <div style={{ width: `${95 * p(0.8, 1.4)}%`, height: "100%", background: `linear-gradient(90deg, ${color.sage}, ${color.terracotta})` }} />
      </div>
    </AbsoluteFill>
  );
};

const Night: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = interpolate(frame, [0, sec(fps, dur.reveal)], [0, 1], { extrapolateRight: "clamp", easing: ease.out });
  return (
    <AbsoluteFill style={{ background: color.night, alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: font.logo, fontWeight: 700, fontSize: 72, color: color.nightInk, opacity: o, letterSpacing: "-0.02em" }}>
        match<span style={{ color: color.terracotta }}>.IA</span>
      </div>
    </AbsoluteFill>
  );
};

export const ENV_CHECK_FRAMES = 90 + 48 - 18; // 3 s + 1,6 s − 0,6 s de transição, a 30 fps

export const EnvCheck: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={sec(fps, 3)} premountFor={fps}>
        <Card />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: sec(fps, dur.sceneSwap) })} />
      <TransitionSeries.Sequence durationInFrames={sec(fps, 1.6)} premountFor={fps}>
        <Night />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
