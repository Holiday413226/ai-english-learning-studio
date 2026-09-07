/**
 * Mode-aware AI readiness.
 *
 * In "hosted" mode the real keys live on the gateway server, so a feature is
 * "ready" when the gateway URL + activation code are configured — regardless
 * of whether the local key fields are empty.  In "byok" mode readiness falls
 * back to the local key fields exactly as before.
 *
 * Selects individual store fields (not getter functions) so components
 * re-render reactively when the config changes.
 */
import useConfigStore from "../store/configStore";

export default function useAiReady() {
  const aiMode = useConfigStore((s) => s.aiMode);
  const gatewayUrl = useConfigStore((s) => s.gatewayUrl);
  const activationCode = useConfigStore((s) => s.activationCode);
  const deepseekApiKey = useConfigStore((s) => s.deepseekApiKey);
  const cozeApiKey = useConfigStore((s) => s.cozeApiKey);
  const debateBotId = useConfigStore((s) => s.debateBotId);
  const discussBotId = useConfigStore((s) => s.discussBotId);

  const hosted = aiMode === "hosted";
  const hostedReady = hosted && !!(gatewayUrl && activationCode);

  return {
    hosted,
    hostedReady,
    deepseekReady: hostedReady || !!deepseekApiKey,
    cozeReady: hostedReady || (!!cozeApiKey && (!!debateBotId || !!discussBotId)),
    aiReady: hostedReady || !!(deepseekApiKey || cozeApiKey),
  };
}
