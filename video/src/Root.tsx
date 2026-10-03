import { Composition } from "remotion";
import { ENV_CHECK_FRAMES, EnvCheck } from "./compositions/EnvCheck";
import { format } from "./brand/tokens";

// Cada vídeo de produção entra aqui como uma <Composition> própria, com id em
// kebab-case (ex.: "explicativo-home"). "env-check" só testa o ambiente.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="env-check"
        component={EnvCheck}
        durationInFrames={ENV_CHECK_FRAMES}
        fps={30}
        width={format.landscape.width}
        height={format.landscape.height}
      />
    </>
  );
};
