import {
  cancelEnvironmentSpeechModelDownload,
  downloadEnvironmentSpeechModel,
  getEnvironmentSpeechModels,
  getEnvironmentSpeechStatus,
  removeEnvironmentSpeechModel,
  selectEnvironmentSpeechModel,
  updateEnvironmentSpeechAcceleration,
  updateEnvironmentSpeechModelUnloadTimeout,
} from "@t3tools/client-runtime/voice-input";
import type { PreparedConnection } from "@t3tools/client-runtime/connection";
import {
  AuthSettingsWriteScope,
  DEFAULT_SPEECH_POST_PROCESSING_PROMPT,
  type EnvironmentId,
  type EnvironmentSpeechModel,
  type EnvironmentSpeechStatus,
  type ProjectId,
  type SpeechAcceleration,
  type SpeechCustomWords,
  type SpeechModelUnloadTimeout,
  type VoiceShortcutMode,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { resolveSpeechPostProcessingModelSelection } from "@t3tools/shared/serverSettings";
import {
  AudioLinesIcon,
  CheckIcon,
  DownloadIcon,
  LanguagesIcon,
  MicIcon,
  RefreshCwIcon,
  StarIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useStableCallback } from "~/hooks/useStableCallback";
import { listBrowserMicrophones, type BrowserMicrophone } from "../../speech/browserMicrophones";
import {
  chooseAudioDestination,
  chooseTranscriptCleanup,
  useCleanupGrant,
} from "../../speech/voiceConsent";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { runtime } from "../../lib/runtime";
import {
  getCustomModelOptionsByInstance,
  resolveAppModelSelectionState,
} from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { useEnvironmentProviders, useEnvironments } from "../../state/environments";
import { useEnvironmentScope } from "../../state/session";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import {
  useEnvironmentSpeechInput,
  useVoiceTranscriptionDestination,
} from "../../speech/useEnvironmentSpeechInput";
import { ComposerSpeechRecordingPill } from "../chat/ComposerSpeechButton";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { VoiceInputSetup } from "../chat/VoiceInputSetup";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { MicrophoneTest } from "./MicrophoneTest";
import { LanguageRow, ModelBenchmarks, orderSpeechLanguages } from "./SpeechModelComparison";
import { languageLabel, SpeechLanguageSelect } from "./SpeechLanguageSelect";
import { filterSpeechModels, type SpeechModelSort } from "./speechModelBrowser";
import { AdvancedSettings } from "./AdvancedSettings";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSearchTarget,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useOptionalSettingsScope, useSettingsScope } from "./SettingsScopeContext";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

const OFF = "off";
const SYSTEM_DEFAULT = "system-default";
const formatSize = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
const SHORTCUT_MODES: readonly VoiceShortcutMode[] = ["auto", "hold", "toggle"];
const UNLOAD_TIMEOUTS: readonly SpeechModelUnloadTimeout[] = [
  "never",
  "immediately",
  "min_2",
  "min_5",
  "min_10",
  "min_15",
  "hour_1",
];
const normalizeTerm = (value: string) => value.replace(/\s+/g, " ").trim().normalize("NFC");
const spellingsOf = (words: SpeechCustomWords) =>
  new Set(
    words.flatMap(({ term, aliases }) =>
      [term, ...aliases].map((spelling) => spelling.toLocaleLowerCase()),
    ),
  );

type ModelCardProps = {
  readonly model: EnvironmentSpeechModel;
  readonly comparisonLanguages: readonly string[];
  readonly busy: boolean;
  readonly canCancel: boolean;
  readonly onDownload: () => void;
  readonly onSelect: () => void;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
  readonly testControls?: ReactNode;
  readonly children?: ReactNode;
};

function ModelBadge(props: { icon: ReactNode; label: string; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="outline" />}>
        {props.icon}
        {props.label}
      </TooltipTrigger>
      <TooltipPopup side="top">{props.tooltip}</TooltipPopup>
    </Tooltip>
  );
}

function ModelCard(props: ModelCardProps) {
  const { t } = useTranslation("voice");
  const { model } = props;
  const downloading = model.state === "downloading" || model.state === "verifying";
  const progress = model.downloaded === undefined ? 0 : (model.downloaded / model.size) * 100;
  return (
    <div className="flex flex-wrap items-start gap-3 px-3 py-2.5 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium leading-5">{model.name}</span>
          {model.recommended ? (
            <ModelBadge
              icon={<StarIcon className="mr-1 size-3" />}
              label={t(($) => $.models.recommended)}
              tooltip={t(($) => $.models.recommendedTooltip)}
            />
          ) : null}
          {model.supportsStreaming ? (
            <ModelBadge
              icon={<AudioLinesIcon className="mr-1 size-3" />}
              label={t(($) => $.models.livePreview)}
              tooltip={t(($) => $.models.livePreviewTooltip)}
            />
          ) : null}
          {model.supportsTranslation ? (
            <ModelBadge
              icon={<LanguagesIcon className="mr-1 size-3" />}
              label={t(($) => $.models.translate)}
              tooltip={t(($) => $.models.translateTooltip)}
            />
          ) : null}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{model.description}</p>
        <ModelBenchmarks
          model={model}
          languages={props.comparisonLanguages}
          facts={[
            ...(model.languages.length > 1
              ? [t(($) => $.models.languageCount, { count: model.languages.length })]
              : model.benchmark
                ? []
                : [languageLabel(model.languages[0] ?? "")]),
            formatSize(model.size),
          ]}
        />
        {downloading ? (
          <div className="mt-2">
            <div
              role="progressbar"
              aria-label={t(($) => $.models.downloadProgress, { model: model.name })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="h-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">
              {model.state === "verifying"
                ? t(($) => $.models.verifying)
                : t(($) => $.models.downloaded, { percent: Math.round(progress) })}
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
        {props.testControls}
        {downloading ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t(($) => $.models.cancelDownload, { model: model.name })}
            disabled={!props.canCancel}
            onClick={props.onCancel}
          >
            <XIcon className="size-3.5" />
          </Button>
        ) : model.state === "downloadable" ? (
          <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onDownload}>
            <DownloadIcon className="mr-1.5 size-3.5" />
            {t(($) => $.models.download)}
          </Button>
        ) : model.active ? (
          <Button size="sm" variant="secondary" disabled>
            <CheckIcon className="mr-1.5 size-3.5" />
            {t(($) => $.models.selected)}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onSelect}>
            {t(($) => $.models.use)}
          </Button>
        )}
        {model.state === "installed" ? (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={props.busy}
            aria-label={t(($) => $.models.delete, { model: model.name })}
            onClick={props.onDelete}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function DictionaryEditor(props: {
  readonly label: string;
  readonly words: SpeechCustomWords;
  readonly disabled?: boolean;
  readonly onChange: (words: SpeechCustomWords) => void;
}) {
  const { t } = useTranslation("voice");
  const { words, label, disabled = false, onChange } = props;
  const [termDraft, setTermDraft] = useState("");
  const [aliasDraft, setAliasDraft] = useState<{ term: string; value: string } | null>(null);
  const spellings = spellingsOf(words);
  const seen = new Set(spellings);
  const newTerms = termDraft
    .split(/[,\n]/)
    .map(normalizeTerm)
    .filter((term) => {
      const key = term.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const canAddTerm =
    !disabled &&
    newTerms.length > 0 &&
    newTerms.every((term) => term.length <= 50) &&
    words.length + newTerms.length <= 100;
  const addTerm = () => {
    if (!canAddTerm) return;
    onChange([...words, ...newTerms.map((term) => ({ term, aliases: [] }))]);
    setTermDraft("");
  };
  const addAlias = () => {
    if (!aliasDraft) return;
    const value = normalizeTerm(aliasDraft.value);
    if (!value || value.length > 50 || spellings.has(value.toLocaleLowerCase())) return;
    onChange(
      words.map((entry) =>
        entry.term === aliasDraft.term && entry.aliases.length < 8
          ? { term: entry.term, aliases: [...entry.aliases, value] }
          : entry,
      ),
    );
    setAliasDraft(null);
  };
  return (
    <>
      <div className="flex items-start gap-1.5">
        <Textarea
          value={termDraft}
          rows={1}
          maxLength={5_100}
          disabled={disabled}
          placeholder={t(($) => $.dictionary.placeholder)}
          aria-label={t(($) => $.dictionary.addLabel, { label })}
          onChange={(event) => setTermDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            addTerm();
          }}
        />
        <Button type="button" disabled={!canAddTerm} onClick={addTerm}>
          {t(($) => $.dictionary.add)}
        </Button>
      </div>
      {words.length > 0 ? (
        <ul
          aria-label={t(($) => $.dictionary.entriesLabel, { label })}
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {words.map(({ term, aliases }) => (
            <li
              key={term}
              className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 py-0.5 pl-2 pr-0.5 text-xs"
            >
              <span className="font-medium">{term}</span>
              {aliases.length > 0 ? (
                <span className="text-muted-foreground">← {aliases.join(", ")}</span>
              ) : null}
              {aliasDraft?.term === term ? (
                <Input
                  autoFocus
                  value={aliasDraft.value}
                  maxLength={50}
                  aria-label={t(($) => $.dictionary.aliasFor, { term })}
                  placeholder={t(($) => $.dictionary.misspelling)}
                  className="w-32"
                  onChange={(event) => setAliasDraft({ term, value: event.target.value })}
                  onBlur={() => setAliasDraft(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setAliasDraft(null);
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addAlias();
                  }}
                />
              ) : (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost-muted"
                  disabled={disabled || aliases.length >= 8}
                  aria-label={t(($) => $.dictionary.addAlias, { term })}
                  onClick={() => setAliasDraft({ term, value: "" })}
                >
                  {t(($) => $.dictionary.alias)}
                </Button>
              )}
              <Button
                type="button"
                size="icon-xs"
                variant="ghost-muted"
                disabled={disabled}
                aria-label={t(($) => $.dictionary.remove, { term })}
                onClick={() => onChange(words.filter((entry) => entry.term !== term))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Vocabulary stored on the environment with the project, read by everyone who dictates there. */
function ProjectDictionaryRow() {
  const { t } = useTranslation("voice");
  const { t: tSettings } = useTranslation("settings");
  const scope = useOptionalSettingsScope();
  const words = useScopedSettings((settings) => settings.speechProjectCustomWords);
  const updateScopedSettings = useUpdateScopedSettings();
  if (scope === null) return null;
  const isProjectScope = scope.scope.kind === "project" || scope.scope.kind === "checkout";
  return (
    <SettingsRow
      serverScoped
      settingKeys={["speechProjectCustomWords"]}
      {...searchableSetting("speech-project-dictionary", tSettings)}
      title={
        isProjectScope ? t(($) => $.dictionary.projectTitle) : t(($) => $.dictionary.sharedTitle)
      }
      description={
        isProjectScope
          ? t(($) => $.dictionary.projectDescription, { project: scope.scope.label })
          : t(($) => $.dictionary.sharedDescription)
      }
      control={
        <span className="text-xs text-muted-foreground">
          {t(($) => $.dictionary.entries, { count: words.length })}
        </span>
      }
    >
      <div className="mt-2 pb-3.5">
        <DictionaryEditor
          label={
            isProjectScope
              ? t(($) => $.dictionary.projectLabel)
              : t(($) => $.dictionary.sharedLabel)
          }
          words={words}
          disabled={scope.connectedEnvironments.length === 0}
          onChange={(next) => updateScopedSettings({ speechProjectCustomWords: next })}
        />
      </div>
    </SettingsRow>
  );
}

/** Cleanup runs on the draft's environment, so its model is an environment setting there. */
function CleanupModelRow() {
  const { t } = useTranslation("voice");
  const { t: tSettings } = useTranslation("settings");
  const { environment, connectedEnvironments } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const providersByEnvironment = useEnvironmentProviders();
  const providers =
    (environment?.serverConfig
      ? providersByEnvironment.get(environment.environmentId)
      : undefined) ?? EMPTY_SERVER_PROVIDERS;
  const textGenerationProviders = providers.filter(
    (provider) => provider.supportsTextGeneration !== false,
  );
  const instanceEntries = providerInstanceEntriesFor(textGenerationProviders, settings, null);
  const hasProvider = instanceEntries.some((entry) => entry.enabled && entry.isAvailable);
  const dedicated = settings.speechPostProcessingModelSelection !== null;
  const selection = resolveAppModelSelectionState(
    {
      ...settings,
      textGenerationModelSelection: resolveSpeechPostProcessingModelSelection(
        settings,
        textGenerationProviders,
      ),
    },
    textGenerationProviders,
  );
  const modelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    textGenerationProviders,
    selection.instanceId,
    selection.model,
  );
  const instanceEntry = instanceEntries.find((entry) => entry.instanceId === selection.instanceId);
  const modelDisabledReason = useScopedModelDisabledReason(settings, instanceEntries);
  const setModel = (next: ReturnType<typeof createModelSelection>) => {
    const reason = modelDisabledReason(next.instanceId, next.model);
    if (reason) {
      toastManager.add({
        type: "error",
        title: t(($) => $.cleanup.modelNotSaved),
        description: reason,
      });
      return;
    }
    updateSettings({ speechPostProcessingModelSelection: next });
  };
  return (
    <SettingsRow
      serverScoped
      settingKeys={["speechPostProcessingModelSelection"]}
      {...searchableSetting("speech-post-processing-model", tSettings)}
      title={t(($) => $.cleanup.model)}
      description={t(
        ($) => (dedicated ? $.cleanup.dedicatedDescription : $.cleanup.defaultDescription),
        { environment: environment?.label ?? t(($) => $.cleanup.thisEnvironment) },
      )}
      resetAction={
        dedicated ? (
          <SettingResetButton
            label={t(($) => $.cleanup.resetLabel)}
            onClick={() => updateSettings({ speechPostProcessingModelSelection: null })}
          />
        ) : null
      }
      control={
        connectedEnvironments.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t(($) => $.cleanup.connectFirst)}</span>
        ) : !hasProvider || !instanceEntry ? (
          <span className="text-sm text-muted-foreground">{t(($) => $.cleanup.noProviders)}</span>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <ProviderModelPicker
              environmentId={environment?.environmentId ?? null}
              activeInstanceId={selection.instanceId}
              model={selection.model}
              lockedProvider={null}
              instanceEntries={instanceEntries}
              modelOptionsByInstance={modelOptionsByInstance}
              triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
              getModelDisabledReason={modelDisabledReason}
              onInstanceModelChange={(instanceId, model) =>
                setModel(createModelSelection(instanceId, model))
              }
            />
            <TraitsPicker
              provider={instanceEntry.driverKind}
              models={instanceEntry.models}
              model={selection.model}
              modelOptions={selection.options ?? []}
              allowPromptInjectedEffort={false}
              planModeEnabled={settings.planModeEnabled}
              triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
              onModelOptionsChange={(options) =>
                setModel(createModelSelection(selection.instanceId, selection.model, options))
              }
            />
          </div>
        )
      }
    />
  );
}

function useVoiceModels(prepared: PreparedConnection | null) {
  const { t } = useTranslation("voice");
  const canManage = useEnvironmentScope(prepared?.environmentId ?? null, AuthSettingsWriteScope);
  const [models, setModels] = useState<readonly EnvironmentSpeechModel[]>([]);
  const [status, setStatus] = useState<EnvironmentSpeechStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestedDownload, setRequestedDownload] = useState<string | null>(null);
  const [actionConnection, setActionConnection] = useState(prepared);
  if (actionConnection !== prepared) {
    setActionConnection(prepared);
    setBusy(false);
    setRequestedDownload(null);
    setModels([]);
    setStatus(null);
  }
  const epoch = useRef(0);
  const refreshRevision = useRef(0);
  const refresh = useStableCallback(
    async (connection: PreparedConnection, mode: "foreground" | "progress") => {
      const current = epoch.current;
      const revision = ++refreshRevision.current;
      try {
        const [nextStatus, nextModels] = await Promise.all([
          runtime.runPromise(getEnvironmentSpeechStatus(connection)),
          runtime.runPromise(getEnvironmentSpeechModels(connection, mode === "foreground")),
        ]);
        if (current !== epoch.current || revision !== refreshRevision.current) return;
        setStatus(nextStatus);
        setModels((previous) => {
          if (mode === "foreground") return nextModels.models;
          const benchmarks = new Map(previous.map((model) => [model.id, model.benchmark]));
          return nextModels.models.map((model) => {
            const benchmark = benchmarks.get(model.id);
            return benchmark ? { ...model, benchmark } : model;
          });
        });
      } catch (error) {
        if (mode === "progress") return;
        if (current !== epoch.current || revision !== refreshRevision.current) return;
        toastManager.add({
          type: "error",
          title: t(($) => $.models.loadFailed),
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads the environment's model catalog when its connection becomes available
  useEffect(() => {
    epoch.current += 1;
    if (prepared) void refresh(prepared, "foreground");
    return () => {
      epoch.current += 1;
    };
  }, [prepared, refresh]);
  const downloading =
    requestedDownload !== null ||
    models.some((model) => model.state === "downloading" || model.state === "verifying");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls progress while a local request or the environment reports an active download
  useEffect(() => {
    if (!prepared || !downloading) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      await refresh(prepared, "progress");
      if (!cancelled) timer = window.setTimeout(() => void poll(), 1_000);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [downloading, prepared, refresh]);

  const run = async (label: string, work: () => Promise<unknown>, downloadId?: string) => {
    if (!prepared || !canManage) return;
    const current = epoch.current;
    if (downloadId) setRequestedDownload(downloadId);
    else setBusy(true);
    try {
      await work();
    } catch (error) {
      if (current === epoch.current)
        toastManager.add({
          type: "error",
          title: label,
          description: error instanceof Error ? error.message : String(error),
        });
    }
    if (current === epoch.current) {
      if (downloadId) setRequestedDownload(null);
      else setBusy(false);
      await refresh(prepared, "foreground");
    }
  };
  return {
    models,
    status,
    run,
    controlsDisabled: busy || downloading || !canManage,
    canCancel: canManage && !busy,
    requestedDownload,
  };
}

type VoiceModels = ReturnType<typeof useVoiceModels>;

function AdvancedSpeechSettings({
  prepared,
  catalog,
}: {
  prepared: PreparedConnection;
  catalog: VoiceModels;
}) {
  const { t } = useTranslation("voice");
  const { t: tSettings } = useTranslation("settings");
  const { run, controlsDisabled, status } = catalog;
  if (!status?.supported) return null;
  const supported = status;
  return (
    <AdvancedSettings targetIds={[searchableSetting("speech-hardware", tSettings).id]}>
      <SettingsRow
        {...searchableSetting("speech-hardware", tSettings)}
        title={t(($) => $.advanced.hardware)}
        description={t(($) => $.advanced.hardwareDescription)}
        control={
          <Select
            value={supported.acceleration}
            disabled={controlsDisabled}
            onValueChange={(value) => {
              if (value)
                void run(
                  t(($) => $.advanced.hardwareFailed),
                  () =>
                    runtime.runPromise(
                      updateEnvironmentSpeechAcceleration(prepared, value as SpeechAcceleration),
                    ),
                );
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={t(($) => $.advanced.hardwareLabel)}
              className="max-w-72"
            >
              <SelectValue>
                {supported.acceleration === "auto"
                  ? t(($) => $.advanced.auto)
                  : supported.acceleration === "cpu"
                    ? t(($) => $.advanced.cpu)
                    : (supported.gpuDevices.find(
                        (device) => `gpu:${device.id}` === supported.acceleration,
                      )?.name ?? t(($) => $.advanced.selectedGpu))}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value="auto">{t(($) => $.advanced.auto)}</SelectItem>
              <SelectItem value="cpu">{t(($) => $.advanced.cpu)}</SelectItem>
              {supported.gpuDevices.map((device) => (
                <SelectItem key={device.id} value={`gpu:${device.id}`}>
                  {device.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        title={t(($) => $.advanced.unload)}
        description={t(($) => $.advanced.unloadDescription)}
        control={
          <Select
            value={supported.modelUnloadTimeout}
            disabled={controlsDisabled}
            onValueChange={(value) => {
              if (value)
                void run(
                  t(($) => $.advanced.unloadFailed),
                  () =>
                    runtime.runPromise(
                      updateEnvironmentSpeechModelUnloadTimeout(
                        prepared,
                        value as SpeechModelUnloadTimeout,
                      ),
                    ),
                );
            }}
          >
            <SelectTrigger size="sm" aria-label={t(($) => $.advanced.unload)} className="max-w-72">
              <SelectValue>
                {t(($) => $.advanced.unloadTimeout[supported.modelUnloadTimeout])}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {UNLOAD_TIMEOUTS.map((timeout) => (
                <SelectItem key={timeout} value={timeout}>
                  {t(($) => $.advanced.unloadTimeout[timeout])}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
    </AdvancedSettings>
  );
}

function SpeechModelBrowser(props: {
  prepared: PreparedConnection;
  catalog: VoiceModels;
  testEnvironmentId: EnvironmentId;
  projectId: ProjectId | null;
  projectName: string | null;
}) {
  const {
    prepared,
    catalog: { status, models, run, controlsDisabled, canCancel, requestedDownload },
  } = props;
  const { t } = useTranslation("voice");
  const { t: tSettings } = useTranslation("settings");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SpeechModelSort>("recommended");
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const [selection, setSelection] = useState<string[] | null>(null);
  const preferred = navigator.languages.map((language) => language.toLowerCase().split("-")[0]!);
  const supportedLanguages = [...new Set(models.flatMap((model) => model.languages))];
  const defaultLanguage = preferred.find((code) => supportedLanguages.includes(code));
  const selectedLanguages = selection ?? (defaultLanguage ? [defaultLanguage] : []);
  const languages = orderSpeechLanguages(supportedLanguages, preferred);
  const needle = languageSearch.trim().toLocaleLowerCase();
  const visibleLanguages = languages.filter(
    (code) =>
      !needle || code.includes(needle) || languageLabel(code).toLocaleLowerCase().includes(needle),
  );
  const accuracyLanguage = selectedLanguages[0] ?? "en";
  const sortLabels: Record<SpeechModelSort, string> = {
    recommended: t(($) => $.models.sortRecommended),
    size: t(($) => $.models.sortSize),
    accuracy: t(($) => $.models.sortAccuracy, { language: languageLabel(accuracyLanguage) }),
    speed: t(($) => $.models.sortSpeed),
  };
  const sortedModels = filterSpeechModels(models, {
    search,
    languages: selectedLanguages,
    downloadedOnly,
    sort,
    accuracyLanguage,
  });
  const activeModel = models.find((model) => model.active);
  const renderedModels =
    activeModel && !sortedModels.includes(activeModel)
      ? [activeModel, ...sortedModels]
      : sortedModels;

  return (
    <SettingsSearchTarget
      {...searchableSetting("speech-models", tSettings)}
      className="@container/voice-models"
    >
      {status && !status.supported ? (
        <p className="px-4 py-2 text-sm text-muted-foreground">
          {t(($) => $.models.unsupported, { reason: status.reason })}
        </p>
      ) : null}
      {status?.supported ? (
        <>
          <p className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground sm:px-4">
            {t(($) => $.models.intro)}
          </p>
          <div className="@min-[32rem]/voice-models:grid @min-[32rem]/voice-models:grid-cols-[11rem_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col border-b border-border/60 bg-muted/10 @min-[32rem]/voice-models:border-r @min-[32rem]/voice-models:border-b-0">
              <div className="space-y-2 p-3">
                <p className="text-sm font-medium">{t(($) => $.models.languages)}</p>
                <Input
                  size="compact"
                  aria-label={t(($) => $.models.searchLanguages)}
                  placeholder={t(($) => $.models.searchLanguages)}
                  value={languageSearch}
                  onChange={(e) => setLanguageSearch(e.target.value)}
                />
              </div>
              <div
                role="group"
                aria-label={t(($) => $.models.browseByLanguage)}
                className="flex gap-1 overflow-x-auto px-2 pb-2 @min-[32rem]/voice-models:h-72 @min-[32rem]/voice-models:flex-col @min-[32rem]/voice-models:overflow-y-auto"
              >
                <LanguageRow
                  label={t(($) => $.models.allLanguages)}
                  selected={selectedLanguages.length === 0}
                  onClick={() => setSelection([])}
                />
                {visibleLanguages.map((code) => (
                  <LanguageRow
                    key={code}
                    label={languageLabel(code)}
                    selected={selectedLanguages.includes(code)}
                    onClick={() =>
                      setSelection(
                        selectedLanguages.includes(code)
                          ? selectedLanguages.filter((language) => language !== code)
                          : [...selectedLanguages, code],
                      )
                    }
                  />
                ))}
                {visibleLanguages.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    {t(($) => $.models.noLanguages)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="space-y-2 p-3">
                <p className="text-sm font-medium">
                  {selectedLanguages.length
                    ? t(($) => $.models.modelsFor, {
                        languages: selectedLanguages.map(languageLabel).join(", "),
                      })
                    : t(($) => $.models.allModels)}
                </p>
                <InputGroup>
                  <InputGroupInput
                    size="compact"
                    aria-label={t(($) => $.models.searchModelsLabel)}
                    placeholder={t(($) => $.models.searchModels)}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <Menu>
                      <MenuTrigger
                        render={<Button size="compact" variant="ghost-muted" />}
                        aria-label={
                          downloadedOnly
                            ? t(($) => $.models.sortAndFilterDownloaded, { sort: sortLabels[sort] })
                            : t(($) => $.models.sortAndFilter, { sort: sortLabels[sort] })
                        }
                      >
                        <SlidersHorizontalIcon />
                        <span className="hidden @min-[40rem]/voice-models:inline">
                          {sortLabels[sort]}
                        </span>
                        {downloadedOnly && <span>1</span>}
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuGroup>
                          <MenuGroupLabel>{t(($) => $.models.sortBy)}</MenuGroupLabel>
                          <MenuRadioGroup
                            value={sort}
                            onValueChange={(value) => setSort(value as SpeechModelSort)}
                          >
                            {(Object.keys(sortLabels) as SpeechModelSort[]).map((value) => (
                              <MenuRadioItem key={value} value={value} closeOnClick>
                                <span className="flex items-center justify-between gap-3">
                                  {sortLabels[value]}
                                  <MenuRadioItemIndicator />
                                </span>
                              </MenuRadioItem>
                            ))}
                          </MenuRadioGroup>
                        </MenuGroup>
                        <MenuSeparator />
                        <MenuCheckboxItem
                          checked={downloadedOnly}
                          onCheckedChange={setDownloadedOnly}
                        >
                          {t(($) => $.models.downloadedOnly)}
                        </MenuCheckboxItem>
                      </MenuPopup>
                    </Menu>
                  </InputGroupAddon>
                </InputGroup>
              </div>
              <div
                className="h-72 overflow-y-auto divide-y divide-border/60"
                role="region"
                aria-label={t(($) => $.models.region)}
                tabIndex={0}
              >
                {sortedModels.length === 0 && (
                  <p className="px-4 py-2 text-sm text-muted-foreground">
                    {t(($) => $.models.noModels)}
                  </p>
                )}
                {renderedModels.map((model) => {
                  const card: ModelCardProps = {
                    model:
                      model.id === requestedDownload && model.state === "downloadable"
                        ? { ...model, state: "downloading" }
                        : model,
                    busy: controlsDisabled,
                    canCancel,
                    comparisonLanguages: selectedLanguages,
                    onDownload: () =>
                      void run(
                        t(($) => $.models.downloadFailed),
                        () =>
                          runtime.runPromise(downloadEnvironmentSpeechModel(prepared, model.id)),
                        model.id,
                      ),
                    onSelect: () =>
                      void run(
                        t(($) => $.models.selectFailed),
                        () => runtime.runPromise(selectEnvironmentSpeechModel(prepared, model.id)),
                      ),
                    onCancel: () =>
                      void run(
                        t(($) => $.models.cancelFailed),
                        () =>
                          runtime.runPromise(
                            cancelEnvironmentSpeechModelDownload(prepared, model.id),
                          ),
                      ),
                    onDelete: () =>
                      void run(
                        t(($) => $.models.deleteFailed),
                        () => runtime.runPromise(removeEnvironmentSpeechModel(prepared, model.id)),
                      ),
                  };
                  return model.active ? (
                    <TranscriptionTest
                      key={model.id}
                      card={card}
                      hidden={!sortedModels.includes(model)}
                      environmentId={props.testEnvironmentId}
                      projectId={props.projectId}
                      projectName={props.projectName}
                    />
                  ) : (
                    <ModelCard key={model.id} {...card} />
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </SettingsSearchTarget>
  );
}

function TranscriptionTest(props: {
  readonly card: ModelCardProps;
  readonly hidden: boolean;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
  readonly projectName: string | null;
}) {
  const { t } = useTranslation("voice");
  const { t: tSettings } = useTranslation("settings");
  const [transcript, setTranscript] = useState<string | null>(null);
  const draft = transcript ?? "";
  const [showTranscript, setShowTranscript] = useState(false);
  const draftRef = useRef(draft);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes the committed draft to the asynchronous transcription controller
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const speech = useEnvironmentSpeechInput({
    environmentId: props.environmentId,
    projectId: props.projectId,
    projectName: props.projectName,
    ownerKey: JSON.stringify([props.environmentId, props.projectId]),
    draftText: draft,
    cleanup: false,
    readDraft: () => ({
      text: draftRef.current,
      selection: { start: draftRef.current.length, end: draftRef.current.length },
    }),
    commitDraft: (text) => setTranscript(text),
  });
  return (
    <SettingsSearchTarget
      {...searchableSetting("transcription-test", tSettings)}
      hidden={props.hidden}
    >
      <ModelCard
        {...props.card}
        testControls={
          <div className="flex min-w-0 max-w-full items-center gap-1">
            <ComposerSpeechRecordingPill
              state={speech.state}
              progress={null}
              level={speech.level}
              onStart={() => void speech.start()}
              onStop={() => void speech.stop()}
              onCancel={() => speech.cancel()}
              onSkipPostProcessing={() => speech.skipPostProcessing()}
            />
            {speech.available ? (
              speech.state.phase === "idle" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowTranscript(true);
                    void speech.start();
                  }}
                >
                  <MicIcon />
                  {t(($) => $.test.start)}
                </Button>
              ) : null
            ) : (
              <span className="text-xs text-muted-foreground">
                {speech.status?.supported === false
                  ? speech.status.reason
                  : t(($) => $.test.waiting)}
              </span>
            )}
          </div>
        }
      >
        {showTranscript ? (
          <div className="w-full">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                {t(($) => $.test.hint)}
              </p>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t(($) => $.test.close)}
                onClick={() => {
                  speech.cancel();
                  setShowTranscript(false);
                }}
              >
                <XIcon />
              </Button>
            </div>
            {speech.preview || transcript !== null ? (
              <p
                role="status"
                aria-label={t(($) => $.test.transcript)}
                className="mt-2 select-text whitespace-pre-wrap break-words text-sm leading-relaxed"
              >
                {speech.preview ? (
                  <>
                    {speech.preview.committed}
                    <span className="text-muted-foreground">{speech.preview.tentative}</span>
                  </>
                ) : (
                  transcript || t(($) => $.test.noSpeech)
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </ModelCard>
      <VoiceInputSetup
        environmentId={speech.transcriptionEnvironmentId}
        open={speech.setup.open}
        step={speech.setup.step}
        status={speech.status}
        model={speech.setup.model}
        downloading={speech.setup.downloading}
        error={speech.setup.error}
        onOpenChange={speech.setup.setOpen}
        onDownload={() => void speech.setup.download()}
        onCancelDownload={() => void speech.setup.cancelDownload()}
        onStartRecording={() => void speech.setup.startRecording()}
      />
    </SettingsSearchTarget>
  );
}

export function VoiceSettingsPanel() {
  const { t } = useTranslation("voice");
  const { t: tSettings } = useTranslation("settings");
  const cleanupEnabled = useCleanupGrant() !== null;
  const settings = useClientSettings();
  const settingsScope = useOptionalSettingsScope();
  const destination = useVoiceTranscriptionDestination();
  const { environments } = useEnvironments();
  const [microphones, setMicrophones] = useState<BrowserMicrophone[]>([]);
  const prepared = destination.prepared;
  const catalog = useVoiceModels(prepared);

  const refreshMicrophones = useStableCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      setMicrophones(await listBrowserMicrophones(t));
    } catch {
      setMicrophones([]);
    }
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to microphone device changes while settings are open
  useEffect(() => {
    queueMicrotask(() => void refreshMicrophones());
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const onChange = () => void refreshMicrophones();
    mediaDevices.addEventListener("devicechange", onChange);
    return () => mediaDevices.removeEventListener("devicechange", onChange);
  }, [refreshMicrophones]);
  const modelStatus = catalog.status;
  const target = settingsScope?.target;
  const members = settingsScope?.scope.members;
  const project =
    members?.find(
      (member) => member.environmentId === target?.environmentId && member.id === target.projectId,
    ) ?? members?.[0];

  const selectedMicrophone = settings.voiceMicrophone;
  const selectedMicrophoneLabel = selectedMicrophone
    ? (microphones.find((device) => device.deviceId === selectedMicrophone)?.label ??
      t(($) => $.microphone.selectedUnavailable))
    : t(($) => $.microphone.systemDefault);
  const destinationValue = destination.environmentId ?? OFF;
  const chosenEnvironment = environments.find(
    (environment) => environment.environmentId === destination.environmentId,
  );
  const chosenUnsupported =
    chosenEnvironment?.serverConfig != null &&
    chosenEnvironment.serverConfig.environment.capabilities.voiceTranscription !== true;
  const model = prepared && modelStatus?.supported ? modelStatus : null;

  return (
    <SettingsPageContainer
      searchTargetFallbacks={{
        "speech-models": prepared ? undefined : "voice-transcription-destination",
        "speech-hardware": prepared && model ? undefined : "voice-transcription-destination",
        "transcription-test": !prepared
          ? "voice-transcription-destination"
          : !model || model.state === "missing-model"
            ? "speech-models"
            : undefined,
        "speech-post-processing-model":
          cleanupEnabled && settingsScope ? undefined : "speech-post-processing",
        "speech-correction-word": cleanupEnabled ? undefined : "speech-post-processing",
      }}
    >
      <SettingsSection id="voice-input" title={t(($) => $.panel.inputSection)}>
        <SettingsRow
          {...searchableSetting("voice-microphone", tSettings)}
          title={t(($) => $.microphone.label)}
          description={t(($) => $.panel.microphoneDescription)}
          control={
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
              <SettingsSearchTarget {...searchableSetting("microphone-test", tSettings)}>
                <MicrophoneTest key={selectedMicrophone} microphoneId={selectedMicrophone} />
              </SettingsSearchTarget>
              <div className="flex min-w-0 items-center gap-1.5">
                <Select
                  value={selectedMicrophone ? `device:${selectedMicrophone}` : SYSTEM_DEFAULT}
                  onValueChange={(value) => {
                    if (value)
                      void updateClientSettings({
                        voiceMicrophone:
                          value === SYSTEM_DEFAULT ? "" : value.slice("device:".length),
                      });
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={t(($) => $.microphone.label)}
                    className="max-w-64"
                  >
                    <SelectValue>{selectedMicrophoneLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    <SelectItem value={SYSTEM_DEFAULT}>
                      {t(($) => $.microphone.systemDefault)}
                    </SelectItem>
                    {microphones.map((device) => (
                      <SelectItem key={device.deviceId} value={`device:${device.deviceId}`}>
                        {device.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t(($) => $.microphone.refresh)}
                  onClick={() => void refreshMicrophones()}
                >
                  <RefreshCwIcon className="size-3.5" />
                </Button>
              </div>
            </div>
          }
        />
        <SettingsRow
          {...searchableSetting("dictation-shortcut-mode", tSettings)}
          title={t(($) => $.panel.shortcut)}
          description={t(($) => $.panel.shortcutDescription)}
          control={
            <Select
              value={settings.voiceShortcutMode}
              onValueChange={(value) => {
                if (value)
                  void updateClientSettings({ voiceShortcutMode: value as VoiceShortcutMode });
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t(($) => $.panel.shortcutMode)}
                className="max-w-72"
              >
                <SelectValue>
                  {t(($) => $.panel.shortcutModes[settings.voiceShortcutMode])}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {SHORTCUT_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(($) => $.panel.shortcutModes[mode])}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection id="voice-transcription" title={t(($) => $.panel.transcriptionSection)}>
        <SettingsRow
          {...searchableSetting("voice-transcription-destination", tSettings)}
          title={t(($) => $.panel.destination)}
          description={t(($) => $.panel.destinationDescription)}
          control={
            <Select
              value={destinationValue}
              onValueChange={(value) => {
                if (!value) return;
                chooseAudioDestination(
                  value === OFF
                    ? null
                    : { kind: "environment", environmentId: value as EnvironmentId },
                );
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t(($) => $.panel.destination)}
                className="max-w-72"
              >
                <SelectValue>
                  {destinationValue === OFF
                    ? t(($) => $.panel.off)
                    : (chosenEnvironment?.label ?? t(($) => $.panel.chosenUnavailable))}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value={OFF}>{t(($) => $.panel.off)}</SelectItem>
                {environments.map((environment) => (
                  <SelectItem key={environment.environmentId} value={environment.environmentId}>
                    {environment.label}
                  </SelectItem>
                ))}
                {destination.environmentId && !chosenEnvironment ? (
                  <SelectItem value={destination.environmentId}>
                    {t(($) => $.panel.chosenUnavailable)}
                  </SelectItem>
                ) : null}
              </SelectPopup>
            </Select>
          }
        >
          {destination.environmentId && chosenUnsupported ? (
            <p className="mt-2 text-xs text-destructive">
              {t(($) => $.panel.destinationUnsupported, {
                environment: chosenEnvironment.label,
              })}
            </p>
          ) : null}
        </SettingsRow>

        <SettingsRow
          {...searchableSetting("speech-language", tSettings)}
          title={t(($) => $.panel.language)}
          description={
            model
              ? model.supportsLanguageDetection
                ? t(($) => $.panel.languageDetects, { model: model.model })
                : t(($) => $.panel.languageFixed, { model: model.model })
              : t(($) => $.panel.languageEmpty)
          }
          control={<SpeechLanguageSelect model={model} />}
        />
        {model?.supportsTranslation ? (
          <SettingsRow
            title={t(($) => $.panel.translate)}
            description={t(($) => $.panel.translateDescription)}
            control={
              <Switch
                aria-label={t(($) => $.panel.translate)}
                checked={settings.speechTranslateToEnglish}
                onCheckedChange={(checked) =>
                  void updateClientSettings({ speechTranslateToEnglish: checked })
                }
              />
            }
          />
        ) : null}
        {prepared ? (
          <SpeechModelBrowser
            key={prepared.environmentId}
            prepared={prepared}
            catalog={catalog}
            testEnvironmentId={
              project?.environmentId ?? target?.environmentId ?? prepared.environmentId
            }
            projectId={project?.id ?? null}
            projectName={project?.title ?? null}
          />
        ) : null}
        {prepared && <AdvancedSpeechSettings prepared={prepared} catalog={catalog} />}
      </SettingsSection>
      <SettingsSection id="voice-recognition" title={t(($) => $.panel.optionsSection)}>
        <SettingsRow
          {...searchableSetting("speech-silence-filtering", tSettings)}
          title={t(($) => $.panel.silence)}
          description={t(($) => $.panel.silenceDescription)}
          control={
            <Switch
              aria-label={t(($) => $.panel.silence)}
              checked={settings.speechSilenceFiltering}
              onCheckedChange={(checked) =>
                void updateClientSettings({ speechSilenceFiltering: checked })
              }
            />
          }
        />
        <SettingsRow
          {...searchableSetting("remove-filler-words", tSettings)}
          title={t(($) => $.panel.fillers)}
          description={t(($) => $.panel.fillersDescription)}
          control={
            <Switch
              aria-label={t(($) => $.panel.fillers)}
              checked={settings.speechRemoveFillerWords}
              onCheckedChange={(checked) =>
                void updateClientSettings({ speechRemoveFillerWords: checked })
              }
            />
          }
        />
        <SettingsRow
          {...searchableSetting("speech-dictionary", tSettings)}
          title={t(($) => $.dictionary.title)}
          description={t(($) => $.dictionary.description)}
          control={
            <span className="text-xs text-muted-foreground">
              {t(($) => $.dictionary.entries, { count: settings.speechCustomWords.length })}
            </span>
          }
        >
          <div className="mt-2 pb-3.5">
            <DictionaryEditor
              label={t(($) => $.dictionary.personalLabel)}
              words={settings.speechCustomWords}
              onChange={(words) => void updateClientSettings({ speechCustomWords: words })}
            />
          </div>
        </SettingsRow>
        <ProjectDictionaryRow />
      </SettingsSection>

      <SettingsSection
        id={searchableSetting("speech-post-processing", tSettings).id}
        title={t(($) => $.cleanup.section)}
      >
        <SettingsRow
          title={t(($) => $.cleanup.enable)}
          description={t(($) => $.cleanup.enableDescription)}
          control={
            <Switch
              aria-label={t(($) => $.cleanup.enable)}
              checked={cleanupEnabled}
              onCheckedChange={chooseTranscriptCleanup}
            />
          }
        />
        {cleanupEnabled ? (
          <SettingsRow
            title={t(($) => $.cleanup.instructions)}
            description={t(($) => $.cleanup.instructionsDescription)}
            control={
              <Select
                value={settings.speechPostProcessingPrompt.mode}
                onValueChange={(value) => {
                  if (value === "default" || value === "custom")
                    void updateClientSettings({
                      speechPostProcessingPrompt: {
                        ...settings.speechPostProcessingPrompt,
                        mode: value,
                      },
                    });
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label={t(($) => $.cleanup.instructions)}
                  className="max-w-64"
                >
                  <SelectValue>
                    {settings.speechPostProcessingPrompt.mode === "custom"
                      ? t(($) => $.cleanup.custom)
                      : t(($) => $.cleanup.builtIn)}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="default">{t(($) => $.cleanup.builtIn)}</SelectItem>
                  <SelectItem value="custom">{t(($) => $.cleanup.custom)}</SelectItem>
                </SelectPopup>
              </Select>
            }
          >
            <Textarea
              aria-label={t(($) => $.cleanup.customInstructions)}
              className="mt-2"
              maxLength={10_000}
              disabled={settings.speechPostProcessingPrompt.mode !== "custom"}
              value={
                settings.speechPostProcessingPrompt.mode === "custom"
                  ? settings.speechPostProcessingPrompt.customInstructions
                  : DEFAULT_SPEECH_POST_PROCESSING_PROMPT
              }
              onChange={(event) =>
                void updateClientSettings({
                  speechPostProcessingPrompt: {
                    mode: "custom",
                    customInstructions: event.target.value,
                  },
                })
              }
            />
          </SettingsRow>
        ) : null}
        {cleanupEnabled && settingsScope !== null ? <CleanupModelRow /> : null}
        {cleanupEnabled ? (
          <SettingsRow
            {...searchableSetting("speech-correction-word", tSettings)}
            title={t(($) => $.cleanup.cue)}
            description={t(($) => $.cleanup.cueDescription)}
            control={
              <Input
                key={settings.speechCorrectionWord}
                defaultValue={settings.speechCorrectionWord}
                maxLength={50}
                placeholder={t(($) => $.cleanup.cuePlaceholder)}
                aria-label={t(($) => $.cleanup.cue)}
                className="w-40"
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next !== settings.speechCorrectionWord)
                    void updateClientSettings({ speechCorrectionWord: next });
                }}
              />
            }
          />
        ) : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
