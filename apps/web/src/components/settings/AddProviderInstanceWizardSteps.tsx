import { useTranslation } from "react-i18next";
import { WizardSteps } from "../ui/wizard";
import {
  ADD_PROVIDER_WIZARD_STEPS,
  resolveWizardNavigation,
  type WizardNavigation,
} from "./AddProviderInstanceDialog.logic";

interface AddProviderInstanceWizardStepsProps {
  readonly currentStep: number;
  readonly summaries: readonly (string | null)[];
  readonly instanceIdError: string | null;
  readonly steps?: readonly string[];
  readonly identityStep?: number;
  readonly prerequisite?: {
    readonly step: number;
    readonly error: string | null;
  };
  readonly onNavigation: (navigation: WizardNavigation) => void;
  readonly disabled?: boolean;
}

export function AddProviderInstanceWizardSteps({
  currentStep,
  summaries,
  instanceIdError,
  steps = ADD_PROVIDER_WIZARD_STEPS,
  identityStep,
  prerequisite,
  onNavigation,
  disabled = false,
}: AddProviderInstanceWizardStepsProps) {
  const { t } = useTranslation("settings");
  const labels = steps.map((step) => {
    switch (step) {
      case "provider":
        return { id: step, label: t(($) => $.providers.provider) };
      case "identity":
        return { id: step, label: t(($) => $.providers.identity) };
      case "config":
        return { id: step, label: t(($) => $.providers.config) };
      case "signIn":
        return { id: step, label: t(($) => $.providers.signIn) };
      default:
        throw new Error(`Unknown provider wizard step: ${step}`);
    }
  });
  return (
    <WizardSteps
      steps={labels}
      currentStep={currentStep}
      summaries={summaries}
      isStepDisabled={() => disabled}
      onStepChange={(requestedStep) =>
        onNavigation(
          resolveWizardNavigation(currentStep, requestedStep, steps.length, {
            instanceIdError,
            ...(identityStep === undefined ? {} : { identityStep }),
            ...(prerequisite === undefined ? {} : { prerequisite }),
          }),
        )
      }
    />
  );
}
