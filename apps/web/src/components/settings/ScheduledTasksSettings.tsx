import { useTranslation } from "react-i18next";
import type { TFunction } from "@t3tools/client-runtime/i18n";
import { useAtomValue } from "@effect/atom-react";
import { connectionStatusTitle } from "~/connection/presentation";
import { AsyncResult } from "effect/reactivity";
import {
  ChevronDownIcon,
  Clock3Icon,
  CopyIcon,
  InboxIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import type {
  EnvironmentId,
  ModelSelection,
  OrchestrationV2ThreadLaunchWorkspaceStrategy,
  ProjectId,
  ScheduledTask,
  ScheduledTaskId,
  ScheduledTaskUpsertInput,
  ScheduledTaskWebhookDeliverySummary,
  ThreadId,
} from "@t3tools/contracts";
import {
  DEFAULT_WEBHOOK_PROMPT,
  emptyWebhookFilterDraft,
  parseWebhookFilterDrafts,
  removeWebhookFilterDraft,
  WEBHOOK_FILTER_OPS,
  type WebhookFilterDraft,
} from "@t3tools/client-runtime/scheduled-task-webhook";
import { scheduleTimeZoneLabel } from "@t3tools/client-runtime/scheduled-task-time-zone";
import {
  MAX_WEBHOOK_DELIVERY_AGE_MINUTES,
  MAX_WEBHOOK_FILTERS,
  MIN_SCHEDULED_TASK_INTERVAL_MS,
  ProviderInstanceId,
  resolveEnvironmentMachineKind,
  ScheduledTaskThreadMode,
  scheduledTaskThreadMode,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { formatRelativeTime } from "../../timestampFormat";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { getCustomModelOptionsByInstance } from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { usePrimaryCloudLinkState } from "../../cloud/cloudLinkState";
import { requestConfirmDialog } from "../../confirmDialog";
import { webhookAddress } from "@t3tools/client-runtime/webhook-address";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useNowMinute } from "../../hooks/useNowMinute";
import {
  useEnvironment,
  useEnvironmentHttpBaseUrl,
  type EnvironmentPresentation,
} from "../../state/environments";
import {
  useProjects,
  useQuietThreadShell,
  useThreadShell,
  useVisibleThreadShells,
} from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { environmentAtomList, environmentIdsKey } from "../../state/environmentAtomList";
import { useThreadSearch } from "../../state/queries";
import { formatEnvironmentQueryError, useEnvironmentQuery } from "../../state/query";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { threadFamilies } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { WorktreeBaseBranchPicker } from "../WorktreeBaseBranchPicker";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { ConnectionStatusDot, connectionPhaseDotClassName } from "../ConnectionStatusDot";
import {
  AuthOrchestrationOperateScope,
  clampManagedRuntimeMode,
  managedCapabilityDenial,
} from "@t3tools/contracts";
import { resolvePastedPath } from "@t3tools/shared/path";
import { useManagedPolicy } from "~/state/managedPolicy";
import { ManagedNotice } from "../ManagedPolicy";
import { readEnvironmentScope } from "~/state/session";
import { useSettingsScope } from "./SettingsScopeContext";
import { EnvironmentRow, useEnvironmentTransportLabel } from "./EnvironmentRow";
import { SettingsGroup } from "./SettingsGroup";
import { settingsScopeEnvironmentLabel, settingsScopeEnvironmentLabels } from "./settingsScopeAxis";
import {
  WEBHOOK_SIGNATURE_DEFAULTS,
  changeDraftProject,
  moveDraftToThread,
  scheduleDraftErrors,
  scheduledTaskDestinationThreads,
  toDateTimeLocalValue,
  webhookDeliveryLabel,
  defaultScheduledTaskProjectId,
  matchesScheduledTaskScope,
  scheduleFromDraft,
  scheduleLabel,
  scheduledTaskDefaultModel,
  taskToDraft,
  unbindDraftFromThread,
  weekdayLabels,
  type DraftState,
  type ScheduleMode,
  type WorkspaceMode,
} from "./scheduledTasksSettings.logic";
import { Label } from "../ui/label";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "../ui/menu";
import { ToggleGroup, Toggle } from "../ui/toggle-group";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "../ui/empty";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
} from "../ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
} from "./settingsLayout";

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
// Thread ids are trimmed, so the leading space keeps this from matching one.
const NEW_THREAD_DESTINATION = " new-thread";

const EMPTY_DRAFT: DraftState = {
  editingId: null,
  title: "",
  prompt: "",
  enabled: true,
  scheduleMode: "fixed",
  intervalMinutes: "15",
  timeOfDay: "09:00",
  runAt: "",
  savedRunAt: "",
  weekdays: new Set([1, 2, 3, 4, 5]),
  projectId: "",
  threadId: "",
  threadMode: "new_thread",
  workspaceMode: "worktree",
  baseRef: "main",
  startFromOrigin: true,
  existingWorktreePath: "",
  modelKey: "",
  runtimeMode: "full-access",
  interactionMode: "default",
  baseModelSelection: null,
  signatureEnabled: false,
  ...WEBHOOK_SIGNATURE_DEFAULTS,
  signatureSecret: "",
  maxDeliveryAgeMinutes: "",
  replayKey: "",
  coalesceKey: "",
  coalesceWindowSeconds: "",
  filters: [],
  savedFilters: [],
};

function WebhookFiltersField({
  filters,
  onChange,
}: {
  filters: ReadonlyArray<WebhookFilterDraft>;
  onChange: (filters: ReadonlyArray<WebhookFilterDraft>) => void;
}) {
  const { t } = useTranslation("settings");
  const filterLabels = {
    equals: t(($) => $.extra.scheduled.filterEquals),
    notEquals: t(($) => $.extra.scheduled.filterNotEquals),
    in: t(($) => $.extra.scheduled.filterIn),
    startsWith: t(($) => $.extra.scheduled.filterStartsWith),
    exists: t(($) => $.extra.scheduled.filterExists),
  };
  const update = (index: number, patch: Partial<WebhookFilterDraft>) =>
    onChange(filters.map((filter, at) => (at === index ? { ...filter, ...patch } : filter)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <Label>{t(($) => $.extra.scheduled.filters)}</Label>
          <p className="text-sm text-muted-foreground">
            {t(($) => $.extra.scheduled.filtersDescription)}
          </p>
        </div>
        <Button
          className="shrink-0"
          variant="outline"
          size="sm"
          disabled={filters.length >= MAX_WEBHOOK_FILTERS}
          onClick={() => onChange([...filters, emptyWebhookFilterDraft()])}
        >
          <PlusIcon />
          {t(($) => $.extra.scheduled.addFilter)}
        </Button>
      </div>
      {filters.map((filter, index) => (
        // Always stacked: the dialog stays narrow on wide windows, so a single line
        // would cut off typical paths and values. The grid wrappers size each control
        // without restyling it; a grid item stretches to its minmax(0, 1fr) track.
        <div key={filter.id} className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-1">
              <Input
                aria-label={t(($) => $.extra.scheduled.filterPath, { number: index + 1 })}
                placeholder="body.action"
                value={filter.path}
                onChange={(event) => update(index, { path: event.target.value })}
              />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t(($) => $.extra.scheduled.filterRemove, { number: index + 1 })}
              onClick={() => onChange(removeWebhookFilterDraft(filters, filter.id))}
            >
              <Trash2Icon />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={filter.op}
              onValueChange={(op) => {
                const known = WEBHOOK_FILTER_OPS.find((option) => option.op === op);
                if (known) update(index, { op: known.op });
              }}
            >
              <div className="grid w-44 shrink-0 grid-cols-1">
                <SelectTrigger
                  size="sm"
                  aria-label={t(($) => $.extra.scheduled.filterTest, { number: index + 1 })}
                >
                  <SelectValue>{filterLabels[filter.op]}</SelectValue>
                </SelectTrigger>
              </div>
              <SelectPopup>
                {WEBHOOK_FILTER_OPS.map((option) => (
                  <SelectItem key={option.op} value={option.op}>
                    {filterLabels[option.op]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {filter.op === "exists" ? null : (
              <div className="grid min-w-0 flex-1 grid-cols-1">
                <Input
                  aria-label={t(($) => $.extra.scheduled.filterValue, { number: index + 1 })}
                  placeholder={filter.op === "in" ? "opened, reopened" : "opened"}
                  value={filter.value}
                  onChange={(event) => update(index, { value: event.target.value })}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-baseline justify-between" htmlFor={htmlFor}>
        <span>{label}</span>
        {hint ? (
          <span className="font-normal text-2xs text-muted-foreground/80">{hint}</span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

function splitModelKey(value: string): ModelSelection | null {
  const index = value.indexOf(":");
  if (index <= 0 || index === value.length - 1) return null;
  return {
    instanceId: ProviderInstanceId.make(value.slice(0, index)),
    model: value.slice(index + 1),
  };
}

function relativeLabel(
  value: string | null,
  nowMs: number,
  t: TFunction<"settings">,
  tCommon: TFunction<"common">,
): string {
  if (!value) return t(($) => $.extra.scheduled.notScheduled);
  const diffMs = new Date(value).getTime() - nowMs;
  if (diffMs <= 0)
    return formatRelativeTime(value, tCommon, nowMs) ?? t(($) => $.extra.scheduled.notScheduled);
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 2) return t(($) => $.extra.scheduled.underMinute);
  if (minutes < 60) return t(($) => $.extra.scheduled.futureMinutes, { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(($) => $.extra.scheduled.futureHours, { hours });
  return t(($) => $.extra.scheduled.futureDays, { count: Math.round(hours / 24) });
}

export function ScheduledRelativeLabel(props: { value: string | null }) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const nowMinute = useNowMinute();
  return relativeLabel(props.value, Date.parse(`${nowMinute}:00.000Z`), t, tCommon);
}

function deliveryOutcomeVariant(outcome: string) {
  if (outcome === "accepted") return "success";
  if (
    outcome === "duplicate" ||
    outcome === "coalesced" ||
    outcome === "disabled" ||
    outcome === "rate_limited" ||
    outcome === "expired"
  ) {
    return "warning";
  }
  if (outcome === "dispatch_failed" || outcome === "rejected_signature") return "error";
  return "outline";
}

function statusVariant(status: ScheduledTask["lastRunStatus"]) {
  if (status === "failed") return "error";
  if (status === "succeeded") return "success";
  if (status === "running") return "info";
  return "outline";
}

export function ScheduledTasksSettings(target: {
  readonly environmentId?: EnvironmentId;
  readonly taskId?: ScheduledTaskId | undefined;
}) {
  const { t } = useTranslation("settings");
  const { scope, environments, connectedEnvironments, environment } = useSettingsScope();
  const [editor, setEditor] = useState<{
    environmentId: EnvironmentId;
    task: ScheduledTask | null;
  } | null>(null);
  const openForEdit = (environmentId: EnvironmentId, task: ScheduledTask) => {
    setEditor({ environmentId, task });
  };
  const defaultEnvironment = environment ?? connectedEnvironments[0];
  const linkedEnvironmentId = target.environmentId ?? defaultEnvironment?.environmentId;
  const linkedEnvironmentConnected = environments.some(
    (entry) =>
      entry.environmentId === linkedEnvironmentId &&
      entry.connection.phase === "connected" &&
      entry.serverConfig !== null,
  );
  const linkedTasksQuery = useEnvironmentQuery(
    target.taskId !== undefined && linkedEnvironmentId !== undefined && linkedEnvironmentConnected
      ? serverEnvironment.scheduledTasksLive({ environmentId: linkedEnvironmentId, input: {} })
      : null,
  );
  const linkedTask = linkedTasksQuery.data?.tasks.find(
    (task) =>
      task.id === target.taskId &&
      linkedEnvironmentId !== undefined &&
      matchesScheduledTaskScope(scope, linkedEnvironmentId, task.projectId),
  );
  // A `taskId` link opens its editor once, the first time the task loads. The editor then owns
  // the session until close, so a disconnect that disables the query cannot drop unsaved edits.
  // An editor the user already opened wins: a late-loading link must not replace its draft.
  const [openedLinkTaskId, setOpenedLinkTaskId] = useState<ScheduledTaskId | undefined>();
  if (target.taskId === undefined && openedLinkTaskId !== undefined) {
    setOpenedLinkTaskId(undefined);
  }
  if (linkedTask && linkedEnvironmentId !== undefined && openedLinkTaskId !== target.taskId) {
    setOpenedLinkTaskId(target.taskId);
    if (editor === null) setEditor({ environmentId: linkedEnvironmentId, task: linkedTask });
  }
  const navigate = useNavigate({ from: "/settings/scheduled-tasks" });
  const closeEditor = () => {
    setEditor(null);
    if (target.taskId === undefined) return;
    void navigate({
      to: "/settings/scheduled-tasks",
      search: ({ taskId: _closed, ...rest }) => rest,
      replace: true,
    });
  };
  const createPermissions = useAtomValue(
    scheduledTaskCreatePermissionsAtom(
      environmentIdsKey(connectedEnvironments.map((entry) => entry.environmentId)),
    ),
  );
  const permittedEnvironments = connectedEnvironments.filter(
    (_entry, index) => createPermissions[index],
  );
  const creationEnvironment =
    permittedEnvironments.find(
      (entry) => entry.environmentId === defaultEnvironment?.environmentId,
    ) ?? permittedEnvironments[0];
  return (
    <SettingsPageContainer>
      <SettingsSection
        title={t(($) => $.extra.scheduled.title)}
        variant="plain"
        headerAction={
          <Button
            size="xs"
            variant="ghost-muted"
            disabled={!creationEnvironment}
            onClick={() =>
              creationEnvironment &&
              setEditor({ environmentId: creationEnvironment.environmentId, task: null })
            }
          >
            <PlusIcon className="size-3" />
            {t(($) => $.extra.scheduled.newTask)}
          </Button>
        }
      >
        {scope.kind === "unavailable" ? (
          <SettingsSection title={t(($) => $.extra.scheduled.unavailableSelection)}>
            <SettingsRow title={scope.message} />
          </SettingsSection>
        ) : environments.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock3Icon />
              </EmptyMedia>
              <EmptyTitle>{t(($) => $.extra.scheduled.noEnvironments)}</EmptyTitle>
              <EmptyDescription>{t(($) => $.extra.scheduled.connect)}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : environments.length > 1 ? (
          <ScheduledTaskEnvironmentList
            environmentId={linkedEnvironmentId}
            taskId={target.taskId}
            onEdit={openForEdit}
          />
        ) : (
          <div className="space-y-8">
            {environments.map((entry) => (
              <ScheduledTaskEnvironmentSection
                key={entry.environmentId}
                environment={entry}
                taskId={linkedEnvironmentId === entry.environmentId ? target.taskId : undefined}
                onEdit={openForEdit}
              />
            ))}
          </div>
        )}
      </SettingsSection>
      {editor ? (
        <ScheduledTaskEditorDialog
          key={`${editor.environmentId}:${editor.task?.id ?? "new"}`}
          initialEnvironmentId={editor.environmentId}
          task={editor.task}
          onClose={closeEditor}
        />
      ) : null}
    </SettingsPageContainer>
  );
}

const scheduledTaskCreatePermissionsAtom = environmentAtomList(
  "web-scheduled-task-create-permissions",
  serverEnvironment.upsertScheduledTask.permissionAtom,
);

const scheduledTasksListAtom = environmentAtomList("web-scheduled-tasks-list", (environmentId) =>
  serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
);

function ScheduledTaskEnvironmentList({
  environmentId,
  taskId,
  onEdit,
}: {
  readonly environmentId: EnvironmentId | undefined;
  readonly taskId: ScheduledTaskId | undefined;
  readonly onEdit: (environmentId: EnvironmentId, task: ScheduledTask) => void;
}) {
  const { t } = useTranslation("settings");
  const { t: tConnect } = useTranslation("connect");
  const { scope, environments } = useSettingsScope();
  const connectedIds = environments.flatMap((environment) =>
    environment.connection.phase === "connected" && environment.serverConfig !== null
      ? [environment.environmentId]
      : [],
  );
  const queries = useAtomValue(scheduledTasksListAtom(environmentIdsKey(connectedIds)));
  const states = environments.map((environment) => {
    const index = connectedIds.indexOf(environment.environmentId);
    const query = index < 0 ? null : queries[index]!;
    const data = query === null ? null : AsyncResult.getOrElse(query, () => null);
    return {
      environment,
      connected: index >= 0,
      timeZone: data?.timeZone,
      tasks: data?.tasks.filter((task) =>
        matchesScheduledTaskScope(scope, environment.environmentId, task.projectId),
      ),
      error: query?._tag === "Failure" ? formatEnvironmentQueryError(query.cause) : null,
    };
  });
  const linkedState = states.find((state) => state.environment.environmentId === environmentId);
  const linkedTask = linkedState?.tasks?.find((task) => task.id === taskId);

  const loaded = states.filter((state) => state.connected && state.error === null && state.tasks);
  const populated = loaded.filter((state) => state.tasks && state.tasks.length > 0);
  const summaries = {
    disconnected: [] as string[],
    loading: [] as string[],
    failed: [] as string[],
    empty: [] as string[],
  };
  const summaryLabels = {
    disconnected: (environments: string) =>
      t(($) => $.extra.scheduled.summaryDisconnected, { environments }),
    loading: (environments: string) => t(($) => $.extra.scheduled.summaryLoading, { environments }),
    failed: (environments: string) => t(($) => $.extra.scheduled.summaryFailed, { environments }),
    empty: (environments: string) => t(($) => $.extra.scheduled.summaryEmpty, { environments }),
  };
  for (const { environment, connected, tasks, error } of states) {
    const label = settingsScopeEnvironmentLabel(environment, environments);
    if (!connected) {
      summaries.disconnected.push(
        `${label} (${connectionStatusTitle(environment.connection, tConnect)})`,
      );
    } else if (error !== null) {
      summaries.failed.push(`${label}: ${error}`);
    } else if (!tasks) {
      summaries.loading.push(label);
    } else if (tasks.length === 0 && populated.length > 0) {
      summaries.empty.push(label);
    }
  }

  return (
    <SettingsGroup>
      {populated.map(({ environment, tasks, timeZone }) => {
        const { primary, secondary } = settingsScopeEnvironmentLabels(environment, environments);
        return (
          <div key={environment.environmentId} className="divide-y divide-border/50">
            <EnvironmentRow
              kind={resolveEnvironmentMachineKind(environment.serverConfig)}
              label={primary}
              subtitle={
                <ScheduledTaskEnvironmentSubtitle environment={environment} secondary={secondary} />
              }
            >
              <ConnectionStatusDot
                dotClassName={connectionPhaseDotClassName(environment.connection.phase)}
                tooltipText={connectionStatusTitle(environment.connection, tConnect)}
              />
              <span className="text-xs text-muted-foreground">
                {connectionStatusTitle(environment.connection, tConnect)}
              </span>
            </EnvironmentRow>
            {tasks?.map((task) => (
              <ScheduledTaskRow
                key={task.id}
                environmentId={environment.environmentId}
                task={task}
                timeZone={timeZone}
                onEdit={() => onEdit(environment.environmentId, task)}
              />
            ))}
          </div>
        );
      })}
      {taskId && linkedState?.tasks && linkedState.error === null && !linkedTask ? (
        <SettingsRow
          title={t(($) => $.extra.scheduled.taskUnavailable)}
          description={t(($) => $.extra.scheduled.taskMissing)}
          role="status"
        />
      ) : null}
      {populated.length === 0 && loaded.length > 0 ? (
        <SettingsRow
          title={t(($) => $.extra.scheduled.noTasks)}
          description={t(($) => $.extra.scheduled.noMatches)}
        />
      ) : null}
      {(Object.keys(summaries) as Array<keyof typeof summaries>).map((label) => {
        const entries = summaries[label];
        if (entries.length === 0) return null;
        const summary = summaryLabels[label](entries.join(", "));
        return (
          <Tooltip key={label}>
            <TooltipTrigger
              render={
                <p
                  className="truncate px-3 py-2.5 text-xs text-muted-foreground sm:px-4"
                  role="status"
                />
              }
            >
              {summary}
            </TooltipTrigger>
            <TooltipPopup>{summary}</TooltipPopup>
          </Tooltip>
        );
      })}
    </SettingsGroup>
  );
}

function ScheduledTaskEnvironmentSubtitle({
  environment,
  secondary,
}: {
  readonly environment: EnvironmentPresentation;
  readonly secondary: string;
}) {
  const transport = useEnvironmentTransportLabel(environment);
  return (
    <>
      {secondary && secondary !== transport ? (
        <span className="block truncate">{secondary}</span>
      ) : null}
      <span className="block truncate">{transport}</span>
    </>
  );
}

function ScheduledTaskEnvironmentSection({
  environment,
  taskId,
  onEdit,
}: {
  readonly environment: EnvironmentPresentation;
  readonly taskId?: ScheduledTaskId | undefined;
  readonly onEdit: (environmentId: EnvironmentId, task: ScheduledTask) => void;
}) {
  const { t } = useTranslation("settings");
  const { scope } = useSettingsScope();
  const connected =
    environment.connection.phase === "connected" && environment.serverConfig !== null;
  const tasksQuery = useEnvironmentQuery(
    connected
      ? serverEnvironment.scheduledTasksLive({
          environmentId: environment.environmentId,
          input: {},
        })
      : null,
  );
  const tasks = tasksQuery.data?.tasks.filter((task) =>
    matchesScheduledTaskScope(scope, environment.environmentId, task.projectId),
  );
  const linkedTask = tasks?.find((task) => task.id === taskId);
  return (
    <SettingsSection
      title={environment.label}
      hideTitle
      icon={
        <EnvironmentMachineIcon
          kind={resolveEnvironmentMachineKind(environment.serverConfig)}
          className="size-3.5"
        />
      }
    >
      {!connected ? (
        <SettingsRow
          title={t(($) => $.extra.scheduled.disconnected)}
          description={t(($) => $.extra.scheduled.reconnectEnvironment, {
            environment: environment.label,
          })}
        />
      ) : tasksQuery.error ? (
        <SettingsRow
          title={t(($) => $.extra.scheduled.loadFailed)}
          description={tasksQuery.error}
        />
      ) : !tasks ? (
        <SettingsRow title={t(($) => $.extra.scheduled.loading)} role="status" />
      ) : (
        <>
          {taskId && !linkedTask ? (
            <SettingsRow
              title={t(($) => $.extra.scheduled.taskUnavailable)}
              description={t(($) => $.extra.scheduled.taskMissing)}
              role="status"
            />
          ) : null}
          {tasks.length === 0 ? (
            <SettingsRow
              title={t(($) => $.extra.scheduled.noTasks)}
              description={t(($) => $.extra.scheduled.noMatches)}
            />
          ) : (
            tasks.map((task) => (
              <ScheduledTaskRow
                key={task.id}
                environmentId={environment.environmentId}
                task={task}
                timeZone={tasksQuery.data?.timeZone}
                onEdit={() => onEdit(environment.environmentId, task)}
              />
            ))
          )}
        </>
      )}
    </SettingsSection>
  );
}

function ScheduledTaskRow({
  environmentId,
  task,
  timeZone,
  onEdit,
}: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask;
  readonly timeZone: string | undefined;
  readonly onEdit: () => void;
}) {
  const { t } = useTranslation("settings");
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const [busy, setBusy] = useState(false);
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);
  const isWebhook = task.schedule.type === "webhook";
  const toggle = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "scheduled task enabled",
  });
  const run = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "scheduled task run now",
  });
  const remove = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "scheduled task delete",
  });
  const act = async (action: "toggle" | "run" | "delete") => {
    if (busy || !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    setBusy(true);
    const result =
      action === "toggle"
        ? await toggle({ environmentId, input: { id: task.id, enabled: !task.enabled } })
        : action === "run"
          ? await run({ environmentId, input: { id: task.id } })
          : await remove({ environmentId, input: { id: task.id } });
    setBusy(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t(($) => $.extra.scheduled.updateFailed),
          description: String(squashAtomCommandFailure(result)),
        }),
      );
    }
  };
  return (
    <SettingsRow
      title={task.title}
      description={<span className="line-clamp-2">{task.prompt}</span>}
      status={
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {scheduleLabel(task.schedule, t, timeZone, task.nextRunAt)} ·{" "}
            {task.blockedByPolicy !== undefined ? (
              task.blockedByPolicy
            ) : !task.enabled ? (
              t(($) => $.extra.scheduled.paused)
            ) : isWebhook ? (
              t(($) => $.extra.scheduled.listening)
            ) : task.nextRunAt ? (
              <>
                {t(($) => $.extra.scheduled.nextRun)}
                <ScheduledRelativeLabel value={task.nextRunAt} />
              </>
            ) : (
              t(($) => $.extra.scheduled.notScheduled)
            )}
          </span>
          {task.lastRunStatus !== "never" ? (
            <Badge variant={statusVariant(task.lastRunStatus)}>{task.lastRunStatus}</Badge>
          ) : null}
          {task.threadId !== null && scheduledTaskThreadMode(task) !== "new_thread" ? (
            <ScheduledTaskThreadLink environmentId={environmentId} threadId={task.threadId} />
          ) : null}
          {task.lastRunError ? <span className="text-destructive">{task.lastRunError}</span> : null}
        </div>
      }
      control={
        <div className="flex items-center gap-2">
          <Switch
            checked={task.enabled}
            disabled={busy || !canOperate}
            aria-label={t(($) => $.extra.scheduled.enable, { title: task.title })}
            onCheckedChange={() => void act("toggle")}
          />
          <Menu>
            <MenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy || !canOperate}
                  aria-label={t(($) => $.extra.scheduled.actions, { title: task.title })}
                />
              }
            >
              <MoreHorizontalIcon className="size-4" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={onEdit}>
                <PencilIcon />
                {t(($) => $.extra.scheduled.edit)}
              </MenuItem>
              {isWebhook ? (
                <MenuItem onClick={() => setDeliveriesOpen(true)}>
                  <InboxIcon />
                  {t(($) => $.extra.scheduled.deliveries)}
                </MenuItem>
              ) : (
                <MenuItem onClick={() => void act("run")}>
                  <PlayIcon />
                  {t(($) => $.extra.scheduled.run)}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem onClick={() => void act("delete")}>
                <Trash2Icon />
                {t(($) => $.extra.scheduled.delete)}
              </MenuItem>
            </MenuPopup>
          </Menu>
          {deliveriesOpen ? (
            <WebhookDeliveriesDialog
              environmentId={environmentId}
              task={task}
              onClose={() => setDeliveriesOpen(false)}
            />
          ) : null}
        </div>
      }
    />
  );
}

function ScheduledTaskThreadLink({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const { t } = useTranslation("settings");
  const ref = scopeThreadRef(environmentId, threadId);
  const title = useQuietThreadShell(ref)?.title.trim();
  return (
    <Link
      to="/$environmentId/$threadId"
      params={buildThreadRouteParams(ref)}
      className="max-w-64 truncate underline underline-offset-2 hover:text-foreground"
    >
      {title || t(($) => $.extra.scheduled.openThread)}
    </Link>
  );
}

function WebhookDeliveriesDialog({
  environmentId,
  task,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation("settings");
  const deliveriesQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTaskWebhookDeliveries({
      environmentId,
      input: { id: task.id, acceptAnyOutcome: true },
    }),
  );
  const [selectedId, setSelectedId] = useState<ScheduledTaskWebhookDeliverySummary["id"] | null>(
    null,
  );
  const selectedQuery = useEnvironmentQuery(
    selectedId === null
      ? null
      : serverEnvironment.scheduledTaskWebhookDelivery({
          environmentId,
          input: { id: task.id, deliveryId: selectedId, acceptAnyOutcome: true },
        }),
  );
  const deliveries = deliveriesQuery.data?.deliveries ?? null;
  const selected = selectedQuery.data?.delivery ?? null;
  const error = selectedId === null ? deliveriesQuery.error : selectedQuery.error;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(($) => $.extra.scheduled.deliveryTitle, { title: task.title })}
          </DialogTitle>
          <DialogDescription>{t(($) => $.extra.scheduled.recentRequests)}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {selectedId !== null && selected === null && selectedQuery.error === null ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t(($) => $.extra.scheduled.loadingDelivery)}
            </p>
          ) : selected ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge
                  variant={deliveryOutcomeVariant(
                    selected.pendingWindow ? "coalesced" : selected.outcome,
                  )}
                >
                  {webhookDeliveryLabel(selected, t)}
                </Badge>
                <span>
                  {selected.method} · <ScheduledRelativeLabel value={selected.receivedAt} />
                </span>
                {selected.signatureVerified ? (
                  <span className="text-muted-foreground">
                    {t(($) => $.extra.scheduled.signatureVerified)}
                  </span>
                ) : null}
              </div>
              {selected.error ? (
                <p
                  className={
                    selected.outcome === "filtered"
                      ? "text-sm text-muted-foreground"
                      : "text-sm text-destructive"
                  }
                >
                  {selected.error}
                </p>
              ) : null}
              <DeliveryBlock
                title={
                  selected.pendingWindow
                    ? t(($) => $.extra.scheduled.scheduledRun)
                    : t(($) => $.extra.scheduled.promptSent)
                }
              >
                {selected.renderedPrompt ??
                  (selected.pendingWindow
                    ? t(($) => $.extra.scheduled.runLater)
                    : t(($) => $.extra.scheduled.noRun))}
              </DeliveryBlock>
              {selected.missingFields.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Empty placeholders: {selected.missingFields.join(", ")}
                </p>
              ) : null}
              <DeliveryBlock title={t(($) => $.extra.scheduled.headers)}>
                {Object.entries(selected.headers)
                  .map(([name, value]) => `${name}: ${value}`)
                  .join("\n")}
              </DeliveryBlock>
              {selected.query ? (
                <DeliveryBlock title={t(($) => $.extra.scheduled.query)}>
                  {selected.query}
                </DeliveryBlock>
              ) : null}
              <DeliveryBlock
                title={
                  selected.bodyTruncated
                    ? t(($) => $.extra.scheduled.bodyTruncated)
                    : t(($) => $.extra.scheduled.body)
                }
              >
                {selected.body || "(empty)"}
              </DeliveryBlock>
            </div>
          ) : selectedId !== null ? null : deliveries === null ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t(($) => $.extra.scheduled.loadingDeliveries)}
            </p>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(($) => $.extra.scheduled.noRequests)}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {deliveries.map((delivery) => (
                <li key={delivery.id}>
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-2 py-2 text-left text-sm hover:bg-accent/40"
                    onClick={() => setSelectedId(delivery.id)}
                  >
                    <Badge
                      variant={deliveryOutcomeVariant(
                        delivery.pendingWindow ? "coalesced" : delivery.outcome,
                      )}
                    >
                      {webhookDeliveryLabel(delivery, t)}
                    </Badge>
                    <span>{delivery.method}</span>
                    <span className="text-muted-foreground">
                      <ScheduledRelativeLabel value={delivery.receivedAt} />
                    </span>
                    {delivery.outcome === "filtered" && delivery.error ? (
                      <span className="text-muted-foreground">{delivery.error}</span>
                    ) : null}
                    {delivery.missingFields.length > 0 ? (
                      <span className="text-muted-foreground">
                        {delivery.missingFields.length} empty placeholder
                        {delivery.missingFields.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogPanel>
        <DialogFooter>
          {selectedId !== null ? (
            <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
              {t(($) => $.extra.scheduled.back)}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={deliveriesQuery.isPending}
              onClick={deliveriesQuery.refresh}
            >
              {t(($) => $.extra.scheduled.refresh)}
            </Button>
          )}
          <DialogClose render={<Button size="sm" />}>
            {t(($) => $.extra.scheduled.done)}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function DeliveryBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{title}</Label>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap break-all">
        {children}
      </pre>
    </div>
  );
}

function WebhookEndpointField({
  environmentId,
  task,
}: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
}) {
  const { t } = useTranslation("settings");
  const canRotate = useAtomValue(
    serverEnvironment.rotateScheduledTaskWebhookToken.permissionAtom(environmentId),
  );
  const httpBaseUrl = useEnvironmentHttpBaseUrl(environmentId);
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: "webhook URL" });
  const rotate = useAtomCommand(serverEnvironment.rotateScheduledTaskWebhookToken, {
    label: "scheduled task rotate webhook token",
  });
  const [rotating, setRotating] = useState(false);
  const endpoint = task?.webhook;
  if (!task || !endpoint) {
    return (
      <p className="text-sm text-muted-foreground">{t(($) => $.extra.scheduled.urlAfterSave)}</p>
    );
  }
  const { address: url, copyable, note } = webhookAddress(endpoint, httpBaseUrl);
  const rotateUrl = async () => {
    const confirmed =
      (await requestConfirmDialog(
        t(($) => $.extra.scheduled.rotateConfirm),
        {
          variant: "destructive",
        },
      )) ?? window.confirm(t(($) => $.extra.scheduled.rotateMessage));
    if (!confirmed) return;
    setRotating(true);
    const result = await rotate({ environmentId, input: { id: task.id } });
    setRotating(false);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: t(($) => $.extra.scheduled.rotateFailed),
          description: String(squashAtomCommandFailure(result)),
        }),
      );
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          readOnly
          aria-label={t(($) => $.extra.scheduled.url)}
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={!copyable}
          onClick={() => copyToClipboard(url, undefined)}
        >
          <CopyIcon />
          {isCopied ? t(($) => $.extra.scheduled.copied) : t(($) => $.extra.scheduled.copy)}
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          disabled={rotating || !canRotate}
          onClick={() => void rotateUrl()}
        >
          {t(($) => $.extra.scheduled.rotate)}
        </Button>
      </div>
      {note !== null ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {endpoint.url !== null ? <WebhookDeliveryMode environmentId={environmentId} /> : null}
    </div>
  );
}

function WebhookDeliveryMode({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const { t } = useTranslation("settings");
  const cloudLink = usePrimaryCloudLinkState();
  if (cloudLink.target?.environmentId !== environmentId || cloudLink.data === null) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {cloudLink.data.holdWebhooksWhileOffline
        ? t(($) => $.extra.scheduled.held)
        : t(($) => $.extra.scheduled.forwarded)}
      <Link to="/settings/access" className="underline underline-offset-2">
        {t(($) => $.extra.scheduled.changeAccess)}
      </Link>
    </p>
  );
}

function ScheduledTaskEditorDialog({
  initialEnvironmentId,
  task,
  onClose,
}: {
  readonly initialEnvironmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
  readonly onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      {/* The form owns the draft so a keystroke re-renders it, not the dialog chrome. */}
      <DialogPopup className="max-w-xl">
        <ScheduledTaskEditorForm
          initialEnvironmentId={initialEnvironmentId}
          task={task}
          saving={saving}
          onSavingChange={setSaving}
          onClose={onClose}
        />
      </DialogPopup>
    </Dialog>
  );
}

function ScheduledTaskDestination({
  environmentId,
  projectId,
  threadId,
  threadMode,
  disabled,
  onSelect,
  onThreadModeChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly threadId: ThreadId | null;
  readonly threadMode: ScheduledTaskThreadMode;
  readonly disabled: boolean;
  readonly onSelect: (thread: { id: ThreadId; projectId: ProjectId } | null) => void;
  /** Absent on servers that predate thread modes. */
  readonly onThreadModeChange: ((mode: ScheduledTaskThreadMode) => void) | undefined;
}) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = threadId === null ? null : scopeThreadRef(environmentId, threadId);
  const shell = useThreadShell(ref);
  // The shell can omit older settled threads; their family read still carries the title.
  const family = useEnvironmentQuery(
    ref !== null && shell === null ? threadFamilies.familyAtom(environmentId, ref.threadId) : null,
  );
  const thread = shell ?? family.data?.threads.find((row) => row.id === threadId);
  const currentLabel =
    ref !== null
      ? thread?.title.trim() || t(($) => $.extra.scheduled.thread, { thread: ref.threadId })
      : threadMode === "new_thread"
        ? t(($) => $.extra.scheduled.threadModes.new_thread)
        : t(($) => $.extra.scheduled.startedByFirstRun);
  const shells = useVisibleThreadShells(open);
  // Mounts older settled threads matching the query, which shells may leave out.
  useThreadSearch(open && projectId ? [environmentId] : [], query, {
    titlesOnly: true,
    projectIds: [projectId as ProjectId],
  });
  const threads = scheduledTaskDestinationThreads(shells, {
    environmentId,
    projectId,
    currentThreadId: threadId,
    query,
  });
  const search = query.trim().toLocaleLowerCase();
  const items: ReadonlyArray<string> = [
    ...(search ? [] : [NEW_THREAD_DESTINATION]),
    ...(threadId !== null && currentLabel.toLocaleLowerCase().includes(search) ? [threadId] : []),
    ...threads.map((row) => row.id),
  ];
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };
  const detail =
    threadMode === "new_thread"
      ? t(($) => $.extra.scheduled.newThread)
      : ref === null
        ? threadMode === "continue"
          ? t(($) => $.extra.scheduled.firstRunContinue)
          : t(($) => $.extra.scheduled.firstRunFreshSession)
        : threadMode === "continue"
          ? t(($) => $.extra.scheduled.continueThread)
          : t(($) => $.extra.scheduled.freshSession);
  return (
    <Field label={t(($) => $.extra.scheduled.destination)} htmlFor="scheduled-task-destination">
      {onThreadModeChange ? (
        <Select
          value={threadMode}
          onValueChange={(value) => onThreadModeChange(value as ScheduledTaskThreadMode)}
        >
          <SelectTrigger size="sm" id="scheduled-task-destination">
            <SelectValue>{t(($) => $.extra.scheduled.threadModes[threadMode])}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {ScheduledTaskThreadMode.literals.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(($) => $.extra.scheduled.threadModes[mode])}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      ) : null}
      {!onThreadModeChange || threadMode !== "new_thread" ? (
        <Combobox
          items={items}
          filteredItems={items}
          filter={null}
          autoHighlight
          open={open && !disabled}
          onOpenChange={handleOpenChange}
          value={threadId ?? (threadMode === "new_thread" ? NEW_THREAD_DESTINATION : null)}
          onValueChange={(value) => {
            if (value === NEW_THREAD_DESTINATION) {
              onSelect(null);
              handleOpenChange(false);
              return;
            }
            const picked = threads.find((row) => row.id === value);
            if (picked) onSelect(picked);
            handleOpenChange(false);
          }}
        >
          <ComboboxTrigger
            id={
              onThreadModeChange
                ? "scheduled-task-destination-thread"
                : "scheduled-task-destination"
            }
            aria-label={
              onThreadModeChange ? t(($) => $.extra.scheduled.destinationThread) : undefined
            }
            disabled={disabled}
            render={<Button variant="outline" size="sm" />}
            className="w-full justify-between"
          >
            <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">{currentLabel}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </ComboboxTrigger>
          <ComboboxPopup align="start" side="bottom" className="w-80">
            <ComboboxSearchInput
              aria-label={t(($) => $.extra.scheduled.searchThreads)}
              placeholder={t(($) => $.extra.scheduled.searchAllThreads)}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ComboboxEmpty>{t(($) => $.extra.scheduled.noThreadsFound)}</ComboboxEmpty>
            <ComboboxList className="max-h-72">
              {items.map((value, index) => (
                <ComboboxItem key={value} index={index} value={value}>
                  <span className="block truncate">
                    {value === NEW_THREAD_DESTINATION
                      ? t(($) => $.extra.scheduled.threadModes.new_thread)
                      : value === threadId
                        ? currentLabel
                        : threads.find((row) => row.id === value)?.title ||
                          t(($) => $.extra.scheduled.untitledThread)}
                  </span>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxPopup>
        </Combobox>
      ) : null}
      <div className="space-y-1 text-sm">
        <p className="text-muted-foreground">{detail}</p>
        {threadMode !== "new_thread" ? (
          <p className="text-muted-foreground">
            {t(($) => $.extra.scheduled.deleteThreadDeletesTask)}
          </p>
        ) : null}
      </div>
    </Field>
  );
}

function ScheduledTaskEditorForm({
  initialEnvironmentId,
  task,
  saving,
  onSavingChange: setSaving,
  onClose,
}: {
  readonly initialEnvironmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
  readonly saving: boolean;
  readonly onSavingChange: (saving: boolean) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation("settings");
  const { scope, connectedEnvironments } = useSettingsScope();
  const [environmentId, setEnvironmentId] = useState(initialEnvironmentId);
  const environment = useEnvironment(environmentId);
  // Older servers reject one-time schedules, so offer Once only where it can save.
  const offersOnce =
    environment?.serverConfig?.environment.capabilities.oneTimeSchedules === true ||
    task?.schedule.type === "once";
  const offersThreadModes =
    environment?.serverConfig?.environment.capabilities.scheduledTaskThreadModes === true;
  const connected =
    environment?.connection.phase === "connected" && environment.serverConfig !== null;
  const WORKSPACE_MODE_LABELS: Record<WorkspaceMode, string> = {
    worktree: t(($) => $.extra.scheduled.newWorktree),
    root: t(($) => $.extra.scheduled.projectCheckout),
    existing_worktree: t(($) => $.extra.scheduled.specificCheckout),
  };
  const WEEKDAY_LABELS = weekdayLabels(t);
  const WEEKDAY_SHORT = [
    t(($) => $.extra.scheduled.sunShort),
    t(($) => $.extra.scheduled.monShort),
    t(($) => $.extra.scheduled.tueShort),
    t(($) => $.extra.scheduled.wedShort),
    t(($) => $.extra.scheduled.thuShort),
    t(($) => $.extra.scheduled.friShort),
    t(($) => $.extra.scheduled.satShort),
  ];
  const tasksQuery = useEnvironmentQuery(
    connected ? serverEnvironment.scheduledTasksLive({ environmentId, input: {} }) : null,
  );
  const allProjects = useProjects();
  const projectsOn = (id: EnvironmentId) =>
    allProjects.filter(
      (project) => project.environmentId === id && matchesScheduledTaskScope(scope, id, project.id),
    );
  const scopedProjects = projectsOn(environmentId);
  const settings = useEnvironmentSettings(environmentId);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const upsertTask = useAtomCommand(serverEnvironment.upsertScheduledTask, {
    label: "scheduled task upsert",
  });
  const webhookDenial = managedCapabilityDenial(useManagedPolicy(environmentId), "webhookTasks");
  const [draft, setDraft] = useState<DraftState>(() =>
    task
      ? taskToDraft(task)
      : {
          ...EMPTY_DRAFT,
          projectId: defaultScheduledTaskProjectId(scopedProjects, scope),
        },
  );
  // Pinned first. The chosen project stays listed after it is archived.
  const projects = scopedProjects
    .filter(
      (project) =>
        project.archivedAt == null ||
        project.id === draft.projectId ||
        project.id === task?.projectId,
    )
    .sort((left, right) => Number(right.pinnedAt != null) - Number(left.pinnedAt != null));
  const submissionPending = useRef(false);
  const editingTaskMissing =
    draft.editingId !== null &&
    tasksQuery.data !== null &&
    !tasksQuery.data.tasks.some((entry) => entry.id === draft.editingId);
  const runAtZone = scheduleTimeZoneLabel(tasksQuery.data?.timeZone);
  const liveTask = tasksQuery.data
    ? (tasksQuery.data.tasks.find((entry) => entry.id === draft.editingId) ?? null)
    : task;
  const selectedProjectId = draft.projectId || projects[0]?.id || "";
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const instanceEntries = providerInstanceEntriesFor(
    providers,
    settings,
    selectedProject?.id ?? null,
  );

  const firstInstance = instanceEntries[0];
  const draftSelection = draft.modelKey ? splitModelKey(draft.modelKey) : null;
  const activeSelection =
    draftSelection &&
    instanceEntries.some((entry) => entry.instanceId === draftSelection.instanceId && entry.enabled)
      ? draftSelection
      : scheduledTaskDefaultModel(settings, selectedProject ?? null, instanceEntries);
  const activeInstanceId =
    activeSelection?.instanceId ?? firstInstance?.instanceId ?? ("" as ProviderInstanceId);
  const activeModel = activeSelection?.model ?? "";
  const modelOptionsByInstance = getCustomModelOptionsByInstance(
    settings,
    providers,
    activeInstanceId,
    activeModel,
  );

  const reportFailure = (title: string, error: unknown) => {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : String(error),
      }),
    );
  };

  const submit = async () => {
    if (
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope) ||
      submissionPending.current ||
      saving ||
      editingTaskMissing ||
      !connected ||
      tasksQuery.data === null
    )
      return;
    const selection = activeSelection;
    if (
      !draft.title.trim() ||
      !draft.prompt.trim() ||
      !projects.some((project) => project.id === selectedProjectId) ||
      selection === null
    ) {
      reportFailure(
        t(($) => $.extra.scheduled.incomplete),
        t(($) => $.extra.scheduled.required),
      );
      return;
    }
    const parsedFilters = parseWebhookFilterDrafts(draft.filters);
    if (draft.scheduleMode === "webhook" && "error" in parsedFilters) {
      const error = parsedFilters.error;
      const description =
        error.kind === "tooMany"
          ? t(($) => $.extra.scheduled.filterTooMany, { maximum: error.maximum })
          : error.kind === "path"
            ? t(($) => $.extra.scheduled.filterPathError, { number: error.number })
            : error.kind === "values"
              ? t(($) => $.extra.scheduled.filterValuesError, { number: error.number })
              : t(($) => $.extra.scheduled.filterValueError, { number: error.number });
      reportFailure(
        t(($) => $.extra.scheduled.invalidFilter),
        description,
      );
      return;
    }
    const schedule = scheduleFromDraft(draft);
    if (schedule === null) {
      const errors = {
        runAt: {
          title: t(($) => $.extra.scheduled.invalidRunAt),
          description: t(($) => $.extra.scheduled.runAtRequired),
        },
        runAtSkipped: {
          title: t(($) => $.extra.scheduled.invalidRunAt),
          description: t(($) => $.extra.scheduled.runAtSkipped),
        },
        age: {
          title: t(($) => $.extra.scheduled.invalidAge),
          description: t(($) => $.extra.scheduled.ageDescription, {
            maximum: MAX_WEBHOOK_DELIVERY_AGE_MINUTES,
          }),
        },
        replay: {
          title: t(($) => $.extra.scheduled.invalidSettings),
          description: t(($) => $.extra.scheduled.replayInvalid),
        },
        coalesce: {
          title: t(($) => $.extra.scheduled.invalidSettings),
          description: t(($) => $.extra.scheduled.coalesceInvalid),
        },
        window: {
          title: t(($) => $.extra.scheduled.invalidSettings),
          description: t(($) => $.extra.scheduled.windowInvalid),
        },
      };
      for (const kind of scheduleDraftErrors(draft)) {
        const error = errors[kind];
        reportFailure(error.title, error.description);
      }
      return;
    }
    if (
      schedule.type === "webhook" &&
      schedule.signature &&
      (!schedule.signature.header ||
        (!schedule.signature.secret &&
          !(liveTask?.schedule.type === "webhook" && liveTask.webhook?.hasSecret)))
    ) {
      reportFailure(
        t(($) => $.extra.scheduled.signatureRequired),
        t(($) => $.extra.scheduled.signatureDetails),
      );
      return;
    }
    if (
      schedule.type === "interval" &&
      (!Number.isSafeInteger(schedule.everyMs) || schedule.everyMs < MIN_SCHEDULED_TASK_INTERVAL_MS)
    ) {
      reportFailure(
        t(($) => $.extra.scheduled.invalidInterval),
        t(($) => $.extra.scheduled.minimumInterval),
      );
      return;
    }
    if (schedule.type === "once" && !offersOnce) {
      reportFailure(
        t(($) => $.extra.scheduled.onceUnavailable),
        t(($) => $.extra.scheduled.onceUnavailableDescription),
      );
      return;
    }
    if (draft.workspaceMode === "existing_worktree" && !draft.existingWorktreePath.trim()) {
      reportFailure(
        t(($) => $.extra.scheduled.checkoutRequired),
        t(($) => $.extra.scheduled.checkoutPathHint),
      );
      return;
    }
    const modelSelection =
      draft.baseModelSelection !== null &&
      draft.baseModelSelection.instanceId === selection.instanceId &&
      draft.baseModelSelection.model === selection.model
        ? draft.baseModelSelection
        : selection;
    const workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy =
      draft.workspaceMode === "root"
        ? { type: "root" }
        : draft.workspaceMode === "existing_worktree"
          ? { type: "existing_worktree", worktreePath: draft.existingWorktreePath.trim() }
          : {
              type: "worktree",
              baseRef: draft.baseRef.trim() || "main",
              startFromOrigin: draft.startFromOrigin,
            };
    const input: ScheduledTaskUpsertInput = {
      ...(draft.editingId ? { id: draft.editingId as ScheduledTaskId, requireExisting: true } : {}),
      title: draft.title.trim(),
      prompt: draft.prompt.trim(),
      enabled: draft.enabled,
      schedule,
      projectId: selectedProjectId as ProjectId,
      threadId: draft.threadId ? (draft.threadId as ThreadId) : null,
      ...(offersThreadModes ? { threadMode: draft.threadMode } : {}),
      workspaceStrategy,
      modelSelection,
      // Tasks have no mode picker; a mode above the administrator's ceiling would fail every run.
      runtimeMode:
        clampManagedRuntimeMode(environment?.serverConfig?.managedPolicy, draft.runtimeMode) ??
        draft.runtimeMode,
      interactionMode: draft.interactionMode,
      creationSource: "web",
    };
    // Lock before React renders, and keep successful creates locked until the form closes.
    submissionPending.current = true;
    setSaving(true);
    const result = await upsertTask({ environmentId, input });
    setSaving(false);
    if (result._tag === "Failure") {
      submissionPending.current = false;
      if (!isAtomCommandInterrupted(result)) {
        reportFailure(
          t(($) => $.extra.scheduled.saveFailed),
          squashAtomCommandFailure(result),
        );
      }
      return;
    }
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {draft.editingId
            ? t(($) => $.extra.scheduled.editTask)
            : t(($) => $.extra.scheduled.newTask)}
        </DialogTitle>
        <DialogDescription>{t(($) => $.extra.scheduled.description)}</DialogDescription>
      </DialogHeader>

      <DialogPanel>
        {/* Fieldsets default to min-width: min-content, which lets one wide control widen the form past the dialog. */}
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          {!connected ? (
            <p className="text-sm text-destructive">{t(($) => $.extra.scheduled.reconnect)}</p>
          ) : null}
          <Field label={t(($) => $.extra.scheduled.runsOn)} htmlFor="scheduled-task-environment">
            <Select
              value={environmentId}
              disabled={task !== null || saving}
              onValueChange={(id) => {
                const next = connectedEnvironments.find((entry) => entry.environmentId === id);
                if (!next) return;
                setEnvironmentId(next.environmentId);
                setDraft((current) => ({
                  ...unbindDraftFromThread(current),
                  projectId: defaultScheduledTaskProjectId(projectsOn(next.environmentId), scope),
                  modelKey: "",
                  baseModelSelection: null,
                  baseRef: "main",
                  startFromOrigin: true,
                  existingWorktreePath: "",
                }));
              }}
            >
              <SelectTrigger id="scheduled-task-environment" size="sm">
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <EnvironmentMachineIcon
                      kind={resolveEnvironmentMachineKind(environment?.serverConfig ?? null)}
                      className="size-4"
                    />
                    {environment?.label ?? t(($) => $.extra.scheduled.unavailableEnvironment)}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {connectedEnvironments.map((entry) => {
                  const { secondary } = settingsScopeEnvironmentLabels(
                    entry,
                    connectedEnvironments,
                  );
                  return (
                    <SelectItem
                      key={entry.environmentId}
                      value={entry.environmentId}
                      label={entry.label}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <EnvironmentMachineIcon
                          kind={resolveEnvironmentMachineKind(entry.serverConfig)}
                          className="size-4"
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{entry.label}</span>
                          {secondary ? (
                            <span className="block max-w-72 truncate text-xs text-muted-foreground">
                              {secondary}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectPopup>
            </Select>
          </Field>
          {tasksQuery.error ? (
            <p className="text-sm text-destructive" role="status">
              {tasksQuery.error}
            </p>
          ) : null}
          {editingTaskMissing ? (
            <p className="text-xs text-destructive" role="status">
              {t(($) => $.extra.scheduled.deleted)}
            </p>
          ) : null}
          <Field label={t(($) => $.extra.scheduled.name)} htmlFor="scheduled-task-title">
            <Input
              id="scheduled-task-title"
              placeholder={t(($) => $.extra.scheduled.nameExample)}
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </Field>

          <ScheduledTaskDestination
            environmentId={environmentId}
            projectId={selectedProjectId}
            threadId={draft.threadId ? (draft.threadId as ThreadId) : null}
            threadMode={draft.threadMode}
            disabled={saving || !connected}
            onSelect={(thread) =>
              setDraft((current) =>
                thread === null
                  ? { ...unbindDraftFromThread(current), threadMode: "new_thread" }
                  : moveDraftToThread(current, thread),
              )
            }
            onThreadModeChange={
              offersThreadModes
                ? (threadMode) =>
                    setDraft((current) => ({
                      ...(threadMode === "new_thread" ? unbindDraftFromThread(current) : current),
                      threadMode,
                    }))
                : undefined
            }
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t(($) => $.extra.scheduled.project)} htmlFor="scheduled-task-project">
              <Select
                value={selectedProjectId}
                onValueChange={(projectId) =>
                  setDraft((current) => changeDraftProject(current, projectId ?? ""))
                }
              >
                <SelectTrigger size="sm" id="scheduled-task-project">
                  <SelectValue placeholder={t(($) => $.extra.scheduled.selectProject)}>
                    {selectedProject?.title}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id} label={project.title}>
                      <span className="block truncate">{project.title}</span>
                      {allProjects.some(
                        (other) =>
                          other.title === project.title &&
                          (other.environmentId !== project.environmentId ||
                            other.id !== project.id),
                      ) ? (
                        <span className="block max-w-72 truncate text-xs text-muted-foreground">
                          {project.workspaceRoot}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>

            <Field label={t(($) => $.extra.scheduled.workspace)} htmlFor="scheduled-task-workspace">
              <Select
                value={draft.workspaceMode}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, workspaceMode: value as WorkspaceMode }))
                }
              >
                <SelectTrigger size="sm" id="scheduled-task-workspace">
                  <SelectValue>{WORKSPACE_MODE_LABELS[draft.workspaceMode]}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="worktree">
                    {t(($) => $.extra.scheduled.newWorktree)}
                  </SelectItem>
                  <SelectItem value="root">
                    {t(($) => $.extra.scheduled.projectCheckout)}
                  </SelectItem>
                  <SelectItem value="existing_worktree">
                    {t(($) => $.extra.scheduled.specificCheckout)}
                  </SelectItem>
                </SelectPopup>
              </Select>
            </Field>
          </div>

          {draft.workspaceMode === "worktree" ? (
            <Field label={t(($) => $.extra.scheduled.baseBranch)} htmlFor="scheduled-task-base-ref">
              <WorktreeBaseBranchPicker
                key={`${environmentId}:${selectedProjectId}`}
                id="scheduled-task-base-ref"
                environmentId={environmentId}
                cwd={selectedProject?.workspaceRoot ?? null}
                value={draft.baseRef}
                onValueChange={(baseRef) => setDraft((current) => ({ ...current, baseRef }))}
                startFromOrigin={draft.startFromOrigin}
                onStartFromOriginChange={(startFromOrigin) =>
                  setDraft((current) => ({ ...current, startFromOrigin }))
                }
                disabled={saving || !connected}
              />
            </Field>
          ) : null}
          {draft.workspaceMode === "existing_worktree" ? (
            <Field
              label={t(($) => $.extra.scheduled.checkoutPath)}
              htmlFor="scheduled-task-checkout"
            >
              <Input
                id="scheduled-task-checkout"
                value={draft.existingWorktreePath}
                placeholder="/path/to/checkout"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    existingWorktreePath: resolvePastedPath(
                      current.existingWorktreePath,
                      event.target.value,
                    ),
                  }))
                }
              />
            </Field>
          ) : null}

          <Field label={t(($) => $.extra.scheduled.prompt)} htmlFor="scheduled-task-prompt">
            <Textarea
              id="scheduled-task-prompt"
              className="max-h-64 overflow-y-auto"
              placeholder={t(($) => $.extra.scheduled.promptPlaceholder)}
              value={draft.prompt}
              onChange={(event) =>
                setDraft((current) => ({ ...current, prompt: event.target.value }))
              }
            />
          </Field>

          <Field label={t(($) => $.extra.scheduled.model)}>
            <div>
              <ProviderModelPicker
                environmentId={environmentId}
                disabled={saving || !connected}
                activeInstanceId={activeInstanceId}
                model={activeModel}
                lockedProvider={null}
                instanceEntries={instanceEntries}
                modelOptionsByInstance={modelOptionsByInstance}
                isComposerOwned={false}
                triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                onInstanceModelChange={(instanceId, model) =>
                  setDraft((current) => ({ ...current, modelKey: `${instanceId}:${model}` }))
                }
              />
            </div>
          </Field>

          <div className="space-y-3">
            {task?.schedule.type === "interval" &&
            task.schedule.everyMs < MIN_SCHEDULED_TASK_INTERVAL_MS ? (
              <p className="text-sm text-muted-foreground" role="status">
                {t(($) => $.extra.scheduled.legacyInterval)}
              </p>
            ) : null}
            {/* Wraps the toggle below the label when both don't fit, as on phones. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{t(($) => $.extra.scheduled.schedule)}</Label>
              <ToggleGroup
                aria-label={t(($) => $.extra.scheduled.scheduleType)}
                value={[draft.scheduleMode]}
                onValueChange={(values) => {
                  const mode = values[0] as ScheduleMode | undefined;
                  if (
                    mode === "fixed" ||
                    mode === "once" ||
                    mode === "interval" ||
                    mode === "webhook"
                  )
                    setDraft((current) => {
                      const suggested =
                        mode === "once" && !current.runAt
                          ? new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000)
                          : null;
                      return {
                        ...current,
                        scheduleMode: mode,
                        // Keep the instant too, so an hour that repeats when clocks go back stays exact.
                        ...(suggested === null
                          ? {}
                          : {
                              runAt: toDateTimeLocalValue(suggested),
                              savedRunAt: suggested.toISOString(),
                            }),
                        prompt:
                          mode === "webhook" && !current.prompt.trim()
                            ? DEFAULT_WEBHOOK_PROMPT
                            : current.prompt,
                      };
                    });
                }}
              >
                <Toggle value="fixed">{t(($) => $.extra.scheduled.fixed)}</Toggle>
                {offersOnce || draft.scheduleMode === "once" ? (
                  <Toggle value="once">{t(($) => $.extra.scheduled.once)}</Toggle>
                ) : null}
                <Toggle value="interval">{t(($) => $.extra.scheduled.interval)}</Toggle>
                <Toggle
                  value="webhook"
                  disabled={webhookDenial !== undefined && draft.scheduleMode !== "webhook"}
                >
                  {t(($) => $.extra.scheduled.onWebhook)}
                </Toggle>
              </ToggleGroup>
            </div>

            {webhookDenial !== undefined ? (
              <ManagedNotice>
                {draft.scheduleMode === "webhook"
                  ? t(($) => $.extra.scheduled.webhookDenied, { reason: webhookDenial })
                  : webhookDenial}
              </ManagedNotice>
            ) : null}
            {/* A disabled task still saves, so keep its fields reachable for fixing. */}
            {draft.scheduleMode === "webhook" &&
            webhookDenial !== undefined &&
            draft.enabled ? null : draft.scheduleMode === "webhook" ? (
              <div className="space-y-4">
                <WebhookEndpointField environmentId={environmentId} task={liveTask} />
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.extra.scheduled.templateHint, {
                    bodyPath: "{{body.path}}",
                    headerName: "{{headers.name}}",
                    queryName: "{{query.name}}",
                    body: "{{body}}",
                    request: "{{request}}",
                  })}
                </p>
                <Field
                  label={t(($) => $.extra.scheduled.skipOld)}
                  hint={t(($) => $.extra.scheduled.minutesOptional)}
                  htmlFor="scheduled-task-max-age"
                >
                  <Input
                    id="scheduled-task-max-age"
                    type="number"
                    nativeInput
                    min={1}
                    max={MAX_WEBHOOK_DELIVERY_AGE_MINUTES}
                    placeholder={t(($) => $.extra.scheduled.everyRequest)}
                    value={draft.maxDeliveryAgeMinutes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        maxDeliveryAgeMinutes: event.target.value,
                      }))
                    }
                  />
                </Field>
                <WebhookFiltersField
                  filters={draft.filters}
                  onChange={(filters) => setDraft((current) => ({ ...current, filters }))}
                />
                <Field
                  label={t(($) => $.extra.scheduled.replayKey)}
                  hint={t(($) => $.extra.scheduled.templateOptional)}
                  htmlFor="scheduled-task-replay-key"
                >
                  <Input
                    id="scheduled-task-replay-key"
                    placeholder="{{headers.delivery-id}}"
                    value={draft.replayKey}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, replayKey: event.target.value }))
                    }
                  />
                </Field>
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.extra.scheduled.replayKeyHint)}
                </p>
                <Field
                  label={t(($) => $.extra.scheduled.coalesceKey)}
                  hint={t(($) => $.extra.scheduled.templateOptional)}
                  htmlFor="scheduled-task-coalesce-key"
                >
                  <Input
                    id="scheduled-task-coalesce-key"
                    placeholder="{{body.id}}"
                    value={draft.coalesceKey}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, coalesceKey: event.target.value }))
                    }
                  />
                </Field>
                <Field
                  label={t(($) => $.extra.scheduled.coalesceWindow)}
                  hint={t(($) => $.extra.scheduled.secondsRange)}
                  htmlFor="scheduled-task-coalesce-window"
                >
                  <Input
                    id="scheduled-task-coalesce-window"
                    type="number"
                    nativeInput
                    min={10}
                    max={3600}
                    placeholder="120"
                    value={draft.coalesceWindowSeconds}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        coalesceWindowSeconds: event.target.value,
                      }))
                    }
                  />
                </Field>
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.extra.scheduled.replayDescription)}
                </p>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="scheduled-task-signature">
                      {t(($) => $.extra.scheduled.requireSignature)}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t(($) => $.extra.scheduled.signatureDescription)}
                    </p>
                  </div>
                  <Switch
                    id="scheduled-task-signature"
                    checked={draft.signatureEnabled}
                    onCheckedChange={(signatureEnabled) =>
                      setDraft((current) => ({ ...current, signatureEnabled }))
                    }
                  />
                </div>
                {draft.signatureEnabled ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label={t(($) => $.extra.scheduled.header)}
                      htmlFor="scheduled-task-signature-header"
                    >
                      <Input
                        id="scheduled-task-signature-header"
                        value={draft.signatureHeader}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            signatureHeader: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label={t(($) => $.extra.scheduled.prefix)}
                      htmlFor="scheduled-task-signature-prefix"
                    >
                      <Input
                        id="scheduled-task-signature-prefix"
                        value={draft.signaturePrefix}
                        placeholder={t(($) => $.extra.scheduled.none)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            signaturePrefix: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label={t(($) => $.extra.scheduled.encoding)}
                      htmlFor="scheduled-task-signature-encoding"
                    >
                      <Select
                        value={draft.signatureEncoding}
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            signatureEncoding: value === "base64" ? "base64" : "hex",
                          }))
                        }
                      >
                        <SelectTrigger size="sm" id="scheduled-task-signature-encoding">
                          <SelectValue>{draft.signatureEncoding}</SelectValue>
                        </SelectTrigger>
                        <SelectPopup>
                          <SelectItem value="hex">hex</SelectItem>
                          <SelectItem value="base64">base64</SelectItem>
                        </SelectPopup>
                      </Select>
                    </Field>
                    <Field
                      label={t(($) => $.extra.scheduled.secret)}
                      htmlFor="scheduled-task-signature-secret"
                    >
                      <Input
                        id="scheduled-task-signature-secret"
                        type="password"
                        autoComplete="off"
                        value={draft.signatureSecret}
                        placeholder={
                          liveTask?.schedule.type === "webhook" && liveTask.webhook?.hasSecret
                            ? t(($) => $.extra.scheduled.unchanged)
                            : t(($) => $.extra.scheduled.sharedSecret)
                        }
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            signatureSecret: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            ) : draft.scheduleMode === "once" ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="scheduled-task-run-at">{t(($) => $.extra.scheduled.runOn)}</Label>
                <Input
                  type="datetime-local"
                  id="scheduled-task-run-at"
                  nativeInput
                  className="w-56"
                  value={draft.runAt}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, runAt: event.target.value }))
                  }
                />
              </div>
            ) : draft.scheduleMode === "fixed" ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="scheduled-task-time">{t(($) => $.extra.scheduled.runAt)}</Label>
                  <Input
                    type="time"
                    id="scheduled-task-time"
                    aria-describedby={
                      runAtZone === undefined ? undefined : "scheduled-task-time-zone"
                    }
                    nativeInput
                    className="w-32"
                    value={draft.timeOfDay}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, timeOfDay: event.target.value }))
                    }
                  />
                  {runAtZone === undefined ? null : (
                    <span id="scheduled-task-time-zone" className="text-xs text-muted-foreground">
                      {runAtZone}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {t(($) => $.extra.scheduled.on)}
                  </span>
                </div>
                <ToggleGroup
                  multiple
                  variant="outline"
                  size="sm"
                  aria-label={t(($) => $.extra.scheduled.days)}
                  value={[...draft.weekdays].map(String)}
                  onValueChange={(values) => {
                    if (values.length === 0) return;
                    setDraft((current) => ({
                      ...current,
                      weekdays: new Set(values.map(Number)),
                    }));
                  }}
                >
                  {WEEKDAY_ORDER.map((day) => (
                    <Toggle key={day} value={String(day)} aria-label={WEEKDAY_LABELS[day]}>
                      {WEEKDAY_SHORT[day]}
                    </Toggle>
                  ))}
                </ToggleGroup>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Label htmlFor="scheduled-task-interval">{t(($) => $.extra.scheduled.every)}</Label>
                <Input
                  type="number"
                  id="scheduled-task-interval"
                  nativeInput
                  min={1}
                  step="any"
                  className="w-24"
                  value={draft.intervalMinutes}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, intervalMinutes: event.target.value }))
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {t(($) => $.extra.scheduled.minutes)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="scheduled-task-enabled">{t(($) => $.extra.scheduled.enabled)}</Label>
              <p id="scheduled-task-enabled-description" className="text-sm text-muted-foreground">
                {t(($) => $.extra.scheduled.disabledDescription)}
              </p>
            </div>
            <Switch
              id="scheduled-task-enabled"
              aria-describedby="scheduled-task-enabled-description"
              checked={draft.enabled}
              onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
            />
          </div>
        </fieldset>
      </DialogPanel>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="sm" disabled={saving} />}>
          {t(($) => $.extra.scheduled.cancel)}
        </DialogClose>
        <Button
          size="sm"
          disabled={
            !canOperate ||
            saving ||
            editingTaskMissing ||
            !connected ||
            !tasksQuery.data ||
            (draft.enabled && draft.scheduleMode === "webhook" && webhookDenial !== undefined)
          }
          onClick={() => void submit()}
        >
          {draft.editingId ? t(($) => $.extra.scheduled.save) : t(($) => $.extra.scheduled.create)}
        </Button>
      </DialogFooter>
    </>
  );
}
