import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useTranslation } from "react-i18next";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { SettingsRow, SettingsSection } from "./settingsLayout";

const DismissedEnvironmentIds = Schema.Array(Schema.String);

/** Suggests `t3 doctor` on every machine whose database still holds at least 1 GiB of freed pages. */
export function DatabaseStorageNotice({
  environments,
}: {
  environments: ReadonlyArray<{ readonly environmentId: EnvironmentId; readonly label: string }>;
}) {
  const { t } = useTranslation("settings");
  const recommendations = useAtomValue(
    serverEnvironment.databaseCompactionRecommendations(
      JSON.stringify(environments.map((environment) => environment.environmentId)),
    ),
  );
  const [dismissed, setDismissed] = useLocalStorage(
    "database-storage-notice-dismissed",
    [],
    DismissedEnvironmentIds,
  );
  const { copyToClipboard } = useCopyToClipboard({ target: "command" });
  const visible = recommendations.filter(
    (recommendation) => !dismissed.includes(recommendation.environmentId),
  );
  if (visible.length === 0) return null;
  return (
    <SettingsSection id="storage-database" title={t(($) => $.extra.database.title)}>
      <SettingsRow
        title={t(($) => $.extra.database.reclaim)}
        description={t(($) => $.extra.database.description)}
      />
      {visible.map(({ environmentId, status }) => (
        <SettingsRow
          key={environmentId}
          title={t(($) => $.extra.database.space, {
            size: (status.reclaimableBytes / 1024 ** 3).toFixed(1),
            environment:
              environments.find((environment) => environment.environmentId === environmentId)
                ?.label ?? environmentId,
          })}
          description={<code className="select-text break-all">{status.compactCommand}</code>}
          control={
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() => copyToClipboard(status.compactCommand, undefined)}
              >
                {t(($) => $.extra.database.copyCommand)}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setDismissed((current) => [...current, environmentId])}
              >
                {t(($) => $.extra.database.dismiss)}
              </Button>
            </div>
          }
        />
      ))}
    </SettingsSection>
  );
}
