import {
  type EnvironmentId,
  isSecretReference,
  type ProviderInstanceId,
  type SecretReference,
  type ServerProvider,
  TextGeneratorConfig,
  type TextGeneratorModel,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { CheckIcon, MoreVertical, PlusIcon, ServerIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import {
  checkTextGeneratorConfig,
  rereadTextGeneratorModels,
  nextTextGeneratorId,
  refreshTextGeneratorModels,
  testTextGeneratorModel,
  useTextGenerationTargets,
  useTextGeneratorModels,
  TEXT_GENERATOR_PRESETS,
  type TextGeneratorPreset,
  textGeneratorBrand,
  textGeneratorDisplayName,
} from "../../textGenerators";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { toastManager } from "../ui/toast";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Label } from "../ui/label";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { WizardFooter, WizardHeader, WizardPanel, WizardPopup, WizardSteps } from "../ui/wizard";
import { SecretSourceInput, useSecretSources } from "./SecretSourceInput";
import { searchableSetting } from "./settingsSearch";
import { SETTINGS_PICKER_TRIGGER_CLASSNAME, SettingsRow, SettingsSection } from "./settingsLayout";

const decodeTextGenerator = Schema.decodeUnknownOption(TextGeneratorConfig);

type Saved = { readonly id: ProviderInstanceId; readonly config: TextGeneratorConfig };
type Editing = Saved | "new";

export function TextGeneratorsSettings({
  environmentId,
  environmentLabel,
  providers,
  readOnly,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly readOnly: boolean;
}) {
  const { t } = useTranslation("settings");
  const settings = useEnvironmentSettings(environmentId);
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<ProviderInstanceId | null>(null);
  const [viewing, setViewing] = useState<Saved | null>(null);
  const generators = Object.entries(settings.textGenerators) as Array<
    [ProviderInstanceId, TextGeneratorConfig]
  >;
  const removingConfig = removing === null ? undefined : settings.textGenerators[removing];

  return (
    <>
      <SettingsSection
        {...searchableSetting("text-generators", t)}
        headerAction={
          !readOnly ? (
            <Button size="xs" variant="outline" onClick={() => setEditing("new")}>
              <PlusIcon className="size-3" aria-hidden />
              {t(($) => $.providers.textGenerators.add)}
            </Button>
          ) : null
        }
      >
        {generators.length === 0 ? (
          <SettingsRow
            title={t(($) => $.providers.textGenerators.empty)}
            description={t(($) => $.providers.textGenerators.emptyDescription)}
          />
        ) : null}
        {generators.map(([id, config]) => {
          const name = textGeneratorDisplayName(config);
          const url = config.baseUrl.replace(/^https?:\/\//, "");
          return (
            <SettingsRow
              key={id}
              title={
                <span className="inline-flex items-center gap-2.5">
                  <ProviderInstanceIcon
                    driverKind={textGeneratorBrand(config)}
                    displayName={name}
                    badgeContent="none"
                  />
                  {name}
                </span>
              }
              description={
                <span className="block truncate ps-7.5">
                  {config.enabled ? url : t(($) => $.providers.textGenerators.disabledUrl, { url })}
                </span>
              }
              control={
                readOnly ? null : (
                  <div className="flex items-center gap-2">
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            size="icon-sm"
                            variant="ghost-muted"
                            aria-label={t(($) => $.providers.textGenerators.moreActions, { name })}
                          />
                        }
                      >
                        <MoreVertical />
                      </MenuTrigger>
                      <MenuPopup align="end">
                        <MenuItem onClick={() => setEditing({ id, config })}>
                          {t(($) => $.providers.edit)}
                        </MenuItem>
                        <MenuItem
                          disabled={!config.enabled}
                          onClick={() => setViewing({ id, config })}
                        >
                          {t(($) => $.providers.textGenerators.showModels)}
                        </MenuItem>
                        <MenuItem variant="destructive" onClick={() => setRemoving(id)}>
                          {t(($) => $.providers.remove)}
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(enabled) =>
                        updateSettings({ textGenerators: { [id]: { ...config, enabled } } })
                      }
                      aria-label={t(($) => $.providers.enableNamed, { name })}
                    />
                  </div>
                )
              }
            />
          );
        })}
      </SettingsSection>
      {editing !== null ? (
        <TextGeneratorWizard
          environmentId={environmentId}
          editing={editing}
          providers={providers}
          onClose={() => setEditing(null)}
          onSave={(id, config) =>
            updateSettings(
              { textGenerators: { [id]: config } },
              { onSaved: () => rereadTextGeneratorModels(environmentId, id) },
            )
          }
          newId={(preset) => nextTextGeneratorId(preset.id, settings, providers)}
        />
      ) : null}
      {viewing !== null ? (
        <TextGeneratorModelsDialog
          environmentId={environmentId}
          saved={viewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
      <AlertDialog
        open={removingConfig !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(($) => $.providers.textGenerators.removeTitle, {
                name: removingConfig ? textGeneratorDisplayName(removingConfig) : "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.providers.textGenerators.removeDescription, {
                environment: environmentLabel,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t(($) => $.providers.cancel)}
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (removing !== null) updateSettings({ textGenerators: { [removing]: null } });
                setRemoving(null);
              }}
            >
              {t(($) => $.providers.remove)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

const TASKS = [
  "textGenerationModelSelection",
  "sourceControlWriterModelSelection",
  "speechPostProcessingModelSelection",
] as const;

function TextGeneratorWizard({
  environmentId,
  editing,
  providers,
  onClose,
  onSave,
  newId,
}: {
  readonly environmentId: EnvironmentId;
  readonly editing: Editing;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly onClose: () => void;
  readonly onSave: (id: ProviderInstanceId, config: TextGeneratorConfig) => void;
  readonly newId: (preset: TextGeneratorPreset) => ProviderInstanceId;
}) {
  const { t } = useTranslation("settings");
  const existing = editing === "new" ? null : editing.config;
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState(TEXT_GENERATOR_PRESETS[0]!);
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? preset.baseUrl);
  const [label, setLabel] = useState(existing?.label ?? "");
  const secretSources = useSecretSources(environmentId);
  const [keyDraft, setKeyDraft] = useState<string | SecretReference>(
    isSecretReference(existing?.apiKey) ? existing.apiKey : "",
  );
  const [keyValid, setKeyValid] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [modelCount, setModelCount] = useState(0);
  const [savedId, setSavedId] = useState<ProviderInstanceId | null>(
    editing === "new" ? null : editing.id,
  );

  const storedKey = typeof existing?.apiKey === "string" ? existing.apiKey : "";
  const apiKey = typeof keyDraft === "string" ? keyDraft.trim() || storedKey : keyDraft;
  const kind = existing?.kind ?? preset.kind;
  const config = decodeTextGenerator({
    kind,
    ...(label.trim() ? { label: label.trim() } : {}),
    baseUrl: baseUrl.trim(),
    apiKey,
    enabled: existing?.enabled ?? true,
  });
  const keyRequired = existing === null && preset.id !== "custom";
  const showBaseUrl =
    existing === null
      ? preset.id === "custom"
      : !["openai", "anthropic", "openrouter"].includes(textGeneratorBrand(existing));
  const canConnect = keyValid && Option.isSome(config) && (!keyRequired || apiKey !== "");
  const name = Option.isSome(config) ? textGeneratorDisplayName(config.value) : preset.label;

  const connect = async () => {
    if (!canConnect || checking) return;
    const id = savedId ?? newId(preset);
    setChecking(true);
    setCheckError(null);
    const result = await checkTextGeneratorConfig(environmentId, id, config.value);
    setChecking(false);
    if ("error" in result) {
      setCheckError(result.error);
      return;
    }
    onSave(id, config.value);
    setSavedId(id);
    setModelCount(result.models.length);
    setStep(1);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <WizardPopup>
        <WizardHeader
          title={
            existing
              ? t(($) => $.providers.textGenerators.editTitle, {
                  name: textGeneratorDisplayName(existing),
                })
              : t(($) => $.providers.textGenerators.addTitle)
          }
          description={t(($) => $.providers.textGenerators.wizardDescription)}
        >
          <WizardSteps
            steps={[
              { id: "connect", label: t(($) => $.providers.connect) },
              { id: "use", label: t(($) => $.providers.textGenerators.stepUse) },
            ]}
            currentStep={step}
            isStepDisabled={(index) => index > step}
            onStepChange={setStep}
          />
        </WizardHeader>
        <WizardPanel>
          {step === 0 ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void connect();
              }}
            >
              <fieldset disabled={checking} className="contents">
                {existing === null ? (
                  <div className="grid gap-1.5">
                    <span className="text-sm font-medium">
                      {t(($) => $.providers.textGenerators.service)}
                    </span>
                    <div
                      role="radiogroup"
                      aria-label={t(($) => $.providers.textGenerators.service)}
                      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                    >
                      {TEXT_GENERATOR_PRESETS.map((candidate) => {
                        const selected = candidate.id === preset.id;
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            className={
                              selected
                                ? "flex flex-col items-center gap-2 rounded-lg border border-primary bg-primary/5 px-2 py-3 text-sm font-medium text-foreground ring-1 ring-primary ring-inset outline-none focus-visible:ring-2 focus-visible:ring-inset"
                                : "flex flex-col items-center gap-2 rounded-lg border bg-background px-2 py-3 text-sm text-muted-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                            }
                            onClick={() => {
                              setPreset(candidate);
                              setBaseUrl(candidate.baseUrl);
                              setCheckError(null);
                            }}
                          >
                            {candidate.id === "custom" ? (
                              <ServerIcon className="size-5" aria-hidden />
                            ) : (
                              <ProviderInstanceIcon
                                driverKind={textGeneratorBrand(candidate)}
                                displayName={candidate.label}
                                badgeContent="none"
                              />
                            )}
                            {candidate.id === "custom"
                              ? t(($) => $.providers.textGenerators.custom)
                              : candidate.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {showBaseUrl ? (
                  <div className="grid gap-1.5">
                    <Label htmlFor="text-generator-url">
                      {t(($) => $.providers.textGenerators.baseUrl)}
                    </Label>
                    <Input
                      id="text-generator-url"
                      placeholder="http://localhost:11434/v1"
                      value={baseUrl}
                      onChange={(event) => {
                        setBaseUrl(event.target.value);
                        setCheckError(null);
                      }}
                      spellCheck={false}
                      autoFocus={existing === null && preset.id === "custom"}
                    />
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label htmlFor="text-generator-key">
                    {keyRequired
                      ? t(($) => $.providers.apiKey)
                      : t(($) => $.providers.textGenerators.apiKeyOptional)}
                  </Label>
                  <SecretSourceInput
                    id="text-generator-key"
                    aria-label={t(($) => $.providers.apiKey)}
                    value={keyDraft}
                    configured={storedKey !== ""}
                    sources={secretSources}
                    onChange={(event) => {
                      setKeyDraft(event.target.value);
                      setCheckError(null);
                    }}
                    onSecretChange={(secret) => setKeyDraft(secret ?? "")}
                    autoFocus={existing === null && preset.id !== "custom"}
                    onValidityChange={setKeyValid}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="text-generator-label">
                    {t(($) => $.providers.textGenerators.name)}
                  </Label>
                  <Input
                    id="text-generator-label"
                    placeholder={
                      existing !== null
                        ? textGeneratorDisplayName(existing)
                        : preset.id === "custom"
                          ? t(($) => $.providers.textGenerators.namePlaceholder)
                          : preset.label
                    }
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </div>
                {checkError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {checkError}
                  </p>
                ) : null}
              </fieldset>
            </form>
          ) : (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                {t(($) => $.providers.textGenerators.connected, { name, count: modelCount })}
              </p>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-4">
                {TASKS.map((task) => (
                  <TextGenerationTaskPicker
                    key={task}
                    environmentId={environmentId}
                    providers={providers}
                    settingKey={task}
                    label={t(($) => $.providers.textGenerators.tasks[task])}
                  />
                ))}
              </div>
            </div>
          )}
        </WizardPanel>
        <WizardFooter
          leading={
            step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(0)}>
                {t(($) => $.providers.back)}
              </Button>
            ) : null
          }
        >
          {step === 0 ? (
            <>
              <Button variant="outline" onClick={onClose}>
                {t(($) => $.providers.cancel)}
              </Button>
              <Button onClick={() => void connect()} disabled={!canConnect || checking}>
                {checking ? <Spinner /> : null}
                {checking
                  ? t(($) => $.providers.textGenerators.connecting)
                  : existing
                    ? t(($) => $.providers.textGenerators.saveContinue)
                    : t(($) => $.providers.connect)}
              </Button>
            </>
          ) : (
            <Button autoFocus onClick={onClose}>
              {t(($) => $.providers.done)}
            </Button>
          )}
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}

function TextGenerationTaskPicker({
  environmentId,
  providers,
  settingKey,
  label,
}: {
  readonly environmentId: EnvironmentId;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly settingKey: (typeof TASKS)[number];
  readonly label: string;
}) {
  const { t } = useTranslation("settings");
  const settings = useEnvironmentSettings(environmentId);
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const own = settings[settingKey];
  const selection = own ?? settings.textGenerationModelSelection;
  const targets = useTextGenerationTargets({
    environmentId,
    settings,
    providers: providers.filter((provider) => provider.supportsTextGeneration !== false),
    projectId: null,
    selections: [selection],
  });
  const testable = Object.hasOwn(settings.textGenerators, selection.instanceId);
  const testKey = `${selection.instanceId}:${selection.model}`;
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly error: string | null;
  } | null>(null);
  const shown = result?.key === testKey ? result : null;
  const test = async () => {
    setTesting(true);
    const error = await testTextGeneratorModel(
      environmentId,
      selection.instanceId,
      selection.model,
    );
    setTesting(false);
    setResult({ key: testKey, error });
  };
  return (
    <>
      <div className="grid min-w-0 gap-0.5 pe-2">
        <span className="text-sm">{label}</span>
        {shown?.error ? (
          <span role="alert" className="text-xs text-destructive">
            {shown.error}
          </span>
        ) : shown ? (
          <span role="status" className="text-xs text-muted-foreground">
            {t(($) => $.providers.textGenerators.testPassed, { model: selection.model })}
          </span>
        ) : own === null ? (
          <span className="text-xs text-muted-foreground">
            {t(($) => $.providers.textGenerators.followsDefault)}
          </span>
        ) : null}
      </div>
      <div className="justify-self-end">
        <ProviderModelPicker
          environmentId={environmentId}
          activeInstanceId={selection.instanceId}
          model={selection.model}
          lockedProvider={null}
          instanceEntries={targets.entries}
          modelOptionsByInstance={getCustomModelOptionsByInstance(
            settings,
            targets.providers,
            selection.instanceId,
            selection.model,
          )}
          triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
          onInstanceModelChange={(instanceId, model) =>
            updateSettings({ [settingKey]: createModelSelection(instanceId, model) })
          }
        />
      </div>
      <div className="justify-self-end">
        {testable ? (
          <Button
            size="xs"
            variant="outline"
            aria-busy={testing}
            disabled={testing}
            onClick={() => void test()}
          >
            <span className="relative">
              <span className={testing ? "invisible" : undefined}>
                {t(($) => $.providers.textGenerators.test)}
              </span>
              {testing ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Spinner />
                </span>
              ) : null}
            </span>
          </Button>
        ) : null}
      </div>
    </>
  );
}

function TextGeneratorModelList({
  models,
  selected,
  onSelect,
}: {
  readonly models: ReadonlyArray<TextGeneratorModel>;
  readonly selected?: string | null;
  readonly onSelect?: (id: string) => void;
}) {
  const { t } = useTranslation("settings");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? models.filter(
        (model) =>
          model.id.toLowerCase().includes(needle) || model.name.toLowerCase().includes(needle),
      )
    : models;
  return (
    <div className="grid gap-2">
      {models.length > 8 ? (
        <Input
          type="search"
          placeholder={t(($) => $.providers.textGenerators.searchModels)}
          aria-label={t(($) => $.providers.textGenerators.searchModels)}
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="max-h-80 overflow-y-auto rounded-lg border divide-y divide-border/60">
        {shown.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {t(($) => $.providers.noModelsMatch)}
          </p>
        ) : (
          <ul
            role={onSelect ? "listbox" : "list"}
            aria-label={t(($) => $.providers.textGenerators.models)}
          >
            {shown.map((model) => {
              const isSelected = model.id === selected;
              const label = (
                <>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{model.name}</span>
                    {model.name !== model.id ? (
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {model.id}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
                </>
              );
              return (
                <li
                  key={model.id}
                  role={onSelect ? "option" : undefined}
                  aria-selected={onSelect ? isSelected : undefined}
                >
                  {onSelect ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      onClick={() => onSelect(model.id)}
                    >
                      {label}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm">{label}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function TextGeneratorModelsDialog({
  environmentId,
  saved,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly saved: Saved;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation("settings");
  const name = textGeneratorDisplayName(saved.config);
  const result = useTextGeneratorModels(environmentId, saved.id, saved.config);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    const outcome = await refreshTextGeneratorModels(environmentId, saved.id);
    setRefreshing(false);
    if ("error" in outcome) {
      toastManager.add({
        type: "error",
        title: t(($) => $.providers.textGenerators.loadFailed, { name }),
        description: outcome.error,
      });
    }
  };
  const models = AsyncResult.isSuccess(result) ? result.value : null;
  const error = Option.getOrUndefined(AsyncResult.error(result));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(($) => $.providers.textGenerators.modelsTitle, { name })}</DialogTitle>
          <DialogDescription>
            {models === null
              ? error
                ? t(($) => $.providers.textGenerators.listFailed)
                : t(($) => $.providers.textGenerators.listLoading)
              : t(($) => $.providers.textGenerators.available, { count: models.length })}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : models === null ? (
            <Spinner tone="muted" />
          ) : (
            <TextGeneratorModelList models={models} />
          )}
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button
            variant="outline"
            aria-busy={refreshing}
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshIcon refreshing={refreshing} />
            {t(($) => $.providers.refresh)}
          </Button>
          <Button onClick={onClose}>{t(($) => $.providers.done)}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
