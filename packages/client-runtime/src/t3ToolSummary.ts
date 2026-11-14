import type { TFunction } from "@t3tools/client-runtime/i18n";
import type { T3McpToolSummaryAction } from "@t3tools/shared/t3McpToolPresentation";

export interface T3ToolSummaryCall {
  readonly input: unknown;
  readonly output: unknown;
  readonly outcome: "completed" | "failed" | "unfinished";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function id(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

interface ToolResult {
  readonly data?: Record<string, unknown>;
  readonly failed: boolean;
}

function readResult(value: unknown, depth = 0): ToolResult {
  if (depth > 4) return { failed: false };
  if (typeof value === "string") {
    try {
      return readResult(JSON.parse(value), depth + 1);
    } catch {
      return { failed: false };
    }
  }
  if (Array.isArray(value)) {
    let data: ToolResult["data"];
    let failed = false;
    for (const block of value) {
      const record = asRecord(block);
      const text = record?.text ?? asRecord(record?.content)?.text;
      const result = readResult(asRecord(text)?.text ?? text, depth + 1);
      data ??= result.data;
      failed ||= result.failed;
    }
    return { ...(data ? { data } : {}), failed };
  }
  const record = asRecord(value);
  if (!record) return { failed: false };
  const failed =
    record.isError === true ||
    record.is_error === true ||
    (typeof record._tag === "string" && /(?:Error|Failure)$/.test(record._tag)) ||
    record.error != null;
  const content = record.structuredContent ?? record.content;
  if (content !== undefined) {
    const result = readResult(content, depth + 1);
    return { ...(result.data ? { data: result.data } : {}), failed: failed || result.failed };
  }
  return { data: record, failed };
}

function readInput(value: unknown): Record<string, unknown> | undefined {
  const input = readResult(value).data;
  // Historical Cursor items retain the MCP args envelope.
  return input && typeof input.toolName === "string" ? asRecord(input.args) : input;
}

/** MCP errors can be returned as data even when the provider completed the tool call. */
export function t3ToolResultIndicatesFailure(output: unknown): boolean {
  return readResult(output).failed;
}

function countEntities(ids: ReadonlyArray<string | undefined>): number {
  return (
    new Set(ids.filter((value) => value !== undefined)).size +
    ids.filter((value) => value === undefined).length
  );
}

/** One PR per single call; a batch counts what its result reports. */
function pullRequestCount(
  calls: ReadonlyArray<{
    readonly input: Record<string, unknown> | undefined;
    readonly output: Record<string, unknown> | undefined;
  }>,
  countKey: "linkedCount" | "unlinkedCount",
): number | null {
  let count = 0;
  for (const call of calls) {
    const reported = call.output?.[countKey];
    if (typeof reported === "number") count += reported;
    else if (call.input?.url !== undefined || call.input?.number !== undefined) count += 1;
    // A batch result too large to compact loses its count, so the label drops the number.
    else return null;
  }
  return count;
}

export function summarizeT3ToolCalls(
  action: T3McpToolSummaryAction,
  calls: ReadonlyArray<T3ToolSummaryCall>,
  t: TFunction<"activity">,
): { label: string; failedCount: number } {
  const results = calls.map((call) => {
    const result = readResult(call.output);
    return {
      input: readInput(call.input),
      output: result.data,
      outcome: result.failed ? ("failed" as const) : call.outcome,
    };
  });
  const completed = results.filter((call) => call.outcome === "completed");
  let failedCount = results.filter((call) => call.outcome === "failed").length;
  const selected = completed.length > 0 ? completed : results;
  const phase = completed.length > 0 ? "completed" : "unfinished";
  const summary = (count: number) =>
    completed.length > 0
      ? t(($) => $.shared.summaries[action].completed, { count })
      : t(($) => $.shared.summaries[action].unfinished, { count });
  const entityIds = (key: string) =>
    selected.map((call) => id(call.output?.[key]) ?? id(call.input?.[key]));
  const projectIds = selected.map(
    (call) => id(call.output?.id) ?? id(call.output?.projectId) ?? id(call.input?.projectId),
  );
  const threadIds = selected.map(
    (call) =>
      id(call.output?.threadId) ??
      id(asRecord(call.output?.thread)?.threadId) ??
      id(call.input?.threadId),
  );
  let label: string;
  switch (action) {
    case "thread-send": {
      const messages = countEntities(selected.map((call) => id(call.output?.messageId)));
      const targetsKnown = threadIds.every((value) => value !== undefined);
      const threads = new Set(threadIds).size;
      label = !targetsKnown
        ? summary(messages)
        : messages === threads && messages > 1
          ? t(($) => $.shared.messages[phase].same, { count: threads })
          : messages === 1
            ? t(($) => $.shared.messages[phase].one, { count: threads })
            : t(($) => $.shared.messages[phase].many, { count: threads, messages });
      break;
    }
    case "thread-create": {
      const createdIds: string[] = [];
      const resultsKnown =
        completed.length > 0 &&
        completed.every((call) => {
          const threads = Array.isArray(call.output?.threads) ? call.output.threads : [call.output];
          return threads.every((thread) => {
            const record = asRecord(thread);
            if (record?.status === "rolled_back") return true;
            const threadId = id(record?.threadId);
            if (!threadId) return false;
            createdIds.push(threadId);
            return true;
          });
        });
      label = resultsKnown
        ? t(($) => $.shared.created.threads, { count: new Set(createdIds).size })
        : summary(selected.length);
      break;
    }
    case "thread-read":
    case "thread-wait": {
      const count = new Set(threadIds).size;
      label = threadIds.every((value) => value !== undefined)
        ? action === "thread-read"
          ? t(($) => $.shared.threads[phase].read, { count })
          : t(($) => $.shared.threads[phase].wait, { count })
        : summary(selected.length);
      break;
    }
    case "attachment-send": {
      const messages = new Map<string, (typeof selected)[number]>();
      selected.forEach((call, index) =>
        messages.set(id(call.output?.messageId) ?? `call-${index}`, call),
      );
      const attachmentCount = [...messages.values()].reduce(
        (count, call) =>
          count + (Array.isArray(call.input?.attachments) ? call.input.attachments.length : 0),
        0,
      );
      const countsKnown = [...messages.values()].every(
        (call) => Array.isArray(call.input?.attachments) && call.input.attachments.length > 0,
      );
      const targetsKnown = threadIds.every((value) => value !== undefined);
      const threads = new Set(threadIds).size;
      label = countsKnown
        ? !targetsKnown
          ? t(($) => $.shared.attachments[phase].known, { count: attachmentCount })
          : threads === 1
            ? t(($) => $.shared.attachments[phase].knownToOne, { count: attachmentCount })
            : t(($) => $.shared.attachments[phase].knownToMany, { count: attachmentCount, threads })
        : !targetsKnown
          ? summary(selected.length)
          : threads === 1
            ? t(($) => $.shared.attachments[phase].unknownToOne, { count: selected.length })
            : t(($) => $.shared.attachments[phase].unknownToMany, {
                count: selected.length,
                threads,
              });
      break;
    }
    case "link-pr": {
      const count = pullRequestCount(selected, "linkedCount");
      label = count === null ? t(($) => $.shared.pullRequests[phase].link) : summary(count);
      break;
    }
    case "unlink-pr": {
      const count = pullRequestCount(selected, "unlinkedCount");
      label = count === null ? t(($) => $.shared.pullRequests[phase].unlink) : summary(count);
      break;
    }
    case "write-pr-guides": {
      const outcomes = selected.flatMap((call) =>
        Array.isArray(call.output?.guides)
          ? call.output.guides.map((guide) => asRecord(guide)?.outcome)
          : [],
      );
      const started = outcomes.filter((outcome) => outcome !== "failed").length;
      const failed = outcomes.length - started;
      failedCount += failed;
      label =
        outcomes.length === 0
          ? summary(selected.length)
          : started === 0
            ? t(($) => $.shared.guides.failed, { count: failed })
            : failed > 0
              ? t(($) => $.shared.guides[phase].partial, { count: started, failed })
              : t(($) => $.shared.guides[phase].started, { count: started });
      break;
    }
    case "delegate":
    case "task-cancel":
      label = summary(countEntities(entityIds("taskId")));
      break;
    case "thread-interrupt":
    case "thread-update":
      label = summary(countEntities(threadIds));
      break;
    case "workflow-stop":
      label = summary(countEntities(entityIds("subagentId")));
      break;
    case "schedule-create":
    case "schedule-update":
    case "schedule-delete":
      label = summary(countEntities(entityIds("scheduledTaskId")));
      break;
    case "queue-read":
    case "queue-edit":
    case "queue-cancel":
    case "queue-reorder":
    case "queue-steer":
      label = summary(countEntities(entityIds("queuedRunId")));
      break;
    case "question-read":
    case "question-respond":
      label = summary(countEntities(entityIds("requestId")));
      break;
    case "worktree-handoff":
      label = summary(countEntities(entityIds("worktreePath")));
      break;
    case "project-read":
    case "project-create":
    case "project-update":
    case "project-delete":
      label = summary(countEntities(projectIds));
      break;
    case "project-clone":
      label = summary(countEntities(entityIds("cwd")));
      break;
    case "environment-unlink":
      label = summary(countEntities(entityIds("environmentId")));
      break;
    case "attachment-prepare":
    case "attachment-discard":
      label = summary(countEntities(entityIds("attachmentId")));
      break;
    case "thread-list":
    case "task-status":
    case "background-wait":
    case "schedule-list":
    case "schedule-run":
    case "thread-configuration":
    case "thread-configure":
    case "thread-fork":
    case "thread-merge":
    case "thread-search":
    case "thread-transfers":
    case "thread-organize":
    case "queue-list":
    case "question-list":
    case "secret-request":
    case "worktree-list":
    case "worktree-status":
    case "project-list":
    case "environment-read":
    case "environment-update":
    case "theme-read":
    case "theme-set":
    case "environment-links":
    case "environment-link":
    case "watch-pr":
    case "unwatch-pr":
    case "list-prs":
    case "read-pr-guide":
    case "browser":
    case "device":
    case "html-preview":
    case "html-render":
    case "send-to-user":
    case "capabilities":
      label = summary(selected.length);
      break;
  }
  return { label, failedCount };
}
